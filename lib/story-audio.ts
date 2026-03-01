export type StoryAudioPayload = {
  audioUrl?: string
  sceneAudioUrls?: string[]
}

const PAYLOAD_PREFIX = 'json:'

export function encodeStoryAudioPayload(payload: StoryAudioPayload): string {
  const sceneAudioUrls = (payload.sceneAudioUrls ?? []).filter(Boolean)
  const audioUrl = payload.audioUrl ?? ''

  if (sceneAudioUrls.length === 0) {
    return audioUrl
  }

  const json = JSON.stringify({
    audioUrl,
    sceneAudioUrls,
  })

  return `${PAYLOAD_PREFIX}${Buffer.from(json, 'utf8').toString('base64')}`
}

export function decodeStoryAudioPayload(stored: string): Required<StoryAudioPayload> {
  if (!stored) {
    return { audioUrl: '', sceneAudioUrls: [] }
  }

  if (!stored.startsWith(PAYLOAD_PREFIX)) {
    return { audioUrl: stored, sceneAudioUrls: [] }
  }

  try {
    const base64 = stored.slice(PAYLOAD_PREFIX.length)
    const parsed = JSON.parse(Buffer.from(base64, 'base64').toString('utf8')) as StoryAudioPayload
    const sceneAudioUrls = (parsed.sceneAudioUrls ?? []).filter(Boolean)
    const audioUrl = parsed.audioUrl || sceneAudioUrls[0] || ''
    return { audioUrl, sceneAudioUrls }
  } catch {
    return { audioUrl: '', sceneAudioUrls: [] }
  }
}
