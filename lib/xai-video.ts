/**
 * xAI Video Generation Provider
 *
 * Supports:
 *  - Scene image generation  (grok-imagine-image via POST /v1/images/generations)
 *  - Scene video generation  (grok-imagine-video via POST /v1/videos/generations + polling)
 *
 * Set XAI_API_KEY in your environment to enable.
 * Optionally override model names via XAI_IMAGE_MODEL / XAI_VIDEO_MODEL.
 */

const XAI_API_URL = 'https://api.x.ai/v1'
const XAI_API_KEY = process.env.XAI_API_KEY || ''
const XAI_IMAGE_MODEL = process.env.XAI_IMAGE_MODEL || 'grok-imagine-image'
const XAI_VIDEO_MODEL = process.env.XAI_VIDEO_MODEL || 'grok-imagine-video'

export function isXaiConfigured(): boolean {
  return Boolean(XAI_API_KEY)
}

// ── Type definitions ─────────────────────────────────────────

interface XaiImageResponse {
  data: Array<{
    b64_json?: string
    url?: string
    revised_prompt?: string
  }>
}

interface XaiVideoStartResponse {
  request_id: string
}

interface XaiVideoStatusResponse {
  status: 'pending' | 'processing' | 'done' | 'failed'
  video?: {
    url: string
    duration: number
  }
  error?: string
  model?: string
}

// ── Image generation ─────────────────────────────────────────

/**
 * Generate a scene illustration using xAI's Aurora image model.
 * Returns base64-encoded JPEG data.
 */
export async function generateSceneImageWithXai(
  prompt: string
): Promise<{ data: string; mimeType: 'image/jpeg' }> {
  const response = await fetch(`${XAI_API_URL}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: XAI_IMAGE_MODEL,
      prompt,
      n: 1,
      response_format: 'b64_json',
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`xAI image generation failed (${response.status}): ${text.slice(0, 200)}`)
  }

  const data: XaiImageResponse = await response.json()
  const b64 = data.data[0]?.b64_json
  if (!b64) {
    throw new Error('xAI image generation returned no image data')
  }
  return { data: b64, mimeType: 'image/jpeg' }
}

// ── Video generation ─────────────────────────────────────────

/**
 * Generate an animated scene video clip using xAI's Grok Imagine video model.
 *
 * Supports two modes:
 *  - Image-to-video (recommended): pass `imageBase64` to animate a Gemini-
 *    generated scene illustration.  The base64 image is sent as a data URI
 *    so no public URL is required.
 *  - Text-to-video: omit `imageBase64` and xAI generates the visuals from
 *    the prompt alone.
 *
 * The generation is asynchronous: the API returns a request_id that is polled
 * until the video is ready.  The completed video (as a temporary URL) is then
 * downloaded and returned as a Buffer so it can be saved locally.
 *
 * @param prompt              Motion/animation description for the scene.
 * @param options.imageBase64 Base64-encoded source image (image-to-video mode).
 * @param options.imageMimeType MIME type of the source image (default 'image/jpeg').
 * @param options.duration    Clip length in seconds (1–10, default 8).
 * @param options.aspectRatio '16:9' | '1:1' | '9:16' etc. (default '16:9').
 * @param options.resolution  '480p' | '720p' (default '720p').
 */
export async function generateSceneVideoClipWithXai(
  prompt: string,
  options: {
    imageBase64?: string
    imageMimeType?: string
    duration?: number
    aspectRatio?: string
    resolution?: '480p' | '720p'
  } = {}
): Promise<Buffer> {
  const {
    imageBase64,
    imageMimeType = 'image/jpeg',
    duration = 8,
    aspectRatio = '16:9',
    resolution = '720p',
  } = options

  // Clamp duration to xAI's supported range (1–10 s)
  const clampedDuration = Math.min(Math.max(Math.round(duration), 1), 10)

  const requestBody: Record<string, unknown> = {
    model: XAI_VIDEO_MODEL,
    prompt,
    duration: clampedDuration,
    aspect_ratio: aspectRatio,
    resolution,
  }

  // Image-to-video: pass the source image as a base64 data URI
  if (imageBase64) {
    requestBody.image = { url: `data:${imageMimeType};base64,${imageBase64}` }
  }

  // ── 1. Start video generation job ────────────────────────
  const startResponse = await fetch(`${XAI_API_URL}/videos/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${XAI_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  })

  if (!startResponse.ok) {
    const text = await startResponse.text().catch(() => '')
    throw new Error(`xAI video generation start failed (${startResponse.status}): ${text.slice(0, 200)}`)
  }

  const { request_id }: XaiVideoStartResponse = await startResponse.json()

  // ── 2. Poll until done ────────────────────────────────────
  const videoUrl = await pollXaiVideoStatus(request_id)

  // ── 3. Download the video ─────────────────────────────────
  const videoResponse = await fetch(videoUrl)
  if (!videoResponse.ok) {
    throw new Error(`Failed to download xAI video (${videoResponse.status}): ${videoUrl}`)
  }

  const arrayBuffer = await videoResponse.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

// ── Polling helper ────────────────────────────────────────────

async function pollXaiVideoStatus(
  requestId: string,
  maxWaitMs = 180_000
): Promise<string> {
  const pollIntervalMs = 4_000
  const deadline = Date.now() + maxWaitMs

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))

    const statusResponse = await fetch(
      `${XAI_API_URL}/videos/generations/${requestId}`,
      { headers: { Authorization: `Bearer ${XAI_API_KEY}` } }
    )

    if (!statusResponse.ok) {
      throw new Error(`xAI video status check failed (${statusResponse.status})`)
    }

    const status: XaiVideoStatusResponse = await statusResponse.json()

    if (status.status === 'done' && status.video?.url) {
      return status.video.url
    }

    if (status.status === 'failed') {
      throw new Error(`xAI video generation failed: ${status.error ?? 'unknown error'}`)
    }

    // Still pending / processing — keep polling
  }

  throw new Error('xAI video generation timed out after 3 minutes')
}
