'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { ScriptScene } from '@/types'

interface ScriptData {
  id: string
  storyId: string
  scenes: ScriptScene[]
  totalDuration: number
}

export default function ScriptPage() {
  const router = useRouter()
  const [script, setScript] = useState<ScriptData | null>(null)
  const [editedScenes, setEditedScenes] = useState<ScriptScene[]>([])
  const [loading, setLoading] = useState(false)
  const [generatingScript, setGeneratingScript] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem('currentScript')
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as ScriptData
        setScript(parsed)
        setEditedScenes(parsed.scenes)
        return
      } catch { /* ignore */ }
    }

    // Auto-generate script from current story
    const storyRaw = localStorage.getItem('currentStory')
    if (!storyRaw) { router.replace('/story/create'); return }

    const story = JSON.parse(storyRaw)
    const characterRaw = localStorage.getItem('currentCharacter')
    const character = characterRaw ? JSON.parse(characterRaw) : null

    setGeneratingScript(true)
    fetch('/api/story/script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storyId: story.id,
        characterNames: character ? [character.name] : [],
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setScript(data.script)
        setEditedScenes(data.script.scenes)
        localStorage.setItem('currentScript', JSON.stringify(data.script))
      })
      .catch((err) => setError(err.message || 'Failed to generate script'))
      .finally(() => setGeneratingScript(false))
  }, [router])

  const updateNarration = (i: number, value: string) => {
    setEditedScenes((prev) =>
      prev.map((s, idx) => idx === i ? { ...s, narration: value } : s)
    )
  }

  const updateDialogueLine = (sceneIdx: number, lineIdx: number, field: 'speaker' | 'text', value: string) => {
    setEditedScenes((prev) =>
      prev.map((s, si) =>
        si === sceneIdx
          ? {
              ...s,
              dialogue: s.dialogue.map((d, di) =>
                di === lineIdx ? { ...d, [field]: value } : d
              ),
            }
          : s
      )
    )
  }

  const handleProceed = async () => {
    if (!script) return
    setLoading(true)

    // Save edited scenes back
    const updatedScript = { ...script, scenes: editedScenes }
    localStorage.setItem('currentScript', JSON.stringify(updatedScript))
    router.push('/video/create')
  }

  if (generatingScript) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="animate-spin w-10 h-10 border-4 border-grape-500 border-t-transparent rounded-full" />
        <p className="text-gray-500">Generating video script…</p>
      </div>
    )
  }

  if (!script) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        {error
          ? <p className="text-red-500">{error}</p>
          : <div className="animate-spin w-8 h-8 border-4 border-grape-500 border-t-transparent rounded-full" />
        }
      </div>
    )
  }

  const totalMins = Math.ceil(script.totalDuration / 60)

  return (
    <div className="min-h-screen bg-gradient-to-b from-grape-50 to-white px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <Link href="/story/options" className="text-grape-500 text-sm mb-6 inline-flex items-center gap-1">
          ← Back
        </Link>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-1">Video Script</h1>
          <p className="text-sm text-gray-500">
            {editedScenes.length} scenes · ~{totalMins} min · Edit any text before generating video
          </p>
        </div>

        <div className="space-y-6 mb-8">
          {editedScenes.map((scene, si) => (
            <div key={si} className="card border border-grape-100">
              <div className="flex items-center gap-2 mb-3">
                <span className="bg-grape-100 text-grape-700 text-xs font-bold px-2 py-1 rounded-full">
                  Scene {si + 1}
                </span>
                <h3 className="font-semibold text-gray-700 text-sm">{scene.title}</h3>
                <span className="ml-auto text-xs text-gray-400">~{scene.estimatedDuration}s</span>
              </div>

              <div className="mb-3">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 block">
                  Narration
                </label>
                <textarea
                  className="input text-sm w-full min-h-[80px] resize-y"
                  value={scene.narration}
                  onChange={(e) => updateNarration(si, e.target.value)}
                />
              </div>

              {scene.dialogue.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 block">
                    Dialogue
                  </label>
                  <div className="space-y-2">
                    {scene.dialogue.map((line, li) => (
                      <div key={li} className="flex gap-2 items-start">
                        <input
                          className="input text-sm w-28 shrink-0"
                          value={line.speaker}
                          onChange={(e) => updateDialogueLine(si, li, 'speaker', e.target.value)}
                          placeholder="Speaker"
                        />
                        <input
                          className="input text-sm flex-1"
                          value={line.text}
                          onChange={(e) => updateDialogueLine(si, li, 'text', e.target.value)}
                          placeholder="Line text"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <details className="mt-3">
                <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
                  Image prompt (click to view/edit)
                </summary>
                <textarea
                  className="input text-xs w-full mt-2 min-h-[60px] resize-y text-gray-500"
                  value={scene.imagePrompt}
                  onChange={(e) =>
                    setEditedScenes((prev) =>
                      prev.map((s, i) => i === si ? { ...s, imagePrompt: e.target.value } : s)
                    )
                  }
                />
              </details>
            </div>
          ))}
        </div>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <button
          onClick={handleProceed}
          disabled={loading}
          className="btn-primary w-full disabled:opacity-60 text-lg py-4"
        >
          {loading ? 'Saving…' : '🎬 Generate Video →'}
        </button>
      </div>
    </div>
  )
}
