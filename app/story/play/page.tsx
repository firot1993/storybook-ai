'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Story, Character } from '@/types'

export default function PlayStoryPage() {
  const [story, setStory] = useState<Story | null>(null)
  const [character, setCharacter] = useState<Character | null>(null)
  const [currentScene, setCurrentScene] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null)
  const router = useRouter()
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const storedStory = localStorage.getItem('currentStory')
    const storedCharacter = localStorage.getItem('currentCharacter')
    
    if (storedStory && storedCharacter) {
      setStory(JSON.parse(storedStory))
      setCharacter(JSON.parse(storedCharacter))
    } else {
      router.push('/')
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
      }
    }
  }, [router])

  useEffect(() => {
    if (story?.audioUrl) {
      const audioElement = new Audio(story.audioUrl)
      audioRef.current = audioElement
      setAudio(audioElement)

      audioElement.addEventListener('ended', () => {
        setIsPlaying(false)
      })

      return () => {
        audioElement.pause()
        audioElement.removeEventListener('ended', () => {})
      }
    }
  }, [story])

  const togglePlay = () => {
    if (!audio) return

    if (isPlaying) {
      audio.pause()
    } else {
      audio.play()
    }
    setIsPlaying(!isPlaying)
  }

  const nextScene = () => {
    if (story && currentScene < story.images.length - 1) {
      setCurrentScene(currentScene + 1)
    }
  }

  const prevScene = () => {
    if (currentScene > 0) {
      setCurrentScene(currentScene - 1)
    }
  }

  if (!story || !character) return null

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 p-4 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent z-10">
        <Link href="/" className="text-white/80 hover:text-white">
          ← Back to Home
        </Link>
        
        <div className="flex items-center gap-2">
          <img
            src={character.cartoonImage}
            alt={character.name}
            className="w-8 h-8 rounded-full border border-white/30"
          />
          <span className="text-sm font-medium">{story.title}</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="h-screen flex flex-col">
        {/* Image */}
        <div className="flex-1 relative">
          <img
            src={story.images[currentScene]}
            alt={`Scene ${currentScene + 1}`}
            className="w-full h-full object-contain"
          />
          
          {/* Scene Indicator */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
            {story.images.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentScene(index)}
                className={`w-2 h-2 rounded-full transition-all ${
                  index === currentScene 
                    ? 'bg-white w-6' 
                    : 'bg-white/50'
                }`}
              />
            ))}
          </div>

          {/* Navigation Arrows */}
          {currentScene > 0 && (
            <button
              onClick={prevScene}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-black/50 rounded-full flex items-center justify-center hover:bg-black/70 transition-colors"
            >
              ←
            </button>
          )}
          
          {currentScene < story.images.length - 1 && (
            <button
              onClick={nextScene}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-black/50 rounded-full flex items-center justify-center hover:bg-black/70 transition-colors"
            >
              →
            </button>
          )}
        </div>

        {/* Story Text & Controls */}
        <div className="bg-gray-800 p-6">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">{story.title}</h2>
              <button
                onClick={togglePlay}
                className="w-14 h-14 bg-primary-600 hover:bg-primary-700 rounded-full flex items-center justify-center text-2xl transition-colors"
              >
                {isPlaying ? '⏸️' : '▶️'}
              </button>
            </div>
            
            <div className="bg-gray-700 rounded-lg p-4 max-h-40 overflow-y-auto">
              <p className="text-gray-300 leading-relaxed">{story.content}</p>
            </div>
            
            <div className="mt-4 flex justify-between items-center">
              <p className="text-sm text-gray-500">
                Scene {currentScene + 1} of {story.images.length}
              </p>
              
              <Link
                href="/story/create"
                className="text-primary-400 hover:text-primary-300 text-sm"
              >
                Create Another Story →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
