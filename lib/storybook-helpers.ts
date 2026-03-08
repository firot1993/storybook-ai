import { getCharacter } from '@/lib/db'
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
