'use client'

import Link from 'next/link'
import { useLanguage } from '@/lib/i18n'

export default function Home() {
  const { t } = useLanguage()

  return (
    <div className="min-h-[calc(100vh-60px)] flex flex-col items-center px-4 pt-10 pb-20">
      <div className="text-center max-w-2xl page-enter flex-1 flex flex-col justify-center w-full">

        {/* Badge */}
        <div className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 bg-forest-100 text-forest-700 rounded-full text-xs font-bold mx-auto border border-forest-200">
          <span className="w-1.5 h-1.5 rounded-full bg-forest-500 animate-pulse" />
          {t('home.poweredBy')}
        </div>

        {/* Hero title */}
        <h1 className="text-5xl md:text-7xl font-bold mb-5 leading-tight tracking-tight forest-text">
          {t('home.title')}
        </h1>

        <p className="text-lg md:text-xl text-slate-600 mb-10 leading-relaxed font-medium max-w-lg mx-auto">
          {t('home.description')}
        </p>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-16">
          <Link
            href="/story/create"
            className="btn-primary inline-flex items-center justify-center gap-2 py-4 px-8 text-base"
          >
            <span>{t('home.startStory')}</span>
            <span>📖</span>
          </Link>
          <Link
            href="/character"
            className="btn-secondary inline-flex items-center justify-center gap-2 py-4 px-8 text-base"
          >
            <span>{t('home.createCharacter')}</span>
            <span>📸</span>
          </Link>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
          <div className="card-interactive group bg-gradient-to-br from-white to-forest-50 border-forest-100">
            <div className="text-3xl mb-3 group-hover:animate-wiggle inline-block">📸</div>
            <h3 className="font-bold text-base mb-1.5 text-forest-800">{t('home.feature1Title')}</h3>
            <p className="text-slate-500 text-sm leading-relaxed">{t('home.feature1Desc')}</p>
          </div>

          <div className="card-interactive group bg-gradient-to-br from-white to-honey-50 border-honey-100">
            <div className="text-3xl mb-3 group-hover:animate-wiggle inline-block">✨</div>
            <h3 className="font-bold text-base mb-1.5 text-honey-700">{t('home.feature2Title')}</h3>
            <p className="text-slate-500 text-sm leading-relaxed">{t('home.feature2Desc')}</p>
          </div>

          <div className="card-interactive group bg-gradient-to-br from-white to-ember-50 border-ember-100">
            <div className="text-3xl mb-3 group-hover:animate-wiggle inline-block">🎬</div>
            <h3 className="font-bold text-base mb-1.5 text-ember-700">{t('home.feature3Title')}</h3>
            <p className="text-slate-500 text-sm leading-relaxed">{t('home.feature3Desc')}</p>
          </div>
        </div>

        {/* Bottom decorative text */}
        <div className="mt-16 flex justify-center items-center gap-8 opacity-30">
          <span className="text-3xl">🌿</span>
          <span className="text-2xl">🌸</span>
          <span className="text-3xl">🍀</span>
        </div>
      </div>
    </div>
  )
}
