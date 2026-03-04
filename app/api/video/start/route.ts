import { NextRequest, NextResponse } from 'next/server'
import { getScript, createVideoProject, updateVideoProject } from '@/lib/db'
import { generateSceneIllustration } from '@/lib/banana-img'
import { generateSceneNarrationAudioUrl } from '@/lib/gemini-tts'
import {
  createSceneVideoClip,
  replaceVideoAudio,
  concatenateVideos,
  burnSubtitles,
  writeSrtFile,
  getVideoDuration,
  buildSubtitleCues,
} from '@/lib/ffmpeg'
import { isXaiConfigured, generateSceneVideoClipWithXai } from '@/lib/xai-video'
import { saveFile, getLocalPath } from '@/lib/storage'
import type { ScriptScene, VideoSettings } from '@/types'

const DEFAULT_SETTINGS: VideoSettings = {
  resolution: '1280x720',
  fps: 24,
  transitionType: 'fade',
  subtitleStyle: { fontSize: 28, color: 'white', position: 'bottom' },
}

// POST /api/video/start — Start async video production pipeline
export async function POST(request: NextRequest) {
  try {
    const { scriptId, storyId, videoSettings, characterImages = [] } = await request.json()

    if (!scriptId || !storyId) {
      return NextResponse.json({ error: 'scriptId and storyId are required' }, { status: 400 })
    }

    const script = await getScript(scriptId)
    if (!script) {
      return NextResponse.json({ error: 'Script not found' }, { status: 404 })
    }

    const settings: VideoSettings = { ...DEFAULT_SETTINGS, ...videoSettings }
    const project = await createVideoProject({ storyId, scriptId, videoSettings: settings as unknown as Record<string, unknown> })

    // Fire-and-forget: run pipeline in background
    runPipeline(project.id, script.scenes, settings, characterImages).catch((err) => {
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
  characterImages: string[]
): Promise<void> {
  const base = `videos/${projectId}`
  const clipPaths: string[] = []
  const sceneDurationsMs: number[] = []

  try {
    const charImagesBase64 = characterImages
      .map((img) => (img.includes('base64,') ? img.split('base64,')[1] : img))
      .filter(Boolean)

    // Determine which provider to use for scene visuals
    const provider = settings.imageProvider ?? 'auto'
    const useXaiVideo =
      (provider === 'xai' || provider === 'auto') && isXaiConfigured()

    if (useXaiVideo) {
      // ════════════════════════════════════════════════════════
      // xAI Video Pipeline
      //   Stage 1 : xAI generates animated video clips per scene
      //   Stage 2 : Gemini TTS generates narration audio
      //   Stage 3 : Replace xAI clip audio with TTS narration
      //   Stage 4 : Concatenate all clips
      //   Stage 5 : Burn subtitles
      // ════════════════════════════════════════════════════════

      // Helper: map resolution string → xAI aspect_ratio
      const aspectRatio = settings.resolution === '1080x1080' ? '1:1' : '16:9'
      const xaiResolution: '480p' | '720p' = '720p'

      // ── Stage 1: Generate scene video clips via xAI ─────────
      await updateVideoProject(projectId, { status: 'generating_images', progress: 5 })

      // xaiVideoLocalPaths[i] = path if xAI succeeded, null if it failed
      // fallbackImageLocalPaths[i] = path if image fallback was needed
      const xaiVideoLocalPaths: (string | null)[] = new Array(scenes.length).fill(null)
      const fallbackImageLocalPaths: (string | null)[] = new Array(scenes.length).fill(null)

      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i]
        const videoDuration = Math.min(Math.max(scene.estimatedDuration ?? 8, 1), 10)
        const videoPrompt =
          `Children's animated storybook scene: ${scene.imagePrompt}. ` +
          `Style: Bright happy colors, round friendly character shapes, gentle and subtle animation, ` +
          `cozy warm atmosphere, picture-book aesthetic. No text or words in the video.`

        try {
          console.log(`[Pipeline] xAI video clip ${i} — generating (${videoDuration}s) …`)
          const videoBuffer = await generateSceneVideoClipWithXai(videoPrompt, {
            duration: videoDuration,
            aspectRatio,
            resolution: xaiResolution,
          })
          const relPath = `${base}/scene-${i}-xai.mp4`
          await saveFile(videoBuffer, relPath)
          xaiVideoLocalPaths[i] = getLocalPath(relPath)
          console.log(`[Pipeline] xAI video clip ${i} saved`)
        } catch (err) {
          console.warn(`[Pipeline] xAI video clip ${i} failed — falling back to static image:`, err)
          // Fall back to Banana/Gemini image generation for this scene
          try {
            const imgResult = await generateSceneIllustration(scene.imagePrompt, charImagesBase64, [])
            const relPath = `${base}/scene-${i}.jpg`
            await saveFile(Buffer.from(imgResult.data, 'base64'), relPath)
            fallbackImageLocalPaths[i] = getLocalPath(relPath)
          } catch (imgErr) {
            console.warn(`[Pipeline] Fallback image ${i} also failed:`, imgErr)
          }
        }

        await updateVideoProject(projectId, {
          status: 'generating_images',
          progress: Math.round(5 + ((i + 1) / scenes.length) * 30),
        })
      }

      // ── Stage 2: Generate scene narration audio ──────────────
      await updateVideoProject(projectId, { status: 'generating_audio', progress: 35 })
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
          progress: Math.round(35 + ((i + 1) / scenes.length) * 20),
        })
      }

      // ── Stage 3: Compose clips (replace xAI audio with TTS) ─
      await updateVideoProject(projectId, { status: 'composing', progress: 55 })
      const sceneVideoUrls: string[] = []

      for (let i = 0; i < scenes.length; i++) {
        const audPath = audioLocalPaths[i]
        const xaiPath = xaiVideoLocalPaths[i]
        const imgPath = fallbackImageLocalPaths[i]

        if (!audPath) {
          console.warn(`[Pipeline] Scene ${i}: missing audio, skipping`)
          sceneDurationsMs.push((scenes[i].estimatedDuration ?? 20) * 1000)
          continue
        }

        const clipRelPath = `${base}/scene-${i}.mp4`
        const clipLocalPath = getLocalPath(clipRelPath)

        if (xaiPath) {
          // Replace the ambient xAI audio with TTS narration
          await replaceVideoAudio(xaiPath, audPath, clipLocalPath, {
            resolution: settings.resolution,
            fps: settings.fps,
          })
        } else if (imgPath) {
          // Fallback: static image + audio (same as legacy pipeline)
          await createSceneVideoClip(imgPath, audPath, clipLocalPath, {
            resolution: settings.resolution,
            fps: settings.fps,
          })
        } else {
          console.warn(`[Pipeline] Scene ${i}: no video or image available, skipping`)
          sceneDurationsMs.push((scenes[i].estimatedDuration ?? 20) * 1000)
          continue
        }

        const duration = await getVideoDuration(clipLocalPath)
        sceneDurationsMs.push(duration)
        clipPaths.push(clipLocalPath)

        const url = await saveFile(
          await import('fs/promises').then((f) => f.readFile(clipLocalPath)),
          clipRelPath
        )
        sceneVideoUrls.push(url)

        await updateVideoProject(projectId, {
          status: 'composing',
          progress: Math.round(55 + ((i + 1) / scenes.length) * 15),
          sceneVideoUrls,
        })
      }
    } else {
      // ════════════════════════════════════════════════════════
      // Legacy Image Pipeline
      //   Stage 1 : Banana/Gemini generates still images
      //   Stage 2 : Gemini TTS generates narration audio
      //   Stage 3 : FFmpeg composes image + audio into clip
      //   Stage 4 : Concatenate
      //   Stage 5 : Subtitles
      // ════════════════════════════════════════════════════════

      // ── Stage 1: Generate scene images (parallel, max 3) ────
      await updateVideoProject(projectId, { status: 'generating_images', progress: 5 })
      const imageLocalPaths: string[] = []

      for (let i = 0; i < scenes.length; i += 3) {
        const batch = scenes.slice(i, i + 3)
        const results = await Promise.allSettled(
          batch.map(async (scene, bi) => {
            const idx = i + bi
            const result = await generateSceneIllustration(
              scene.imagePrompt,
              charImagesBase64,
              []
            )
            const relPath = `${base}/scene-${idx}.jpg`
            await saveFile(Buffer.from(result.data, 'base64'), relPath)
            return { idx, localPath: getLocalPath(relPath) }
          })
        )

        for (const r of results) {
          if (r.status === 'fulfilled') {
            imageLocalPaths[r.value.idx] = r.value.localPath
          } else {
            console.warn(`[Pipeline] Scene image ${i} failed:`, r.reason)
            imageLocalPaths[i] = imageLocalPaths[0] ?? '' // fallback to first image
          }
        }

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

        const url = await saveFile(
          await import('fs/promises').then((f) => f.readFile(clipLocalPath)),
          clipRelPath
        )
        sceneVideoUrls.push(url)

        await updateVideoProject(projectId, {
          status: 'composing',
          progress: Math.round(50 + ((i + 1) / scenes.length) * 20),
          sceneVideoUrls,
        })
      }
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
    const srtRelPath = `${base}/subtitles.srt`
    const srtLocalPath = getLocalPath(srtRelPath)
    await writeSrtFile(subtitles, srtLocalPath)

    const finalRelPath = `${base}/final.mp4`
    const finalLocalPath = getLocalPath(finalRelPath)
    await burnSubtitles(rawLocalPath, srtLocalPath, finalLocalPath, settings.subtitleStyle)
    const finalVideoUrl = await saveFile(
      await import('fs/promises').then((f) => f.readFile(finalLocalPath)),
      finalRelPath
    )

    await updateVideoProject(projectId, {
      status: 'complete',
      progress: 100,
      subtitles,
      finalVideoUrl,
    })

    console.log(`[Video Pipeline] Project ${projectId} complete: ${finalVideoUrl}`)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown pipeline error'
    console.error(`[Video Pipeline] Project ${projectId} failed:`, error)
    await updateVideoProject(projectId, { status: 'failed', errorMessage: msg })
  }
}
