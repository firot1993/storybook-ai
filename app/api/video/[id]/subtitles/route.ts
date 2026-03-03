import { NextRequest, NextResponse } from 'next/server'
import { getVideoProject, updateVideoProject } from '@/lib/db'
import { burnSubtitles, writeSrtFile } from '@/lib/ffmpeg'
import { getLocalPath, saveFile } from '@/lib/storage'
import type { SubtitleCue } from '@/types'
import fs from 'fs/promises'

// PATCH /api/video/[id]/subtitles — Edit subtitles and re-burn
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const { subtitles }: { subtitles: SubtitleCue[] } = await request.json()

    if (!Array.isArray(subtitles) || subtitles.length === 0) {
      return NextResponse.json({ error: 'subtitles array is required' }, { status: 400 })
    }

    const project = await getVideoProject(id)
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    if (!project.rawVideoUrl) {
      return NextResponse.json(
        { error: 'Raw video not available yet — wait for pipeline to complete' },
        { status: 409 }
      )
    }

    const base = `videos/${id}`
    const srtLocalPath = getLocalPath(`${base}/subtitles-edited.srt`)
    await writeSrtFile(subtitles, srtLocalPath)

    const rawLocalPath = getLocalPath(`${base}/raw.mp4`)
    const finalRelPath = `${base}/final-edited.mp4`
    const finalLocalPath = getLocalPath(finalRelPath)

    await burnSubtitles(rawLocalPath, srtLocalPath, finalLocalPath)
    const finalVideoUrl = await saveFile(await fs.readFile(finalLocalPath), finalRelPath)

    await updateVideoProject(id, { subtitles, finalVideoUrl })

    return NextResponse.json({ success: true, finalVideoUrl, subtitles })
  } catch (error) {
    console.error('[Subtitles PATCH] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
