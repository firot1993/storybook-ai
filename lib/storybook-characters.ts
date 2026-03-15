import type { StorybookCharacter } from '@/types'

function normalizeStorybookCharacterName(name: string | null | undefined): string {
  return typeof name === 'string' ? name.trim().toLowerCase() : ''
}

function normalizeStorybookCharacterId(id: string | null | undefined): string {
  return typeof id === 'string' ? id.trim() : ''
}

function getEntryKey(entry: StorybookCharacter, index: number): string {
  const normalizedName = normalizeStorybookCharacterName(entry.name)
  if (normalizedName) return `name:${normalizedName}`

  const normalizedId = normalizeStorybookCharacterId(entry.id)
  if (normalizedId) return `id:${normalizedId}`

  return `index:${index}`
}

function getOptionalString(entry: StorybookCharacter, key: string): string {
  const value = (entry as unknown as Record<string, unknown>)[key]
  return typeof value === 'string' ? value.trim() : ''
}

function pickPreferredText(primary: string, secondary: string): string {
  return primary || secondary
}

function scoreEntry(entry: StorybookCharacter): number {
  const hasId = normalizeStorybookCharacterId(entry.id).length > 0
  const hasName = normalizeStorybookCharacterName(entry.name).length > 0
  const hasDescription = getOptionalString(entry, 'description').length > 0
  const hasImage = getOptionalString(entry, 'image').length > 0

  return (
    (entry.role === 'protagonist' ? 100 : 0) +
    (entry.isNpc === false ? 40 : 0) +
    (hasId ? 20 : 0) +
    (hasName ? 10 : 0) +
    (hasDescription ? 4 : 0) +
    (hasImage ? 2 : 0)
  )
}

function mergeCharacterEntries<T extends StorybookCharacter>(current: T, incoming: T): T {
  const currentScore = scoreEntry(current)
  const incomingScore = scoreEntry(incoming)
  const primary = incomingScore > currentScore ? incoming : current
  const secondary = primary === current ? incoming : current

  const merged = {
    ...(secondary as unknown as Record<string, unknown>),
    ...(primary as unknown as Record<string, unknown>),
  } as unknown as T

  const mergedRole: StorybookCharacter['role'] =
    current.role === 'protagonist' || incoming.role === 'protagonist'
      ? 'protagonist'
      : 'supporting'

  const mergedId =
    normalizeStorybookCharacterId((primary as StorybookCharacter).id) ||
    normalizeStorybookCharacterId((secondary as StorybookCharacter).id)

  const mergedName =
    getOptionalString(current, 'name') ||
    getOptionalString(incoming, 'name')

  const mergedDescription = pickPreferredText(
    getOptionalString(primary, 'description'),
    getOptionalString(secondary, 'description')
  )
  const mergedPronoun = pickPreferredText(
    getOptionalString(primary, 'pronoun'),
    getOptionalString(secondary, 'pronoun')
  )
  const mergedCharacterRole = pickPreferredText(
    getOptionalString(primary, 'characterRole'),
    getOptionalString(secondary, 'characterRole')
  )
  const mergedImage = pickPreferredText(
    getOptionalString(primary, 'image'),
    getOptionalString(secondary, 'image')
  )

  merged.id = mergedId
  if (mergedName) {
    merged.name = mergedName
  }
  merged.role = mergedRole
  merged.isNpc = mergedRole === 'supporting' ? current.isNpc === true && incoming.isNpc === true : false

  if (mergedDescription) {
    merged.description = mergedDescription
  }
  if (mergedPronoun) {
    merged.pronoun = mergedPronoun
  }
  if (mergedCharacterRole) {
    merged.characterRole = mergedCharacterRole
  }
  if (mergedImage) {
    ;(merged as Record<string, unknown>).image = mergedImage
  }

  return merged
}

export function mergeStorybookCharacters<T extends StorybookCharacter>(characters: T[]): T[] {
  const result: T[] = []
  const seenByKey = new Map<string, number>()

  for (let index = 0; index < characters.length; index++) {
    const entry = characters[index]
    const key = getEntryKey(entry, index)
    const existingIndex = seenByKey.get(key)

    if (existingIndex === undefined) {
      result.push(entry)
      seenByKey.set(key, result.length - 1)
      continue
    }

    result[existingIndex] = mergeCharacterEntries(result[existingIndex], entry)
  }

  return result
}
