'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

export default function CharacterPage() {
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const router = useRouter()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Show preview
    const reader = new FileReader()
    reader.onload = (e) => setPreview(e.target?.result as string)
    reader.readAsDataURL(file)

    // Upload and generate character
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
        // Store character ID in localStorage or URL
        localStorage.setItem('currentCharacter', JSON.stringify(data.character))
        router.push('/character/name')
      } else {
        const data = (await response.json().catch(() => null)) as { error?: string; details?: unknown } | null
        if (data?.details) {
          console.error('Character generation details:', data.details)
        }
        alert(data?.error || 'Failed to generate character. Please try again.')
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Failed to generate character. Please try again.')
    } finally {
      setUploading(false)
    }
  }

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
      <div className="max-w-xl w-full">
        <Link href="/" className="text-gray-500 hover:text-gray-700 mb-8 inline-block">
          ← Back to Home
        </Link>

        <div className="card">
          <h1 className="text-3xl font-bold text-center mb-2">
            Create Your Character
          </h1>
          <p className="text-gray-600 text-center mb-8">
            Upload a photo to transform into a magical storybook character
          </p>

          <div className="mb-6 rounded-lg p-3 text-sm bg-blue-50 text-blue-700">
            Local mode: character and story data are stored in your browser only.
          </div>

          {!preview ? (
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-primary-500 transition-colors">
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
                <div className="text-5xl mb-4">📸</div>
                <p className="text-lg font-medium text-gray-700 mb-2">
                  Click to upload a photo
                </p>
                <p className="text-sm text-gray-500">
                  Supports JPG, PNG (max 5MB)
                </p>
              </label>
            </div>
          ) : (
            <div className="text-center">
              <div className="relative mb-6">
                <Image
                  src={preview}
                  alt="Preview"
                  width={384}
                  height={384}
                  className="w-full max-w-sm mx-auto rounded-lg shadow-md"
                />
                {uploading && (
                  <div className="absolute inset-0 bg-black bg-opacity-50 rounded-lg flex items-center justify-center">
                    <div className="text-white text-center">
                      <div className="animate-spin text-4xl mb-2">✨</div>
                      <p>Creating magic...</p>
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
