'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Character, Story } from '@/types'
import ConfirmDialog from './confirm-dialog'
import { showToast } from './toast'

interface StorySummary extends Omit<Story, 'content' | 'images'> {
  images: string[]
}

export default function LibraryTab() {
  const [activeTab, setActiveTab] = useState<'characters' | 'stories'>('characters')
  const [characters, setCharacters] = useState<Character[]>([])
  const [stories, setStories] = useState<StorySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'character' | 'story'
    id: string
    name: string
  } | null>(null)
  const [editingCharacter, setEditingCharacter] = useState<{
    id: string
    name: string
  } | null>(null)
  const [savingCharacter, setSavingCharacter] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      if (activeTab === 'characters') {
        const res = await fetch('/api/character')
        if (res.ok) {
          const data = await res.json()
          setCharacters(data.characters)
        }
      } else {
        const res = await fetch('/api/story')
        if (res.ok) {
          const data = await res.json()
          setStories(data.stories)
        }
      }
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleDelete = async () => {
    if (!deleteTarget) return
    const { type, id } = deleteTarget

    const endpoint = type === 'character' ? `/api/character/${id}` : `/api/story/${id}`
    const res = await fetch(endpoint, { method: 'DELETE' })

    if (res.ok) {
      if (type === 'character') {
        setCharacters((prev) => prev.filter((c) => c.id !== id))
      } else {
        setStories((prev) => prev.filter((s) => s.id !== id))
      }
    }
    setDeleteTarget(null)
  }

  const handleSaveCharacter = async () => {
    if (!editingCharacter) return

    setSavingCharacter(true)
    try {
      const response = await fetch(`/api/character/${editingCharacter.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingCharacter.name.trim() }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null
        showToast(data?.error || 'Could not update character', 'error')
        return
      }

      setCharacters((prev) =>
        prev.map((c) =>
          c.id === editingCharacter.id ? { ...c, name: editingCharacter.name.trim() } : c
        )
      )
      setEditingCharacter(null)
      showToast('Character updated!', 'success')
    } catch {
      showToast('Could not update character', 'error')
    } finally {
      setSavingCharacter(false)
    }
  }

  return (
    <div className="w-full">
      <div className="flex justify-center gap-2 mb-4 bg-forest-50 rounded-2xl p-1">
        <button
          onClick={() => setActiveTab('characters')}
          className={`flex-1 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'characters'
              ? 'bg-white text-ember-600 shadow-md'
              : 'text-forest-400 hover:text-forest-600'
          }`}
        >
          Characters{characters.length > 0 && activeTab !== 'characters' && (
            <span className="ml-1 text-xs bg-forest-200 text-forest-500 px-1.5 py-0.5 rounded-full">{characters.length}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('stories')}
          className={`flex-1 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'stories'
              ? 'bg-white text-sky-600 shadow-md'
              : 'text-forest-400 hover:text-forest-600'
          }`}
        >
          Stories{stories.length > 0 && activeTab !== 'stories' && (
            <span className="ml-1 text-xs bg-forest-200 text-forest-500 px-1.5 py-0.5 rounded-full">{stories.length}</span>
          )}
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 page-enter">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="aspect-[3/4] card p-0 overflow-hidden">
              <div className="skeleton h-full w-full rounded-none" />
            </div>
          ))}
        </div>
      ) : activeTab === 'characters' ? (
        <div className="page-enter">
          <h3 className="font-extrabold text-forest-700 mb-4">Characters 👥</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Link
              href="/character"
              className="card-interactive p-0 overflow-hidden aspect-[3/4] flex flex-col items-center justify-center border-dashed border-ember-300 bg-ember-50/30 group"
            >
              <div className="w-14 h-14 rounded-full bg-ember-100 flex items-center justify-center text-2xl group-hover:scale-110 group-hover:rotate-12 transition-transform mb-2">
                📸
              </div>
              <p className="font-extrabold text-ember-600 text-sm">New Character</p>
              <p className="text-[10px] text-ember-400 font-medium">Upload a photo</p>
            </Link>
            {characters.map((char) => (
              <div key={char.id} className="group relative">
                <div className="card-interactive p-0 overflow-hidden aspect-[3/4] flex flex-col">
                  <div className="relative flex-1 bg-forest-50">
                    <Image
                      src={char.cartoonImage}
                      alt={char.name || 'Character'}
                      fill
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                      <div className="flex gap-2">
                        <Link
                          href={`/story/create?characterId=${char.id}`}
                          className="flex-1 bg-white/90 hover:bg-white text-forest-700 text-[10px] font-bold py-1.5 rounded-full text-center"
                        >
                          New Story
                        </Link>
                        <button
                          onClick={() => setEditingCharacter({ id: char.id, name: char.name || '' })}
                          className="bg-sky-500/90 hover:bg-sky-500 text-white p-1.5 rounded-full"
                          aria-label="Edit character"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15.232 5.232l3.536 3.536M9 11l6-6 3 3-6 6-4 1 1-4z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setDeleteTarget({ type: 'character', id: char.id, name: char.name })}
                          className="bg-red-500/90 hover:bg-red-500 text-white p-1.5 rounded-full"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 bg-white text-center">
                    <p className="font-bold text-forest-700 text-sm truncate">{char.name || 'Unnamed'}</p>
                    {char.age && (
                      <p className="text-[10px] text-ember-500 font-medium">Age {char.age}</p>
                    )}
                    {char.voiceName && (
                      <p className="text-[10px] text-gray-400 font-medium">🎙️ {char.voiceName}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 page-enter">
          <Link
            href="/story/create"
            className="card-interactive p-0 overflow-hidden aspect-[3/4] flex flex-col items-center justify-center border-dashed border-sky-300 bg-sky-50/30 group"
          >
            <div className="w-14 h-14 rounded-full bg-sky-100 flex items-center justify-center text-2xl group-hover:scale-110 group-hover:-rotate-12 transition-transform mb-2">
              📖
            </div>
            <p className="font-extrabold text-sky-600 text-sm">New Story</p>
            <p className="text-[10px] text-sky-400 font-medium">Start an adventure</p>
          </Link>
          {stories.map((story) => (
            <div key={story.id} className="group relative">
              <Link
                href={`/story/play?id=${story.id}`}
                className="group card-interactive p-0 overflow-hidden aspect-[3/4] flex flex-col border-sky-200"
              >
                <div className="relative flex-1 bg-sky-50">
                  {story.images?.[0] ? (
                    <Image src={story.images[0]} alt={story.title} fill className="object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl opacity-20 text-sky-300">
                      📖
                    </div>
                  )}
                </div>
                <div className="p-3 bg-white border-t border-sky-100">
                  <p className="font-bold text-sky-900 text-xs sm:text-sm line-clamp-2 leading-tight mb-1 h-8 sm:h-10">
                    {story.title}
                  </p>
                  <p className="text-[9px] text-sky-400 font-medium">
                    {new Date(story.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </Link>
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setDeleteTarget({ type: 'story', id: story.id, name: story.title })
                }}
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

      <ConfirmDialog
        open={!!deleteTarget}
        title={deleteTarget?.type === 'character' ? 'Delete Character?' : 'Delete Story?'}
        message={
          deleteTarget?.type === 'character'
            ? `Are you sure you want to say goodbye to ${deleteTarget.name}?`
            : `Are you sure you want to delete "${deleteTarget?.name}"?`
        }
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {editingCharacter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !savingCharacter && setEditingCharacter(null)} />
          <div className="relative bg-white rounded-3xl shadow-2xl p-6 max-w-md w-full border-2 border-sky-200">
            <h2 className="text-xl font-extrabold text-forest-700 mb-4">Edit Character</h2>
            <label className="block text-sm font-bold text-forest-600 mb-2">Name</label>
            <input
              type="text"
              value={editingCharacter.name}
              onChange={(e) => setEditingCharacter((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
              className="input mb-6"
              placeholder="Character name"
              autoFocus
            />
            <div className="flex gap-3">
              <button type="button" onClick={() => setEditingCharacter(null)} disabled={savingCharacter} className="btn-secondary flex-1 disabled:opacity-50">
                Cancel
              </button>
              <button type="button" onClick={handleSaveCharacter} disabled={savingCharacter} className="btn-primary flex-1 disabled:opacity-50">
                {savingCharacter ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
