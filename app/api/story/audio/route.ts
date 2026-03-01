import { NextRequest, NextResponse } from 'next/server'
import { updateStoryAudio } from '@/lib/db'
import { GeminiTtsError, generateNarrationAudioUrl } from '@/lib/gemini-tts'

// POST /api/story/audio - Generate (or regenerate) narration audio from existing story content
export async function POST(request: NextRequest) {
  try {
    const { storyId, content } = await request.json()

    if (typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json(
        { error: 'Story content is required.' },
        { status: 400 }
      )
    }

    const audioUrl = await generateNarrationAudioUrl(content)

    let persisted = false
    if (
      typeof storyId === 'string' &&
      storyId.trim().length > 0 &&
      !storyId.startsWith('local-')
    ) {
      try {
        await updateStoryAudio(storyId, audioUrl)
        persisted = true
      } catch (error) {
        console.warn(`Failed to persist regenerated audio for story ${storyId}:`, error)
      }
    }

    return NextResponse.json({
      audioUrl,
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
