'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { StoryOption, Character } from '@/types'

export default function StoryOptionsPage() {
  const [options, setOptions] = useState<StoryOption[]>([])
  const [character, setCharacter] = useState<Character | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const storedOptions = localStorage.getItem('storyOptions')
    const storedCharacter = localStorage.getItem('currentCharacter')
    
    if (storedOptions && storedCharacter) {
      setOptions(JSON.parse(storedOptions))
      setCharacter(JSON.parse(storedCharacter))
    } else {
      router.push('/story/create')
    }
  }, [router])

  const handleSelect = async (index: number) => {
    if (!character) return
    
    setSelectedIndex(index)
    setLoading(true)

    try {
      const response = await fetch('/api/story/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: character.id,
          optionIndex: index,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        localStorage.setItem('currentStory', JSON.stringify(data.story))
        router.push('/story/play')
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Failed to generate story. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!character || options.length === 0) return null

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="max-w-2xl w-full">
        <Link href="/story/create" className="text-gray-500 hover:text-gray-700 mb-8 inline-block">
          ← Back
        </Link>

        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <img
              src={character.cartoonImage}
              alt={character.name}
              className="w-12 h-12 rounded-full object-cover border-2 border-primary-500"
            />
            <span className="text-xl font-bold">{character.name}'s Adventure</span>
          </div>
          
          <h1 className="text-3xl font-bold mb-2">Choose Your Story</h1>
          <p className="text-gray-600">
            Select one of these magical adventures
          </p>
        </div>

        <div className="space-y-4">
          {options.map((option, index) => (
            <button
              key={index}
              onClick={() => !loading && handleSelect(index)}
              disabled={loading}
              className={`w-full card text-left transition-all hover:shadow-xl ${
                selectedIndex === index 
                  ? 'ring-4 ring-primary-500 bg-primary-50' 
                  : ''
              } ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                  selectedIndex === index 
                    ? 'bg-primary-500 text-white' 
                    : 'bg-gray-200 text-gray-700'
                }`}>
                  {loading && selectedIndex === index ? (
                    <span className="animate-spin">✨</span>
                  ) : (
                    index + 1
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    {option.title}
                  </h3>
                  <p className="text-gray-600">{option.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link href="/story/create" className="text-primary-600 hover:text-primary-700">
            ← Try different keywords
          </Link>
        </div>
      </div>
    </div>
  )
}
