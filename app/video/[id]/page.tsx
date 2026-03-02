'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import type { SubtitleCue } from '@/types'

type Stage = 'pending' | 'generating_images' | 'generating_audio' | 'composing' | 'editing' | 'adding_subtitles' | 'complete' | 'failed'

const STAGE_LABELS: Record<Stage, { label: string; emoji: string }> = {
  pending: { label: 'Starting up…', emoji: '⏳' },
  generating_images: { label: 'Generating scene illustrations…', emoji: '🎨' },
  generating_audio: { label: 'Creating voice narration…', emoji: '🎙️' },
  composing: { label: 'Composing video clips…', emoji: '🎞️' },
  editing: { label: 'Editing final cut…', emoji: '✂️' },
  adding_subtitles: { label: 'Adding subtitles…', emoji: '💬' },
  complete: { label: 'Your video is ready!', emoji: '🎉' },
  failed: { label: 'Generation failed', emoji: '❌' },
}

export default function VideoPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [status, setStatus] = useState<Stage>('pending')
  const [progress, setProgress] = useState(0)
  const [finalVideoUrl, setFinalVideoUrl] = useState('')
  const [sceneVideoUrls, setSceneVideoUrls] = useState<string[]>([])
  const [error, setError] = useState('')
  const [editingSubtitles, setEditingSubtitles] = useState(false)
  const [editedSubtitles, setEditedSubtitles] = useState<SubtitleCue[]>([])
  const [savingSubtitles, setSavingSubtitles] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!id) return
    const es = new EventSource(`/api/video/${id}/status`)
    esRef.current = es

    es.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data)
      setStatus(data.status)
      setProgress(data.progress)
      if (data.sceneVideoUrls?.length) setSceneVideoUrls(data.sceneVideoUrls)
    })

    es.addEventListener('complete', (e) => {
      const data = JSON.parse(e.data)
      setStatus('complete')
      setProgress(100)
      setFinalVideoUrl(data.finalVideoUrl)
      if (data.sceneVideoUrls?.length) setSceneVideoUrls(data.sceneVideoUrls)
      if (data.subtitles?.length) {
        setEditedSubtitles(data.subtitles)
      }
      es.close()
    })

    es.addEventListener('error', (e) => {
      const data = JSON.parse((e as MessageEvent).data ?? '{}')
      setStatus('failed')
      setError(data.message || 'Video generation failed')
      es.close()
    })

    return () => { es.close() }
  }, [id])

  const handleSaveSubtitles = async () => {
    setSavingSubtitles(true)
    try {
      const res = await fetch(`/api/video/${id}/subtitles`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtitles: editedSubtitles }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setFinalVideoUrl(data.finalVideoUrl)
      setEditingSubtitles(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save subtitles')
    } finally {
      setSavingSubtitles(false)
    }
  }

  const stageInfo = STAGE_LABELS[status] ?? STAGE_LABELS.pending

  return (
    <div className="min-h-screen bg-gray-900 text-white px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <Link href="/video/create" className="text-gray-400 text-sm mb-8 inline-flex items-center gap-1 hover:text-white">
          ← Back
        </Link>

        {status !== 'complete' && (
          <div className="text-center mb-12">
            <div className="text-5xl mb-4">{stageInfo.emoji}</div>
            <h1 className="text-2xl font-bold mb-2">{stageInfo.label}</h1>

            {/* Progress bar */}
            <div className="w-full bg-gray-700 rounded-full h-3 mb-2 mt-6">
              <div
                className="bg-gradient-to-r from-grape-500 to-blue-500 h-3 rounded-full transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-gray-400 text-sm">{progress}% complete</p>

            {status === 'failed' && (
              <div className="mt-6 bg-red-900/40 border border-red-700 rounded-xl p-4">
                <p className="text-red-300 text-sm">{error}</p>
                <button
                  onClick={() => router.push('/video/create')}
                  className="mt-3 btn-secondary text-sm"
                >
                  ← Try Again
                </button>
              </div>
            )}

            {/* Scene previews while processing */}
            {sceneVideoUrls.length > 0 && (
              <div className="mt-8 text-left">
                <h2 className="text-sm font-medium text-gray-400 mb-3">Completed scenes:</h2>
                <div className="grid grid-cols-3 gap-2">
                  {sceneVideoUrls.map((url, i) => (
                    <video
                      key={i}
                      src={url}
                      className="rounded-lg aspect-video object-cover bg-gray-800"
                      muted
                      autoPlay
                      loop
                      playsInline
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {status === 'complete' && finalVideoUrl && (
          <div>
            <div className="text-center mb-6">
              <div className="text-5xl mb-2">🎉</div>
              <h1 className="text-3xl font-bold">Your Story Video is Ready!</h1>
            </div>

            {/* Main video player */}
            <div className="rounded-2xl overflow-hidden bg-black mb-6 shadow-2xl">
              <video
                src={finalVideoUrl}
                controls
                className="w-full"
                autoPlay
              />
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 mb-8">
              <a
                href={finalVideoUrl}
                download={`story-video.mp4`}
                className="btn-primary flex-1 text-center"
              >
                ⬇️ Download Video
              </a>
              <button
                onClick={() => setEditingSubtitles(!editingSubtitles)}
                className="btn-secondary flex-1"
              >
                💬 {editingSubtitles ? 'Cancel Edit' : 'Edit Subtitles'}
              </button>
              <button
                onClick={() => router.push('/story/create')}
                className="btn-secondary flex-1"
              >
                ✨ New Story
              </button>
            </div>

            {/* Subtitle editor */}
            {editingSubtitles && (
              <div className="card bg-gray-800 border-gray-700 mb-6">
                <h2 className="font-semibold text-white mb-4">Edit Subtitles</h2>
                <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                  {editedSubtitles.map((cue, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <span className="text-gray-500 text-xs w-8 pt-2 text-right shrink-0">{cue.index}</span>
                      <textarea
                        className="input bg-gray-700 border-gray-600 text-white text-sm flex-1 min-h-[48px] resize-none"
                        value={cue.text}
                        onChange={(e) =>
                          setEditedSubtitles((prev) =>
                            prev.map((c, ci) => ci === i ? { ...c, text: e.target.value } : c)
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleSaveSubtitles}
                  disabled={savingSubtitles}
                  className="btn-primary w-full mt-4 disabled:opacity-60"
                >
                  {savingSubtitles ? 'Rebuilding video…' : '✓ Save & Rebuild'}
                </button>
              </div>
            )}

            {/* Scene grid */}
            {sceneVideoUrls.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-gray-400 mb-3">Scene Clips</h2>
                <div className="grid grid-cols-3 gap-2">
                  {sceneVideoUrls.map((url, i) => (
                    <video
                      key={i}
                      src={url}
                      className="rounded-lg aspect-video object-cover bg-gray-800 cursor-pointer hover:opacity-80"
                      muted
                      loop
                      playsInline
                      onClick={(e) => (e.currentTarget as HTMLVideoElement).paused
                        ? (e.currentTarget as HTMLVideoElement).play()
                        : (e.currentTarget as HTMLVideoElement).pause()
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
