'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

type Stage =
  | 'pending'
  | 'generating_images'
  | 'generating_audio'
  | 'composing'
  | 'editing'
  | 'adding_subtitles'
  | 'complete'
  | 'failed'

const STAGE_LABELS: Record<Stage, { label: string; emoji: string }> = {
  pending: { label: 'Starting up…', emoji: '⏳' },
  generating_images: { label: 'Generating scene illustrations…', emoji: '🎨' },
  generating_audio: { label: 'Creating voice narration…', emoji: '🎙️' },
  composing: { label: 'Animating scenes with xAI…', emoji: '🎞️' },
  editing: { label: 'Finishing up…', emoji: '✂️' },
  adding_subtitles: { label: 'Finishing up…', emoji: '💬' },
  complete: { label: 'Your video is ready!', emoji: '🎉' },
  failed: { label: 'Generation failed', emoji: '❌' },
}

export default function VideoPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [status, setStatus] = useState<Stage>('pending')
  const [progress, setProgress] = useState(0)
  const [sceneVideoUrls, setSceneVideoUrls] = useState<string[]>([])
  const [error, setError] = useState('')

  // Player state
  const [currentScene, setCurrentScene] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const esRef = useRef<EventSource | null>(null)

  // Derive audio URL from project id + scene index
  const getAudioUrl = useCallback(
    (sceneIndex: number) => `/api/files/videos/${id}/scene-${sceneIndex}.wav`,
    [id]
  )

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
      if (data.sceneVideoUrls?.length) setSceneVideoUrls(data.sceneVideoUrls)
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

  // Play a specific scene
  const playScene = useCallback(
    (index: number) => {
      if (index >= sceneVideoUrls.length) {
        setIsPlaying(false)
        return
      }
      setCurrentScene(index)

      // Sync audio
      if (audioRef.current) {
        audioRef.current.src = getAudioUrl(index)
        audioRef.current.load()
      }

      // Video src is set via <video key={} src={} — React re-renders handle this
      setIsPlaying(true)
    },
    [sceneVideoUrls.length, getAudioUrl]
  )

  // Auto-play first scene once complete
  useEffect(() => {
    if (status === 'complete' && sceneVideoUrls.length > 0 && !isPlaying) {
      playScene(0)
    }
  }, [status, sceneVideoUrls.length, isPlaying, playScene])

  // When video ends, advance to next scene
  const handleVideoEnded = () => {
    const next = currentScene + 1
    if (next < sceneVideoUrls.length) {
      playScene(next)
    } else {
      setIsPlaying(false)
    }
  }

  // Sync audio when video plays/pauses
  const handleVideoPlay = () => {
    audioRef.current?.play().catch(() => {})
  }
  const handleVideoPause = () => {
    audioRef.current?.pause()
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

            {/* Live scene previews while generating */}
            {sceneVideoUrls.length > 0 && (
              <div className="mt-8 text-left">
                <h2 className="text-sm font-medium text-gray-400 mb-3">
                  Completed scenes ({sceneVideoUrls.length}):
                </h2>
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

        {status === 'complete' && sceneVideoUrls.length > 0 && (
          <div>
            <div className="text-center mb-6">
              <div className="text-5xl mb-2">🎉</div>
              <h1 className="text-3xl font-bold">Your Story Video is Ready!</h1>
              <p className="text-gray-400 text-sm mt-1">
                {sceneVideoUrls.length} animated scene{sceneVideoUrls.length > 1 ? 's' : ''}
              </p>
            </div>

            {/* Hidden audio element for synchronized narration */}
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio ref={audioRef} preload="auto" />

            {/* Main scene player */}
            <div className="rounded-2xl overflow-hidden bg-black mb-4 shadow-2xl relative">
              <video
                key={currentScene}
                ref={videoRef}
                src={sceneVideoUrls[currentScene]}
                controls
                autoPlay={isPlaying}
                className="w-full"
                onEnded={handleVideoEnded}
                onPlay={handleVideoPlay}
                onPause={handleVideoPause}
              />
              {/* Scene indicator */}
              <div className="absolute top-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                Scene {currentScene + 1} / {sceneVideoUrls.length}
              </div>
            </div>

            {/* Scene navigation */}
            <div className="flex gap-2 justify-center mb-6">
              <button
                onClick={() => playScene(Math.max(0, currentScene - 1))}
                disabled={currentScene === 0}
                className="btn-secondary disabled:opacity-40"
              >
                ← Prev
              </button>
              <button
                onClick={() => playScene(0)}
                className="btn-secondary"
              >
                ↺ Restart
              </button>
              <button
                onClick={() => playScene(Math.min(sceneVideoUrls.length - 1, currentScene + 1))}
                disabled={currentScene === sceneVideoUrls.length - 1}
                className="btn-secondary disabled:opacity-40"
              >
                Next →
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 mb-8">
              <a
                href={sceneVideoUrls[currentScene]}
                download={`scene-${currentScene + 1}.mp4`}
                className="btn-primary flex-1 text-center"
              >
                ⬇️ Download Scene {currentScene + 1}
              </a>
              <button
                onClick={() => router.push('/story/create')}
                className="btn-secondary flex-1"
              >
                ✨ New Story
              </button>
            </div>

            {/* All scene clips grid */}
            <div>
              <h2 className="text-sm font-medium text-gray-400 mb-3">All Scenes</h2>
              <div className="grid grid-cols-3 gap-2">
                {sceneVideoUrls.map((url, i) => (
                  <div key={i} className="relative">
                    <video
                      src={url}
                      className={`rounded-lg aspect-video object-cover bg-gray-800 cursor-pointer hover:opacity-80 w-full ${
                        i === currentScene ? 'ring-2 ring-blue-500' : ''
                      }`}
                      muted
                      loop
                      playsInline
                      onClick={() => playScene(i)}
                    />
                    <span className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                      {i + 1}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
