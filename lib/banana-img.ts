import sharp from 'sharp'
import { generateCharacterImageWithDiagnostics, generateStoryImage } from './gemini'

const BANANA_API_URL = process.env.BANANA_API_URL || 'https://api.banana.dev'
const BANANA_API_KEY = process.env.BANANA_API_KEY || ''
const BANANA_MODEL_KEY = process.env.BANANA_MODEL_KEY || ''

export class BananaImageError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'BananaImageError'
  }
}

interface BananaResponse {
  id?: string
  message?: string
  modelOutputs?: Array<{ image_base64?: string }>
  outputs?: Array<{ image?: string; images?: string[] }>
}

function isBananaConfigured(): boolean {
  return Boolean(BANANA_API_KEY && BANANA_MODEL_KEY)
}

async function callBananaApi(modelInputs: Record<string, unknown>): Promise<string> {
  let response: Response
  try {
    response = await fetch(`${BANANA_API_URL}/start/v4/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${BANANA_API_KEY}`,
      },
      body: JSON.stringify({
        modelKey: BANANA_MODEL_KEY,
        modelInputs,
        startOnly: false,
      }),
    })
  } catch {
    throw new BananaImageError(503, 'Cannot reach Banana API. Check BANANA_API_URL.')
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new BananaImageError(response.status, `Banana API ${response.status}: ${text.slice(0, 200)}`)
  }

  const data: BananaResponse = await response.json()

  const base64 =
    data.modelOutputs?.[0]?.image_base64 ||
    data.outputs?.[0]?.image ||
    (data.outputs?.[0]?.images ?? [])[0]

  if (!base64) {
    throw new BananaImageError(502, 'Banana API returned no image data.')
  }
  return base64
}

/**
 * Compress a base64 image to JPEG.
 */
export async function compressImage(
  base64Data: string,
  maxDim = 768,
  quality = 80
): Promise<{ data: string; mimeType: 'image/jpeg' }> {
  try {
    const buf = await sharp(Buffer.from(base64Data, 'base64'))
      .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer()
    return { data: buf.toString('base64'), mimeType: 'image/jpeg' }
  } catch {
    return { data: base64Data, mimeType: 'image/jpeg' }
  }
}

/**
 * Generate an image from a text prompt.
 * Falls back to Gemini Image if Banana is not configured.
 */
export async function generateImageFromPrompt(
  prompt: string,
  options: {
    width?: number
    height?: number
    negativePrompt?: string
    steps?: number
    guidanceScale?: number
    referenceImageBase64?: string
    characterNames?: string[]
  } = {}
): Promise<{ data: string; mimeType: 'image/jpeg' }> {
  const {
    width = 768,
    height = 768,
    negativePrompt = 'text, watermark, signature, blurry, low quality, ugly, scary, realistic, photo',
    steps = 20,
    guidanceScale = 7.5,
    referenceImageBase64,
    characterNames,
  } = options

  if (isBananaConfigured()) {
    try {
      const raw = await callBananaApi({
        prompt,
        negative_prompt: negativePrompt,
        width,
        height,
        num_inference_steps: steps,
        guidance_scale: guidanceScale,
        ...(referenceImageBase64 ? { image: referenceImageBase64, strength: 0.7 } : {}),
      })
      return compressImage(raw, Math.max(width, height))
    } catch (err) {
      console.warn('[Banana] Failed, falling back to Gemini Image:', err)
    }
  }

  // Fallback: Gemini Image
  if (referenceImageBase64) {
    // Story scene image with character reference
    const result = await generateStoryImage(
      prompt,
      characterNames ? `Characters: ${characterNames.join(', ')}` : '',
      [referenceImageBase64],
      characterNames
    )
    if (result) return { data: result.data, mimeType: 'image/jpeg' }
  } else {
    // Character generation from description only — use minimal prompt
    const result = await generateCharacterImageWithDiagnostics('', prompt)
    if (result.imageData) {
      return { data: result.imageData, mimeType: 'image/jpeg' }
    }
  }

  throw new BananaImageError(502, 'Image generation failed (both Banana and Gemini returned no image).')
}

/**
 * Generate a character cartoon image from a photo or text description.
 * photoBase64: optional reference photo
 * description: text description of the character
 * style: art style (e.g., "cute cartoon character")
 */
export async function generateCharacterCartoon(
  description: string,
  style = 'cute cartoon character',
  photoBase64?: string
): Promise<{ data: string; mimeType: 'image/jpeg' }> {
  const prompt = photoBase64
    ? `Character reconstruction: extract the core facial features and hairstyle from this photo, ` +
      `then rebuild the character in hand-drawn children's picture-book style. ` +
      `Style: ${style}. ${description ? `Character details: ${description}.` : ''} ` +
      `Emphasize hand-drawn texture with flat-style shadow lighting. ` +
      `Maintain the person's distinguishing facial features with gentle anime/picture-book stylization. ` +
      `Warm, breathable artistic atmosphere. Upper-body portrait, centered, clean simple background, friendly expression.`
    : `Children's picture-book illustration: ${description}. ` +
      `Style: ${style}. Hand-drawn texture, flat-style shadows, warm and breathable artistic feel, ` +
      `upper-body portrait, centered, clean simple background, friendly expression.`

  const neg = 'realistic, photographic, scary, dark, adult content, text, watermark, blurry, 3D render'

  return generateImageFromPrompt(prompt, {
    width: 768,
    height: 768,
    negativePrompt: neg,
    referenceImageBase64: photoBase64,
  })
}

/**
 * Generate a scene illustration for a story script scene.
 */
export async function generateSceneIllustration(
  imagePrompt: string,
  characterImagesBase64: string[],
  characterNames: string[]
): Promise<{ data: string; mimeType: 'image/jpeg' }> {
  const fullPrompt = `Children's picture book illustration, ages 4-8: ${imagePrompt}. Style: Bright happy colors, round friendly shapes, simple background, cozy and warm. No text in image.`

  return generateImageFromPrompt(fullPrompt, {
    width: 1280,
    height: 720,
    negativePrompt: 'text, letters, words, watermark, scary, realistic, photo',
    referenceImageBase64: characterImagesBase64[0],
    characterNames,
  })
}
