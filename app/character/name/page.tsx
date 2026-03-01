'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Character } from '@/types'

export default function NameCharacterPage() {
  const [name, setName] = useState('')
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
    if (!name.trim() || !character) return

    setLoading(true)
    try {
      const updated = { ...character, name: name.trim() }
      localStorage.setItem('currentCharacter', JSON.stringify(updated))
      router.push('/story/create')
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  if (!character) return null

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="max-w-xl w-full">
        <Link href="/character" className="text-gray-500 hover:text-gray-700 mb-8 inline-block">
          ← Back
        </Link>

        <div className="card">
          <h1 className="text-3xl font-bold text-center mb-2">
            Name Your Character
          </h1>
          <p className="text-gray-600 text-center mb-8">
            What should we call your new friend?
          </p>

          <div className="text-center mb-8">
            <Image
              src={character.cartoonImage}
              alt="Your character"
              width={192}
              height={192}
              className="w-48 h-48 mx-auto rounded-full object-cover shadow-lg border-4 border-white"
            />
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Character Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Sparkle, Max, Luna"
                className="input text-lg"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="btn-primary w-full text-lg disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Continue →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
