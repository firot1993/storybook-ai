import { NextRequest, NextResponse } from 'next/server'
import { generateStoryOptions } from '@/lib/gemini'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// POST /api/story/options - Generate story options
export async function POST(request: NextRequest) {
  try {
    const { characterId, keywords, ageGroup } = await request.json()

    if (!characterId || !keywords) {
      return NextResponse.json(
        { error: 'Character ID and keywords are required' },
        { status: 400 }
      )
    }

    // Get character name from Firestore
    const characterDoc = await getDoc(doc(db, 'characters', characterId))
    if (!characterDoc.exists()) {
      return NextResponse.json(
        { error: 'Character not found' },
        { status: 404 }
      )
    }

    const character = characterDoc.data()
    const characterName = character.name || 'the character'

    // Generate story options using Gemini 3 Flash
    const options = await generateStoryOptions(characterName, keywords, ageGroup)

    if (options.length === 0) {
      return NextResponse.json(
        { error: 'Failed to generate story options' },
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
