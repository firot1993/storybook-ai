import { NextRequest, NextResponse } from 'next/server'
import { getScript, createVideoProject, updateVideoProject } from '@/lib/db'
import { generateSceneIllustration } from '@/lib/banana-img'
import { generateSceneNarrationAudioUrl } from '@/lib/gemini-tts'
import { generateSceneVideo, isXaiConfigured } from '@/lib/xai'
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

    if (!isXaiConfigured()) {
      return NextResponse.json({ error: 'XAI_API_KEY is not configured' }, { status: 500 })
    }

    const script = await getScript(scriptId)
    if (!script) {
      return NextResponse.json({ error: 'Script not found' }, { status: 404 })
    }

    const settings: VideoSettings = { ...DEFAULT_SETTINGS, ...videoSettings }
    const project = await createVideoProject({ storyId, scriptId, videoSettings: settings as unknown as Record<string, unknown> })

    // Fire-and-forget: run pipeline in background
    runPipeline(project.id, script.scenes, characterImages).catch((err) => {
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
  characterImages: string[]
): Promise<void> {
  const base = `videos/${projectId}`

  try {
    // Extract character base64 for image reference
    const charImagesBase64 = characterImages
      .map((img) => (img.includes('base64,') ? img.split('base64,')[1] : img))
      .filter(Boolean)

    // ── Stage 1: Generate scene images via Gemini/Banana (parallel, max 3) ─
    await updateVideoProject(projectId, { status: 'generating_images', progress: 5 })
    const imageBase64List: string[] = []

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
          // Also persist image file for reference
          const relPath = `${base}/scene-${idx}.jpg`
          await saveFile(Buffer.from(result.data, 'base64'), relPath)
          return { idx, base64: result.data }
        })
      )

      for (const r of results) {
        if (r.status === 'fulfilled') {
          imageBase64List[r.value.idx] = r.value.base64
        } else {
          console.warn(`[Pipeline] Scene image ${i} failed:`, r.reason)
          imageBase64List[i] = imageBase64List[0] ?? ''
        }
      }

      const done = Math.min(i + 3, scenes.length)
      await updateVideoProject(projectId, {
        status: 'generating_images',
        progress: Math.round(5 + (done / scenes.length) * 20),
      })
    }

    // ── Stage 2: Generate scene narration audio ───────────────
    await updateVideoProject(projectId, { status: 'generating_audio', progress: 25 })
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
        progress: Math.round(25 + ((i + 1) / scenes.length) * 20),
      })
    }

    // ── Stage 3: Animate each scene image with xAI ───────────
    await updateVideoProject(projectId, { status: 'composing', progress: 45 })
    const sceneVideoUrls: string[] = []

    for (let i = 0; i < scenes.length; i++) {
      const base64 = imageBase64List[i]
      if (!base64) {
        console.warn(`[Pipeline] Scene ${i}: no image, skipping xAI generation`)
        continue
      }

      try {
        const animationPrompt = scenes[i].narration || scenes[i].imagePrompt
        console.log(`[xAI] Scene ${i}: generating video from scene image…`)

        const videoBuffer = await generateSceneVideo(base64, animationPrompt)

        const clipRelPath = `${base}/scene-${i}.mp4`
        const url = await saveFile(videoBuffer, clipRelPath)
        sceneVideoUrls.push(url)

        console.log(`[xAI] Scene ${i}: video saved → ${clipRelPath}`)
      } catch (err) {
        console.error(`[Pipeline] Scene ${i} xAI video failed:`, err)
      }

      await updateVideoProject(projectId, {
        status: 'composing',
        progress: Math.round(45 + ((i + 1) / scenes.length) * 50),
        sceneVideoUrls,
      })
    }

    if (sceneVideoUrls.length === 0) {
      throw new Error('No scene videos were generated by xAI')
    }

    await updateVideoProject(projectId, {
      status: 'complete',
      progress: 100,
      sceneVideoUrls,
    })

    console.log(`[Video Pipeline] Project ${projectId} complete — ${sceneVideoUrls.length} scenes`)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown pipeline error'
    console.error(`[Video Pipeline] Project ${projectId} failed:`, error)
    await updateVideoProject(projectId, { status: 'failed', errorMessage: msg })
  }
}
