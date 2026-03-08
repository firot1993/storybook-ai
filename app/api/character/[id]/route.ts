import { NextRequest, NextResponse } from 'next/server'
import { getCharacter, updateCharacter, deleteCharacter } from '@/lib/db'
import { assignCharacterVoice } from '@/lib/gemini'
import { normalizeLocale } from '@/lib/i18n/shared'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const character = await getCharacter(id)
  if (!character) {
    return NextResponse.json({ error: 'Character not found' }, { status: 404 })
  }
  return NextResponse.json({ character })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()

  if (body.action === 'assignVoice') {
    const locale = normalizeLocale(body.locale)
    const character = await getCharacter(id)
    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }
    try {
      const { voiceName, reason } = await assignCharacterVoice(
        character.name,
        character.age,
        character.style,
        character.voiceName || undefined,  // exclude current voice so re-assign picks a different one
        locale
      )
      const updated = await updateCharacter(id, { voiceName })
      return NextResponse.json({ character: updated, voiceName, reason })
    } catch {
      return NextResponse.json({ error: 'Voice assignment failed' }, { status: 500 })
    }
  }

  const updateData: { name?: string; age?: number | null; voiceName?: string; pronoun?: string; role?: string } = {}
  if (typeof body.name === 'string' && body.name.trim()) {
    updateData.name = body.name.trim()
  }
  if (typeof body.age === 'number') {
    updateData.age = body.age
  }
  if (typeof body.voiceName === 'string') {
    updateData.voiceName = body.voiceName
  }
  if (typeof body.pronoun === 'string') {
    updateData.pronoun = body.pronoun
  }
  if (typeof body.role === 'string') {
    updateData.role = body.role
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  try {
    const character = await updateCharacter(id, updateData)
    return NextResponse.json({ character })
  } catch {
    return NextResponse.json({ error: 'Character not found' }, { status: 404 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    await deleteCharacter(id)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Character not found' }, { status: 404 })
  }
}
