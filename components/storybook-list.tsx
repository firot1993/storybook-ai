'use client'

import Link from 'next/link'
import type { Character, Story, Storybook } from '@/types'
import { STYLES } from '@/lib/styles'
import { CharacterAvatar } from '@/components/character-avatar'
import { useLanguage } from '@/lib/i18n'
import { normalizeStoryChoices } from '@/lib/story-scenes'

export type StorybookChapterItem = Pick<Story, 'id' | 'title' | 'synopsis' | 'status' | 'createdAt' | 'content'>
export type StorybookListItem = Pick<Storybook, 'id' | 'name' | 'ageRange' | 'styleId' | 'characters'> & {
  chapters?: StorybookChapterItem[]
}

interface StorybookListProps {
  storybooks: StorybookListItem[]
  characters: Character[]
  expandedId: string | null
  onToggle: (id: string) => void
  createHref?: string
}

export default function StorybookList({
  storybooks,
  characters,
  expandedId,
  onToggle,
  createHref = '/story/create',
}: StorybookListProps) {
  const { t } = useLanguage()

  const getProtagonist = (book: StorybookListItem) => {
    const entry = book.characters.find((c) => c.role === 'protagonist')
    if (!entry) return null
    return characters.find((c) => c.id === entry.id) ?? null
  }

  return (
    <div className="space-y-3">
      {storybooks.map((book) => {
        const protagonist = getProtagonist(book)
        const styledImage = protagonist
          ? (protagonist.styleImages?.[book.styleId] ?? protagonist.cartoonImage)
          : null
        const styleConfig = STYLES.find((s) => s.id === book.styleId)
        const isExpanded = expandedId === book.id
        const panelId = `storybook-panel-${book.id}`
        const chapters = book.chapters ?? []
        const chapterCount = chapters.length
        const latestChapter = chapters[chapterCount - 1]
        const latestChapterId = latestChapter?.id
        const latestChapterHasChoices = normalizeStoryChoices(latestChapter?.content ?? '').length > 0
        const [createPath, createSearch = ''] = createHref.split('?', 2)
        const continueParams = new URLSearchParams(createSearch)
        continueParams.set('bookId', book.id)
        if (latestChapterId && latestChapterHasChoices) {
          continueParams.set('fromStoryId', latestChapterId)
        } else {
          continueParams.delete('fromStoryId')
        }
        const continueQuery = continueParams.toString()
        const continueHref = continueQuery ? `${createPath}?${continueQuery}` : createPath

        return (
          <div key={book.id} className="card p-0 overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => onToggle(book.id)}
              aria-expanded={isExpanded}
              aria-controls={panelId}
              className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors text-left"
            >
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

              <div className={`shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            <div id={panelId} hidden={!isExpanded} className="border-t border-gray-100">
              {isExpanded && (
                chapterCount === 0 ? (
                  <div className="px-4 py-6 text-center">
                    <p className="text-sm text-gray-400 mb-3">{t('storybook.emptyBook')}</p>
                    <Link
                      href={continueHref}
                      className="text-xs font-bold text-forest-600 hover:text-forest-800 underline"
                    >
                      {t('storybook.createFirst')}
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {chapters.map((chapter, idx) => (
                      <Link
                        key={chapter.id}
                        href={`/story/play?id=${chapter.id}`}
                        className="flex items-start gap-3 px-4 py-3.5 hover:bg-forest-50/60 transition-colors group"
                      >
                        <div className="shrink-0 w-8 h-8 rounded-xl bg-forest-100 flex items-center justify-center mt-0.5">
                          <span className="text-xs font-extrabold text-forest-600">{idx + 1}</span>
                        </div>

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

                    <div className="px-4 py-3 bg-gray-50/50">
                      <Link
                        href={continueHref}
                        className="flex items-center gap-2 text-xs font-bold text-forest-500 hover:text-forest-700 transition-colors"
                      >
                        <span className="w-6 h-6 rounded-lg border-2 border-dashed border-forest-300 flex items-center justify-center text-forest-400">+</span>
                        {t('storybook.continueBtn')}
                      </Link>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
