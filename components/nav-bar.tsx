'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n'

export default function NavBar() {
  const { locale, setLocale, t } = useLanguage()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="glass-header px-6 py-3 flex items-center justify-between">
      <Link href="/" className="flex items-center gap-3 group">
        <div className="w-9 h-9 bg-forest-500 rounded-xl flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
          <span className="text-white text-lg">📖</span>
        </div>
        <span className="font-accent font-bold text-lg text-forest-800 tracking-tight">{t('nav.brand')}</span>
      </Link>

      <nav className="hidden sm:flex items-center gap-6 text-sm font-medium text-slate-600">
        <Link href="/character" className="hover:text-forest-600 transition-colors">{t('nav.myCharacters')}</Link>
        <Link href="/storybook" className="hover:text-forest-600 transition-colors">{t('nav.myStories')}</Link>
      </nav>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
          className="text-xs font-bold px-3 py-1.5 border-2 border-gray-300 text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
          aria-label="Switch language"
        >
          {locale === 'zh' ? 'EN' : '中'}
        </button>
        <Link
          href="/character/create"
          className="hidden sm:inline-flex text-xs font-bold px-4 py-2 bg-ember-500 text-white rounded-full hover:bg-ember-600 transition-colors shadow-sm"
        >
          {t('nav.createCharacter')}
        </Link>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="sm:hidden p-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Toggle menu"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu panel */}
      {menuOpen && (
        <div className="absolute top-full left-0 right-0 bg-white border-b border-gray-200 shadow-lg sm:hidden z-50">
          <nav className="flex flex-col p-4 gap-3">
            <Link href="/character" onClick={() => setMenuOpen(false)} className="text-sm font-medium text-slate-700 hover:text-forest-600 py-2">
              {t('nav.myCharacters')}
            </Link>
            <Link href="/storybook" onClick={() => setMenuOpen(false)} className="text-sm font-medium text-slate-700 hover:text-forest-600 py-2">
              {t('nav.myStories')}
            </Link>
            <Link href="/character/create" onClick={() => setMenuOpen(false)} className="text-sm font-bold text-white bg-ember-500 hover:bg-ember-600 rounded-full py-2 px-4 text-center transition-colors">
              {t('nav.createCharacter')}
            </Link>
          </nav>
        </div>
      )}
    </header>
  )
}
