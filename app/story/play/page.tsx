'use client'

import {
  Suspense,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ChangeEvent,
  type TouchEvent,
} from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Story, Character } from '@/types'
import { getCurrentStoryFromIndexedDB, setCurrentStoryInIndexedDB } from '@/lib/client-story-store'
import { showToast } from '@/components/toast'
import { splitStoryIntoScenes } from '@/lib/story-scenes'

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const rounded = Math.floor(seconds)
  const mins = Math.floor(rounded / 60)
  const secs = rounded % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function sceneStorageKey(storyId: string): string {
  return `storybook:last-scene:${storyId}`
}

type StoryLine = { type: 'narration' | 'character'; speaker?: string; text: string }

function splitNarrationIntoReadableLines(text: string): StoryLine[] {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return []

  const sentences = normalized.split(/(?<=[.!?])\s+/).filter(Boolean)
  if (sentences.length <= 2) {
    return [{ type: 'narration', text: normalized }]
  }

  const lines: StoryLine[] = []
  for (let i = 0; i < sentences.length; i += 2) {
    lines.push({ type: 'narration', text: sentences.slice(i, i + 2).join(' ') })
  }
  return lines
}

function mergeNearbyNarrationLines(lines: StoryLine[]): StoryLine[] {
  const merged: StoryLine[] = []

  for (const line of lines) {
    const prev = merged[merged.length - 1]
    if (
      prev &&
      prev.type === 'narration' &&
      line.type === 'narration'
    ) {
      const combined = `${prev.text} ${line.text}`.replace(/\s+/g, ' ').trim()
      const sentenceCount = combined.split(/(?<=[.!?])\s+/).filter(Boolean).length
      const canMerge = combined.length <= 320 && sentenceCount <= 5

      if (canMerge) {
        prev.text = combined
        continue
      }
    }

    merged.push(line)
  }

  return merged
}

