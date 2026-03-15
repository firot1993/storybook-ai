import { getCharacter, getStory, getStorybook } from '@/lib/db'
import { imageToBase64 } from '@/lib/storage'
import type { Locale } from '@/lib/i18n/shared'
import type { StorybookCharacter } from '@/types'

type StorybookLike = {
  characters: StorybookCharacter[]
  ageRange: string
  styleId: string
}

/**
 * Resolve protagonist and supporting character names from a storybook record.
 * Handles both direct-name companions (AI suggestions) and DB-backed characters.
 * Also returns the protagonist Character record for accessing style images.
 */
export async function resolveStorybookCharacters(
  storybook: StorybookLike,
  locale: Locale = 'zh'
) {
  const protagonistEntry = storybook.characters.find((c) => c.role === 'protagonist')
  const protagonistChar = protagonistEntry?.id ? await getCharacter(protagonistEntry.id) : null
  const protagonistName = protagonistChar?.name || (locale === 'zh' ? '小主角' : 'Little hero')

  // Supporting characters (including NPC-tagged entries) should be available
  // to story creation/synopsis prompts.
  const supportingEntries = storybook.characters.filter((c) => c.role === 'supporting')
  const supportingNames = await Promise.all(
    supportingEntries.map(async (c) => {
      if (c.name) return c.name
      if (c.id) {
        const char = await getCharacter(c.id)
        return char?.name || null
      }
      return null
    })
  )
  const supportingName = supportingNames.filter(Boolean).join(locale === 'zh' ? '、' : ', ')
    || (locale === 'zh' ? '小伙伴' : 'Companion')

  // Resolve pronoun: StorybookCharacter override → Character record default
  const protagonistPronoun =
    protagonistEntry?.pronoun?.trim() || protagonistChar?.pronoun?.trim() || ''

  // Resolve role: StorybookCharacter override → Character record default
  const protagonistRole =
    protagonistEntry?.characterRole?.trim() || protagonistChar?.role?.trim() || ''

  return { protagonistName, supportingName, protagonistChar, protagonistPronoun, protagonistRole }
}

/**
 * Resolve the style description string for a storybook's styleId.
 */
export function resolveStorybookStyle(storybook: { styleId: string }): string {
  const styleDescriptions: Record<string, string> = {
    ghibli: 'hand-drawn anime, warm natural palette, gentle sunlit atmosphere',
    watercolor: 'soft crayon and watercolor blend, muted pastel palette, dreamy mood',
    plush3d: 'cute 3D chibi render, soft plush texture, pastel palette',
    claymation: 'clay stop-motion look, handcrafted texture, warm earthy palette',
    pencil: 'European colored-pencil illustration, classic storybook warmth',
  }

  return styleDescriptions[storybook.styleId] || 'dreamlike watercolor, macaron palette, sparkling starlit atmosphere'
}

// ── Character reference resolution (shared by director-script & video/start) ──

function extractBase64(raw: string | null | undefined): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const marker = 'base64,'
  const markerIndex = trimmed.indexOf(marker)
  if (markerIndex >= 0) {
    return trimmed.slice(markerIndex + marker.length).trim()
  }
  return trimmed
}

function parseStyleImages(raw: unknown): Record<string, string> {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, string>
      }
    } catch {
      return {}
    }
    return {}
  }
  if (typeof raw === 'object') return raw as Record<string, string>
  return {}
}

/**
 * Resolve all character reference images for a story (protagonist + supporting characters).
 * Returns parallel arrays of base64 images, names, and descriptions.
 */
export async function resolveStoryCharacterReferences(storyId: string): Promise<{
  imagesBase64: string[]
  names: string[]
  descriptions: string[]
}> {
  const story = await getStory(storyId)
  if (!story) return { imagesBase64: [], names: [], descriptions: [] }

  const resolvedImages: string[] = []
  const resolvedNames: string[] = []
  const resolvedDescriptions: string[] = []
  const seen = new Set<string>()

  const pushReference = async (
    imageRaw: string | null | undefined,
    nameRaw: string | null | undefined,
    descriptionRaw?: string | null
  ) => {
    if (!imageRaw?.trim()) return
    // Use imageToBase64 which handles data URIs, local API URLs, and GCS URLs
    const imageBase64 = await imageToBase64(imageRaw.trim()) ?? extractBase64(imageRaw)
    if (!imageBase64 || seen.has(imageBase64)) return
    seen.add(imageBase64)
    resolvedImages.push(imageBase64)
    resolvedNames.push(nameRaw?.trim() || `Character ${resolvedImages.length}`)
    resolvedDescriptions.push(descriptionRaw?.trim() || '')
  }

  if (story.storybookId) {
    const storybook = await getStorybook(story.storybookId)
    if (storybook) {
      const orderedChars = [...storybook.characters].sort((a, b) => {
        if (a.role === b.role) return 0
        return a.role === 'protagonist' ? -1 : 1
      })
      const records = await Promise.all(
        orderedChars.map((entry) => (entry.id ? getCharacter(entry.id) : Promise.resolve(null)))
      )

      for (let index = 0; index < orderedChars.length; index++) {
        const entry = orderedChars[index]
        const character = records[index]
        const styleImages = parseStyleImages(character?.styleImages)
        const preferredImage = styleImages[storybook.styleId] || character?.cartoonImage || entry.image || ''
        await pushReference(
          preferredImage,
          character?.name || entry.name || undefined,
          entry.description || undefined
        )
      }
    }
  }

  if (resolvedImages.length === 0 && story.characterIds.length > 0) {
    const records = await Promise.all(story.characterIds.map((id) => getCharacter(id)))
    for (let index = 0; index < records.length; index++) {
      const character = records[index]
      if (!character) continue
      await pushReference(character.cartoonImage, character.name || `Character ${index + 1}`)
    }
  }

  if (resolvedImages.length === 0) {
    await pushReference(story.mainImage, story.title || '主角')
  }

  return { imagesBase64: resolvedImages, names: resolvedNames, descriptions: resolvedDescriptions }
}
