import { NextRequest, NextResponse } from 'next/server'
import { generateStory, getGeminiErrorResponse } from '@/lib/gemini'
import { createStory } from '@/lib/db'
import type { Story } from '@/types'

// POST /api/story/generate — Generate story text only (v2)
// Images and audio are generated later in the video pipeline (/api/video/start)
export async function POST(request: NextRequest) {
  try {
    const {
      synopsisId,
      characterIds,
      characterNames,
      optionIndex,
      optionTitle,
      optionDescription,
      keywords,
      ageGroup,
      relationship,
      // Legacy single-character fields (kept for backward compat)
      characterId,
      characterName,
    } = await request.json()

    // Normalize to arrays — support both new multi-char and legacy single-char
    const names: string[] = Array.isArray(characterNames) && characterNames.length > 0
      ? characterNames
      : typeof characterName === 'string' && characterName.trim()
        ? [characterName.trim()]
        : []
    const ids: string[] = Array.isArray(characterIds) && characterIds.length > 0
      ? characterIds
      : typeof characterId === 'string'
        ? [characterId]
        : []

    if (names.length === 0 || optionIndex === undefined) {
      return NextResponse.json(
        { error: 'characterName(s) and optionIndex are required' },
        { status: 400 }
      )
    }

    const setting = [
      typeof optionTitle === 'string' ? optionTitle : '',
      typeof optionDescription === 'string' ? optionDescription : '',
      typeof keywords === 'string' ? keywords : '',
    ]
      .filter(Boolean)
      .join(' - ')

    const resolvedRelationship =
      (typeof relationship === 'string' && relationship.trim()) || ''

    // ── Generate story text ────────────────────────────────────
    let storyText = ''
    try {
      storyText = await generateStory(
        names,
        setting || 'A magical bedtime adventure',
        typeof ageGroup === 'string' ? ageGroup : '4-6',
        undefined,
        resolvedRelationship || undefined
      )
    } catch (error) {
      const { status, message } = getGeminiErrorResponse(error)
      return NextResponse.json({ error: message }, { status })
    }

    const title = names.length === 1
      ? `${names[0]}'s Adventure`
      : names.length === 2
        ? `${names[0]} & ${names[1]}'s Adventure`
        : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}'s Adventure`

    // ── Save to DB ─────────────────────────────────────────────
    let dbStory
    if (ids.length > 0) {
      try {
        dbStory = await createStory({
          synopsisId: typeof synopsisId === 'string' ? synopsisId : undefined,
          characterIds: ids,
          title,
          content: storyText,
          images: [],
          audioUrl: '',
          sceneAudioUrls: [],
        })
      } catch (dbError) {
        console.warn('[Story Generate] DB save failed:', dbError)
      }
    }

    const story: Story = {
      id: dbStory?.id ?? `local-story-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      synopsisId: typeof synopsisId === 'string' ? synopsisId : undefined,
      characterIds: ids,
      title,
      synopsis: '',
      content: storyText,
      mainImage: '',
      status: 'complete',
      images: [],
      audioUrl: '',
      sceneAudioUrls: [],
      createdAt: dbStory?.createdAt ?? new Date(),
      updatedAt: dbStory?.updatedAt ?? new Date(),
    }

    return NextResponse.json({ story })
  } catch (error) {
    console.error('[Story Generate] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
