import { NextRequest, NextResponse } from 'next/server'
import { readFile, fileExists } from '@/lib/storage'
import path from 'path'

const MIME_MAP: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  srt: 'text/plain',
}

// GET /api/files/[...path] — Serve local storage files
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params
  const relativePath = pathSegments.join('/')
  const ext = path.extname(relativePath).slice(1).toLowerCase()
  const mimeType = MIME_MAP[ext] ?? 'application/octet-stream'

  if (!(await fileExists(relativePath))) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  const buffer = await readFile(relativePath)
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
