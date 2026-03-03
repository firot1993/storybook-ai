import { NextRequest, NextResponse } from 'next/server'
import { generateScript, getGeminiErrorResponse } from '@/lib/gemini'
import { getStory, createScript } from '@/lib/db'

// POST /api/story/script — Generate a structured video script from a story
export async function POST(request: NextRequest) {
  try {
    const {
      storyId,
      characterNames = [],
    } = await request.json()

    if (!storyId) {
      return NextResponse.json({ error: 'storyId is required' }, { status: 400 })
    }

    const story = await getStory(storyId)
    if (!story) {
      return NextResponse.json({ error: 'Story not found' }, { status: 404 })
    }

    let scenes: import('@/types').ScriptScene[]
    try {
      scenes = await generateScript(story.content, characterNames, [])
    } catch (error) {
      const { status, message } = getGeminiErrorResponse(error)
      return NextResponse.json({ error: message }, { status })
    }

    if (!scenes.length) {
      return NextResponse.json(
        { error: 'Failed to generate script — no scenes returned from AI' },
        { status: 500 }
      )
    }

    const totalDuration = scenes.reduce((sum, s) => sum + (s.estimatedDuration ?? 0), 0)
    const script = await createScript({ storyId, scenes, totalDuration })

    return NextResponse.json({
      script: {
        id: script.id,
        storyId: script.storyId,
        scenes,
        totalDuration,
        createdAt: script.createdAt,
      },
    })
  } catch (error) {
    console.error('[Script] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
