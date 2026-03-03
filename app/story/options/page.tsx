'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { StoryOption, Character } from '@/types'
import { setCurrentStoryInIndexedDB } from '@/lib/client-story-store'
import StepProgress from '@/components/step-progress'
import { showToast } from '@/components/toast'

const CARD_STYLES = [
  'bg-gradient-to-br from-candy-50 to-candy-100 border-candy-300',
  'bg-gradient-to-br from-sky-50 to-sky-100 border-sky-300',
  'bg-gradient-to-br from-sun-50 to-sun-100 border-sun-300',
]

const CARD_ICONS = ['\u{2B50}', '\u{1F496}', '\u{26A1}']

const GENERATE_STEPS = [
  { emoji: '\u{1F4D6}', text: 'Writing your story...' },
  { emoji: '\u{1F3A8}', text: 'Painting the illustrations...' },
  { emoji: '\u{2728}', text: 'Adding finishing touches...' },
  { emoji: '\u{1F31F}', text: 'Almost ready...' },
]

export default function StoryOptionsPage() {
  const [options, setOptions] = useState<StoryOption[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [progressStep, setProgressStep] = useState(0)
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (loading) {
      setProgressStep(0)
      progressInterval.current = setInterval(() => {
        setProgressStep((prev) => Math.min(prev + 1, GENERATE_STEPS.length - 1))
      }, 8000)
    } else {
      if (progressInterval.current) clearInterval(progressInterval.current)
    }
    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current)
    }
  }, [loading])

  useEffect(() => {
    const storedOptions = localStorage.getItem('storyOptions')
    const storedCharacters = localStorage.getItem('currentCharacters')

    if (storedOptions && storedCharacters) {
      setOptions(JSON.parse(storedOptions))
      setCharacters(JSON.parse(storedCharacters))
    } else {
      router.push('/story/create')
    }
    setHydrated(true)
  }, [router])

  const handleSelect = async (index: number) => {
    if (characters.length === 0) return

    const storedKeywords = localStorage.getItem('storyKeywords') || ''
    const storedAgeGroup = localStorage.getItem('ageGroup') || '4-6'
    const storedRelationship = localStorage.getItem('storyRelationship') || ''
    const selectedOption = options[index]

    setSelectedIndex(index)
    setLoading(true)

    try {
      const response = await fetch('/api/story/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterIds: characters.map((c) => c.id),
          characterNames: characters.map((c) => c.name || 'the character'),
          characterImages: characters.map((c) => c.cartoonImage),
          optionIndex: index,
          optionTitle: selectedOption?.title,
          optionDescription: selectedOption?.description,
          keywords: storedKeywords,
          ageGroup: storedAgeGroup,
          relationship: storedRelationship,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data?.warnings) {
          console.warn('Story generation warnings:', data.warnings)
        }

        try {
          localStorage.setItem('currentStory', JSON.stringify(data.story))
          localStorage.setItem('currentStoryStorage', 'localStorage')
        } catch (storageError) {
          console.warn('localStorage write failed for currentStory, falling back to IndexedDB.', storageError)
          await setCurrentStoryInIndexedDB(data.story)
          localStorage.removeItem('currentStory')
          localStorage.setItem('currentStoryStorage', 'indexedDB')
        }

        router.push('/story/play')
      } else {
        const data = (await response.json().catch(() => null)) as { error?: string; details?: unknown } | null
        if (data?.details) {
          console.error('Story generation details:', data.details)
        }
        const message = data?.error || `Oops! Something went wrong. Let's try again!`
        showToast(message, 'error')
      }
    } catch (error) {
      console.error('Story generation request failed:', error)
      const message = error instanceof Error ? error.message : 'Oops! Something went wrong. Let\'s try again!'
      showToast(message, 'error')
    } finally {
      setLoading(false)
    }
  }

  if (!hydrated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
        <div className="max-w-2xl w-full">
          <div className="skeleton h-4 w-20 mb-8" />
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="skeleton w-12 h-12 rounded-full" />
              <div className="skeleton h-6 w-40" />
            </div>
            <div className="skeleton h-8 w-48 mx-auto mb-2" />
            <div className="skeleton h-5 w-56 mx-auto" />
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card">
                <div className="flex items-start gap-4">
                  <div className="skeleton w-10 h-10 rounded-full" />
                  <div className="flex-1">
                    <div className="skeleton h-6 w-48 mb-2" />
                    <div className="skeleton h-4 w-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (characters.length === 0 || options.length === 0) return null

  const adventureTitle = characters.length === 1
    ? `${characters[0].name}'s Adventure`
    : characters.length === 2
      ? `${characters[0].name} & ${characters[1].name}'s Adventure`
      : `${characters.map((c) => c.name).join(', ')}'s Adventure`

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="max-w-2xl w-full page-enter">
        <Link href="/story/create" className="text-grape-400 hover:text-grape-600 mb-6 inline-flex items-center gap-1 text-sm font-bold">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Link>

        <StepProgress currentStep={1} type="story" />

        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="flex -space-x-3">
              {characters.map((char) => (
                <div key={char.id} className="rounded-full p-0.5 bg-gradient-to-r from-candy-400 to-grape-400">
                  <Image
                    src={char.cartoonImage}
                    alt={char.name}
                    width={48}
                    height={48}
                    className="w-12 h-12 rounded-full object-cover bg-white"
                  />
                </div>
              ))}
            </div>
            <span className="text-xl font-extrabold text-grape-700">{adventureTitle}</span>
          </div>

          <h1 className="text-3xl font-extrabold mb-2 text-grape-700">Pick a story! &#127775;</h1>
          <p className="text-candy-600 text-lg">
            Which one sounds fun?
          </p>
        </div>

        <div className="space-y-4">
          {options.map((option, index) => (
            <button
              key={index}
              onClick={() => !loading && handleSelect(index)}
              disabled={loading}
              className={`w-full text-left rounded-3xl p-6 border-3 transition-all duration-200 ${
                CARD_STYLES[index % CARD_STYLES.length]
              } ${
                selectedIndex === index
                  ? 'ring-4 ring-candy-300 scale-[1.02] shadow-xl'
                  : 'hover:shadow-xl hover:-translate-y-1 hover:scale-[1.01]'
              } ${loading && selectedIndex !== index ? 'opacity-40' : ''} ${loading ? 'cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center text-2xl bg-white/60">
                  {loading && selectedIndex === index ? (
                    <div className="w-6 h-6 border-3 border-candy-300 border-t-candy-600 rounded-full animate-spin" />
                  ) : (
                    CARD_ICONS[index % CARD_ICONS.length]
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-extrabold text-gray-900 mb-1">
                    {option.title}
                  </h3>
                  <p className="text-gray-700 text-sm leading-relaxed">{option.description}</p>
                </div>
              </div>
              {loading && selectedIndex === index && (
                <div className="mt-4 pt-4 border-t border-candy-200">
                  <div className="flex items-center gap-2 text-sm text-candy-700 font-bold mb-2">
                    <span className="animate-bounce-star inline-block">{GENERATE_STEPS[progressStep].emoji}</span>
                    <span className="animate-fade-in" key={progressStep}>{GENERATE_STEPS[progressStep].text}</span>
                  </div>
                  <div className="w-full h-1.5 bg-candy-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-candy-400 to-grape-400 rounded-full transition-all duration-1000 ease-out"
                      style={{ width: `${((progressStep + 1) / GENERATE_STEPS.length) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </button>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link href="/story/create" className="text-grape-500 hover:text-grape-700 text-sm inline-flex items-center gap-1 font-bold">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Try different ideas
          </Link>
        </div>
      </div>
    </div>
  )
}
