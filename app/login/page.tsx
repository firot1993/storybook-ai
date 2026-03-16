'use client'

import { useState } from 'react'
import { useLanguage } from '@/lib/i18n'

type AuthTab = 'invite' | 'byok'

export default function LoginPage() {
  const { t } = useLanguage()
  const [tab, setTab] = useState<AuthTab>('invite')
  const [code, setCode] = useState('')
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState('')
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
        setError(t('login.errors.invalidInvite'))
      }
    } catch {
      setError(t('login.errors.generic'))
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
        body: JSON.stringify({ geminiApiKey, elevenLabsApiKey }),
      })

      if (res.ok) {
        window.location.href = '/'
      } else {
        const data = await res.json()
        setError(data.error || t('login.errors.invalidApiKey'))
      }
    } catch {
      setError(t('login.errors.generic'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="card max-w-sm w-full text-center">
        <h1 className="heading text-2xl text-slate-800 mb-2">{t('login.title')}</h1>
        <p className="text-slate-500 text-sm mb-6">{t('login.subtitle')}</p>

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
            {t('login.inviteTab')}
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
            {t('login.byokTab')}
          </button>
        </div>

        {tab === 'invite' ? (
          <form onSubmit={handleInviteSubmit} className="space-y-4">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t('login.invitePlaceholder')}
              className="input text-center"
              autoFocus
            />

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading || !code.trim()}
              className="btn-primary w-full disabled:opacity-50"
            >
              {loading ? t('login.verifying') : t('login.enter')}
            </button>
          </form>
        ) : (
          <form onSubmit={handleByokSubmit} className="space-y-4">
            <input
              type="password"
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              placeholder={t('login.geminiApiKeyPlaceholder')}
              className="input text-center"
              autoFocus
            />
            <input
              type="password"
              value={elevenLabsApiKey}
              onChange={(e) => setElevenLabsApiKey(e.target.value)}
              placeholder={t('login.elevenLabsApiKeyPlaceholder')}
              className="input text-center"
            />
            <p className="text-xs text-gray-400">
              {t('login.byokHelp')}
            </p>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading || !geminiApiKey.trim() || !elevenLabsApiKey.trim()}
              className="btn-primary w-full disabled:opacity-50"
            >
              {loading ? t('login.validating') : t('login.connect')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
