'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import StepProgress from '@/components/step-progress'
import { showToast } from '@/components/toast'

const TIPS = [
  { icon: '\u{1F4A1}', text: 'Use a clear photo of a face' },
  { icon: '\u{2600}\u{FE0F}', text: 'Good lighting works best' },
  { icon: '\u{1F60A}', text: 'A big smile makes a great cartoon!' },
]

export default function CharacterPage() {
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const router = useRouter()

  const processFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('Oops! Please pick a picture file (JPG, PNG).', 'error')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('That picture is too big! Try one under 5MB.', 'error')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => setPreview(e.target?.result as string)
    reader.readAsDataURL(file)

    setUploading(true)
    try {
      const base64 = await fileToBase64(file)
      const response = await fetch('/api/character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64.split(',')[1] }),
      })

      if (response.ok) {
        const data = await response.json()
        localStorage.setItem('currentCharacter', JSON.stringify(data.character))
        router.push('/character/name')
      } else {
        const data = (await response.json().catch(() => null)) as { error?: string; details?: unknown } | null
        if (data?.details) {
          console.error('Character generation details:', data.details)
        }
        showToast(data?.error || 'Something went wrong. Let\'s try again!', 'error')
      }
    } catch (error) {
      console.error('Error:', error)
      showToast('Something went wrong. Let\'s try again!', 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="max-w-xl w-full page-enter">
        <Link href="/" className="text-grape-400 hover:text-grape-600 mb-6 inline-flex items-center gap-1 text-sm font-bold">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Home
        </Link>

        <StepProgress currentStep={0} />

        <div className="card">
          <h1 className="text-3xl font-extrabold text-center mb-2 text-grape-700">
            Make a New Friend! &#128247;
          </h1>
          <p className="text-candy-600 text-center mb-8 text-lg">
            Upload a photo and see the magic happen!
          </p>

          {!preview ? (
            <>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-3 border-dashed rounded-3xl p-12 text-center transition-all duration-200 mb-8 ${
                  isDragging
                    ? 'border-candy-500 bg-candy-50 scale-[1.02]'
                    : 'border-grape-300 hover:border-candy-400 hover:bg-candy-50/50'
                }`}
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                  id="photo-upload"
                  disabled={uploading}
                />
                <label
                  htmlFor="photo-upload"
                  className={`flex flex-col items-center ${uploading ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                >
                  <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 transition-colors duration-200 ${
                    isDragging ? 'bg-candy-100' : 'bg-grape-100'
                  }`}>
                    <span className="text-4xl">{isDragging ? '\u{1F31F}' : '\u{1F4F8}'}</span>
                  </div>
                  <p className="text-xl font-bold text-grape-700 mb-1">
                    {isDragging ? 'Drop it here!' : 'Click or drag a photo'}
                  </p>
                  <p className="text-sm text-grape-400 font-medium">
                    JPG or PNG, max 5MB
                  </p>
                </label>
              </div>

              <div className="bg-sky-50 rounded-2xl p-5 border border-sky-100">
                <p className="text-sky-800 font-bold text-sm mb-3 flex items-center gap-2">
                  <span>&#10024;</span> Magic Tips:
                </p>
                <div className="grid grid-cols-1 gap-3">
                  {TIPS.map((tip, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm text-sky-700 font-medium">
                      <span className="text-lg bg-white w-8 h-8 rounded-full flex items-center justify-center shadow-sm shrink-0">
                        {tip.icon}
                      </span>
                      {tip.text}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="text-center animate-fade-in">
              <div className="relative mb-6 mx-auto w-full max-w-sm">
                <div className="rounded-2xl overflow-hidden shadow-2xl border-4 border-white aspect-square relative">
                  <Image
                    src={preview}
                    alt="Preview"
                    fill
                    className="object-cover"
                  />
                </div>
                {uploading && (
                  <div className="absolute inset-0 bg-grape-900/60 rounded-2xl flex items-center justify-center backdrop-blur-sm z-20">
                    <div className="text-white text-center p-6">
                      <div className="text-5xl mb-4 animate-bounce-star">&#10024;</div>
                      <p className="font-extrabold text-2xl mb-2">Creating Magic!</p>
                      <div className="w-48 h-2 bg-white/20 rounded-full mx-auto overflow-hidden mb-3">
                        <div className="h-full bg-candy-400 animate-shimmer" style={{ width: '60%' }} />
                      </div>
                      <p className="text-white/80 font-medium italic">Turning your photo into a cartoon...</p>
                    </div>
                  </div>
                )}
              </div>

              {!uploading && (
                <button
                  onClick={() => {
                    setPreview(null)
                    localStorage.removeItem('currentCharacter')
                  }}
                  className="btn-secondary"
                >
                  Choose Different Photo
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
