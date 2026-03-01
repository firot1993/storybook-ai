'use client'

import { Suspense, useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Character } from '@/types'
import StepProgress from '@/components/step-progress'
import { showToast } from '@/components/toast'

const AGE_LABELS: Record<string, { label: string; emoji: string; color: string; activeColor: string }> = {
  '2-4': { label: 'Tiny Tots', emoji: '\u{1F476}', color: 'border-candy-200 text-candy-600', activeColor: 'border-candy-500 bg-candy-100 text-candy-700 shadow-md' },
  '4-6': { label: 'Little Stars', emoji: '\u{2B50}', color: 'border-sun-200 text-sun-600', activeColor: 'border-sun-500 bg-sun-100 text-sun-700 shadow-md' },
  '6-8': { label: 'Big Kids', emoji: '\u{1F680}', color: 'border-grape-200 text-grape-600', activeColor: 'border-grape-500 bg-grape-100 text-grape-700 shadow-md' },
}

const THEMES = [
  { label: 'Jungle Adventure', emoji: '\u{1F334}', keywords: 'jungle, animals, exploring, treasure' },
  { label: 'Space Mission', emoji: '\u{1F680}', keywords: 'stars, rocket, moon, aliens' },
  { label: 'Under the Sea', emoji: '\u{1F419}', keywords: 'ocean, fish, mermaid, bubbles' },
  { label: 'Magic Castle', emoji: '\u{1F3F0}', keywords: 'magic, dragon, knight, wizard' },
]

const STORY_PROGRESS = [
  { emoji: '\u{1F4AD}', text: 'Brainstorming ideas...' },
  { emoji: '\u{1F4DD}', text: 'Writing story outlines...' },
  { emoji: '\u{2728}', text: 'Adding a sprinkle of magic...' },
]

const FUN_KEYWORDS = [
  { text: 'Dinosaurs', emoji: '\u{1F996}' },
  { text: 'Space', emoji: '\u{1F680}' },
  { text: 'Magic', emoji: '\u{1F320}' },
  { text: 'Pirates', emoji: '\u{1F3F4}\u{200D}\u{2620}\u{FE0F}' },
  { text: 'Animals', emoji: '\u{1F43E}' },
  { text: 'Princess', emoji: '\u{1F478}' },
  { text: 'Superheroes', emoji: '\u{1F9B8}' },
  { text: 'Ocean', emoji: '\u{1F30A}' },
]

export default function CreateStoryPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
        <div className="max-w-xl w-full">
          <div className="skeleton h-4 w-20 mb-8" />
          <div className="card">
            <div className="skeleton h-8 w-64 mb-2" />
            <div className="skeleton h-5 w-48 mb-6" />
            <div className="skeleton h-32 w-full mb-6" />
            <div className="skeleton h-12 w-full" />
          </div>
        </div>
      </div>
    }>
      <CreateStoryContent />
    </Suspense>
  )
}

