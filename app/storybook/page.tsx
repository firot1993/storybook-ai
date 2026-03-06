'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Character, Storybook, Story } from '@/types'
import { STYLES } from '@/lib/styles'
import { CharacterAvatar } from '@/components/character-avatar'
import { useLanguage } from '@/lib/i18n'

type ChapterItem = Pick<Story, 'id' | 'title' | 'synopsis' | 'status' | 'createdAt'>
type StorybookWithChapters = Storybook & { chapters: ChapterItem[] }

export default function StorybookLibraryPage() {
  const { t } = useLanguage()
  const [storybooks, setStorybooks] = useState<StorybookWithChapters[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [booksRes, charsRes] = await Promise.all([
        fetch('/api/storybook'),
        fetch('/api/character'),
      ])
      if (booksRes.ok) {
        const d = await booksRes.json()
        const books: StorybookWithChapters[] = d.storybooks ?? []
        setStorybooks(books)
        if (books.length === 1) setExpandedId(books[0].id)
      }
      if (charsRes.ok) {
        const d = await charsRes.json()
        setCharacters(d.characters ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const getProtagonist = (book: StorybookWithChapters) => {
    const entry = book.characters.find((c) => c.role === 'protagonist')
    if (!entry) return null
    return characters.find((c) => c.id === entry.id) ?? null
  }

  const toggle = (id: string) => setExpandedId((prev) => (prev === id ? null : id))

  return (
    <div className="min-h-[calc(100vh-60px)] px-4 pt-6 pb-20">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-forest-800">{t('storybook.pageTitle')}</h1>
            <p className="text-sm text-gray-400 mt-0.5">{t('storybook.pageSubtitle')}</p>
          </div>
          <Link href="/story/create" className="btn-primary text-sm py-2 px-4 whitespace-nowrap">
            {t('storybook.createBtn')}
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}
          </div>
        ) : storybooks.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📭</div>
            <p className="text-lg font-bold text-gray-500 mb-2">{t('storybook.emptyState')}</p>
            <p className="text-sm text-gray-400 mb-6">{t('storybook.emptyHelp')}</p>
            <Link href="/story/create" className="btn-primary inline-block">{t('storybook.startLink')}</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {storybooks.map((book) => {
              const protagonist = getProtagonist(book)
              const styledImage = protagonist
                ? (protagonist.styleImages?.[book.styleId] ?? protagonist.cartoonImage)
                : null
              const styleConfig = STYLES.find((s) => s.id === book.styleId)
              const isExpanded = expandedId === book.id
              const chapterCount = book.chapters?.length ?? 0

              return (
                <div key={book.id} className="card p-0 overflow-hidden transition-all">
                  {/* Storybook header row */}
                  <button
                    onClick={() => toggle(book.id)}
                    className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors text-left"
                  >
                    {/* Protagonist avatar */}
                    <div className="relative shrink-0">
                      <CharacterAvatar
                        src={styledImage}
                        name={protagonist?.name}
                        fallbackEmoji={styleConfig?.emoji ?? '📖'}
                        size={56}
                      />
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-100 text-xs">
                        {styleConfig?.emoji ?? '📖'}
                      </div>
                    </div>

                    {/* Book info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-extrabold text-forest-800 truncate">{book.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] bg-forest-100 text-forest-600 px-1.5 py-0.5 rounded-full font-bold">{book.ageRange}{t('storybook.ageUnit')}</span>
                        {styleConfig && (
                          <span className="text-[10px] text-gray-400 font-medium">{t(`styles.${styleConfig.id}.label`)}</span>
                        )}
                        <span className="text-[10px] text-gray-400">·</span>
                        <span className="text-[10px] text-gray-400 font-medium">
                          {chapterCount === 0 ? t('storybook.noStories') : t('storybook.episodeCount', { count: chapterCount })}
                        </span>
                      </div>
                    </div>

                    {/* Expand indicator */}
                    <div className={`shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                      <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {/* Chapter list */}
                  {isExpanded && (
                    <div className="border-t border-gray-100">
                      {chapterCount === 0 ? (
                        <div className="px-4 py-6 text-center">
                          <p className="text-sm text-gray-400 mb-3">{t('storybook.emptyBook')}</p>
                          <Link
                            href="/story/create"
                            className="text-xs font-bold text-forest-600 hover:text-forest-800 underline"
                          >
                            {t('storybook.createFirst')}
                          </Link>
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-50">
                          {book.chapters.map((chapter, idx) => (
                            <Link
                              key={chapter.id}
                              href={`/story/play?id=${chapter.id}`}
                              className="flex items-start gap-3 px-4 py-3.5 hover:bg-forest-50/60 transition-colors group"
                            >
                              {/* Episode number */}
                              <div className="shrink-0 w-8 h-8 rounded-xl bg-forest-100 flex items-center justify-center mt-0.5">
                                <span className="text-xs font-extrabold text-forest-600">{idx + 1}</span>
                              </div>

                              {/* Episode info */}
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-sm text-gray-800 truncate group-hover:text-forest-700 transition-colors">
                                  {chapter.title || t('storybook.episodeLabel', { num: idx + 1 })}
                                </p>
                                {chapter.synopsis && (
                                  <p className="text-xs text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">
                                    {chapter.synopsis}
                                  </p>
                                )}
                              </div>

                              {/* Status + arrow */}
                              <div className="shrink-0 flex items-center gap-2 mt-0.5">
                                {chapter.status === 'complete' ? (
                                  <span className="text-[10px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full font-bold">{t('storybook.statusComplete')}</span>
                                ) : chapter.status === 'generating' ? (
                                  <span className="text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-bold">{t('storybook.statusGenerating')}</span>
                                ) : (
                                  <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-bold">{t('storybook.statusDraft')}</span>
                                )}
                                <svg className="w-4 h-4 text-gray-300 group-hover:text-forest-500 group-hover:translate-x-0.5 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                </svg>
                              </div>
                            </Link>
                          ))}

                          {/* Add more episodes */}
                          <div className="px-4 py-3 bg-gray-50/50">
                            <Link
                              href="/story/create"
                              className="flex items-center gap-2 text-xs font-bold text-forest-500 hover:text-forest-700 transition-colors"
                            >
                              <span className="w-6 h-6 rounded-lg border-2 border-dashed border-forest-300 flex items-center justify-center text-forest-400">+</span>
                              {t('storybook.continueBtn')}
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}
