import fs from 'fs/promises'
import { NextRequest, NextResponse } from 'next/server'
import { createVideoProject, getScript, updateVideoProject } from '@/lib/db'
import { generateSceneIllustration } from '@/lib/banana-img'
import { generateSceneLineNarrationAudioUrlsV2, generateSceneNarrationAudioUrl } from '@/lib/gemini-tts'
import {
  buildSubtitleCues,
  buildSubtitleCuesV2,
  canRenderCjkSubtitles,
  createSceneVideoClip,
  concatenateAudiosV2,
  concatenateVideos,
  burnSubtitles,
  getVideoDuration,
  subtitlesContainCjk,
  writeSrtFile,
} from '@/lib/ffmpeg'
import { saveFile, getLocalPath, fileExists } from '@/lib/storage'
import { resolveStoryCharacterReferences } from '@/lib/storybook-helpers'
import type { ScriptScene, VideoSettings } from '@/types'

const DEFAULT_SETTINGS: VideoSettings = {
  resolution: '1280x720',
  fps: 24,
  transitionType: 'fade',
  subtitleStyle: { fontSize: 28, color: 'white', position: 'bottom' },
}

function normalizeCharacterKey(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, '')
    .replace(/["'`“”‘’]/g, '')
    .toLowerCase()
}

function extractCharacterCandidateNames(raw: string): string[] {
  return raw
    .split(/[、,，/|&]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function resolveSceneCharacterReferences(
  scene: ScriptScene,
  allImagesBase64: string[],
  allNames: string[],
  allDescriptions: string[]
): { imagesBase64: string[]; names: string[]; descriptions: string[] } {
  if (allImagesBase64.length === 0) return { imagesBase64: [], names: [], descriptions: [] }
  if (allImagesBase64.length === 1) {
    return {
      imagesBase64: [allImagesBase64[0]],
      names: [allNames[0] || 'Character 1'],
      descriptions: [allDescriptions[0] || ''],
    }
  }

  const aliasToIndices = new Map<string, number[]>()
  const registerAlias = (aliasRaw: string, idx: number) => {
    const key = normalizeCharacterKey(aliasRaw)
    if (!key) return
    const list = aliasToIndices.get(key) ?? []
    if (!list.includes(idx)) list.push(idx)
    aliasToIndices.set(key, list)
  }

  allNames.forEach((name, idx) => {
    registerAlias(name, idx)
    extractCharacterCandidateNames(name).forEach((alias) => registerAlias(alias, idx))
  })

  const selectedIndices: number[] = []
  const seen = new Set<number>()
  const pickIndex = (idx: number) => {
    if (idx < 0 || idx >= allImagesBase64.length) return
    if (seen.has(idx)) return
    seen.add(idx)
    selectedIndices.push(idx)
  }

  const rawCandidates = [
    ...(scene.charactersUsed ?? []),
    ...scene.dialogue.map((d) => d.speaker),
  ]
  const candidates = rawCandidates.flatMap((name) =>
    extractCharacterCandidateNames(name.replace(/[:：].*$/, ''))
  )

  for (const candidate of candidates) {
    const exact = aliasToIndices.get(normalizeCharacterKey(candidate))
    if (exact?.length) {
      exact.forEach(pickIndex)
      continue
    }

    const normalizedCandidate = normalizeCharacterKey(candidate)
    for (const [alias, indices] of aliasToIndices.entries()) {
      if (!alias || !normalizedCandidate) continue
      if (alias.includes(normalizedCandidate) || normalizedCandidate.includes(alias)) {
        indices.forEach(pickIndex)
      }
    }
  }

  // Safe fallback: keep protagonist reference when no scene match was found.
  if (selectedIndices.length === 0) pickIndex(0)

  const limited = selectedIndices.slice(0, 4)
  return {
    imagesBase64: limited.map((idx) => allImagesBase64[idx]),
    names: limited.map((idx) => allNames[idx] || `Character ${idx + 1}`),
    descriptions: limited.map((idx) => allDescriptions[idx] || ''),
  }
}

function debugLogSceneScript(projectId: string, scene: ScriptScene, sceneIndex: number): void {
  const sceneLines = [
    scene.narration,
    ...scene.dialogue.map((d) => `${d.speaker}: ${d.text}`),
  ].filter(Boolean)
  console.log(
    `[Video Pipeline][${projectId}][Scene ${sceneIndex}] Script\n` +
    `title: ${scene.title || ''}\n` +
    `charactersUsed: ${(scene.charactersUsed ?? []).join(', ') || '(none)'}\n` +
    `narration: ${scene.narration || ''}\n` +
    `dialogue:\n${scene.dialogue.map((d) => `- ${d.speaker}: ${d.text}`).join('\n') || '- (none)'}\n` +
    `audioScriptLines:\n${sceneLines.map((line) => `- ${line}`).join('\n') || '- (none)'}\n` +
    `imagePrompt: ${scene.imagePrompt || ''}`
  )
}

function buildImagePromptWithCharacterGuard(
  scene: ScriptScene,
  selectedNames: string[],
  selectedDescriptions: string[]
): string {
  const normalize = (name: string) => normalizeCharacterKey(name)
  const seen = new Set<string>()
  const mergedNames: string[] = []
  const descriptionByKey = new Map<string, string>()
  const pushName = (nameRaw: string) => {
    const trimmed = nameRaw.trim()
    if (!trimmed) return
    const key = normalize(trimmed)
    if (!key || seen.has(key)) return
    seen.add(key)
    mergedNames.push(trimmed)
  }

  ;(scene.charactersUsed ?? []).forEach(pushName)
  selectedNames.forEach(pushName)
  selectedNames.forEach((name, idx) => {
    const key = normalize(name || '')
    if (!key) return
    const description = (selectedDescriptions[idx] || '').trim()
    if (description && !descriptionByKey.has(key)) {
      descriptionByKey.set(key, description)
    }
  })

  const base = scene.imagePrompt || ''
  if (mergedNames.length === 0) return base

  const required = mergedNames
    .map((name) => {
      const detail = descriptionByKey.get(normalize(name))
      return detail ? `${name}(${detail})` : name
    })
    .join(', ')
  const lc = base.toLowerCase()
  if (lc.includes('must include all characters') || lc.includes('characters in this frame')) {
    return base
  }

  return `${base} Characters in this frame: ${required}. Must include all characters, keep each one clearly visible, consistent, and recognizable.`
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
    const { imagesBase64, names, descriptions } = await resolveStoryCharacterReferences(storyId)

    // Fire-and-forget: run pipeline in background
    runPipeline(project.id, scriptId, script.scenes, settings, imagesBase64, names, descriptions).catch((err) => {
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
  scriptId: string,
  scenes: ScriptScene[],
  settings: VideoSettings,
  characterImagesBase64: string[],
  characterNames: string[],
  characterDescriptions: string[]
): Promise<void> {
  const base = `videos/${projectId}`
  const clipPaths: string[] = []
  const sceneDurationsMs: number[] = []
  const sceneLineDurationsMs: number[][] = []

  try {
    console.log(`[Video Pipeline][${projectId}] Start generation with ${scenes.length} scenes`)
    scenes.forEach((scene, index) => debugLogSceneScript(projectId, scene, index))

    // ── Stage 1: Generate scene images (use pre-generated if available) ─
    await updateVideoProject(projectId, { status: 'generating_images', progress: 5 })
    const imageLocalPaths: string[] = []

    // Check which scenes have pre-generated images from interleaved director script
    const preGenPrefix = `videos/pre-${scriptId}`
    const preGenAvailable: boolean[] = await Promise.all(
      scenes.map((_, idx) => fileExists(`${preGenPrefix}/scene-${idx}.jpg`))
    )
    const preGenCount = preGenAvailable.filter(Boolean).length
    if (preGenCount > 0) {
      console.log(`[Video Pipeline][${projectId}] Found ${preGenCount}/${scenes.length} pre-generated scene images`)
    }

    // Copy pre-generated images to project dir; generate missing ones
    for (let i = 0; i < scenes.length; i += 3) {
      const batch = scenes.slice(i, i + 3)
      const results = await Promise.allSettled(
        batch.map(async (scene, bi) => {
          const idx = i + bi

          // Use pre-generated image if available
          if (preGenAvailable[idx]) {
            const preRelPath = `${preGenPrefix}/scene-${idx}.jpg`
            const destRelPath = `${base}/scene-${idx}.jpg`
            const preLocalPath = getLocalPath(preRelPath)
            const preData = await fs.readFile(preLocalPath)
            await saveFile(preData, destRelPath)
            console.log(`[Video Pipeline][${projectId}][Scene ${idx}] Using pre-generated image`)
            return { idx, localPath: getLocalPath(destRelPath) }
          }

          // Generate image for this scene
          const sceneRefs = resolveSceneCharacterReferences(
            scene,
            characterImagesBase64,
            characterNames,
            characterDescriptions
          )
          const enforcedImagePrompt = buildImagePromptWithCharacterGuard(
            scene,
            sceneRefs.names,
            sceneRefs.descriptions
          )
          console.log(
            `[Video Pipeline][${projectId}][Scene ${idx}] Image generation input\n` +
            `characters: ${sceneRefs.names.join(', ') || '(none)'}\n` +
            `imagePrompt: ${enforcedImagePrompt || ''}`
          )
          const result = await generateSceneIllustration(
            enforcedImagePrompt,
            sceneRefs.imagesBase64,
            sceneRefs.names
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
      const sceneLines = [
        scene.narration,
        ...scene.dialogue.map((d) => `${d.speaker}: ${d.text}`),
      ].filter(Boolean)
      const sceneText = sceneLines.join('\n')
      console.log(
        `[Video Pipeline][${projectId}][Scene ${i}] Audio generation input\n` +
        `${sceneLines.map((line) => `- ${line}`).join('\n') || '- (none)'}`
      )

      try {
        // V2: generate per-line audio then concatenate into scene audio.
        const lineAudioDataUrls = await generateSceneLineNarrationAudioUrlsV2(sceneLines)
        const lineLocalPaths: string[] = []
        const lineDurationsMs: number[] = []

        for (let lineIdx = 0; lineIdx < lineAudioDataUrls.length; lineIdx++) {
          const dataUrl = lineAudioDataUrls[lineIdx]
          const b64 = dataUrl?.split('base64,')[1] ?? ''
          if (!b64) continue
          const lineRelPath = `${base}/scene-${i}-line-${lineIdx}.wav`
          await saveFile(Buffer.from(b64, 'base64'), lineRelPath)
          const lineLocalPath = getLocalPath(lineRelPath)
          lineLocalPaths.push(lineLocalPath)
          try {
            lineDurationsMs.push(await getVideoDuration(lineLocalPath))
          } catch {
            lineDurationsMs.push(0)
          }
        }

        if (lineLocalPaths.length === 0) {
          throw new Error('No line-level audio generated in V2 flow')
        }

        const relPath = `${base}/scene-${i}.wav`
        const sceneLocalPath = getLocalPath(relPath)
        await concatenateAudiosV2(lineLocalPaths, sceneLocalPath)
        await saveFile(await fs.readFile(sceneLocalPath), relPath)
        audioLocalPaths.push(sceneLocalPath)
        sceneLineDurationsMs.push(lineDurationsMs)
      } catch (err) {
        console.warn(`[Pipeline] Scene ${i} V2 audio failed, fallback to legacy scene TTS:`, err)
        try {
          const audioDataUrl = await generateSceneNarrationAudioUrl(sceneText)
          const b64 = audioDataUrl.split('base64,')[1]
          const relPath = `${base}/scene-${i}.wav`
          await saveFile(Buffer.from(b64, 'base64'), relPath)
          const fallbackLocalPath = getLocalPath(relPath)
          audioLocalPaths.push(fallbackLocalPath)
          try {
            const fallbackDuration = await getVideoDuration(fallbackLocalPath)
            const avgMs = sceneLines.length > 0
              ? Math.max(1, Math.floor(fallbackDuration / sceneLines.length))
              : 0
            sceneLineDurationsMs.push(sceneLines.map(() => avgMs))
          } catch {
            sceneLineDurationsMs.push([])
          }
        } catch (legacyErr) {
          console.warn(`[Pipeline] Scene ${i} legacy audio failed:`, legacyErr)
          audioLocalPaths.push('')
          sceneLineDurationsMs.push([])
        }
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

    const subtitles = buildSubtitleCuesV2(scenes, sceneLineDurationsMs, sceneDurationsMs)
    const finalSubtitles = subtitles.length > 0
      ? subtitles
      : buildSubtitleCues(scenes, sceneDurationsMs)
    let finalVideoUrl = rawVideoUrl
    let burnedSubtitles: typeof finalSubtitles = []

    const hasSubtitles = finalSubtitles.length > 0
    const hasCjkSubtitles = hasSubtitles && subtitlesContainCjk(finalSubtitles)
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
        await writeSrtFile(finalSubtitles, srtLocalPath)

        const finalRelPath = `${base}/final.mp4`
        const finalLocalPath = getLocalPath(finalRelPath)
        await burnSubtitles(rawLocalPath, srtLocalPath, finalLocalPath, settings.subtitleStyle)
        finalVideoUrl = await saveFile(
          await import('fs/promises').then((f) => f.readFile(finalLocalPath)),
          finalRelPath
        )
        burnedSubtitles = finalSubtitles
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
