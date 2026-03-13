'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import type { Character } from '@/types'
import { showToast } from '@/components/toast'
import ConfirmDialog from '@/components/confirm-dialog'
import { useLanguage } from '@/lib/i18n'

export default function CharacterPage() {
  const { t } = useLanguage()
  const [characters, setCharacters] = useState<Character[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  const fetchChars = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/character')
      if (res.ok) {
        const data = await res.json()
        setCharacters(data.characters)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchChars() }, [fetchChars])

  const handleDelete = async () => {
    if (!deleteTarget) return
    const res = await fetch(`/api/character/${deleteTarget.id}`, { method: 'DELETE' })
    if (res.ok) {
      setCharacters((prev) => prev.filter((c) => c.id !== deleteTarget.id))
      showToast(t('character.deleted'), 'success')
    }
    setDeleteTarget(null)
  }

  return (
    <div className="min-h-[calc(100vh-60px)] px-4 pt-6 pb-12">
      <div className="max-w-5xl mx-auto">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-accent font-bold text-forest-800">{t('character.pageTitle')}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t('character.pageSubtitle')}</p>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="aspect-[3/4] card p-0 overflow-hidden">
                <div className="skeleton h-full w-full rounded-none" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {/* New character card */}
            <Link href="/character/create"
              className="card-interactive p-0 overflow-hidden aspect-[3/4] flex flex-col items-center justify-center border-dashed border-ember-300 bg-ember-50/30 group">
              <div className="w-14 h-14 rounded-full bg-ember-100 flex items-center justify-center text-2xl group-hover:scale-110 group-hover:rotate-12 transition-transform mb-2">
                📸
              </div>
              <p className="font-extrabold text-ember-600 text-sm">{t('character.createCard')}</p>
              <p className="text-xs text-ember-400 font-medium mt-0.5">{t('character.uploadHint')}</p>
            </Link>

            {characters.map((char) => (
              <div key={char.id} className="group relative">
                <div className="card-interactive p-0 overflow-hidden aspect-[3/4] flex flex-col">
                  <div className="relative flex-1 bg-gray-100">
                    <Image
                      src={char.cartoonImage}
                      alt={char.name || t('character.unnamed')}
                      fill className="object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2.5">
                      <Link
                        href={`/story/create?characterId=${char.id}`}
                        className="w-full bg-white/90 hover:bg-white text-forest-700 text-xs font-bold py-1.5 rounded-full text-center"
                      >
                        {t('character.createStoryHover')}
                      </Link>
                    </div>
                  </div>
                  <div className="p-2.5 bg-white text-center">
                    <p className="font-bold text-forest-700 text-sm truncate">{char.name || t('character.unnamed')}</p>
                    {char.age && <p className="text-xs text-ember-500 font-medium">{char.age} {t('character.yearsOld')}</p>}
                    {char.voiceName && <p className="text-xs text-gray-500">🎙️ {char.voiceName}</p>}
                    <div className="mt-2">
                      <Link
                        href={`/character/name?id=${char.id}`}
                        className="inline-flex items-center justify-center w-full rounded-full border border-gray-200 text-gray-700 text-[11px] font-bold py-1.5 hover:bg-gray-50 transition-colors"
                      >
                        {t('character.manageBtn')}
                      </Link>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setDeleteTarget({ id: char.id, name: char.name || t('character.unnamed') })}
                  className="absolute top-2 right-2 bg-red-500/80 hover:bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 shadow-sm"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {!loading && characters.length === 0 && (
          <div className="text-center py-24 mt-4 max-w-md mx-auto">
            <div className="text-7xl mb-6 animate-fade-up stagger-1">🌟</div>
            <h2 className="font-accent font-bold text-2xl text-forest-800 mb-2 animate-fade-up stagger-2">{t('character.emptyState')}</h2>
            <p className="text-base text-gray-500 mb-8 leading-relaxed animate-fade-up stagger-3">{t('character.emptyHelp')}</p>
            <Link href="/character/create" className="btn-primary inline-flex items-center gap-2.5 py-4 px-8 text-lg animate-fade-up stagger-4">
              <span>📸</span>
              <span>{t('character.createCard')}</span>
              <span>→</span>
            </Link>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('character.deleteTitle')}
        message={t('character.deleteMessage', { name: deleteTarget?.name ?? '' })}
        confirmLabel={t('character.deleteConfirm')}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
