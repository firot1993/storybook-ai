import { NextRequest, NextResponse } from 'next/server'
import {
  getCharacterRelationship,
  listCharacterRelationships,
  setCharacterRelationship,
} from '@/lib/db'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const characterAId = searchParams.get('characterAId')
  const characterBId = searchParams.get('characterBId')

  if (characterAId && characterBId) {
    const relationship = await getCharacterRelationship(characterAId, characterBId)
    return NextResponse.json({ relationship: relationship ?? null })
  }

  const relationships = await listCharacterRelationships()
  return NextResponse.json({ relationships })
}

export async function POST(request: NextRequest) {
  try {
    const { characterAId, characterBId, relationship } = await request.json()

    if (typeof characterAId !== 'string' || typeof characterBId !== 'string') {
      return NextResponse.json(
        { error: 'characterAId and characterBId are required' },
        { status: 400 }
      )
    }
    if (typeof relationship !== 'string') {
      return NextResponse.json(
        { error: 'relationship must be a string' },
        { status: 400 }
      )
    }

    const saved = await setCharacterRelationship(characterAId, characterBId, relationship)
    return NextResponse.json({ relationship: saved })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save relationship'
    const status = message.includes('two different characters') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
