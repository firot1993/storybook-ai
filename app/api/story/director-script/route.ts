import { NextRequest, NextResponse } from 'next/server'
import { getStory, getStorybook, createScript, getCharacter } from '@/lib/db'
import { generateStorybookDirectorScript, getGeminiErrorResponse } from '@/lib/gemini'
import { normalizeLocale } from '@/lib/i18n/shared'
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
 *   minLength       — (optional) minimum number of scenes, default 15
 *   maxLength       — (optional) maximum number of scenes, default 18
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
      minLength,
      maxLength,
      minlength,
      maxlength,
      locale: localeRaw,
    } = await request.json()
    const locale = normalizeLocale(localeRaw)

    if (!storyId) {
      return NextResponse.json({ error: 'storyId is required' }, { status: 400 })
    }

    const minSceneCountRaw = minLength ?? minlength
    const maxSceneCountRaw = maxLength ?? maxlength

    const minSceneCount =
      minSceneCountRaw === undefined
        ? 15
        : Number.isFinite(minSceneCountRaw)
          ? Math.trunc(minSceneCountRaw)
          : NaN
    const maxSceneCount =
      maxSceneCountRaw === undefined
        ? 18
        : Number.isFinite(maxSceneCountRaw)
          ? Math.trunc(maxSceneCountRaw)
          : NaN

    if (!Number.isFinite(minSceneCount) || !Number.isFinite(maxSceneCount)) {
      return NextResponse.json(
        { error: 'minLength and maxLength must be numbers' },
        { status: 400 }
      )
    }
    if (minSceneCount < 1 || maxSceneCount < 1) {
      return NextResponse.json(
        { error: 'minLength and maxLength must be >= 1' },
        { status: 400 }
      )
    }
    if (minSceneCount > maxSceneCount) {
      return NextResponse.json(
        { error: 'minLength cannot be greater than maxLength' },
        { status: 400 }
      )
    }

    const story = await getStory(storyId)
    if (!story) {
      return NextResponse.json({ error: 'Story not found' }, { status: 404 })
    }

    // Auto-resolve from storybook; allow per-request overrides
    let protagonistName = protagonistOverride ?? (locale === 'zh' ? '主角' : 'Protagonist')
    let supportingName = supportingOverride ?? (locale === 'zh' ? '配角' : 'Companion')
    let ageRange = ageRangeOverride ?? '4-6'
    let styleDesc = styleDescOverride ?? 'warm 2D anime style, macaron palette'
    const characterPool: string[] = []
    const characterProfiles: Array<{ name: string; description?: string }> = []
    const seenCharacterName = new Set<string>()
    const pushCharacterName = (name: string | null | undefined) => {
      const trimmed = name?.trim() || ''
      if (!trimmed) return
      const key = trimmed.toLowerCase()
      if (seenCharacterName.has(key)) return
      seenCharacterName.add(key)
      characterPool.push(trimmed)
    }
    const seenCharacterProfile = new Set<string>()
    const pushCharacterProfile = (
      name: string | null | undefined,
      description: string | null | undefined
    ) => {
      const trimmedName = name?.trim() || ''
      if (!trimmedName) return
      const key = trimmedName.toLowerCase()
      const trimmedDescription = description?.trim() || ''
      if (seenCharacterProfile.has(key)) {
        if (trimmedDescription) {
          const index = characterProfiles.findIndex((profile) => profile.name.toLowerCase() === key)
          if (index >= 0 && !characterProfiles[index].description) {
            characterProfiles[index].description = trimmedDescription
          }
        }
        return
      }
      seenCharacterProfile.add(key)
      characterProfiles.push({
        name: trimmedName,
        ...(trimmedDescription ? { description: trimmedDescription } : {}),
      })
    }

    if (story.storybookId) {
      const storybook = await getStorybook(story.storybookId)
      if (storybook) {
        if (!ageRangeOverride) ageRange = storybook.ageRange
        if (!styleDescOverride) styleDesc = resolveStorybookStyle(storybook)

        if (!protagonistOverride || !supportingOverride) {
          const resolved = await resolveStorybookCharacters(storybook, locale)
          if (!protagonistOverride) protagonistName = resolved.protagonistName
          if (!supportingOverride) supportingName = resolved.supportingName
        }

        const records = await Promise.all(
          storybook.characters.map((entry) => (entry.id ? getCharacter(entry.id) : Promise.resolve(null)))
        )
        storybook.characters.forEach((entry, i) => {
          const character = records[i]
          const resolvedName = character?.name || entry.name
          pushCharacterName(resolvedName)
          pushCharacterProfile(resolvedName, entry.description)
        })
      }
    }
    pushCharacterName(protagonistName)
    pushCharacterProfile(protagonistName, undefined)
    supportingName
      .split(/[、,，/|]/)
      .map((name: string) => name.trim())
      .forEach((name: string) => {
        pushCharacterName(name)
        pushCharacterProfile(name, undefined)
      })

    let scenes: import('@/types').DirectorStoryboardScene[]
    try {
      scenes = await generateStorybookDirectorScript({
        storyName: story.title,
        protagonistName,
        supportingName,
        storyContent: story.content,
        ageRange,
        styleDesc,
        locale,
        characterPool,
        characterProfiles,
        minSceneCount,
        maxSceneCount,
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
