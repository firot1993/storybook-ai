import { createXai } from '@ai-sdk/xai'
import { experimental_generateVideo as generateVideo } from 'ai'

const XAI_API_KEY = process.env.XAI_API_KEY || ''

export function isXaiConfigured(): boolean {
  return Boolean(XAI_API_KEY)
}

/**
 * Animate a scene image into a video clip using xAI Grok image-to-video.
 *
 * @param imageBase64 - Raw base64 image data (no data: prefix needed)
 * @param prompt      - Text description of the desired animation
 * @returns           - Video bytes as Buffer
 */
export async function generateSceneVideo(
  imageBase64: string,
  prompt: string
): Promise<Buffer> {
  if (!XAI_API_KEY) {
    throw new Error('[xAI] XAI_API_KEY is not configured')
  }

  const xai = createXai({ apiKey: XAI_API_KEY })

  const dataUri = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`

  const { video } = await generateVideo({
    model: xai.video('grok-imagine-video'),
    prompt: {
      // @ts-expect-error: image-to-video prompt shape from xAI provider
      type: 'image',
      image: dataUri,
      text: prompt,
    },
    providerOptions: {
      xai: {
        duration: 10,
        aspectRatio: '16:9',
        resolution: '720p',
      },
    },
  })

  return Buffer.from(video.uint8Array)
}
