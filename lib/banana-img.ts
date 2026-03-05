import sharp from 'sharp'
import { generateStoryImage } from './gemini'

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

function stripDataUrlPrefix(raw: string): string {
  const marker = 'base64,'
  const idx = raw.indexOf(marker)
  return idx >= 0 ? raw.slice(idx + marker.length).trim() : raw.trim()
}

async function normalizeReferenceImages(characterImagesBase64: string[]): Promise<string[]> {
  const seen = new Set<string>()
  const refs: string[] = []
  for (const raw of characterImagesBase64) {
    const cleaned = stripDataUrlPrefix(raw || '')
    if (!cleaned || seen.has(cleaned)) continue
    seen.add(cleaned)
    const compressed = await compressImage(cleaned, 512, 72)
    refs.push(compressed.data)
  }
  return refs
}

async function buildReferenceSheetForBanana(referenceImagesBase64: string[]): Promise<string | undefined> {
  const limited = referenceImagesBase64.slice(0, 4)
  if (limited.length === 0) return undefined
  if (limited.length === 1) return limited[0]

  const cellSize = 384
  const cols = limited.length <= 2 ? limited.length : 2
  const rows = Math.ceil(limited.length / cols)
  const width = cols * cellSize
  const height = rows * cellSize

  try {
    const composites = await Promise.all(
      limited.map(async (base64, idx) => {
        const left = (idx % cols) * cellSize
        const top = Math.floor(idx / cols) * cellSize
        const tile = await sharp(Buffer.from(base64, 'base64'))
          .resize(cellSize, cellSize, { fit: 'cover' })
          .jpeg({ quality: 78 })
          .toBuffer()
        return { input: tile, left, top }
      })
    )

    const sheet = await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 247, g: 247, b: 242 },
      },
    })
      .composite(composites)
      .jpeg({ quality: 78 })
      .toBuffer()

    return sheet.toString('base64')
  } catch {
    return limited[0]
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
    referenceImagesBase64?: string[]
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
    referenceImagesBase64,
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
  const geminiRefs = (referenceImagesBase64 ?? []).filter(Boolean)
  if (geminiRefs.length > 0 || referenceImageBase64) {
    const refs = geminiRefs.length > 0 ? geminiRefs : [referenceImageBase64 as string]
    const result = await generateStoryImage(
      prompt,
      characterNames ? `Characters: ${characterNames.join(', ')}` : '',
      refs,
      characterNames
    )
    if (result) return { data: result.data, mimeType: 'image/jpeg' }
  } else {
    // Text-only fallback when no reference image is available.
    const result = await generateStoryImage(prompt, '')
    if (result) return { data: result.data, mimeType: 'image/jpeg' }
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
 * Generate a supporting/NPC companion image.
 * Character form should follow the companion name/description semantics:
 * - human-like name/description -> can be a human child character
 * - creature/object/fantasy-like name -> non-human companion
 * Used for storybook supporting characters and discovered NPCs.
 */
export async function generateCompanionCharacterCartoon(
  name: string,
  description: string,
  style = 'cute cartoon character'
): Promise<{ data: string; mimeType: 'image/jpeg' }> {
  const safeName = (name || '').trim().slice(0, 40) || 'Companion'
  const safeDescription = (description || '').trim().slice(0, 200) || 'friendly magical companion'

  const prompt =
    `Children's picture-book companion character design. ` +
    `Character name: ${safeName}. Character traits: ${safeDescription}. ` +
    `Style: ${style}. ` +
    `Character type should match the name semantics: if the name/description suggests a child/person, draw a human child; ` +
    `if it suggests animal/spirit/object/fantasy creature, draw a non-human companion. ` +
    `Do not force a fixed species when the name already implies one. ` +
    `Cute, warm, friendly, storybook look. ` +
    `Centered portrait, clean simple background, clear silhouette, no text.`

  const neg =
    'photo, realistic photography, live action, scary, dark, horror, text, watermark'

  return generateImageFromPrompt(prompt, {
    width: 768,
    height: 768,
    negativePrompt: neg,
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
  const referenceImages = await normalizeReferenceImages(characterImagesBase64)
  const bananaReferenceSheet = await buildReferenceSheetForBanana(referenceImages)

  return generateImageFromPrompt(fullPrompt, {
    width: 1280,
    height: 720,
    negativePrompt: 'text, letters, words, watermark, scary, realistic, photo',
    referenceImageBase64: bananaReferenceSheet,
    referenceImagesBase64: referenceImages,
    characterNames,
  })
}
