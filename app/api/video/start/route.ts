import { NextRequest, NextResponse } from 'next/server'
import { createVideoProject, getCharacter, getScript, getStory, getStorybook, updateVideoProject } from '@/lib/db'
import { generateSceneIllustration } from '@/lib/banana-img'
import { generateSceneNarrationAudioUrl } from '@/lib/gemini-tts'
import {
  canRenderCjkSubtitles,
  createSceneVideoClip,
  concatenateVideos,
  burnSubtitles,
  writeSrtFile,
  getVideoDuration,
  buildSubtitleCues,
  subtitlesContainCjk,
} from '@/lib/ffmpeg'
import { saveFile, getLocalPath } from '@/lib/storage'
import type { ScriptScene, VideoSettings } from '@/types'

const DEFAULT_SETTINGS: VideoSettings = {
  resolution: '1280x720',
  fps: 24,
  transitionType: 'fade',
  subtitleStyle: { fontSize: 28, color: 'white', position: 'bottom' },
}

function extractBase64(raw: string | null | undefined): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const marker = 'base64,'
  const markerIndex = trimmed.indexOf(marker)
  if (markerIndex >= 0) {
    return trimmed.slice(markerIndex + marker.length).trim()
  }
  return trimmed
}

function parseStyleImages(raw: unknown): Record<string, string> {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, string>
      }
    } catch {
      return {}
    }
    return {}
  }
  if (typeof raw === 'object') return raw as Record<string, string>
  return {}
}

async function resolveStoryCharacterReferences(storyId: string): Promise<{
  imagesBase64: string[]
  names: string[]
}> {
  const story = await getStory(storyId)
  if (!story) return { imagesBase64: [], names: [] }

  const resolvedImages: string[] = []
  const resolvedNames: string[] = []
  const seen = new Set<string>()

  const pushReference = (imageRaw: string | null | undefined, nameRaw: string | null | undefined) => {
    const imageBase64 = extractBase64(imageRaw)
    if (!imageBase64 || seen.has(imageBase64)) return
    seen.add(imageBase64)
    resolvedImages.push(imageBase64)
    resolvedNames.push(nameRaw?.trim() || `Character ${resolvedImages.length}`)
  }

  if (story.storybookId) {
    const storybook = await getStorybook(story.storybookId)
    if (storybook) {
      const orderedChars = [...storybook.characters].sort((a, b) => {
        if (a.role === b.role) return 0
        return a.role === 'protagonist' ? -1 : 1
      })
      const records = await Promise.all(
        orderedChars.map((entry) => (entry.id ? getCharacter(entry.id) : Promise.resolve(null)))
      )

      orderedChars.forEach((entry, index) => {
        const character = records[index]
        if (!character) return
        const styleImages = parseStyleImages(character.styleImages)
        const preferredImage = styleImages[storybook.styleId] || character.cartoonImage
        pushReference(preferredImage, character.name || entry.name || undefined)
      })
    }
  }

  if (resolvedImages.length === 0 && story.characterIds.length > 0) {
    const records = await Promise.all(story.characterIds.map((id) => getCharacter(id)))
    records.forEach((character, index) => {
      if (!character) return
      pushReference(character.cartoonImage, character.name || `Character ${index + 1}`)
    })
  }

  if (resolvedImages.length === 0) {
    pushReference(story.mainImage, story.title || '主角')
  }

  return { imagesBase64: resolvedImages, names: resolvedNames }
}

