import { NextRequest, NextResponse } from 'next/server'
import { getCharacter, updateCharacter, deleteCharacter } from '@/lib/db'

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
  const { name, description } = await request.json()
  
  const updateData: { name?: string; description?: string } = {}
  if (typeof name === 'string' && name.trim()) {
    updateData.name = name.trim()
  }
  if (typeof description === 'string') {
    updateData.description = description.trim()
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
