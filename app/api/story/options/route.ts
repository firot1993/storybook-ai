import { NextRequest, NextResponse } from 'next/server'
import { generateStoryOptionsWithDiagnostics, getGeminiErrorResponse } from '@/lib/gemini'

// POST /api/story/options - Generate story options based on local character data
export async function POST(request: NextRequest) {
  try {
    const { characterName, characterNames, keywords, ageGroup, characterDescriptions } = await request.json()

    if (!keywords) {
      return NextResponse.json(
        { error: 'Keywords are required' },
        { status: 400 }
      )
    }

    // Support both legacy single characterName and new characterNames array
    let names: string[]
    if (Array.isArray(characterNames) && characterNames.length > 0) {
      names = characterNames.map((n: string) => (typeof n === 'string' && n.trim() ? n.trim() : 'the character'))
    } else {
      const single = typeof characterName === 'string' && characterName.trim().length > 0
        ? characterName.trim()
        : 'the character'
      names = [single]
    }

    const normalizedAgeGroup =
      typeof ageGroup === 'string' && ageGroup.trim().length > 0
        ? ageGroup
        : '4-6'

    let optionsResult: Awaited<ReturnType<typeof generateStoryOptionsWithDiagnostics>>
    try {
      optionsResult = await generateStoryOptionsWithDiagnostics(
        names,
        keywords,
        normalizedAgeGroup,
        characterDescriptions
      )
    } catch (error) {
      console.error('Gemini story options error:', error)
      const { status, message } = getGeminiErrorResponse(error)
      return NextResponse.json({ error: message }, { status })
    }

    const { options, diagnostics } = optionsResult

    if (options.length === 0) {
      console.error('No story options parsed from model output:', diagnostics)
      return NextResponse.json(
        {
          error: 'Failed to generate story options from model output.',
          ...(process.env.NODE_ENV !== 'production'
            ? { details: diagnostics }
            : {}),
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ options })
  } catch (error) {
    console.error('Error generating story options:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
