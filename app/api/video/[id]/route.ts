import { NextRequest, NextResponse } from 'next/server'
import { getVideoProject, deleteVideoProject } from '@/lib/db'
import { deleteProjectFiles } from '@/lib/storage'

// GET /api/video/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const project = await getVideoProject(id)
  if (!project) {
    return NextResponse.json({ error: 'Video project not found' }, { status: 404 })
  }
  return NextResponse.json({ videoProject: project })
}

// DELETE /api/video/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    await deleteVideoProject(id)
    await deleteProjectFiles(id).catch(() => {})
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Video DELETE] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