function parseSceneLines(rawText: string): StoryLine[] {
  const normalized = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!normalized) return []

  const withSpeakerBreaks = normalized.replace(
    /([.!?])\s+([A-Za-z][A-Za-z0-9' -]{0,24}(?::|["“]))/g,
    '$1\n$2'
  )

  const blocks = withSpeakerBreaks
    .split(/\n+/)
    .map((block) => block.trim())
    .filter(Boolean)

  const lines: StoryLine[] = []
  for (const block of blocks) {
    const match = block.match(/^([A-Za-z][A-Za-z0-9' -]{0,24}):\s*([\s\S]+)$/)
    const quoteMatch = block.match(/^([A-Za-z][A-Za-z0-9' -]{0,24})\s*["“]\s*([\s\S]+)$/)

    if (!match && !quoteMatch) {
      lines.push(...splitNarrationIntoReadableLines(block))
      continue
    }

    const speaker = (match?.[1] ?? quoteMatch?.[1] ?? '').trim()
    let text = (match?.[2] ?? quoteMatch?.[2] ?? '').replace(/\s+/g, ' ').trim()
    text = text.replace(/[”"]$/, '').trim()
    if (!text) continue

    if (speaker.toLowerCase() === 'narrator') {
      lines.push(...splitNarrationIntoReadableLines(text))
    } else {
      lines.push({ type: 'character', speaker, text })
    }
  }

  return mergeNearbyNarrationLines(lines)
}

export default function PlayStoryPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-4xl animate-bounce-star">&#10024;</div>
      </div>
    }>
      <PlayStoryContent />
    </Suspense>
  )
}

function PlayStoryContent() {
  const [story, setStory] = useState<Story | null>(null)
  const [characters, setCharacters] = useState<Character[]>([])
  const [currentScene, setCurrentScene] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isAudioReady, setIsAudioReady] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [audioCurrentTime, setAudioCurrentTime] = useState(0)
  const [audioDuration, setAudioDuration] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [readerTextSize, setReaderTextSize] = useState<'sm' | 'md' | 'lg'>('md')
  const [focusTextMode, setFocusTextMode] = useState(false)
  const [isRegeneratingAudio, setIsRegeneratingAudio] = useState(false)
  const [sceneKey, setSceneKey] = useState(0)
  const router = useRouter()
  const searchParams = useSearchParams()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const shouldContinueNarrationRef = useRef(false)
  const touchStartX = useRef<number | null>(null)
  const storyId = story?.id ?? ''
  const storyImageCount = story?.images.length ?? 0
  const sceneAudioUrls = (story?.sceneAudioUrls ?? []).filter(Boolean)
  const hasSceneAudio = sceneAudioUrls.length > 0
  const sceneAudioSource =
    hasSceneAudio && currentScene < sceneAudioUrls.length ? sceneAudioUrls[currentScene] : ''
  const singleAudioSource = hasSceneAudio ? '' : (story?.audioUrl ?? '')
  const currentAudioSource = sceneAudioSource || singleAudioSource

  useEffect(() => {
    let active = true
    const loadStory = async () => {
      const storyId = searchParams.get('id')

      // Load from DB if story ID provided
      if (storyId) {
        try {
          const res = await fetch(`/api/story/${storyId}`)
          if (res.ok) {
            const data = await res.json()
            if (active && data.story) {
              setStory(data.story)
              if (data.characters && data.characters.length > 0) {
                setCharacters(data.characters)
              }
              return
            }
          }
        } catch (error) {
          console.error('Failed to load story from DB:', error)
        }
        if (active) router.push('/')
        return
      }

      // Fallback: load from localStorage / IndexedDB
      const storedCharacters = localStorage.getItem('currentCharacters')
      const storedCharacter = localStorage.getItem('currentCharacter')
      if (storedCharacters) {
        setCharacters(JSON.parse(storedCharacters))
      } else if (storedCharacter) {
        setCharacters([JSON.parse(storedCharacter)])
      } else {
        router.push('/')
        return
      }

      const storageType = localStorage.getItem('currentStoryStorage')
      if (storageType === 'indexedDB') {
        try {
          const idbStory = await getCurrentStoryFromIndexedDB<Story>()
          if (active && idbStory) {
            setStory(idbStory)
            return
          }
        } catch (error) {
          console.error('Failed to load story from IndexedDB:', error)
        }
      }

      const storedStory = localStorage.getItem('currentStory')
      if (storedStory) {
        if (active) {
          setStory(JSON.parse(storedStory))
        }
      } else if (active) {
        router.push('/')
      }
    }

    void loadStory()

    return () => {
      active = false
      if (audioRef.current) {
        audioRef.current.pause()
      }
    }
  }, [router, searchParams])

  useEffect(() => {
    if (!storyId) return
    const key = sceneStorageKey(storyId)
    const storedScene = Number(localStorage.getItem(key))
    if (!Number.isFinite(storedScene)) return

    const clamped = Math.min(Math.max(Math.trunc(storedScene), 0), storyImageCount)
    setCurrentScene(clamped)
  }, [storyId, storyImageCount])

  useEffect(() => {
    if (!storyId) return
    localStorage.setItem(sceneStorageKey(storyId), String(currentScene))
  }, [currentScene, storyId])

  const totalScenes = story?.images.length ?? 0

  const goToScene = useCallback((index: number) => {
    if (index >= 0 && index <= totalScenes) { // Allow going to totalScenes for "The End"
      setCurrentScene(index)
      setSceneKey((k) => k + 1)
      // Scroll the storybook card into view on mobile
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [totalScenes])

  useEffect(() => {
    if (!currentAudioSource) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      shouldContinueNarrationRef.current = false
      setIsPlaying(false)
      setIsAudioReady(false)
      setAudioError(null)
      setAudioCurrentTime(0)
      setAudioDuration(0)
      return
    }

    const audioElement = new Audio(currentAudioSource)
    audioRef.current = audioElement
    audioElement.preload = 'metadata'
    setIsPlaying(false)
    setIsAudioReady(false)
    setAudioError(null)
    setAudioCurrentTime(0)
    setAudioDuration(0)

    const onLoadedMetadata = () => {
      setAudioDuration(Number.isFinite(audioElement.duration) ? audioElement.duration : 0)
    }
    const onCanPlay = () => {
      setIsAudioReady(true)
      if (!shouldContinueNarrationRef.current) return

      void audioElement.play().catch((error) => {
        shouldContinueNarrationRef.current = false
        setAudioError('Could not continue narration automatically.')
        console.error('Auto-play next scene failed:', error)
      })
    }
    const onTimeUpdate = () => {
      setAudioCurrentTime(audioElement.currentTime || 0)
    }
    const onEnded = () => {
      if (hasSceneAudio && shouldContinueNarrationRef.current) {
        const lastNarratedScene = Math.min(totalScenes, sceneAudioUrls.length) - 1

        if (currentScene < lastNarratedScene) {
          goToScene(currentScene + 1)
          return
        }

        if (currentScene === lastNarratedScene && totalScenes > 0) {
          goToScene(totalScenes)
        }
      }

      shouldContinueNarrationRef.current = false
      setIsPlaying(false)
      setAudioCurrentTime(audioElement.duration || 0)
    }
    const onPlay = () => {
      setIsPlaying(true)
      setAudioError(null)
    }
    const onPause = () => {
      setIsPlaying(false)
    }
    const onError = () => {
      setIsPlaying(false)
      setIsAudioReady(false)
      setAudioError('Playback failed. Try regenerating audio.')
    }

    audioElement.addEventListener('loadedmetadata', onLoadedMetadata)
    audioElement.addEventListener('canplay', onCanPlay)
    audioElement.addEventListener('timeupdate', onTimeUpdate)
    audioElement.addEventListener('ended', onEnded)
    audioElement.addEventListener('play', onPlay)
    audioElement.addEventListener('pause', onPause)
    audioElement.addEventListener('error', onError)

    return () => {
      audioElement.pause()
      audioElement.removeEventListener('loadedmetadata', onLoadedMetadata)
      audioElement.removeEventListener('canplay', onCanPlay)
      audioElement.removeEventListener('timeupdate', onTimeUpdate)
      audioElement.removeEventListener('ended', onEnded)
      audioElement.removeEventListener('play', onPlay)
      audioElement.removeEventListener('pause', onPause)
      audioElement.removeEventListener('error', onError)
    }
  }, [currentAudioSource, currentScene, goToScene, hasSceneAudio, sceneAudioUrls.length, totalScenes])

  useEffect(() => {
    if (!audioRef.current) return
    audioRef.current.playbackRate = playbackRate
  }, [playbackRate])

  const nextScene = useCallback(() => goToScene(currentScene + 1), [currentScene, goToScene])
  const prevScene = useCallback(() => goToScene(currentScene - 1), [currentScene, goToScene])

  const togglePlay = useCallback(async () => {
    if (!audioRef.current) return

    if (isPlaying) {
      shouldContinueNarrationRef.current = false
      audioRef.current.pause()
      return
    }

    shouldContinueNarrationRef.current = true
    try {
      await audioRef.current.play()
      setAudioError(null)
    } catch (error) {
      shouldContinueNarrationRef.current = false
      console.error('Audio play failed:', error)
      setAudioError('Tap play again to allow audio on this device.')
      showToast('Tap play again to allow audio on this device.', 'error')
    }
  }, [isPlaying])

  const seekAudio = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return
    const value = Number(event.target.value)
    if (!Number.isFinite(value)) return

    audioRef.current.currentTime = value
    setAudioCurrentTime(value)
  }, [])

  const skipAudioBy = useCallback((deltaSeconds: number) => {
    if (!audioRef.current) return
    const nextValue = Math.min(
      Math.max(audioRef.current.currentTime + deltaSeconds, 0),
      audioDuration || Number.POSITIVE_INFINITY
    )
    audioRef.current.currentTime = nextValue
    setAudioCurrentTime(nextValue)
  }, [audioDuration])

  const cyclePlaybackRate = useCallback(() => {
    setPlaybackRate((prev) => {
      if (prev === 1) return 1.15
      if (prev === 1.15) return 0.9
      return 1
    })
  }, [])

  const cycleReaderTextSize = useCallback(() => {
    setReaderTextSize((prev) => {
      if (prev === 'sm') return 'md'
      if (prev === 'md') return 'lg'
      return 'sm'
    })
  }, [])

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        nextScene()
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        prevScene()
      } else if (e.key === ' ') {
        e.preventDefault()
        togglePlay()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [nextScene, prevScene, togglePlay])

  // Swipe gestures
  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null) return
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 60) {
      if (diff > 0) nextScene()
      else prevScene()
    }
    touchStartX.current = null
  }

  const persistStoryLocally = useCallback(async (updatedStory: Story) => {
    const storageType = localStorage.getItem('currentStoryStorage')

    try {
      if (storageType === 'indexedDB') {
        await setCurrentStoryInIndexedDB(updatedStory)
        return
      }

      localStorage.setItem('currentStory', JSON.stringify(updatedStory))
      localStorage.setItem('currentStoryStorage', 'localStorage')
    } catch (error) {
      console.warn('Failed to persist updated story to localStorage, using IndexedDB.', error)
      await setCurrentStoryInIndexedDB(updatedStory)
      localStorage.removeItem('currentStory')
      localStorage.setItem('currentStoryStorage', 'indexedDB')
    }
  }, [])

  const handleRegenerateAudio = useCallback(async () => {
    if (!story || isRegeneratingAudio) return

    setIsRegeneratingAudio(true)

    try {
      const response = await fetch('/api/story/audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId: story.id,
          content: story.content,
          sceneCount: story.images.length,
        }),
      })

      const data = (await response.json().catch(() => null)) as {
        audioUrl?: string
        sceneAudioUrls?: string[]
        error?: string
      } | null
      if (!response.ok || !data?.audioUrl) {
        showToast(data?.error || 'Could not generate audio right now. Please try again.', 'error')
        return
      }

      const updatedStory: Story = {
        ...story,
        audioUrl: data.audioUrl,
        sceneAudioUrls: data.sceneAudioUrls ?? [],
      }

      if (audioRef.current) {
        audioRef.current.pause()
      }
      shouldContinueNarrationRef.current = false
      setStory(updatedStory)
      setIsPlaying(false)
      setAudioError(null)

      if (!searchParams.get('id')) {
        await persistStoryLocally(updatedStory)
      }

      showToast('Narration is ready! Press play to listen.', 'success')
    } catch (error) {
      console.error('Audio regeneration failed:', error)
      showToast('Could not generate audio right now. Please try again.', 'error')
    } finally {
      setIsRegeneratingAudio(false)
    }
  }, [isRegeneratingAudio, persistStoryLocally, searchParams, story])

  const sceneLines = useMemo(() => {
    if (!story) return []

    const parts = splitStoryIntoScenes(story.content)
    let rawText = ''

    if (parts.length > 0 && currentScene < parts.length) {
      rawText = parts[currentScene]
    } else {
      const sentences = story.content.split(/(?<=[.!?])\s+/)
      const scenesCount = story.images.length || 1
      const perScene = Math.ceil(sentences.length / scenesCount)
      const start = currentScene * perScene
      rawText = sentences.slice(start, start + perScene).join(' ')
    }

    return parseSceneLines(rawText)
  }, [currentScene, story])
  const narrationTextClass = readerTextSize === 'sm'
    ? 'text-sm sm:text-base leading-6 sm:leading-7'
    : readerTextSize === 'lg'
      ? 'text-lg sm:text-xl leading-7 sm:leading-8'
      : 'text-base sm:text-lg leading-6 sm:leading-7'
  const dialogueTextClass = readerTextSize === 'sm'
    ? 'text-sm sm:text-base leading-6 sm:leading-7'
    : readerTextSize === 'lg'
      ? 'text-lg sm:text-xl leading-7 sm:leading-8'
      : 'text-base sm:text-lg leading-6 sm:leading-7'
  const readerSizeLabel = readerTextSize === 'sm' ? 'Small' : readerTextSize === 'md' ? 'Medium' : 'Large'

  if (!story || characters.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-4xl animate-bounce-star">&#10024;</div>
      </div>
    )
  }

  const isTheEnd = currentScene === totalScenes
  const hasAnyAudio = hasSceneAudio || Boolean(story.audioUrl)

  return (
    <div className="min-h-screen flex flex-col px-4 py-6">
      {/* Top bar */}
      <div className="flex justify-between items-center mb-4 max-w-2xl mx-auto w-full">
        <Link href="/" className="text-grape-500 hover:text-grape-700 transition-colors inline-flex items-center gap-1.5 text-sm font-bold">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Home
        </Link>

        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            {characters.map((char) => (
              <div key={char.id} className="rounded-full p-0.5 bg-gradient-to-r from-candy-400 to-grape-400">
                <Image
                  src={char.cartoonImage}
                  alt={char.name}
                  width={28}
                  height={28}
                  className="w-7 h-7 rounded-full bg-white"
                />
              </div>
            ))}
          </div>
          <span className="text-sm font-bold text-grape-700 truncate max-w-[140px]">{story.title}</span>
        </div>

        <Link
          href="/story/create"
          className="text-grape-500 hover:text-grape-700 text-sm font-bold transition-colors"
        >
          New &#10024;
        </Link>
      </div>

      {/* Storybook card */}
      <div className="flex-1 flex flex-col items-center justify-center max-w-2xl mx-auto w-full">
        <div
          key={sceneKey}
          className={`animate-page-turn w-full bg-white rounded-3xl shadow-xl border-3 overflow-hidden ${
            isTheEnd ? 'border-candy-400 bg-gradient-to-br from-candy-50 to-white flex-1 flex flex-col items-center justify-center min-h-[400px]' : 'border-amber-200'
          }`}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {isTheEnd ? (
            <div className="p-8 text-center animate-scene">
              <h2 className="text-5xl font-extrabold mb-6 rainbow-text animate-bounce">The End!</h2>
              <div className="flex justify-center gap-4 mb-8">
                {characters.map((char) => (
                  <div key={char.id} className="animate-float">
                    <div className="rounded-full p-1 bg-gradient-to-r from-candy-400 to-grape-400 shadow-lg">
                      <Image
                        src={char.cartoonImage}
                        alt={char.name}
                        width={96}
                        height={96}
                        className="w-24 h-24 rounded-full bg-white object-cover"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xl text-grape-600 font-bold mb-8">What a wonderful adventure!</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button onClick={() => goToScene(0)} className="btn-secondary py-3 px-6">
                  Read Again &#128257;
                </button>
                <Link href="/story/create" className="btn-primary py-3 px-6 text-base">
                  New Story &#10024;
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* Image */}
              {!focusTextMode && story.images[currentScene] && (
                <div className="relative group w-full aspect-[4/3] bg-amber-50">
                  <Image
                    src={story.images[currentScene]}
                    alt={`Page ${currentScene + 1}`}
                    fill
                    sizes="(max-width: 672px) 100vw, 672px"
                    className="object-cover"
                  />
                  <button
                    onClick={prevScene}
                    disabled={currentScene === 0}
                    aria-label="Previous page"
                    className={`absolute left-0 top-0 h-full w-1/4 transition-opacity ${
                      currentScene === 0
                        ? 'cursor-not-allowed'
                        : 'cursor-pointer opacity-0 sm:group-hover:opacity-100 bg-gradient-to-r from-black/15 to-transparent'
                    }`}
                  />
                  <button
                    onClick={nextScene}
                    disabled={currentScene >= totalScenes}
                    aria-label="Next page"
                    className={`absolute right-0 top-0 h-full w-1/4 transition-opacity ${
                      currentScene >= totalScenes
                        ? 'cursor-not-allowed'
                        : 'cursor-pointer opacity-0 sm:group-hover:opacity-100 bg-gradient-to-l from-black/15 to-transparent'
                    }`}
                  />
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] px-2 py-1 rounded-full bg-white/70 text-grape-700 font-semibold hidden sm:block">
                    Tap sides to turn pages
                  </div>
                </div>
              )}

              {/* Text area */}
              <div className={`p-5 sm:p-7 md:p-8 ${focusTextMode ? 'bg-white' : 'bg-gradient-to-b from-amber-50 to-white'}`}>
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/80 border border-amber-200 px-3 py-1.5 text-xs font-bold text-amber-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-candy-400" />
                    Scene {currentScene + 1}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={cycleReaderTextSize}
                      className="px-3 py-1.5 rounded-full border border-grape-200 bg-white text-xs font-bold text-grape-600 hover:bg-grape-50"
                    >
                      Text: {readerSizeLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFocusTextMode((prev) => !prev)}
                      className="px-3 py-1.5 rounded-full border border-grape-200 bg-white text-xs font-bold text-grape-600 hover:bg-grape-50"
                    >
                      {focusTextMode ? 'Show Image' : 'Focus Text'}
                    </button>
                  </div>
                </div>
                <div className="space-y-3 max-h-[30vh] sm:max-h-[32vh] md:max-h-[28vh] lg:max-h-[32vh] overflow-y-auto pr-1">
                  {sceneLines.map((line, idx) => {
                    if (line.type === 'narration') {
                      return (
                        <p 
                          key={idx} 
                          className={`text-gray-800 ${
                            narrationTextClass
                          } ${
                            idx === 0 ? 'first-letter:text-4xl first-letter:font-extrabold first-letter:text-amber-600 first-letter:mr-1 first-letter:float-left first-letter:leading-none' : ''
                          }`}
                        >
                          {line.text}
                        </p>
                      )
                    } else {
                      return (
                        <p key={idx} className={`${dialogueTextClass} text-gray-900 font-semibold`}>
                          <span className="inline-flex items-center rounded-full bg-candy-100 text-candy-700 px-2 py-0.5 mr-2 text-[10px] sm:text-xs font-extrabold tracking-wide uppercase align-middle">
                            {line.speaker}
                          </span>
                          <span className="text-grape-700 italic">
                            {line.text.startsWith('"') || line.text.startsWith('“') ? line.text : `“${line.text}”`}
                          </span>
                        </p>
                      )
                    }
                  })}
                </div>
                <div className="mt-8 pt-4 border-t border-amber-50 text-right text-[10px] text-amber-300 font-extrabold tracking-widest uppercase">
                  Page {currentScene + 1} of {totalScenes}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Controls below the card */}
        <div className="w-full mt-5 flex items-center justify-between">
          {/* Prev button */}
          <button
            onClick={prevScene}
            disabled={currentScene === 0}
            aria-label="Previous page"
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 border-2 shadow-md ${
              currentScene === 0
                ? 'bg-gray-100 border-gray-200 text-gray-300 cursor-not-allowed'
                : 'bg-white hover:bg-candy-50 border-candy-200 text-grape-600 hover:scale-110 active:scale-95'
            }`}
          >
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Center: page indicator + audio */}
          <div className="flex flex-col items-center gap-2 w-full max-w-md px-2">
            {!isTheEnd && (
              <>
                {/* Page dots */}
                <div className="flex gap-2 items-center flex-wrap justify-center">
                  {story.images.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => goToScene(index)}
                      aria-label={`Go to page ${index + 1}`}
                      className={`rounded-full transition-all duration-300 ${
                        index === currentScene
                          ? 'bg-gradient-to-r from-candy-500 to-grape-500 w-8 h-3'
                          : 'bg-grape-200 hover:bg-grape-300 w-3 h-3'
                      }`}
                    />
                  ))}
                  <button
                    onClick={() => goToScene(totalScenes)}
                    aria-label="Go to The End"
                    className={`rounded-full transition-all duration-300 flex items-center justify-center ${
                      currentScene === totalScenes
                        ? 'bg-gradient-to-r from-candy-500 to-grape-500 w-8 h-3'
                        : 'bg-grape-200 hover:bg-grape-300 w-3 h-3'
                    }`}
                  />
                </div>

                {/* Audio controls */}
                {hasAnyAudio ? (
                  <div className="w-full max-w-sm bg-white/90 border-2 border-candy-200 rounded-2xl px-3 py-2 shadow-sm">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={togglePlay}
                        aria-label={isPlaying ? 'Pause' : 'Listen'}
                        disabled={(!isAudioReady && !audioError) || !currentAudioSource}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 shadow-md text-white ${
                          (!isAudioReady && !audioError) || !currentAudioSource
                            ? 'bg-gray-300 cursor-not-allowed'
                            : 'bg-gradient-to-r from-candy-500 to-grape-500 hover:from-candy-600 hover:to-grape-600 active:scale-95'
                        }`}
                      >
                        {isPlaying ? (
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        )}
                      </button>

                      <button
                        onClick={() => skipAudioBy(-10)}
                        disabled={!isAudioReady || audioDuration <= 0 || !currentAudioSource}
                        aria-label="Rewind 10 seconds"
                        className="w-9 h-9 rounded-full border-2 border-candy-200 text-grape-600 disabled:text-gray-300 disabled:border-gray-200 disabled:cursor-not-allowed hover:bg-candy-50 transition-colors text-xs font-bold"
                      >
                        -10
                      </button>

                      <input
                        type="range"
                        min={0}
                        max={Math.max(audioDuration, 0)}
                        step={0.1}
                        value={Math.min(audioCurrentTime, audioDuration || 0)}
                        onChange={seekAudio}
                        disabled={!isAudioReady || audioDuration <= 0 || !currentAudioSource}
                        aria-label="Audio progress"
                        className="flex-1 accent-grape-500 h-2"
                      />

                      <button
                        onClick={() => skipAudioBy(10)}
                        disabled={!isAudioReady || audioDuration <= 0 || !currentAudioSource}
                        aria-label="Forward 10 seconds"
                        className="w-9 h-9 rounded-full border-2 border-candy-200 text-grape-600 disabled:text-gray-300 disabled:border-gray-200 disabled:cursor-not-allowed hover:bg-candy-50 transition-colors text-xs font-bold"
                      >
                        +10
                      </button>

                      <button
                        onClick={cyclePlaybackRate}
                        aria-label="Change playback speed"
                        className="h-9 px-2 rounded-full border-2 border-candy-200 text-xs font-bold text-grape-600 hover:bg-candy-50 transition-colors"
                      >
                        {playbackRate.toFixed(2).replace('.00', '')}x
                      </button>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] font-semibold text-grape-500">
                      <span>{formatAudioTime(audioCurrentTime)}</span>
                      <span className={`px-2 truncate ${audioError ? 'text-rose-500' : 'text-grape-500'}`}>
                        {audioError
                          ? audioError
                          : isAudioReady
                            ? 'Narration ready'
                            : currentAudioSource
                              ? 'Loading narration...'
                              : 'No audio for this scene'}
                      </span>
                      <span>{formatAudioTime(audioDuration)}</span>
                    </div>
                    {!currentAudioSource && (
                      <div className="mt-2 flex justify-center">
                        <button
                          onClick={handleRegenerateAudio}
                          disabled={isRegeneratingAudio}
                          className="text-xs font-bold text-grape-600 hover:text-grape-700 underline underline-offset-2 disabled:text-gray-400 disabled:no-underline"
                        >
                          {isRegeneratingAudio ? 'Regenerating scene audio...' : 'Regenerate scene audio'}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <button
                      onClick={handleRegenerateAudio}
                      disabled={isRegeneratingAudio}
                      aria-label="Regenerate audio narration"
                      className={`h-11 px-4 rounded-full inline-flex items-center gap-2 text-sm font-bold transition-all duration-200 border-2 shadow-md ${
                        isRegeneratingAudio
                          ? 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed'
                          : 'bg-white border-candy-300 text-grape-600 hover:bg-candy-50 hover:scale-105 active:scale-95'
                      }`}
                    >
                      {isRegeneratingAudio ? (
                        <>
                          <span className="w-4 h-4 border-2 border-candy-300 border-t-candy-600 rounded-full animate-spin" />
                          Adding audio...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5L6 9H3v6h3l5 4V5z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.54 8.46a5 5 0 010 7.07" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.07 4.93a10 10 0 010 14.14" />
                          </svg>
                          Add Audio
                        </>
                      )}
                    </button>
                    <p className="text-xs text-grape-400 font-semibold">Enable hands-free narration</p>
                  </div>
                )}
              </>
            )}

            <p className="text-sm font-bold text-grape-400">
              {isTheEnd ? 'The End' : `Page ${currentScene + 1} of ${story.images.length}`}
            </p>
            {!isTheEnd && (
              <p className="text-xs font-semibold text-grape-300 text-center">
                Swipe, tap image sides, or use arrow keys
              </p>
            )}
          </div>

          {/* Next button */}
          <button
            onClick={nextScene}
            disabled={currentScene >= totalScenes}
            aria-label="Next page"
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 border-2 shadow-md ${
              currentScene >= totalScenes
                ? 'bg-gray-100 border-gray-200 text-gray-300 cursor-not-allowed'
                : 'bg-white hover:bg-candy-50 border-candy-200 text-grape-600 hover:scale-110 active:scale-95'
            }`}
          >
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
