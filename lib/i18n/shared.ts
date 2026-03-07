export type Locale = 'zh' | 'en'

export function normalizeLocale(value: unknown, fallback: Locale = 'zh'): Locale {
  if (typeof value !== 'string') return fallback

  const normalized = value.trim().toLowerCase()
  if (normalized === 'en') return 'en'
  if (normalized === 'zh') return 'zh'

  return fallback
}

export function getLocaleLanguageName(locale: Locale): string {
  return locale === 'zh' ? 'Simplified Chinese' : 'English'
}
