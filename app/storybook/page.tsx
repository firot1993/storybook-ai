'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { Character } from '@/types'
import StorybookList, { type StorybookListItem } from '@/components/storybook-list'
import { useLanguage } from '@/lib/i18n'

export default function StorybookLibraryPage() {
  const { t } = useLanguage()
  const [storybooks, setStorybooks] = useState<StorybookListItem[]>([])
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
        const books: StorybookListItem[] = d.storybooks ?? []
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
          <StorybookList
            storybooks={storybooks}
            characters={characters}
            expandedId={expandedId}
            onToggle={toggle}
          />
        )}

      </div>
    </div>
  )
}