function CreateStoryContent() {
  const [keywords, setKeywords] = useState('')
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null)
  const [ageGroup, setAgeGroup] = useState<'2-4' | '4-6' | '6-8'>('4-6')
  const [characters, setCharacters] = useState<Character[]>([])
  const [allCharacters, setAllCharacters] = useState<Character[]>([])
  const [relationship, setRelationship] = useState('')
  const [isRelationshipLoading, setIsRelationshipLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [progressStep, setProgressStep] = useState(0)
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (loading) {
      setProgressStep(0)
      progressInterval.current = setInterval(() => {
        setProgressStep((prev) => Math.min(prev + 1, STORY_PROGRESS.length - 1))
      }, 2500)
    } else {
      if (progressInterval.current) clearInterval(progressInterval.current)
    }
    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current)
    }
  }, [loading])

  const fetchRelationship = useCallback(async (ids: string[]) => {
    if (ids.length !== 2) {
      setRelationship('')
      return
    }
    
    setIsRelationshipLoading(true)
    try {
      const res = await fetch(`/api/relationship?characterAId=${ids[0]}&characterBId=${ids[1]}`)
      if (res.ok) {
        const data = await res.json()
        setRelationship(data.relationship?.relationship || '')
      }
    } catch (error) {
      console.error('Error fetching relationship:', error)
    } finally {
      setIsRelationshipLoading(false)
    }
  }, [])

  const fetchAllCharacters = useCallback(async () => {
    try {
      const res = await fetch('/api/character')
      if (res.ok) {
        const data = await res.json()
        setAllCharacters(data.characters || [])
      }
    } catch {
      // Non-critical
    }
  }, [])

  useEffect(() => {
    const characterId = searchParams.get('characterId')

    const initialize = async () => {
      await fetchAllCharacters()
      
      let initialCharacters: Character[] = []
      if (characterId) {
        try {
          const res = await fetch(`/api/character/${characterId}`)
          if (res.ok) {
            const data = await res.json()
            if (data?.character) {
              initialCharacters = [data.character]
              setCharacters(initialCharacters)
            }
          }
        } catch (error) {
          console.error('Error fetching character:', error)
        }
      } else {
        const stored = localStorage.getItem('currentCharacter')
        if (stored) {
          const char = JSON.parse(stored)
          initialCharacters = [char]
          setCharacters(initialCharacters)
          localStorage.removeItem('currentCharacter')
        }
      }
      setHydrated(true)
    }

    initialize()
  }, [searchParams, fetchAllCharacters])

  const toggleCharacter = (char: Character) => {
    setCharacters((prev) => {
      let next: Character[]
      const exists = prev.some((c) => c.id === char.id)
      if (exists) {
        next = prev.filter((c) => c.id !== char.id)
      } else if (prev.length >= 3) {
        showToast('You can pick up to 3 characters!', 'error')
        return prev
      } else {
        next = [...prev, char]
      }
      
      if (next.length === 2) {
        fetchRelationship(next.map(c => c.id))
      } else {
        setRelationship('')
      }
      
      return next
    })
  }

  const toggleKeyword = (word: string) => {
    setSelectedTheme(null)
    setKeywords(prev => {
      const words = prev.split(',').map(w => w.trim()).filter(Boolean)
      if (words.includes(word)) {
        return words.filter(w => w !== word).join(', ')
      } else {
        if (words.length >= 3) {
          showToast('Pick up to 3 ideas for the best story!', 'error')
          return prev
        }
        return [...words, word].join(', ')
      }
    })
  }

  const selectTheme = (themeLabel: string, themeKeywords: string) => {
    if (selectedTheme === themeLabel) {
      setSelectedTheme(null)
      setKeywords('')
    } else {
      setSelectedTheme(themeLabel)
      setKeywords(themeKeywords)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (characters.length === 0) {
      showToast('Please pick at least one character!', 'error')
      return
    }

    setLoading(true)
    try {
      // Save relationship if 2 characters are picked
      if (characters.length === 2 && relationship.trim()) {
        await fetch('/api/relationship', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            characterAId: characters[0].id,
            characterBId: characters[1].id,
            relationship: relationship.trim(),
          }),
        })
      }

      const response = await fetch('/api/story/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterIds: characters.map((c) => c.id),
          characterNames: characters.map((c) => c.name || 'the character'),
          characterDescriptions: characters.map((c) => c.description || ''),
          keywords,
          ageGroup,
          relationship: relationship.trim(),
        }),
      })

      if (response.ok) {
        const data = await response.json()
        localStorage.setItem('storyOptions', JSON.stringify(data.options))
        localStorage.setItem('storyKeywords', keywords)
        localStorage.setItem('ageGroup', ageGroup)
        localStorage.setItem('currentCharacters', JSON.stringify(characters))
        localStorage.setItem('storyRelationship', relationship.trim())
        router.push('/story/options')
      } else {
        const data = (await response.json().catch(() => null)) as { error?: string; details?: unknown } | null
        showToast(data?.error || 'Oops! Something went wrong. Let\'s try again!', 'error')
      }
    } catch (error) {
      console.error('Error:', error)
      showToast('Oops! Something went wrong. Let\'s try again!', 'error')
    } finally {
      setLoading(false)
    }
  }

  if (!hydrated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
        <div className="max-w-xl w-full">
          <div className="skeleton h-4 w-20 mb-8" />
          <div className="card">
            <div className="skeleton h-8 w-64 mb-2" />
            <div className="skeleton h-5 w-48 mb-6" />
            <div className="skeleton h-32 w-full mb-6" />
            <div className="skeleton h-12 w-full" />
          </div>
        </div>
      </div>
    )
  }

  const selectedKeywordsList = keywords.split(',').map(k => k.trim()).filter(Boolean)

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-12">
      <div className="max-w-2xl w-full page-enter">
        <Link href="/" className="text-grape-400 hover:text-grape-600 mb-6 inline-flex items-center gap-1 text-sm font-bold">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Home
        </Link>

        <StepProgress currentStep={0} type="story" />

        <form onSubmit={handleSubmit} className="card border-t-8 border-t-sky-400 relative overflow-hidden">
          {loading && (
            <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-50 flex flex-col items-center justify-center text-center p-8 animate-fade-in">
              <div className="text-6xl mb-6 animate-bounce-star" key={progressStep}>{STORY_PROGRESS[progressStep].emoji}</div>
              <h2 className="text-2xl font-extrabold text-grape-700 mb-1">Whispering to the magic book...</h2>
              <p className="text-candy-600 font-bold mb-6 animate-fade-in text-sm" key={`text-${progressStep}`}>
                {STORY_PROGRESS[progressStep].text}
              </p>
              <div className="w-64 h-2.5 bg-grape-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-candy-400 to-grape-400 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${((progressStep + 1) / STORY_PROGRESS.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          <h1 className="text-3xl font-extrabold mb-2 text-grape-700">New Adventure &#10024;</h1>
          <p className="text-candy-600 mb-8 text-lg font-medium">Who is going on this journey?</p>
          
          <div className="mb-10">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-grape-600">Pick your characters</h3>
              <span className={`text-xs font-bold px-2 py-1 rounded-lg ${characters.length >= 3 ? 'bg-sun-100 text-sun-700' : 'bg-grape-50 text-grape-400'}`}>
                {characters.length}/3 Selected
              </span>
            </div>
            
            {allCharacters.length === 0 ? (
              <div className="text-center py-12 bg-sky-50 rounded-3xl border-3 border-dashed border-sky-200">
                <div className="text-5xl mb-4">&#128101;</div>
                <p className="text-sky-800 font-extrabold text-xl mb-2">No characters yet!</p>
                <p className="text-sky-600 mb-8 max-w-xs mx-auto">You need to make a character first before you can start a story.</p>
                <Link href="/character" className="btn-primary py-4 px-8 shadow-sky-200">
                  Make a Character &#127775;
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {allCharacters.map((char) => {
                  const isSelected = characters.some((c) => c.id === char.id)
                  return (
                    <button
                      key={char.id}
                      type="button"
                      onClick={() => toggleCharacter(char)}
                      className={`group relative flex flex-col items-center transition-all duration-300 ${
                        isSelected ? 'scale-105' : 'grayscale-[0.5] opacity-70 hover:grayscale-0 hover:opacity-100'
                      }`}
                    >
                      <div className={`relative w-20 h-20 sm:w-24 sm:h-24 rounded-3xl overflow-hidden border-4 transition-all ${
                        isSelected ? 'border-candy-400 shadow-xl' : 'border-white shadow-md'
                      }`}>
                        <Image
                          src={char.cartoonImage}
                          alt={char.name || 'Character'}
                          fill
                          className="object-cover"
                        />
                        {isSelected && (
                          <div className="absolute inset-0 bg-candy-500/20 flex items-center justify-center">
                            <div className="bg-white rounded-full p-1 shadow-lg animate-fade-in">
                              <svg className="w-6 h-6 text-candy-500" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          </div>
                        )}
                      </div>
                      <span className={`mt-2 text-sm font-extrabold truncate w-full text-center ${isSelected ? 'text-candy-600' : 'text-grape-400'}`}>
                        {char.name || 'Unnamed'}
                      </span>
                    </button>
                  )
                })}
                {allCharacters.length < 12 && (
                  <Link
                    href="/character"
                    className="flex flex-col items-center group"
                  >
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl border-4 border-dashed border-sky-200 flex items-center justify-center bg-white group-hover:bg-sky-50 transition-all group-hover:scale-105">
                      <span className="text-4xl text-sky-300 group-hover:rotate-90 transition-transform">+</span>
                    </div>
                    <span className="mt-2 text-xs font-bold text-sky-300">New Friend</span>
                  </Link>
                )}
              </div>
            )}
          </div>

          {characters.length >= 2 && (
            <div className="mb-10 animate-fade-in">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="font-bold text-grape-600">
                  {characters.length === 2 ? 'How are they related?' : 'How do they know each other?'}
                </h3>
                {isRelationshipLoading && (
                  <div className="w-4 h-4 border-2 border-grape-200 border-t-grape-500 rounded-full animate-spin" />
                )}
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  placeholder={characters.length === 2 
                    ? `e.g. ${characters[0].name} and ${characters[1].name} are best friends` 
                    : "e.g. They are all cousins visiting the beach"}
                  className="input pr-10"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xl">
                  {characters.length === 2 ? '\u{1F46D}' : '\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}\u{200D}\u{1F466}'}
                </div>
              </div>
              <p className="mt-2 text-xs text-candy-500 font-medium italic">
                {characters.length === 2 
                  ? "This helps the AI write better interactions between them!"
                  : "Tell us how this group of friends interacts!"}
              </p>
            </div>
          )}

          <div className="mb-10">
            <h3 className="font-bold text-grape-600 mb-4">Choose an adventure theme</h3>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {THEMES.map((theme) => (
                <button
                  key={theme.label}
                  type="button"
                  onClick={() => selectTheme(theme.label, theme.keywords)}
                  className={`p-4 rounded-2xl border-2 text-left transition-all ${
                    selectedTheme === theme.label
                      ? 'border-sky-400 bg-sky-50 shadow-md ring-2 ring-sky-100'
                      : 'border-grape-100 bg-white hover:border-sky-200 hover:bg-sky-50/30'
                  }`}
                >
                  <span className="text-2xl block mb-1">{theme.emoji}</span>
                  <span className="text-sm font-bold text-grape-700 block">{theme.label}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-grape-100" />
              <span className="text-xs font-bold text-grape-400 uppercase tracking-wider">or mix your own</span>
              <div className="flex-1 h-px bg-grape-100" />
            </div>
            <label className="block text-sm font-bold text-grape-600 mb-3">
              Pick fun things to include:
            </label>
            <div className="flex flex-wrap gap-2 mb-4">
              {FUN_KEYWORDS.map(({ text, emoji }) => {
                const isActive = selectedKeywordsList.includes(text)
                return (
                  <button
                    key={text}
                    type="button"
                    onClick={() => toggleKeyword(text)}
                    className={`px-4 py-2 rounded-full border-2 text-sm font-bold transition-all ${
                      isActive 
                        ? 'bg-candy-500 border-candy-500 text-white shadow-md' 
                        : 'bg-white border-grape-200 text-grape-600 hover:border-candy-300 hover:bg-candy-50'
                    }`}
                  >
                    {emoji} {text}
                  </button>
                )
              })}
            </div>
            <input
              type="text"
              value={keywords}
              onChange={(e) => { setSelectedTheme(null); setKeywords(e.target.value) }}
              placeholder="Type your own ideas here..."
              className="input text-base"
            />
          </div>

          <div className="mb-10">
            <label className="block text-sm font-bold text-grape-600 mb-4">
              Who is this story for?
            </label>
            <div className="flex gap-3">
              {(['2-4', '4-6', '6-8'] as const).map((age) => {
                const info = AGE_LABELS[age]
                return (
                  <button
                    key={age}
                    type="button"
                    onClick={() => setAgeGroup(age)}
                    className={`flex-1 py-4 px-2 rounded-2xl border-3 font-bold transition-all duration-200 text-center ${
                      ageGroup === age ? info.activeColor : info.color
                    }`}
                  >
                    <span className="text-2xl block mb-1">{info.emoji}</span>
                    <span className="text-sm block">{info.label}</span>
                    <span className="text-xs block opacity-70">{age} yrs</span>
                  </button>
                )
              })}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !keywords.trim() || characters.length === 0}
            className="btn-primary w-full text-xl disabled:opacity-50 py-5"
          >
            Create Magic Stories &#10024;
          </button>
        </form>
      </div>
    </div>
  )
}
