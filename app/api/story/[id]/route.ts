import { NextRequest, NextResponse } from 'next/server'
import { getStory, deleteStory, getVideoProjectByStoryId } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const [story, videoProject] = await Promise.all([
    getStory(id),
    getVideoProjectByStoryId(id),
  ])
  if (!story) {
    return NextResponse.json({ error: 'Story not found' }, { status: 404 })
  }
  return NextResponse.json({ story, videoProject: videoProject ?? null })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    await deleteStory(id)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Story not found' }, { status: 404 })
  }
}
