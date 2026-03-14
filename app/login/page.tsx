'use client'

import { useState } from 'react'

type AuthTab = 'invite' | 'byok'

export default function LoginPage() {
  const [tab, setTab] = useState<AuthTab>('invite')
  const [code, setCode] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })

      if (res.ok) {
        window.location.href = '/'
      } else {
        setError('Invalid invite code')
      }
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleByokSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/byok', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      })

      if (res.ok) {
        window.location.href = '/'
      } else {
        const data = await res.json()
        setError(data.error || 'Invalid API key')
      }
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="card max-w-sm w-full text-center">
        <h1 className="heading text-2xl text-slate-800 mb-2">童梦奇缘</h1>
        <p className="text-slate-500 text-sm mb-6">Sign in to continue</p>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6">
          <button
            type="button"
            onClick={() => { setTab('invite'); setError('') }}
            className={`flex-1 pb-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'invite'
                ? 'border-forest-500 text-forest-700'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            Invite Code
          </button>
          <button
            type="button"
            onClick={() => { setTab('byok'); setError('') }}
            className={`flex-1 pb-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'byok'
                ? 'border-forest-500 text-forest-700'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            Use Your Own Key
          </button>
        </div>

        {tab === 'invite' ? (
          <form onSubmit={handleInviteSubmit} className="space-y-4">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Invite code"
              className="input text-center"
              autoFocus
            />

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading || !code.trim()}
              className="btn-primary w-full disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Enter'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleByokSubmit} className="space-y-4">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Gemini API key"
              className="input text-center"
              autoFocus
            />
            <p className="text-xs text-gray-400">
              Your key is encrypted and stored in a secure cookie. It is never logged or shared.
            </p>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading || !apiKey.trim()}
              className="btn-primary w-full disabled:opacity-50"
            >
              {loading ? 'Validating...' : 'Connect'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
