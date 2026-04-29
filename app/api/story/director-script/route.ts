import { NextRequest, NextResponse } from 'next/server'
import { getStory, getStorybook, createScript, getCharacter } from '@/lib/db'
import { generateInterleavedDirectorScript, generateStorybookDirectorScript, getGeminiErrorResponse } from '@/lib/gemini'
import { resolveApiKey } from '@/lib/api-utils'
import { normalizeLocale } from '@/lib/i18n/shared'
import { resolveStorybookCharacters, resolveStorybookStyle, resolveStoryCharacterReferences } from '@/lib/storybook-helpers'
import { extractSceneContexts, splitStoryIntoScenes } from '@/lib/story-scenes'
import { saveFile } from '@/lib/storage'

/**
 * POST /api/story/director-script
 *
 * Generates an anime-director storyboard script from a completed story.
 * Returns an SSE stream with progress/complete/error events.
 *
 * Request body:
 *   storyId        — required
 *   protagonistName — (optional) overrides auto-resolved protagonist name
 *   supportingName  — (optional) overrides auto-resolved supporting name
 *   ageRange        — (optional) overrides storybook ageRange
 *   styleDesc       — (optional) overrides storybook style description
 *   minLength       — (optional) minimum number of scenes, default 4
 *   maxLength       — (optional) maximum number of scenes, default 4
 *
 * Character names, ageRange, and styleDesc are auto-resolved from the storybook when omitted.
 */
export async function POST(request: NextRequest) {
  const apiKey = resolveApiKey(request)

  // Parse and validate request body before starting the stream
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

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
  } = body as Record<string, string | number | undefined>
  const locale = normalizeLocale(localeRaw as string | undefined)

  if (!storyId) {
    return NextResponse.json({ error: 'storyId is required' }, { status: 400 })
  }

  const minSceneCountRaw = minLength ?? minlength
  const maxSceneCountRaw = maxLength ?? maxlength

  const minSceneCount =
    minSceneCountRaw === undefined
      ? 4
      : Number.isFinite(minSceneCountRaw)
        ? Math.trunc(minSceneCountRaw as number)
        : NaN
  const maxSceneCount =
    maxSceneCountRaw === undefined
      ? 4
      : Number.isFinite(maxSceneCountRaw)
        ? Math.trunc(maxSceneCountRaw as number)
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

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        const story = await getStory(storyId as string)
        if (!story) {
          send('error', { error: 'Story not found' })
          controller.close()
          return
        }

        // Auto-resolve from storybook; allow per-request overrides
        let protagonistName = (protagonistOverride as string | undefined) ?? (locale === 'zh' ? '主角' : 'Protagonist')
        let supportingName = (supportingOverride as string | undefined) ?? (locale === 'zh' ? '配角' : 'Companion')
        let ageRange = (ageRangeOverride as string | undefined) ?? ''
        let styleDesc = (styleDescOverride as string | undefined) ?? 'warm 2D anime style, macaron palette'
        let protagonistPronoun = ''
        let protagonistRole = ''
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
              protagonistPronoun = resolved.protagonistPronoun
              protagonistRole = resolved.protagonistRole
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

        // Resolve character reference images for interleaved generation
        const charRefs = await resolveStoryCharacterReferences(storyId as string)

        // Extract scene contexts from story content for parallel generation
        const storySceneContexts = extractSceneContexts(story.content)
        const storySceneTexts = storySceneContexts.length > 0
          ? splitStoryIntoScenes(story.content)
          : []

        // When scene contexts exist, derive scene count from them; otherwise use request params
        const sceneCount = storySceneContexts.length > 0
          ? storySceneContexts.length
          : minSceneCount

        let scenes: import('@/types').DirectorStoryboardScene[]
        let scriptId: string

        // Try interleaved generation first (script + images in one call)
        try {
          console.log('[Director Script] Attempting interleaved generation', { sceneCount })
          const result = await generateInterleavedDirectorScript({
            storyName: story.title,
            protagonistName,
            supportingName,
            storyContent: story.content,
            ageRange,
            styleDesc,
            locale,
            characterPool,
            characterProfiles,
            sceneCount,
            protagonistPronoun,
            protagonistRole,
            characterImagesBase64: charRefs.imagesBase64,
            characterNames: charRefs.names,
            sceneTexts: storySceneTexts.length === sceneCount ? storySceneTexts : undefined,
            sceneContexts: storySceneContexts.length === sceneCount ? storySceneContexts : undefined,
            apiKey,
            onProgress: (event) => {
              send('progress', event)
            },
          })

          scenes = result.scenes

          if (!scenes.length) {
            throw new Error('Interleaved generation returned no scenes')
          }

          const totalDuration = scenes.reduce((sum, s) => sum + (s.estimatedDuration ?? 10), 0)
          const script = await createScript({ storyId: storyId as string, scenes, totalDuration })
          scriptId = script.id

          // Save pre-generated scene frame images to storage
          const imageEntries = Array.from(result.sceneImages.entries())
          let totalFramesSaved = 0
          if (imageEntries.length > 0) {
            await Promise.all(
              imageEntries.flatMap(([idx, frames]) =>
                frames.map(async (img, frameIdx) => {
                  const relPath = `videos/pre-${scriptId}/scene-${idx}-frame-${frameIdx}.jpg`
                  await saveFile(Buffer.from(img.data, 'base64'), relPath)
                  totalFramesSaved++
                })
              )
            )
            console.log(`[Director Script] Saved ${totalFramesSaved} pre-generated frame images for script ${scriptId}`)
          }

          console.log('[Director Script] Interleaved generation succeeded', {
            sceneCount: scenes.length,
            scenesWithImages: result.sceneImages.size,
            totalFrames: totalFramesSaved,
            scriptId,
          })

          send('complete', {
            script: {
              id: scriptId,
              storyId: script.storyId,
              scenes,
              totalDuration,
              sceneCount: scenes.length,
              createdAt: script.createdAt,
            },
          })
          controller.close()
          return
        } catch (interleavedError) {
          console.warn('[Director Script] Interleaved generation failed, falling back to text-only:', interleavedError)
        }

        // Fallback: text-only director script generation
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
            protagonistPronoun,
            protagonistRole,
            apiKey,
          })
        } catch (error) {
          const { message } = getGeminiErrorResponse(error)
          send('error', { error: message })
          controller.close()
          return
        }

        if (!scenes.length) {
          send('error', { error: 'Director script generation returned no scenes' })
          controller.close()
          return
        }

        const totalDuration = scenes.reduce((sum, s) => sum + (s.estimatedDuration ?? 10), 0)
        const script = await createScript({ storyId: storyId as string, scenes, totalDuration })

        send('complete', {
          script: {
            id: script.id,
            storyId: script.storyId,
            scenes,
            totalDuration,
            sceneCount: scenes.length,
            createdAt: script.createdAt,
          },
        })
        controller.close()
      } catch (error) {
        console.error('[Director Script] Error:', error)
        try {
          send('error', { error: 'Internal server error' })
          controller.close()
        } catch {
          // stream may already be closed
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
