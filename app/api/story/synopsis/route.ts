import { NextRequest, NextResponse } from 'next/server'
import { generateSynopsis, getGeminiErrorResponse } from '@/lib/gemini'
import { createSynopsis } from '@/lib/db'

// POST /api/story/synopsis — Generate a story synopsis/outline
export async function POST(request: NextRequest) {
  try {
    const {
      characterIds = [],
      characterNames = [],
      theme = '',
      keywords,
      ageGroup = '4-6',
      relationship,
    } = await request.json()

    if (!keywords || !Array.isArray(characterNames) || characterNames.length === 0) {
      return NextResponse.json(
        { error: 'characterNames and keywords are required' },
        { status: 400 }
      )
    }

    const resolvedRelationship =
      (typeof relationship === 'string' && relationship.trim()) || ''

    let content: string
    try {
      content = await generateSynopsis(
        characterNames,
        [],
        theme || keywords,
        keywords,
        ageGroup,
        resolvedRelationship || undefined
      )
    } catch (error) {
      const { status, message } = getGeminiErrorResponse(error)
      return NextResponse.json({ error: message }, { status })
    }

    if (!content) {
      return NextResponse.json({ error: 'Failed to generate synopsis' }, { status: 500 })
    }

    const synopsis = await createSynopsis({
      characterIds,
      theme: theme || keywords,
      keywords,
      ageGroup,
      content,
    })

    const estimatedSceneCount = Math.min(
      5,
      Math.max(3, (content.match(/\[(Opening|Problem|Adventure|Resolution|Scene \d)/g) || []).length)
    )

    return NextResponse.json({
      synopsis: {
        id: synopsis.id,
        content: synopsis.content,
        theme: synopsis.theme,
        estimatedSceneCount,
        createdAt: synopsis.createdAt,
      },
    })
  } catch (error) {
    console.error('[Synopsis] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
