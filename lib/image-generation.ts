import sharp from 'sharp'
import { generateStoryImage } from './gemini'
import {
  buildCharacterNamesReference,
  buildCharacterCartoonPrompt,
  buildCompanionCharacterCartoonPrompt,
  buildSceneIllustrationPrompt,
} from './ai-prompts'

export class ImageGenerationError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ImageGenerationError'
  }
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

async function buildReferenceSheet(referenceImagesBase64: string[]): Promise<string | undefined> {
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
 */
export async function generateImageFromPrompt(
  prompt: string,
  options: {
    referenceImageBase64?: string
    referenceImagesBase64?: string[]
    characterNames?: string[]
  } = {}
): Promise<{ data: string; mimeType: 'image/jpeg' }> {
  const {
    referenceImageBase64,
    referenceImagesBase64,
    characterNames,
  } = options

  const geminiRefs = (referenceImagesBase64 ?? []).filter(Boolean)
  if (geminiRefs.length > 0 || referenceImageBase64) {
    const refs = geminiRefs.length > 0 ? geminiRefs : [referenceImageBase64 as string]
    const result = await generateStoryImage(
      prompt,
      characterNames ? buildCharacterNamesReference(characterNames) : '',
      refs,
      characterNames
    )
    if (result) return { data: result.data, mimeType: 'image/jpeg' }
  } else {
    // Text-only fallback when no reference image is available.
    const result = await generateStoryImage(prompt, '')
    if (result) return { data: result.data, mimeType: 'image/jpeg' }
  }

  throw new ImageGenerationError(502, 'Image generation failed (Gemini returned no image).')
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
  const prompt = buildCharacterCartoonPrompt(description, style, Boolean(photoBase64))

  return generateImageFromPrompt(prompt, {
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
  const prompt = buildCompanionCharacterCartoonPrompt(name, description, style)
  return generateImageFromPrompt(prompt)
}

/**
 * Generate a scene illustration for a story script scene.
 */
export async function generateSceneIllustration(
  imagePrompt: string,
  characterImagesBase64: string[],
  characterNames: string[]
): Promise<{ data: string; mimeType: 'image/jpeg' }> {
  const fullPrompt = buildSceneIllustrationPrompt(imagePrompt)
  const referenceImages = await normalizeReferenceImages(characterImagesBase64)
  const referenceSheet = await buildReferenceSheet(referenceImages)

  return generateImageFromPrompt(fullPrompt, {
    referenceImageBase64: referenceSheet,
    referenceImagesBase64: referenceImages,
    characterNames,
  })
}