// POST /api/video/start — Start async video production pipeline
export async function POST(request: NextRequest) {
  try {
    const { scriptId, storyId, videoSettings } = await request.json()

    if (!scriptId || !storyId) {
      return NextResponse.json({ error: 'scriptId and storyId are required' }, { status: 400 })
    }

    const script = await getScript(scriptId)
    if (!script) {
      return NextResponse.json({ error: 'Script not found' }, { status: 404 })
    }

    const settings: VideoSettings = { ...DEFAULT_SETTINGS, ...videoSettings }
    const project = await createVideoProject({ storyId, scriptId, videoSettings: settings as unknown as Record<string, unknown> })
    const { imagesBase64, names } = await resolveStoryCharacterReferences(storyId)

    // Fire-and-forget: run pipeline in background
    runPipeline(project.id, script.scenes, settings, imagesBase64, names).catch((err) => {
      console.error(`[Video Pipeline] Project ${project.id} crashed:`, err)
    })

    return NextResponse.json({
      videoProject: { id: project.id, status: 'pending', progress: 0 },
    })
  } catch (error) {
    console.error('[Video Start] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── Pipeline ─────────────────────────────────────────────────

async function runPipeline(
  projectId: string,
  scenes: ScriptScene[],
  settings: VideoSettings,
  characterImagesBase64: string[],
  characterNames: string[]
): Promise<void> {
  const base = `videos/${projectId}`
  const clipPaths: string[] = []
  const sceneDurationsMs: number[] = []

  try {
    // ── Stage 1: Generate scene images (parallel, max 3 concurrent) ─
    await updateVideoProject(projectId, { status: 'generating_images', progress: 5 })
    const imageLocalPaths: string[] = []

    for (let i = 0; i < scenes.length; i += 3) {
      const batch = scenes.slice(i, i + 3)
      const results = await Promise.allSettled(
        batch.map(async (scene, bi) => {
          const idx = i + bi
          const result = await generateSceneIllustration(
            scene.imagePrompt,
            characterImagesBase64,
            characterNames
          )
          const relPath = `${base}/scene-${idx}.jpg`
          await saveFile(Buffer.from(result.data, 'base64'), relPath)
          return { idx, localPath: getLocalPath(relPath) }
        })
      )

      results.forEach((r, bi) => {
        const idx = i + bi
        if (r.status === 'fulfilled') {
          imageLocalPaths[r.value.idx] = r.value.localPath
          return
        }
        console.warn(`[Pipeline] Scene image ${idx} failed:`, r.reason)
        imageLocalPaths[idx] = imageLocalPaths[idx - 1] ?? imageLocalPaths[0] ?? ''
      })

      const done = Math.min(i + 3, scenes.length)
      await updateVideoProject(projectId, {
        status: 'generating_images',
        progress: Math.round(5 + (done / scenes.length) * 25),
      })
    }

    // ── Stage 2: Generate scene audio ────────────────────────
    await updateVideoProject(projectId, { status: 'generating_audio', progress: 30 })
    const audioLocalPaths: string[] = []

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i]
      const sceneText = [
        scene.narration,
        ...scene.dialogue.map((d) => `${d.speaker}: ${d.text}`),
      ].join('\n')

      try {
        const audioDataUrl = await generateSceneNarrationAudioUrl(sceneText)
        const b64 = audioDataUrl.split('base64,')[1]
        const relPath = `${base}/scene-${i}.wav`
        await saveFile(Buffer.from(b64, 'base64'), relPath)
        audioLocalPaths.push(getLocalPath(relPath))
      } catch (err) {
        console.warn(`[Pipeline] Scene ${i} audio failed:`, err)
        audioLocalPaths.push('')
      }

      await updateVideoProject(projectId, {
        status: 'generating_audio',
        progress: Math.round(30 + ((i + 1) / scenes.length) * 20),
      })
    }

    // ── Stage 3: Compose scene video clips ───────────────────
    await updateVideoProject(projectId, { status: 'composing', progress: 50 })
    const sceneVideoUrls: string[] = []

    for (let i = 0; i < scenes.length; i++) {
      const imgPath = imageLocalPaths[i]
      const audPath = audioLocalPaths[i]

      if (!imgPath || !audPath) {
        console.warn(`[Pipeline] Scene ${i}: missing image or audio, skipping`)
        sceneDurationsMs.push((scenes[i].estimatedDuration ?? 20) * 1000)
        continue
      }

      const clipRelPath = `${base}/scene-${i}.mp4`
      const clipLocalPath = getLocalPath(clipRelPath)

      await createSceneVideoClip(imgPath, audPath, clipLocalPath, {
        resolution: settings.resolution,
        fps: settings.fps,
      })

      const duration = await getVideoDuration(clipLocalPath)
      sceneDurationsMs.push(duration)
      clipPaths.push(clipLocalPath)

      const url = await saveFile(await import('fs/promises').then((f) => f.readFile(clipLocalPath)), clipRelPath)
      sceneVideoUrls.push(url)

      await updateVideoProject(projectId, {
        status: 'composing',
        progress: Math.round(50 + ((i + 1) / scenes.length) * 20),
        sceneVideoUrls,
      })
    }

    if (clipPaths.length === 0) {
      throw new Error('No scene clips were generated')
    }

    // ── Stage 4: Concatenate all clips ───────────────────────
    await updateVideoProject(projectId, { status: 'editing', progress: 72 })
    const rawRelPath = `${base}/raw.mp4`
    const rawLocalPath = getLocalPath(rawRelPath)
    await concatenateVideos(clipPaths, rawLocalPath)
    const rawVideoUrl = await saveFile(
      await import('fs/promises').then((f) => f.readFile(rawLocalPath)),
      rawRelPath
    )

    // ── Stage 5: Build subtitles & burn ──────────────────────
    await updateVideoProject(projectId, {
      status: 'adding_subtitles',
      rawVideoUrl,
      progress: 80,
    })

    const subtitles = buildSubtitleCues(scenes, sceneDurationsMs)
    let finalVideoUrl = rawVideoUrl
    let burnedSubtitles: typeof subtitles = []

    const hasSubtitles = subtitles.length > 0
    const hasCjkSubtitles = hasSubtitles && subtitlesContainCjk(subtitles)
    const cjkFontReady = !hasCjkSubtitles || canRenderCjkSubtitles()

    if (!hasSubtitles) {
      console.warn(`[Video Pipeline] Project ${projectId}: no subtitles to burn, using raw video`)
    } else if (!cjkFontReady) {
      console.warn(
        `[Video Pipeline] Project ${projectId}: CJK subtitles detected but no CJK font found; skipping subtitle burn`
      )
    } else {
      try {
        const srtRelPath = `${base}/subtitles.srt`
        const srtLocalPath = getLocalPath(srtRelPath)
        await writeSrtFile(subtitles, srtLocalPath)

        const finalRelPath = `${base}/final.mp4`
        const finalLocalPath = getLocalPath(finalRelPath)
        await burnSubtitles(rawLocalPath, srtLocalPath, finalLocalPath, settings.subtitleStyle)
        finalVideoUrl = await saveFile(
          await import('fs/promises').then((f) => f.readFile(finalLocalPath)),
          finalRelPath
        )
        burnedSubtitles = subtitles
      } catch (subtitleError) {
        console.warn(
          `[Video Pipeline] Project ${projectId}: subtitle burn failed, falling back to raw video:`,
          subtitleError
        )
      }
    }

    await updateVideoProject(projectId, {
      status: 'complete',
      progress: 100,
      subtitles: burnedSubtitles,
      finalVideoUrl,
    })

    console.log(`[Video Pipeline] Project ${projectId} complete: ${finalVideoUrl}`)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown pipeline error'
    console.error(`[Video Pipeline] Project ${projectId} failed:`, error)
    await updateVideoProject(projectId, { status: 'failed', errorMessage: msg })
  }
}
