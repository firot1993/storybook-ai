'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Character } from '@/types'
import StepProgress from '@/components/step-progress'
import { showToast } from '@/components/toast'

const RANDOM_NAMES = [
  'Sparkle', 'Max', 'Luna', 'Binkie', 'Oliver', 'Daisy', 'Waffles', 
  'Ziggy', 'Pip', 'Bubbles', 'Rex', 'Misty', 'Leo', 'Ginger', 'Toby'
]

export default function NameCharacterPage() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [character, setCharacter] = useState<Character | null>(null)
  const [loading, setLoading] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const stored = localStorage.getItem('currentCharacter')
    if (stored) {
      setCharacter(JSON.parse(stored))
    } else {
      router.push('/character')
    }
    setHydrated(true)
  }, [router])

  const handleRandomName = () => {
    const random = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)]
    setName(random)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !character) return

    setLoading(true)
    try {
      const updated = { ...character, name: name.trim(), description: description.trim() }
      localStorage.setItem('currentCharacter', JSON.stringify(updated))

      // Persist name and description to DB
      try {
        await fetch(`/api/character/${character.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), description: description.trim() }),
        })
      } catch {
        // Non-blocking: localStorage is the source of truth for the session
      }

      showToast(`Welcome to the family, ${name}! \u{2728}`, 'success')
      router.push('/')
    } catch (error) {
      console.error('Error:', error)
      showToast('Oops! We couldn\'t save your friend. Try again!', 'error')
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
            <div className="skeleton h-8 w-64 mx-auto mb-2" />
            <div className="skeleton h-5 w-48 mx-auto mb-8" />
            <div className="skeleton w-48 h-48 rounded-full mx-auto mb-8" />
            <div className="skeleton h-12 w-full mb-6" />
            <div className="skeleton h-12 w-full mb-6" />
            <div className="skeleton h-12 w-full" />
          </div>
        </div>
      </div>
    )
  }

  if (!character) return null

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="max-w-xl w-full page-enter">
        <Link href="/character" className="text-grape-400 hover:text-grape-600 mb-6 inline-flex items-center gap-1 text-sm font-bold">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Link>

        <StepProgress currentStep={1} type="character" />

        <div className="card">
          <h1 className="text-3xl font-extrabold text-center mb-2 text-grape-700">
            Meet Your New Friend! &#11088;
          </h1>
          <p className="text-candy-600 text-center mb-8 text-lg">
            Give them a name and a special story!
          </p>

          <div className="flex items-center justify-center gap-4 mb-8">
            {/* Original photo (small) */}
            <div className="flex flex-col items-center">
              <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-grape-200 shadow-md opacity-60">
                <Image
                  src={character.originalImage}
                  alt="Original photo"
                  width={80}
                  height={80}
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="text-[10px] text-grape-400 mt-1.5 font-medium">Photo</span>
            </div>

            {/* Arrow */}
            <div className="text-grape-300 flex flex-col items-center -mt-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              <span className="text-[10px] font-bold text-candy-400">Magic!</span>
            </div>

            {/* Cartoon (large, featured) */}
            <div className="flex flex-col items-center relative">
              <div className="rounded-full p-1.5 bg-gradient-to-r from-candy-400 via-sun-400 to-grape-400 inline-block shadow-xl">
                <Image
                  src={character.cartoonImage}
                  alt="Your character"
                  width={160}
                  height={160}
                  className="w-40 h-40 rounded-full object-cover bg-white"
                />
              </div>
              <div className="absolute -bottom-1 -right-1 w-10 h-10 bg-mint-500 rounded-full border-4 border-white flex items-center justify-center text-lg shadow-lg animate-bounce-star">
                &#10024;
              </div>
              <span className="text-[10px] text-candy-500 mt-1.5 font-bold">Cartoon</span>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <div className="flex justify-between items-end mb-2">
                <label className="block text-lg font-bold text-grape-600">
                  Character Name
                </label>
                <button 
                  type="button" 
                  onClick={handleRandomName}
                  className="text-sm font-bold text-candy-500 hover:text-candy-600 flex items-center gap-1"
                >
                  <span>&#127922;</span> Random Name
                </button>
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Sparkle, Max, Luna"
                className="input text-xl"
                required
                autoFocus
              />
            </div>

            <div className="mb-8">
              <label className="block text-lg font-bold text-grape-600 mb-2">
                What are they like? (Setting)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., A brave knight who lives in a candy castle, or a friendly dragon who loves marshmallows..."
                className="input text-lg h-32 resize-none leading-relaxed"
              />
              <p className="text-xs text-grape-400 mt-2 font-medium">
                This helps the AI write better stories for them!
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="btn-primary w-full text-xl disabled:opacity-50 inline-flex items-center justify-center gap-2 group"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="animate-bounce-star inline-block">&#10024;</span>
                  Saving {name || 'your friend'}...
                </span>
              ) : (
                <>
                  Save & Continue
                  <span className="group-hover:translate-x-1 transition-transform">&#10024;</span>
                </>
              )}
            </button>

            <p className="text-center mt-4">
              <button
                type="button"
                onClick={() => router.push('/story/create')}
                className="text-sm text-grape-400 hover:text-grape-600 font-medium underline underline-offset-2"
              >
                Skip to story creation
              </button>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
