'use client'

import { Suspense, useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Story, Character } from '@/types'
import { getCurrentStoryFromIndexedDB } from '@/lib/client-story-store'

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
  const [sceneKey, setSceneKey] = useState(0)
  const router = useRouter()
  const searchParams = useSearchParams()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const touchStartX = useRef<number | null>(null)

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
    if (story?.audioUrl) {
      const audioElement = new Audio(story.audioUrl)
      audioRef.current = audioElement

      audioElement.addEventListener('ended', () => {
        setIsPlaying(false)
      })

      return () => {
        audioElement.pause()
        audioElement.removeEventListener('ended', () => {})
      }
    }
  }, [story])

  const totalScenes = story?.images.length ?? 0

  const goToScene = useCallback((index: number) => {
    if (index >= 0 && index <= totalScenes) { // Allow going to totalScenes for "The End"
      setCurrentScene(index)
      setSceneKey((k) => k + 1)
    }
  }, [totalScenes])

  const nextScene = useCallback(() => goToScene(currentScene + 1), [currentScene, goToScene])
  const prevScene = useCallback(() => goToScene(currentScene - 1), [currentScene, goToScene])

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextScene, prevScene])

  // Swipe gestures
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 60) {
      if (diff > 0) nextScene()
      else prevScene()
    }
    touchStartX.current = null
  }

  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  // Split story content into scenes using [Scene X] markers
  const getSceneText = () => {
    if (!story) return ''
    const parts = story.content.split(/\*{0,2}\[Scene\s*\d+[^\]]*\]\*{0,2}\s*/i).filter(Boolean)
    if (parts.length > 1 && currentScene < parts.length) {
      return parts[currentScene].trim()
    }
    const sentences = story.content.split(/(?<=[.!?])\s+/)
    const scenesCount = story.images.length || 1
    const perScene = Math.ceil(sentences.length / scenesCount)
    const start = currentScene * perScene
    return sentences.slice(start, start + perScene).join(' ')
  }

  if (!story || characters.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-4xl animate-bounce-star">&#10024;</div>
      </div>
    )
  }

  const isTheEnd = currentScene === totalScenes

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
          className={`animate-fade-in w-full bg-white rounded-3xl shadow-xl border-3 overflow-hidden ${
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
              {story.images[currentScene] && (
                <div className="relative w-full aspect-[4/3] bg-amber-50">
                  <Image
                    src={story.images[currentScene]}
                    alt={`Page ${currentScene + 1}`}
                    fill
                    sizes="(max-width: 672px) 100vw, 672px"
                    className="object-cover"
                  />
                </div>
              )}

              {/* Text area */}
              <div className="p-5 sm:p-6 bg-gradient-to-b from-amber-50 to-white">
                <p className="text-gray-800 leading-loose text-lg sm:text-xl font-medium">
                  {getSceneText()}
                </p>
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
          <div className="flex flex-col items-center gap-2">
            {!isTheEnd && (
              <div className="flex items-center gap-3">
                {/* Page dots */}
                <div className="flex gap-2 items-center">
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

                {/* Audio button */}
                {story.audioUrl && (
                  <button
                    onClick={togglePlay}
                    aria-label={isPlaying ? 'Pause' : 'Listen'}
                    className="w-11 h-11 bg-gradient-to-r from-candy-500 to-grape-500 hover:from-candy-600 hover:to-grape-600 active:scale-95 rounded-full flex items-center justify-center transition-all duration-200 shadow-md text-white"
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
                )}
              </div>
            )}

            <p className="text-sm font-bold text-grape-400">
              {isTheEnd ? 'The End' : `Page ${currentScene + 1} of ${story.images.length}`}
            </p>
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
