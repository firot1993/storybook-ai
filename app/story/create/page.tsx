'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Character } from '@/types'

export default function CreateStoryPage() {
  const [keywords, setKeywords] = useState('')
  const [ageGroup, setAgeGroup] = useState<'2-4' | '4-6' | '6-8'>('4-6')
  const [character, setCharacter] = useState<Character | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const stored = localStorage.getItem('currentCharacter')
    if (stored) {
      setCharacter(JSON.parse(stored))
    } else {
      router.push('/character')
    }
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!character) return

    setLoading(true)
    try {
      const response = await fetch('/api/story/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterName: character.name || 'the character',
          keywords,
          ageGroup,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        localStorage.setItem('storyOptions', JSON.stringify(data.options))
        localStorage.setItem('storyKeywords', keywords)
        localStorage.setItem('ageGroup', ageGroup)
        router.push('/story/options')
      } else {
        const data = (await response.json().catch(() => null)) as { error?: string; details?: unknown } | null
        if (data?.details) {
          console.error('Story options generation details:', data.details)
        }
        alert(data?.error || 'Failed to generate story options. Please try again.')
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Failed to generate story options. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!character) return null

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="max-w-xl w-full">
        <Link href="/character/name" className="text-gray-500 hover:text-gray-700 mb-8 inline-block">
          ← Back
        </Link>

        <div className="card">
          <div className="flex items-center gap-4 mb-6">
            <Image
              src={character.cartoonImage}
              alt={character.name}
              width={64}
              height={64}
              className="w-16 h-16 rounded-full object-cover border-2 border-primary-500"
            />
            <div>
              <p className="text-sm text-gray-500">Creating a story for</p>
              <p className="text-xl font-bold text-gray-900">{character.name}</p>
            </div>
          </div>

          <h1 className="text-2xl font-bold mb-2">What kind of adventure?</h1>
          <p className="text-gray-600 mb-6">
            Describe the story you want, or enter some keywords
          </p>

          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Story Keywords
              </label>
              <textarea
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="e.g., forest adventure, space travel, magical castle..."
                className="input h-32 resize-none"
                required
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Age Group
              </label>
              <div className="flex gap-3">
                {(['2-4', '4-6', '6-8'] as const).map((age) => (
                  <button
                    key={age}
                    type="button"
                    onClick={() => setAgeGroup(age)}
                    className={`flex-1 py-2 px-4 rounded-lg border-2 transition-colors ${
                      ageGroup === age
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {age} years
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !keywords.trim()}
              className="btn-primary w-full text-lg disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin">✨</span>
                  Generating ideas...
                </span>
              ) : (
                'Generate Story Options →'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
