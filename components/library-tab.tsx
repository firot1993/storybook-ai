'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { CharacterWithStoryCount, Story, Character } from '@/types'
import ConfirmDialog from './confirm-dialog'
import { showToast } from './toast'

interface StorySummary extends Omit<Story, 'content' | 'images'> {
  images: string[]
  characters?: Pick<Character, 'id' | 'name' | 'cartoonImage'>[]
}

interface CharacterMini {
  id: string
  name: string
  cartoonImage: string
}

interface CharacterRelationship {
  id: string
  characterAId: string
  characterBId: string
  relationship: string
  characterA: CharacterMini
  characterB: CharacterMini
}

function pairKey(a: string, b: string) {
  return [a, b].sort().join(':')
}

export default function LibraryTab() {
  const [activeTab, setActiveTab] = useState<'characters' | 'stories'>('characters')
  const [characters, setCharacters] = useState<CharacterWithStoryCount[]>([])
  const [stories, setStories] = useState<StorySummary[]>([])
  const [relationships, setRelationships] = useState<CharacterRelationship[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'character' | 'story'
    id: string
    name: string
  } | null>(null)
  const [editingCharacter, setEditingCharacter] = useState<{
    id: string
    name: string
    description: string
  } | null>(null)
  const [editingRelationship, setEditingRelationship] = useState<{
    characterAId: string
    characterBId: string
    relationship: string
  } | null>(null)
  const [savingCharacter, setSavingCharacter] = useState(false)
  const [savingRelationship, setSavingRelationship] = useState(false)

  const getRelationshipText = useCallback(
    (characterAId: string, characterBId: string) => {
      if (!characterAId || !characterBId || characterAId === characterBId) return ''
      const key = pairKey(characterAId, characterBId)
      return relationships.find((rel) => pairKey(rel.characterAId, rel.characterBId) === key)?.relationship || ''
    },
    [relationships]
  )

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      if (activeTab === 'characters') {
        const [charactersRes, relationshipsRes] = await Promise.all([
          fetch('/api/character'),
          fetch('/api/relationship'),
        ])

        if (charactersRes.ok) {
          const data = await charactersRes.json()
          setCharacters(data.characters)
        }
        if (relationshipsRes.ok) {
          const data = await relationshipsRes.json()
          setRelationships(data.relationships || [])
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
        setRelationships((prev) =>
          prev.filter((rel) => rel.characterAId !== id && rel.characterBId !== id)
        )
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
        body: JSON.stringify({
          name: editingCharacter.name.trim(),
          description: editingCharacter.description,
        }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null
        showToast(data?.error || 'Could not update character', 'error')
        return
      }

      const data = await response.json()
      const updated = data.character as Character
      setCharacters((prev) =>
        prev.map((character) =>
          character.id === updated.id
            ? {
                ...character,
                name: updated.name,
                description: updated.description,
              }
            : character
        )
      )
      setStories((prev) =>
        prev.map((story) => ({
          ...story,
          characters: story.characters?.map((character) =>
            character.id === updated.id
              ? { ...character, name: updated.name, cartoonImage: updated.cartoonImage }
              : character
          ),
        }))
      )
      setRelationships((prev) =>
        prev.map((rel) => ({
          ...rel,
          characterA:
            rel.characterA.id === updated.id
              ? {
                  ...rel.characterA,
                  name: updated.name,
                  cartoonImage: updated.cartoonImage,
                }
              : rel.characterA,
          characterB:
            rel.characterB.id === updated.id
              ? {
                  ...rel.characterB,
                  name: updated.name,
                  cartoonImage: updated.cartoonImage,
                }
              : rel.characterB,
        }))
      )
      setEditingCharacter(null)
      showToast('Character updated!', 'success')
    } catch (error) {
      console.error('Failed to save character:', error)
      showToast('Could not update character', 'error')
    } finally {
      setSavingCharacter(false)
    }
  }

  const openRelationshipEditor = () => {
    if (characters.length < 2) return
    const [first, second] = characters
    setEditingRelationship({
      characterAId: first.id,
      characterBId: second.id,
      relationship: getRelationshipText(first.id, second.id),
    })
  }

  const handleSaveRelationship = async () => {
    if (!editingRelationship) return

    setSavingRelationship(true)
    try {
      const response = await fetch('/api/relationship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterAId: editingRelationship.characterAId,
          characterBId: editingRelationship.characterBId,
          relationship: editingRelationship.relationship.trim(),
        }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null
        showToast(data?.error || 'Could not update relationship', 'error')
        return
      }

      const data = await response.json()
      const saved = data.relationship as CharacterRelationship | null
      const key = pairKey(editingRelationship.characterAId, editingRelationship.characterBId)

      if (!saved) {
        setRelationships((prev) =>
          prev.filter((rel) => pairKey(rel.characterAId, rel.characterBId) !== key)
        )
      } else {
        setRelationships((prev) => {
          const exists = prev.some((rel) => rel.id === saved.id)
          if (exists) {
            return prev.map((rel) => (rel.id === saved.id ? saved : rel))
          }
          return [saved, ...prev]
        })
      }

      setEditingRelationship(null)
      showToast('Relationship updated!', 'success')
    } catch (error) {
      console.error('Failed to save relationship:', error)
      showToast('Could not update relationship', 'error')
    } finally {
      setSavingRelationship(false)
    }
  }

  const selectedA = characters.find(c => c.id === editingRelationship?.characterAId)
  const selectedB = characters.find(c => c.id === editingRelationship?.characterBId)

  return (
    <div className="w-full">
      <div className="flex justify-center gap-2 mb-4 bg-grape-50 rounded-2xl p-1">
        <button
          onClick={() => setActiveTab('characters')}
          className={`flex-1 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'characters'
              ? 'bg-white text-candy-600 shadow-md'
              : 'text-grape-400 hover:text-grape-600'
          }`}
        >
          Characters {characters.length > 0 && activeTab !== 'characters' && (
            <span className="ml-1 text-xs bg-grape-200 text-grape-500 px-1.5 py-0.5 rounded-full">{characters.length}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('stories')}
          className={`flex-1 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'stories'
              ? 'bg-white text-sky-600 shadow-md'
              : 'text-grape-400 hover:text-grape-600'
          }`}
        >
          Stories {stories.length > 0 && activeTab !== 'stories' && (
            <span className="ml-1 text-xs bg-grape-200 text-grape-500 px-1.5 py-0.5 rounded-full">{stories.length}</span>
          )}
        </button>
      </div>

      {activeTab === 'characters' && characters.length >= 2 && (
        <div className="mb-8 page-enter">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-extrabold text-grape-700">Relationships &#128109;</h3>
            <button
              type="button"
              onClick={openRelationshipEditor}
              className="text-xs font-bold text-candy-500 hover:text-candy-600 bg-candy-50 hover:bg-candy-100 px-3 py-1.5 rounded-full transition-colors"
            >
              + New / Edit
            </button>
          </div>
          
          {relationships.length === 0 ? (
            <div className="bg-white/50 border-2 border-dashed border-grape-100 rounded-3xl p-6 text-center">
              <p className="text-xs text-grape-400 font-medium">No relationships defined yet. They&apos;ll help make better stories!</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {relationships.map((rel) => (
                <div
                  key={rel.id}
                  className="bg-white border-2 border-grape-100 rounded-2xl p-2.5 pr-4 flex items-center gap-3 shadow-sm hover:shadow-md hover:border-grape-200 transition-all cursor-pointer group"
                  onClick={() => setEditingRelationship({
                    characterAId: rel.characterAId,
                    characterBId: rel.characterBId,
                    relationship: rel.relationship
                  })}
                >
                  <div className="flex -space-x-3">
                    <div className="w-8 h-8 rounded-full border-2 border-white overflow-hidden shadow-sm relative">
                      <Image src={rel.characterA.cartoonImage} alt={rel.characterA.name} fill className="object-cover" />
                    </div>
                    <div className="w-8 h-8 rounded-full border-2 border-white overflow-hidden shadow-sm relative">
                      <Image src={rel.characterB.cartoonImage} alt={rel.characterB.name} fill className="object-cover" />
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-extrabold text-grape-400 leading-none mb-1">
                      {rel.characterA.name} & {rel.characterB.name}
                    </p>
                    <p className="text-xs font-bold text-grape-700 leading-none">
                      {rel.relationship}
                    </p>
                  </div>
                  <div className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="w-3 h-3 text-grape-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15.232 5.232l3.536 3.536M9 11l6-6 3 3-6 6-4 1 1-4z" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
          <h3 className="font-extrabold text-grape-700 mb-4">Characters &#128101;</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Link
              href="/character"
              className="card-interactive p-0 overflow-hidden aspect-[3/4] flex flex-col items-center justify-center border-dashed border-candy-300 bg-candy-50/30 group"
            >
              <div className="w-14 h-14 rounded-full bg-candy-100 flex items-center justify-center text-2xl group-hover:scale-110 group-hover:rotate-12 transition-transform mb-2">
                &#128247;
              </div>
              <p className="font-extrabold text-candy-600 text-sm">New Character</p>
              <p className="text-[10px] text-candy-400 font-medium">Upload a photo</p>
            </Link>
            {characters.map((char) => (
              <div key={char.id} className="group relative">
                <div className="card-interactive p-0 overflow-hidden aspect-[3/4] flex flex-col">
                  <div className="relative flex-1 bg-grape-50">
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
                          className="flex-1 bg-white/90 hover:bg-white text-grape-700 text-[10px] font-bold py-1.5 rounded-full text-center"
                        >
                          New Story
                        </Link>
                        <button
                          onClick={() =>
                            setEditingCharacter({
                              id: char.id,
                              name: char.name || '',
                              description: char.description || '',
                            })
                          }
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
                    <p className="font-bold text-grape-700 text-sm truncate">{char.name || 'Unnamed'}</p>
                    <p className="text-[10px] text-candy-500 font-medium">{char._count.stories} stories</p>
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
              &#128214;
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
                    <Image
                      src={story.images[0]}
                      alt={story.title}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl opacity-20 text-sky-300">
                      &#128214;
                    </div>
                  )}
                  <div className="absolute top-2 left-2 flex -space-x-2">
                    {story.characters?.slice(0, 3).map((c) => (
                      <div key={c.id} className="w-6 h-6 rounded-full border-2 border-white overflow-hidden bg-white shadow-sm">
                        <Image src={c.cartoonImage} alt={c.name} width={24} height={24} className="object-cover" />
                      </div>
                    ))}
                  </div>
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
            ? `Are you sure you want to say goodbye to ${deleteTarget.name}? All their stories will be gone too.`
            : `Are you sure you want to delete "${deleteTarget?.name}"?`
        }
        confirmLabel="Say Goodbye"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {editingCharacter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !savingCharacter && setEditingCharacter(null)} />
          <div className="relative bg-white rounded-3xl shadow-2xl p-6 max-w-md w-full border-3 border-sky-200">
            <h2 className="text-xl font-extrabold text-grape-700 mb-4">Edit Character</h2>
            <label className="block text-sm font-bold text-grape-600 mb-2">Name</label>
            <input
              type="text"
              value={editingCharacter.name}
              onChange={(e) => setEditingCharacter((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
              className="input mb-4"
              placeholder="Character name"
            />
            <label className="block text-sm font-bold text-grape-600 mb-2">Description</label>
            <textarea
              value={editingCharacter.description}
              onChange={(e) => setEditingCharacter((prev) => (prev ? { ...prev, description: e.target.value } : prev))}
              className="input min-h-[110px] resize-none"
              placeholder="Describe your character..."
            />
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setEditingCharacter(null)}
                disabled={savingCharacter}
                className="btn-secondary flex-1 py-3 text-base disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCharacter}
                disabled={savingCharacter}
                className="btn-primary flex-1 py-3 text-base disabled:opacity-50"
              >
                {savingCharacter ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingRelationship && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !savingRelationship && setEditingRelationship(null)} />
          <div className="relative bg-white rounded-3xl shadow-2xl p-6 max-w-md w-full border-3 border-grape-200">
            <h2 className="text-xl font-extrabold text-grape-700 mb-4">Edit Relationship</h2>
            
            <div className="flex items-center justify-center gap-6 mb-8 mt-4">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full border-4 border-white shadow-lg overflow-hidden relative mx-auto mb-2">
                  {selectedA && <Image src={selectedA.cartoonImage} alt={selectedA.name} fill className="object-cover" />}
                </div>
                <p className="text-[10px] font-bold text-grape-500 truncate w-20">{selectedA?.name || 'Character 1'}</p>
              </div>
              <div className="text-2xl animate-pulse text-candy-400">&#10084;</div>
              <div className="text-center">
                <div className="w-16 h-16 rounded-full border-4 border-white shadow-lg overflow-hidden relative mx-auto mb-2">
                  {selectedB && <Image src={selectedB.cartoonImage} alt={selectedB.name} fill className="object-cover" />}
                </div>
                <p className="text-[10px] font-bold text-grape-500 truncate w-20">{selectedB?.name || 'Character 2'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-sm font-bold text-grape-600 mb-2">Character 1</label>
                <select
                  value={editingRelationship.characterAId}
                  onChange={(e) => {
                    const nextA = e.target.value
                    const nextB = nextA === editingRelationship.characterBId
                      ? (characters.find((char) => char.id !== nextA)?.id || editingRelationship.characterBId)
                      : editingRelationship.characterBId
                    setEditingRelationship({
                      characterAId: nextA,
                      characterBId: nextB,
                      relationship: getRelationshipText(nextA, nextB),
                    })
                  }}
                  className="input text-xs"
                >
                  {characters.map((char) => (
                    <option key={char.id} value={char.id}>
                      {char.name || 'Unnamed'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-grape-600 mb-2">Character 2</label>
                <select
                  value={editingRelationship.characterBId}
                  onChange={(e) => {
                    const nextB = e.target.value
                    const nextA = nextB === editingRelationship.characterAId
                      ? (characters.find((char) => char.id !== nextB)?.id || editingRelationship.characterAId)
                      : editingRelationship.characterAId
                    setEditingRelationship({
                      characterAId: nextA,
                      characterBId: nextB,
                      relationship: getRelationshipText(nextA, nextB),
                    })
                  }}
                  className="input text-xs"
                >
                  {characters.map((char) => (
                    <option key={char.id} value={char.id}>
                      {char.name || 'Unnamed'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label className="block text-sm font-bold text-grape-600 mb-2">How are they related?</label>
            <input
              type="text"
              value={editingRelationship.relationship}
              onChange={(e) => setEditingRelationship((prev) => (prev ? { ...prev, relationship: e.target.value } : prev))}
              className="input"
              placeholder="e.g. siblings, cousins, best friends..."
            />
            <p className="text-[10px] text-grape-400 mt-2 italic font-medium">Leave blank to remove the relationship.</p>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setEditingRelationship(null)}
                disabled={savingRelationship}
                className="btn-secondary flex-1 py-3 text-base disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveRelationship}
                disabled={savingRelationship}
                className="btn-primary flex-1 py-3 text-base disabled:opacity-50"
              >
                {savingRelationship ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
