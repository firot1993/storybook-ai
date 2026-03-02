'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { VideoSettings } from '@/types'

const RESOLUTIONS = [
  { value: '1280x720', label: '16:9 Widescreen (1280×720)', emoji: '📺' },
  { value: '1080x1080', label: '1:1 Square (1080×1080)', emoji: '📱' },
  { value: '1920x1080', label: '16:9 Full HD (1920×1080)', emoji: '🖥️' },
] as const

const TRANSITIONS = [
  { value: 'fade', label: 'Fade', description: 'Smooth fade between scenes' },
  { value: 'cut', label: 'Cut', description: 'Instant scene change' },
] as const

export default function VideoCreatePage() {
  const router = useRouter()
  const [settings, setSettings] = useState<VideoSettings>({
    resolution: '1280x720',
    fps: 24,
    transitionType: 'fade',
    subtitleStyle: { fontSize: 28, color: 'white', position: 'bottom' },
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!localStorage.getItem('currentScript')) {
      router.replace('/story/create')
    }
  }, [router])

  const handleStart = async () => {
    const scriptRaw = localStorage.getItem('currentScript')
    const storyRaw = localStorage.getItem('currentStory')
    const characterRaw = localStorage.getItem('currentCharacter')

    if (!scriptRaw || !storyRaw) {
      setError('Missing script or story data. Please start over.')
      return
    }

    const script = JSON.parse(scriptRaw)
    const story = JSON.parse(storyRaw)
    const character = characterRaw ? JSON.parse(characterRaw) : null

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/video/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: script.id,
          storyId: story.id,
          videoSettings: settings,
          characterImages: character?.cartoonImage ? [character.cartoonImage] : [],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to start video generation')

      router.push(`/video/${data.videoProject.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-grape-50 to-white px-4 py-12">
      <div className="max-w-xl mx-auto">
        <Link href="/story/script" className="text-grape-500 text-sm mb-6 inline-flex items-center gap-1">
          ← Back to Script
        </Link>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800 mb-1">🎬 Video Settings</h1>
          <p className="text-sm text-gray-500">Choose your video format before generating</p>
        </div>

        <div className="card mb-6">
          <h2 className="font-semibold text-gray-700 mb-3">Resolution</h2>
          <div className="space-y-2">
            {RESOLUTIONS.map((r) => (
              <label
                key={r.value}
                className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                  settings.resolution === r.value
                    ? 'border-grape-500 bg-grape-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="resolution"
                  value={r.value}
                  checked={settings.resolution === r.value}
                  onChange={() => setSettings((s) => ({ ...s, resolution: r.value }))}
                  className="sr-only"
                />
                <span className="text-xl">{r.emoji}</span>
                <span className="text-sm text-gray-700">{r.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="card mb-6">
          <h2 className="font-semibold text-gray-700 mb-3">Scene Transitions</h2>
          <div className="flex gap-3">
            {TRANSITIONS.map((t) => (
              <label
                key={t.value}
                className={`flex-1 p-3 rounded-xl border-2 cursor-pointer text-center transition-all ${
                  settings.transitionType === t.value
                    ? 'border-grape-500 bg-grape-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="transition"
                  value={t.value}
                  checked={settings.transitionType === t.value}
                  onChange={() => setSettings((s) => ({ ...s, transitionType: t.value }))}
                  className="sr-only"
                />
                <div className="font-medium text-sm text-gray-700">{t.label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{t.description}</div>
              </label>
            ))}
          </div>
        </div>

        <div className="card mb-8">
          <h2 className="font-semibold text-gray-700 mb-3">Subtitles</h2>
          <div className="flex gap-3 items-center">
            <label className="text-sm text-gray-600 w-20 shrink-0">Font size</label>
            <input
              type="range"
              min={18}
              max={48}
              value={settings.subtitleStyle.fontSize}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  subtitleStyle: { ...s.subtitleStyle, fontSize: Number(e.target.value) },
                }))
              }
              className="flex-1"
            />
            <span className="text-sm text-gray-500 w-8">{settings.subtitleStyle.fontSize}px</span>
          </div>
          <div className="flex gap-3 items-center mt-3">
            <label className="text-sm text-gray-600 w-20 shrink-0">Position</label>
            <div className="flex gap-2">
              {(['bottom', 'top', 'center'] as const).map((pos) => (
                <button
                  key={pos}
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      subtitleStyle: { ...s.subtitleStyle, position: pos },
                    }))
                  }
                  className={`px-3 py-1 text-xs rounded-full border ${
                    settings.subtitleStyle.position === pos
                      ? 'border-grape-500 bg-grape-100 text-grape-700'
                      : 'border-gray-200 text-gray-500'
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}

        <button
          onClick={handleStart}
          disabled={loading}
          className="btn-primary w-full text-lg py-4 disabled:opacity-60"
        >
          {loading ? 'Starting…' : '🚀 Start Video Generation'}
        </button>

        <p className="text-center text-xs text-gray-400 mt-3">
          Generation takes 2–5 minutes depending on story length
        </p>
      </div>
    </div>
  )
}
