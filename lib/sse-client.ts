/**
 * Parse an SSE stream from a fetch Response into typed events.
 * Calls the appropriate handler for each event type.
 */
export async function readSSEStream<TComplete>(
  response: Response,
  handlers: {
    onProgress?: (data: {
      chunkIndex: number
      totalChunks: number
      scenesGenerated: number
      totalScenes: number
    }) => void
    onComplete: (data: TComplete) => void
    onError?: (data: { error: string }) => void
  }
): Promise<void> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // Process complete SSE messages (delimited by double newline)
    const parts = buffer.split('\n\n')
    // Last part may be incomplete — keep it in buffer
    buffer = parts.pop() ?? ''

    for (const part of parts) {
      const trimmed = part.trim()
      if (!trimmed) continue

      let eventType = 'message'
      let data = ''

      for (const line of trimmed.split('\n')) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7)
        } else if (line.startsWith('data: ')) {
          data = line.slice(6)
        }
      }

      if (!data) continue

      try {
        const parsed = JSON.parse(data)

        if (eventType === 'progress') {
          handlers.onProgress?.(parsed)
        } else if (eventType === 'complete') {
          handlers.onComplete(parsed)
        } else if (eventType === 'error') {
          if (handlers.onError) {
            handlers.onError(parsed)
          } else {
            throw new Error(parsed.error || 'SSE error event')
          }
        }
      } catch (e) {
        if (e instanceof SyntaxError) {
          console.warn('[SSE] Failed to parse data:', data)
        } else {
          throw e
        }
      }
    }
  }
}
