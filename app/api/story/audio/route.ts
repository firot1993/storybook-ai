import { NextRequest, NextResponse } from 'next/server'
import { updateStoryAudio } from '@/lib/db'
import { GeminiTtsError, generateSceneNarrationAudioUrls } from '@/lib/gemini-tts'
import { splitStoryIntoScenes } from '@/lib/story-scenes'

// POST /api/story/audio - Generate (or regenerate) narration audio from existing story content
export async function POST(request: NextRequest) {
  try {
    const { storyId, content, sceneCount } = await request.json()

    if (typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json(
        { error: 'Story content is required.' },
        { status: 400 }
      )
    }

    const maxSceneCount = typeof sceneCount === 'number' && Number.isFinite(sceneCount)
      ? Math.max(1, Math.trunc(sceneCount))
      : undefined
    const parsedScenes = splitStoryIntoScenes(content)
    const targetScenes = (maxSceneCount ? parsedScenes.slice(0, maxSceneCount) : parsedScenes)
    const sceneAudioUrls = await generateSceneNarrationAudioUrls(
      targetScenes.length > 0 ? targetScenes : [content]
    )
    const audioUrl = sceneAudioUrls.find(Boolean) || ''

    if (!audioUrl) {
      return NextResponse.json(
        { error: 'Audio generation returned no playable scenes.' },
        { status: 502 }
      )
    }

    let persisted = false
    if (
      typeof storyId === 'string' &&
      storyId.trim().length > 0 &&
      !storyId.startsWith('local-')
    ) {
      try {
        await updateStoryAudio(storyId, { audioUrl, sceneAudioUrls })
        persisted = true
      } catch (error) {
        console.warn(`Failed to persist regenerated audio for story ${storyId}:`, error)
      }
    }

    return NextResponse.json({
      audioUrl,
      sceneAudioUrls,
      persisted,
    })
  } catch (error) {
    if (error instanceof GeminiTtsError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error('Error generating story audio:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
