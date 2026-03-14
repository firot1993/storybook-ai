'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n'

export default function NavBar() {
  const { locale, setLocale, t } = useLanguage()
  const [menuOpen, setMenuOpen] = useState(false)
  const [byokActive, setByokActive] = useState(false)

  useEffect(() => {
    fetch('/api/auth/byok')
      .then((res) => res.json())
      .then((data) => setByokActive(data.active === true))
      .catch(() => {})
  }, [])

  async function handleRemoveByok() {
    await fetch('/api/auth/byok', { method: 'DELETE' })
    window.location.href = '/login'
  }

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
        {byokActive && (
          <div className="relative group">
            <button
              className="text-xs font-medium px-2.5 py-1.5 border-2 border-amber-300 text-amber-700 bg-amber-50 rounded-full flex items-center gap-1"
              aria-label="Using your own API key"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
              BYOK
            </button>
            <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-50">
              <button
                onClick={handleRemoveByok}
                className="whitespace-nowrap text-xs px-3 py-2 bg-white border border-gray-200 rounded-lg shadow-md text-red-600 hover:bg-red-50 transition-colors"
              >
                Remove API Key
              </button>
            </div>
          </div>
        )}
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
            {byokActive && (
              <button
                onClick={handleRemoveByok}
                className="text-sm font-medium text-red-600 hover:text-red-700 py-2 text-left"
              >
                Remove API Key
              </button>
            )}
          </nav>
        </div>
      )}
    </header>
  )
}
