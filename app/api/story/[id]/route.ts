import { NextRequest, NextResponse } from 'next/server'
import { getStory, deleteStory, getVideoProjectByStoryId } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // SSE mode: stream video project updates until terminal state
  const acceptsSSE = request.headers.get('accept')?.includes('text/event-stream')
  if (acceptsSSE) {
    return streamVideoProgress(id)
  }

  const [story, videoProject] = await Promise.all([
    getStory(id),
    getVideoProjectByStoryId(id),
  ])
  if (!story) {
    return NextResponse.json({ error: 'Story not found' }, { status: 404 })
  }
  return NextResponse.json({ story, videoProject: videoProject ?? null })
}

function streamVideoProgress(storyId: string) {
  const encoder = new TextEncoder()
  const POLL_INTERVAL_MS = 3000
  const MAX_POLL_MS = 15 * 60 * 1000

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      const startTime = Date.now()
      let closed = false

      const cleanup = () => {
        if (!closed) {
          closed = true
          try { controller.close() } catch { /* already closed */ }
        }
      }

      const poll = async () => {
        if (closed) return

        // Safety timeout
        if (Date.now() - startTime > MAX_POLL_MS) {
          send('error', { error: 'Video generation timed out. Please try again.' })
          cleanup()
          return
        }

        try {
          const videoProject = await getVideoProjectByStoryId(storyId)
          if (!videoProject) {
            send('progress', { videoProject: null })
          } else {
            const isTerminal = videoProject.status === 'complete' || videoProject.status === 'failed'
            send('progress', { videoProject })
            if (isTerminal) {
              cleanup()
              return
            }
          }
        } catch {
          // Ignore individual poll errors, keep trying
        }

        if (!closed) {
          setTimeout(poll, POLL_INTERVAL_MS)
        }
      }

      // Start polling immediately
      await poll()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
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
