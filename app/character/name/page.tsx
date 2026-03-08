'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import type { Character } from '@/types'
import StepProgress from '@/components/step-progress'
import { showToast } from '@/components/toast'
import { useLanguage } from '@/lib/i18n'
import StorybookList, { type StorybookListItem } from '@/components/storybook-list'

const RANDOM_NAMES = [
  'Sparkle', 'Max', 'Luna', 'Binkie', 'Oliver', 'Daisy',
  'Ziggy', 'Pip', 'Bubbles', 'Leo', 'Ginger', 'Toby', 'Mochi', 'Finn',
]

export default function NameCharacterPage() {
  const { locale, t } = useLanguage()
  const [name, setName] = useState('')
  const [age, setAge] = useState<string>('')
  const [character, setCharacter] = useState<Character | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [saving, setSaving] = useState(false)
  const [assigningVoice, setAssigningVoice] = useState(false)
  const [voiceName, setVoiceName] = useState('')
  const [voiceReason, setVoiceReason] = useState('')
  const [relatedBooks, setRelatedBooks] = useState<StorybookListItem[]>([])
  const [bookCharacters, setBookCharacters] = useState<Character[]>([])
  const [loadingRelatedBooks, setLoadingRelatedBooks] = useState(false)
  const [expandedBookId, setExpandedBookId] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const characterId = searchParams.get('id')?.trim() || ''
  const isDetailMode = characterId.length > 0

  useEffect(() => {
    let cancelled = false

    const applyCharacter = (char: Character) => {
      if (cancelled) return
      setCharacter(char)
      setName(char.name || '')
      setAge(typeof char.age === 'number' ? String(char.age) : '')
      setVoiceName(char.voiceName || '')
      setVoiceReason('')
      if (!characterId) {
        localStorage.setItem('currentCharacter', JSON.stringify(char))
      }
    }

    const loadCharacter = async () => {
      try {
        if (characterId) {
          setLoadingRelatedBooks(true)

          const res = await fetch(`/api/character/${characterId}`)
          if (!res.ok) throw new Error(t('characterName.loadFailed'))
          const data = await res.json()
          if (!data?.character) throw new Error(t('characterName.loadFailed'))
          applyCharacter(data.character as Character)
          if (!cancelled) setHydrated(true)

          try {
            const [booksRes, charsRes] = await Promise.all([
              fetch('/api/storybook'),
              fetch('/api/character'),
            ])

            if (!booksRes.ok) {
              if (!cancelled) {
                setRelatedBooks([])
                setExpandedBookId(null)
              }
            } else {
              const booksData = await booksRes.json() as { storybooks?: StorybookListItem[] }
              const storybooks = Array.isArray(booksData.storybooks) ? booksData.storybooks : []
              const related = storybooks.filter((book) =>
                Array.isArray(book.characters) && book.characters.some((entry) => entry.id === characterId)
              )
              if (!cancelled) {
                setRelatedBooks(related)
                setExpandedBookId(related.length === 1 ? related[0].id : null)
              }
            }

            if (!charsRes.ok) {
              if (!cancelled) setBookCharacters([])
            } else {
              const charsData = await charsRes.json() as { characters?: Character[] }
              if (!cancelled) setBookCharacters(Array.isArray(charsData.characters) ? charsData.characters : [])
            }
          } catch {
            if (!cancelled) {
              setRelatedBooks([])
              setBookCharacters([])
              setExpandedBookId(null)
            }
          }
          return
        }

        const stored = localStorage.getItem('currentCharacter')
        if (!stored) {
          router.push('/character')
          return
        }
        applyCharacter(JSON.parse(stored) as Character)
        if (!cancelled) setHydrated(true)
      } catch (err) {
        showToast(err instanceof Error ? err.message : t('characterName.loadFailed'), 'error')
        router.push('/character')
      } finally {
        if (!cancelled) {
          setHydrated(true)
          setLoadingRelatedBooks(false)
        }
      }
    }

    loadCharacter()

    return () => { cancelled = true }
  }, [characterId, router, t])

  const handleRandomName = () => {
    setName(RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)])
  }

  const handleAssignVoice = async () => {
    if (!character) return
    setAssigningVoice(true)
    try {
      const ageNum = age ? parseInt(age, 10) : null
      await fetch(`/api/character/${character.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || character.name,
          ...(ageNum !== null ? { age: ageNum } : {}),
        }),
      })

      const res = await fetch(`/api/character/${character.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assignVoice', locale }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('characterName.voiceAssignFailed'))
      setVoiceName(data.voiceName)
      setVoiceReason(data.reason || '')

      const updated = { ...character, voiceName: data.voiceName }
      setCharacter(updated)
      localStorage.setItem('currentCharacter', JSON.stringify(updated))
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('characterName.voiceAssignFailed'), 'error')
    } finally {
      setAssigningVoice(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !character) return

    setSaving(true)
    try {
      const ageNum = age ? parseInt(age, 10) : null
      const updated: Character = {
        ...character,
        name: name.trim(),
        age: ageNum ?? undefined,
        voiceName: voiceName || character.voiceName,
      }
      localStorage.setItem('currentCharacter', JSON.stringify(updated))

      await fetch(`/api/character/${character.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          ...(ageNum !== null ? { age: ageNum } : {}),
          ...(voiceName ? { voiceName } : {}),
        }),
      })

      showToast(t('characterName.welcome', { name }), 'success')
      router.push('/')
    } catch {
      showToast(t('characterName.saveFailed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!hydrated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
        <div className="max-w-xl w-full">
          <div className="skeleton h-4 w-20 mb-8" />
          <div className="card space-y-4">
            <div className="skeleton h-8 w-64 mx-auto" />
            <div className="skeleton w-48 h-48 rounded-full mx-auto" />
            <div className="skeleton h-12 w-full" />
            <div className="skeleton h-12 w-full" />
          </div>
        </div>
      </div>
    )
  }

  if (!character) return null

  const toggleRelatedBook = (id: string) => {
    setExpandedBookId((prev) => (prev === id ? null : id))
  }

  if (isDetailMode) {
    const createdAtDate = new Date(character.createdAt)
    const createdAtText = Number.isNaN(createdAtDate.getTime())
      ? t('characterName.notSet')
      : createdAtDate.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US')
    const styleLabelRaw = t(`styles.${character.style}.label`)
    const styleLabel = styleLabelRaw.startsWith('styles.') ? character.style : styleLabelRaw

    return (
      <div className="min-h-screen px-4 py-8">
        <div className="max-w-2xl mx-auto page-enter">
          <Link href="/character" className="text-grape-400 hover:text-grape-600 mb-6 inline-flex items-center gap-1 text-sm font-bold">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            {t('characterName.back')}
          </Link>

          <div className="card">
            <h1 className="text-3xl font-extrabold text-center mb-2 text-grape-700">
              {t('characterName.detailsTitle')}
            </h1>
            <p className="text-gray-500 text-center mb-7">
              {t('characterName.detailsSubtitle')}
            </p>

            <div className="flex items-center justify-center gap-5 mb-8">
              {character.originalImage && (
                <>
                  <div className="flex flex-col items-center">
                    <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-gray-200 shadow opacity-60">
                      <Image src={character.originalImage} alt="Original" width={80} height={80} className="w-full h-full object-cover" />
                    </div>
                    <span className="text-[10px] text-gray-400 mt-1.5 font-medium">{t('characterName.photo')}</span>
                  </div>
                  <div className="text-gray-300 -mt-4 text-lg font-bold">→</div>
                </>
              )}
              <div className="flex flex-col items-center">
                <div className="rounded-full p-1.5 bg-gradient-to-r from-grape-400 to-grape-600 shadow-xl inline-block">
                  <Image
                    src={character.cartoonImage}
                    alt="Character portrait"
                    width={140}
                    height={140}
                    className="w-36 h-36 rounded-full object-cover bg-white"
                  />
                </div>
                <span className="text-[10px] text-grape-500 mt-1.5 font-bold">{t('characterName.character')}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                <p className="text-[11px] text-gray-500 font-semibold">{t('characterName.nameInfoLabel')}</p>
                <p className="text-sm font-bold text-gray-800 mt-1 break-words">{character.name || t('character.unnamed')}</p>
              </div>
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                <p className="text-[11px] text-gray-500 font-semibold">{t('characterName.ageInfoLabel')}</p>
                <p className="text-sm font-bold text-gray-800 mt-1">
                  {typeof character.age === 'number' ? `${character.age} ${t('character.yearsOld')}` : t('characterName.notSet')}
                </p>
              </div>
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                <p className="text-[11px] text-gray-500 font-semibold">{t('characterName.voiceTitle')}</p>
                <p className="text-sm font-bold text-gray-800 mt-1">{character.voiceName || t('characterName.notSet')}</p>
              </div>
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                <p className="text-[11px] text-gray-500 font-semibold">{t('characterName.styleLabel')}</p>
                <p className="text-sm font-bold text-gray-800 mt-1">{styleLabel || t('characterName.notSet')}</p>
              </div>
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                <p className="text-[11px] text-gray-500 font-semibold">{t('characterName.pronounLabel')}</p>
                <p className="text-sm font-bold text-gray-800 mt-1">{character.pronoun || t('characterName.notSet')}</p>
              </div>
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                <p className="text-[11px] text-gray-500 font-semibold">{t('characterName.roleLabel')}</p>
                <p className="text-sm font-bold text-gray-800 mt-1">{character.role || t('characterName.notSet')}</p>
              </div>
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 sm:col-span-2">
                <p className="text-[11px] text-gray-500 font-semibold">{t('characterName.createdAtLabel')}</p>
                <p className="text-sm font-bold text-gray-800 mt-1">{createdAtText}</p>
              </div>
            </div>

            <div className="mt-6">
              <h2 className="text-sm font-extrabold text-gray-700 mb-3">{t('characterName.relatedBooksTitle')}</h2>

              {loadingRelatedBooks ? (
                <div className="space-y-3">
                  <div className="skeleton h-20 rounded-2xl" />
                  <div className="skeleton h-20 rounded-2xl" />
                </div>
              ) : relatedBooks.length === 0 ? (
                <div className="rounded-2xl bg-gray-50 border border-gray-200 p-4">
                  <p className="text-xs text-gray-400">{t('characterName.relatedBooksEmpty')}</p>
                </div>
              ) : (
                <StorybookList
                  storybooks={relatedBooks}
                  characters={bookCharacters}
                  expandedId={expandedBookId}
                  onToggle={toggleRelatedBook}
                />
              )}
            </div>

            <p className="text-center mt-6">
              <button
                type="button"
                onClick={() => router.push('/character')}
                className="text-sm text-gray-400 hover:text-gray-600 underline underline-offset-2"
              >
                {t('characterName.backToCharacters')}
              </button>
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="max-w-xl w-full page-enter">
        <Link href="/character" className="text-grape-400 hover:text-grape-600 mb-6 inline-flex items-center gap-1 text-sm font-bold">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {t('characterName.back')}
        </Link>

        <StepProgress currentStep={1} type="character" />

        <div className="card">
          <h1 className="text-3xl font-extrabold text-center mb-2 text-grape-700">
            {t('characterName.title')}
          </h1>
          <p className="text-gray-500 text-center mb-7">
            {t('characterName.subtitle')}
          </p>

          {/* Portrait display */}
          <div className="flex items-center justify-center gap-5 mb-8">
            {character.originalImage && (
              <>
                <div className="flex flex-col items-center">
                  <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-gray-200 shadow opacity-60">
                    <Image src={character.originalImage} alt="Original" width={80} height={80} className="w-full h-full object-cover" />
                  </div>
                  <span className="text-[10px] text-gray-400 mt-1.5 font-medium">{t('characterName.photo')}</span>
                </div>
                <div className="text-gray-300 -mt-4 text-lg font-bold">→</div>
              </>
            )}
            <div className="flex flex-col items-center">
              <div className="rounded-full p-1.5 bg-gradient-to-r from-grape-400 to-grape-600 shadow-xl inline-block">
                <Image
                  src={character.cartoonImage}
                  alt="Character portrait"
                  width={140}
                  height={140}
                  className="w-36 h-36 rounded-full object-cover bg-white"
                />
              </div>
              <span className="text-[10px] text-grape-500 mt-1.5 font-bold">{t('characterName.character')}</span>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-5">
            {/* Name */}
            <div>
              <div className="flex justify-between items-end mb-2">
                <label className="text-sm font-bold text-gray-700">{t('characterName.nameLabel')}</label>
                <button type="button" onClick={handleRandomName} className="text-xs font-bold text-grape-500 hover:text-grape-700">
                  {t('characterName.randomBtn')}
                </button>
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('characterName.namePlaceholder')}
                className="input"
                required
                autoFocus
              />
            </div>

            {/* Age */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">{t('characterName.ageLabel')}</label>
              <div className="flex gap-2 flex-wrap">
                {[3, 4, 5, 6, 7, 8, 9, 10].map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAge(age === String(a) ? '' : String(a))}
                    className={`w-10 h-10 rounded-full text-sm font-bold border-2 transition-all ${
                      age === String(a)
                        ? 'border-grape-500 bg-grape-500 text-white shadow'
                        : 'border-gray-200 text-gray-500 hover:border-grape-300'
                    }`}
                  >
                    {a}
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder={t('characterName.ageOther')}
                  className="input w-20 text-sm py-1.5"
                />
              </div>
            </div>

            {/* Voice assignment */}
            <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-bold text-gray-700">{t('characterName.voiceTitle')}</p>
                  <p className="text-xs text-gray-400">{t('characterName.voiceSubtitle')}</p>
                </div>
                <button
                  type="button"
                  onClick={handleAssignVoice}
                  disabled={assigningVoice}
                  className="text-sm font-bold px-4 py-2 bg-grape-500 text-white rounded-full hover:bg-grape-600 disabled:opacity-60 transition-colors shrink-0"
                >
                  {assigningVoice ? '...' : voiceName ? t('characterName.reassign') : t('characterName.assignVoice')}
                </button>
              </div>

              {voiceName ? (
                <div className="flex items-center gap-3 bg-white rounded-xl p-3 border border-grape-100">
                  <span className="text-2xl">🎙️</span>
                  <div>
                    <p className="font-bold text-grape-700">{voiceName}</p>
                    <p className="text-xs text-gray-400">{t(`voices.${voiceName}`) || t('characterName.matchedVoice')}</p>
                    {voiceReason && <p className="text-xs text-gray-500 mt-0.5 italic">{voiceReason}</p>}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400 text-center py-2">{t('characterName.noVoice')}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="btn-primary w-full text-lg disabled:opacity-50 py-4"
            >
              {saving ? t('characterName.saving') : t('characterName.saveBtn')}
            </button>

            <p className="text-center">
              <button
                type="button"
                onClick={() => router.push('/story/create')}
                className="text-sm text-gray-400 hover:text-gray-600 underline underline-offset-2"
              >
                {t('characterName.skipStory')}
              </button>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
