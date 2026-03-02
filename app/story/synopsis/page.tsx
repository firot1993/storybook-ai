'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface SynopsisData {
  id: string
  content: string
  theme: string
  estimatedSceneCount: number
}

export default function SynopsisPage() {
  const router = useRouter()
  const [synopsis, setSynopsis] = useState<SynopsisData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem('currentSynopsis')
    if (stored) {
      try { setSynopsis(JSON.parse(stored)) } catch { /* ignore */ }
    } else {
      router.replace('/story/create')
    }
  }, [router])

  const handleConfirm = async () => {
    if (!synopsis) return
    setLoading(true)
    setError('')
    try {
      const storyOptionsRaw = localStorage.getItem('storyOptions')
      const storyOptions = storyOptionsRaw ? JSON.parse(storyOptionsRaw) : []

      // Navigate to story options (already generated or re-generate)
      if (storyOptions.length > 0) {
        router.push('/story/options')
      } else {
        router.push('/story/options')
      }
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  const handleRegenerate = () => {
    localStorage.removeItem('currentSynopsis')
    router.push('/story/create')
  }

  if (!synopsis) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-grape-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-grape-50 to-white px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <Link href="/story/create" className="text-grape-500 text-sm mb-6 inline-flex items-center gap-1">
          ← Back
        </Link>

        <div className="card mb-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">📖</span>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Story Outline</h1>
              <p className="text-sm text-gray-500">
                Theme: <span className="font-medium text-grape-600">{synopsis.theme}</span>
                &nbsp;·&nbsp;~{synopsis.estimatedSceneCount} scenes
              </p>
            </div>
          </div>

          <div className="bg-grape-50 rounded-xl p-5 text-gray-700 leading-relaxed whitespace-pre-wrap text-sm">
            {synopsis.content}
          </div>
        </div>

        {error && (
          <p className="text-red-500 text-sm mb-4 text-center">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleRegenerate}
            className="btn-secondary flex-1"
          >
            ↺ Try Different Outline
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="btn-primary flex-1 disabled:opacity-60"
          >
            {loading ? 'Continuing…' : 'Use This Outline →'}
          </button>
        </div>
      </div>
    </div>
  )
}
