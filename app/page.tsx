'use client'

import Link from 'next/link'
import { useLanguage } from '@/lib/i18n'

export default function Home() {
  const { t } = useLanguage()

  return (
    <div className="min-h-[calc(100vh-60px)] flex flex-col items-center px-4 pt-12 md:pt-20 pb-24">
      <div className="max-w-3xl w-full">

        {/* ── Hero section ── */}
        <div className="mb-20 md:mb-28">
          {/* Badge */}
          <div className="animate-fade-up stagger-1 inline-flex items-center gap-2 mb-8 px-4 py-1.5 bg-forest-100 text-forest-700 rounded-full text-xs font-bold border border-forest-200">
            {t('home.poweredBy')}
          </div>

          {/* Title — dramatic scale */}
          <h1 className="animate-fade-up stagger-2 text-5xl sm:text-6xl md:text-8xl font-accent font-bold mb-6 leading-[0.95] tracking-tight text-forest-800 text-left">
            {t('home.title')}
          </h1>

          <p className="animate-fade-up stagger-3 text-lg md:text-xl text-slate-500 mb-10 leading-relaxed font-normal max-w-xl text-left">
            {t('home.description')}
          </p>

          {/* CTA — larger, more prominent */}
          <div className="animate-fade-up stagger-4 flex flex-col sm:flex-row gap-3">
            <Link
              href="/story/create"
              className="btn-primary inline-flex items-center justify-center gap-2.5 py-4 px-8 text-lg"
            >
              <span>{t('home.startStory')}</span>
              <span className="text-xl">→</span>
            </Link>
            <Link
              href="/character"
              className="btn-secondary inline-flex items-center justify-center gap-2 py-4 px-8 text-lg"
            >
              <span>{t('home.createCharacter')}</span>
              <span>📸</span>
            </Link>
          </div>
        </div>

        {/* ── How it works: numbered steps (not identical cards) ── */}
        <div className="animate-fade-up stagger-5">
          <div className="flex flex-col gap-5">

            {/* Step 1 — full width, prominent */}
            <div className="card flex flex-col sm:flex-row items-start gap-5">
              <div className="w-12 h-12 rounded-xl bg-forest-500 text-white flex items-center justify-center font-accent font-bold text-xl shrink-0">
                1
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-accent font-bold text-lg text-forest-800 mb-1">{t('home.feature1Title')}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{t('home.feature1Desc')}</p>
              </div>
              <div className="text-4xl shrink-0 hidden sm:block">📸</div>
            </div>

            {/* Steps 2+3 — side by side, smaller */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="card flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-honey-500 text-white flex items-center justify-center font-accent font-bold text-lg shrink-0">
                  2
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-accent font-bold text-base text-honey-700 mb-0.5">{t('home.feature2Title')}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">{t('home.feature2Desc')}</p>
                </div>
              </div>

              <div className="card flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-ember-500 text-white flex items-center justify-center font-accent font-bold text-lg shrink-0">
                  3
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-accent font-bold text-base text-ember-700 mb-0.5">{t('home.feature3Title')}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">{t('home.feature3Desc')}</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
