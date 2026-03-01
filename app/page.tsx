'use client'

import { useState } from 'react'
import Link from 'next/link'
import LibraryTab from '@/components/library-tab'

export default function Home() {
  const [tab, setTab] = useState<'create' | 'library'>('create')

  return (
    <div className="min-h-screen flex flex-col items-center px-4 pt-8 pb-16">
      {/* Tab pills */}
      <div className="flex gap-2 mb-8 bg-white/60 rounded-full p-1.5 border border-grape-100 shadow-sm">
        <button
          onClick={() => setTab('create')}
          className={`px-6 py-2.5 rounded-full text-sm font-bold transition-all ${
            tab === 'create'
              ? 'bg-gradient-to-r from-candy-500 to-grape-500 text-white shadow-md'
              : 'text-grape-500 hover:bg-grape-50'
          }`}
        >
          Create New
        </button>
        <button
          onClick={() => setTab('library')}
          className={`px-6 py-2.5 rounded-full text-sm font-bold transition-all ${
            tab === 'library'
              ? 'bg-gradient-to-r from-candy-500 to-grape-500 text-white shadow-md'
              : 'text-grape-500 hover:bg-grape-50'
          }`}
        >
          My Library
        </button>
      </div>

      {tab === 'create' ? (
        <div className="text-center max-w-2xl page-enter flex-1 flex flex-col justify-center">
          <div className="inline-block mb-4 px-5 py-2 bg-gradient-to-r from-sun-200 to-candy-200 text-candy-700 rounded-full text-sm font-bold">
            Powered by Gemini AI
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold mb-6 leading-tight rainbow-text">
            Storybook AI
          </h1>

          <p className="text-xl md:text-2xl text-grape-600 mb-10 leading-relaxed font-medium">
            Make your very own story! Create a character or start a new adventure!
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/story/create"
              className="btn-primary text-xl inline-flex items-center justify-center gap-3 py-5 px-10"
            >
              Create Story
              <span className="text-2xl">&#128214;</span>
            </Link>
            <Link
              href="/character"
              className="btn-secondary text-xl inline-flex items-center justify-center gap-3 py-5 px-10"
            >
              Make Character
              <span className="text-2xl">&#128247;</span>
            </Link>
          </div>

          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            <div className="card-interactive group bg-gradient-to-br from-candy-50 to-candy-100 border-candy-200">
              <div className="text-4xl mb-4 group-hover:animate-wiggle inline-block">
                &#128247;
              </div>
              <h3 className="font-bold text-xl mb-2 text-candy-700">Make Friends</h3>
              <p className="text-candy-600 text-sm leading-relaxed">Turn any photo into a cartoon friend to use in your stories!</p>
            </div>

            <div className="card-interactive group bg-gradient-to-br from-grape-50 to-grape-100 border-grape-200">
              <div className="text-4xl mb-4 group-hover:animate-wiggle inline-block">
                &#10024;
              </div>
              <h3 className="font-bold text-xl mb-2 text-grape-700">AI Magic</h3>
              <p className="text-grape-600 text-sm leading-relaxed">Magic makes your characters and stories come to life!</p>
            </div>

            <div className="card-interactive group bg-gradient-to-br from-sun-50 to-sun-100 border-sun-200">
              <div className="text-4xl mb-4 group-hover:animate-wiggle inline-block">
                &#128101;
              </div>
              <h3 className="font-bold text-xl mb-2 text-sun-700">Multi-Character</h3>
              <p className="text-sun-600 text-sm leading-relaxed">Pick up to 3 friends to go on an adventure together!</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-2xl page-enter">
          <h2 className="text-3xl font-extrabold text-grape-700 text-center mb-2">
            My Library &#128218;
          </h2>
          <p className="text-candy-500 text-center mb-4">
            Your characters and stories
          </p>
          <LibraryTab />
        </div>
      )}
    </div>
  )
}
