import { NextRequest } from 'next/server'
import { getVideoProject } from '@/lib/db'

// GET /api/video/[id]/status — SSE progress stream
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: object) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          )
        } catch {
          // Client disconnected
        }
      }

      const poll = async () => {
        try {
          const project = await getVideoProject(projectId)

          if (!project) {
            send('error', { message: 'Project not found' })
            controller.close()
            return
          }

          if (project.status === 'complete') {
            send('complete', {
              status: 'complete',
              progress: 100,
              finalVideoUrl: project.finalVideoUrl,
              sceneVideoUrls: project.sceneVideoUrls,
              subtitles: project.subtitles,
            })
            controller.close()
            return
          }

          if (project.status === 'failed') {
            send('error', {
              status: 'failed',
              message: project.errorMessage || 'Video generation failed',
            })
            controller.close()
            return
          }

          send('progress', {
            status: project.status,
            progress: project.progress,
            sceneVideoUrls: project.sceneVideoUrls,
          })

          setTimeout(poll, 2000)
        } catch (err) {
          console.error('[SSE Poll] Error:', err)
          controller.close()
        }
      }

      poll()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
