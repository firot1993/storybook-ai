import { getCharacter } from '@/lib/db'
import { getStyleById } from '@/lib/styles'
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
export async function resolveStorybookCharacters(storybook: StorybookLike) {
  const protagonistEntry = storybook.characters.find((c) => c.role === 'protagonist')
  const protagonistChar = protagonistEntry?.id ? await getCharacter(protagonistEntry.id) : null
  const protagonistName = protagonistChar?.name || '小主角'

  // Exclude dynamically discovered NPCs from the default supporting cast
  // used in story creation/synopsis prompts.
  const supportingEntries = storybook.characters.filter(
    (c) => c.role === 'supporting' && !c.isNpc
  )
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
  const supportingName = supportingNames.filter(Boolean).join('、') || '小伙伴'

  return { protagonistName, supportingName, protagonistChar }
}

/**
 * Resolve the style description string for a storybook's styleId.
 */
export function resolveStorybookStyle(storybook: { styleId: string }): string {
  return getStyleById(storybook.styleId)?.description || '梦幻水彩、马卡龙色调、星光熠熠的氛围'
}
