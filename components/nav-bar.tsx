'use client'

import Link from 'next/link'
import { useLanguage } from '@/lib/i18n'

export default function NavBar() {
  const { locale, setLocale, t } = useLanguage()

  return (
    <header className="glass-header px-6 py-3 flex items-center justify-between">
      <Link href="/" className="flex items-center gap-3 group">
        <div className="w-9 h-9 bg-forest-500 rounded-xl flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
          <span className="text-white text-lg">📖</span>
        </div>
        <span className="font-bold text-lg text-forest-800 tracking-tight">{t('nav.brand')}</span>
      </Link>

      <nav className="hidden sm:flex items-center gap-6 text-sm font-medium text-slate-600">
        <Link href="/character" className="hover:text-forest-600 transition-colors">{t('nav.myCharacters')}</Link>
        <Link href="/storybook" className="hover:text-forest-600 transition-colors">{t('nav.myStories')}</Link>
      </nav>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
          className="text-xs font-bold px-3 py-1.5 border-2 border-forest-300 text-forest-600 rounded-full hover:bg-forest-50 transition-colors"
          aria-label="Switch language"
        >
          {locale === 'zh' ? 'EN' : '中'}
        </button>
        <Link
          href="/character/create"
          className="text-xs font-bold px-4 py-2 bg-forest-500 text-white rounded-full hover:bg-forest-600 transition-colors shadow-sm"
        >
          {t('nav.createCharacter')}
        </Link>
      </div>
    </header>
  )
}
