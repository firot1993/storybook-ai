import { NextRequest, NextResponse } from 'next/server'
import { getStory, getStorybook, createScript } from '@/lib/db'
import { generateStorybookDirectorScript, getGeminiErrorResponse } from '@/lib/gemini'
import { resolveStorybookCharacters, resolveStorybookStyle } from '@/lib/storybook-helpers'

/**
 * POST /api/story/director-script
 *
 * Generates an anime-director storyboard script (15-18 scenes) from a completed story.
 * Each scene contains voiceOver, dialogue, cameraDesign, animationAction, and 3 key-frame
 * image prompts (opening / midAction / ending) for multi-frame video generation.
 *
 * Request body:
 *   storyId        — required
 *   protagonistName — (optional) overrides auto-resolved protagonist name
 *   supportingName  — (optional) overrides auto-resolved supporting name
 *   ageRange        — (optional) overrides storybook ageRange
 *   styleDesc       — (optional) overrides storybook style description
 *
 * Character names, ageRange, and styleDesc are auto-resolved from the storybook when omitted.
 */
export async function POST(request: NextRequest) {
  try {
    const {
      storyId,
      protagonistName: protagonistOverride,
      supportingName: supportingOverride,
      ageRange: ageRangeOverride,
      styleDesc: styleDescOverride,
    } = await request.json()

    if (!storyId) {
      return NextResponse.json({ error: 'storyId is required' }, { status: 400 })
    }

    const story = await getStory(storyId)
    if (!story) {
      return NextResponse.json({ error: 'Story not found' }, { status: 404 })
    }

    // Auto-resolve from storybook; allow per-request overrides
    let protagonistName = protagonistOverride ?? '主角'
    let supportingName = supportingOverride ?? '配角'
    let ageRange = ageRangeOverride ?? '4-6'
    let styleDesc = styleDescOverride ?? '温馨2D动漫风格，马卡龙色调'

    if (story.storybookId) {
      const storybook = await getStorybook(story.storybookId)
      if (storybook) {
        if (!ageRangeOverride) ageRange = storybook.ageRange
        if (!styleDescOverride) styleDesc = resolveStorybookStyle(storybook)

        if (!protagonistOverride || !supportingOverride) {
          const resolved = await resolveStorybookCharacters(storybook)
          if (!protagonistOverride) protagonistName = resolved.protagonistName
          if (!supportingOverride) supportingName = resolved.supportingName
        }
      }
    }

    let scenes: import('@/types').DirectorStoryboardScene[]
    try {
      scenes = await generateStorybookDirectorScript({
        storyName: story.title,
        protagonistName,
        supportingName,
        storyContent: story.content,
        ageRange,
        styleDesc,
      })
    } catch (error) {
      const { status, message } = getGeminiErrorResponse(error)
      return NextResponse.json({ error: message }, { status })
    }

    if (!scenes.length) {
      return NextResponse.json(
        { error: 'Director script generation returned no scenes' },
        { status: 500 }
      )
    }

    const totalDuration = scenes.reduce((sum, s) => sum + (s.estimatedDuration ?? 10), 0)
    const script = await createScript({ storyId, scenes, totalDuration })

    return NextResponse.json({
      script: {
        id: script.id,
        storyId: script.storyId,
        scenes,
        totalDuration,
        sceneCount: scenes.length,
        createdAt: script.createdAt,
      },
    })
  } catch (error) {
    console.error('[Director Script] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
