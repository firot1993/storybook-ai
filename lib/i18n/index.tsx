'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import zh from './zh'
import en from './en'
import type { Locale } from './shared'

const translations = { zh, en }
export type { Locale } from './shared'

function getNestedValue(obj: unknown, parts: string[]): string {
  let current = obj
  for (const key of parts) {
    if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[key]
    } else {
      return parts.join('.')
    }
  }
  return typeof current === 'string' ? current : parts.join('.')
}

interface LanguageContextValue {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextValue>({
  locale: 'zh',
  setLocale: () => {},
  t: (key) => key,
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('zh')

  useEffect(() => {
    const saved = localStorage.getItem('locale') as Locale | null
    if (saved === 'en' || saved === 'zh') {
      setLocaleState(saved)
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
  }, [locale])

  const setLocale = (l: Locale) => {
    setLocaleState(l)
    localStorage.setItem('locale', l)
  }

  const t = (key: string, vars?: Record<string, string | number>): string => {
    const parts = key.split('.')
    const result = getNestedValue(translations[locale], parts)
    if (!vars) return result
    return result.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`))
  }

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
