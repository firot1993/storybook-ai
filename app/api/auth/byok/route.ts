import { NextRequest, NextResponse } from 'next/server'
import { getGeminiClient } from '@/lib/gemini-client'
import { validateElevenLabsApiKey } from '@/lib/gemini-tts'
import { setByokCookie, clearByokCookie, BYOK_COOKIE_NAME, BYOK_READY_COOKIE_NAME, getByokKeys } from '@/lib/byok'

function normalizeOptionalKey(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const {
    apiKey,
    geminiApiKey,
    elevenLabsApiKey,
  } = body as {
    apiKey?: string
    geminiApiKey?: string
    elevenLabsApiKey?: string
  }

  const normalizedGeminiApiKey = normalizeOptionalKey(geminiApiKey ?? apiKey)
  const normalizedElevenLabsApiKey = normalizeOptionalKey(elevenLabsApiKey)

  if (!normalizedGeminiApiKey || !normalizedElevenLabsApiKey) {
    return NextResponse.json({ error: 'Both Gemini and ElevenLabs API keys are required for BYOK.' }, { status: 400 })
  }

  if (normalizedGeminiApiKey) {
    try {
      const client = getGeminiClient(normalizedGeminiApiKey)
      await client.models.list()
    } catch (error) {
      console.error('[BYOK] Gemini API key validation failed:', error)
      const apiError = error as { status?: number; statusCode?: number; message?: string; code?: number }
      const status = apiError?.status ?? apiError?.statusCode ?? apiError?.code
      if (status === 401 || status === 403) {
        return NextResponse.json({ error: 'Invalid API key. Please check your Gemini API key.' }, { status: 401 })
      }
      const message = apiError?.message || 'Unknown error'
      if (message.toLowerCase().includes('api key') || message.toLowerCase().includes('permission') || message.toLowerCase().includes('unauthorized')) {
        return NextResponse.json({ error: 'Invalid API key. Please check your Gemini API key.' }, { status: 401 })
      }
      return NextResponse.json(
        { error: `Failed to validate API key: ${message}` },
        { status: 502 }
      )
    }
  }

  if (normalizedElevenLabsApiKey) {
    try {
      await validateElevenLabsApiKey(normalizedElevenLabsApiKey)
    } catch (error) {
      console.error('[BYOK] ElevenLabs API key validation failed:', error)
      const apiError = error as { status?: number; message?: string }
      return NextResponse.json(
        { error: apiError?.message || 'Invalid ElevenLabs API key. Please check your ElevenLabs API key.' },
        { status: apiError?.status ?? 502 }
      )
    }
  }

  const response = NextResponse.json({ ok: true })
  setByokCookie(response, {
    ...(normalizedGeminiApiKey ? { geminiApiKey: normalizedGeminiApiKey } : {}),
    ...(normalizedElevenLabsApiKey ? { elevenLabsApiKey: normalizedElevenLabsApiKey } : {}),
  })
  return response
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  clearByokCookie(response)
  return response
}

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(BYOK_COOKIE_NAME)?.value
  const readyCookie = request.cookies.get(BYOK_READY_COOKIE_NAME)?.value
  const keys = getByokKeys(request)
  const active = Boolean(
    cookie &&
    readyCookie === '1' &&
    keys?.geminiApiKey &&
    keys?.elevenLabsApiKey
  )
  return NextResponse.json({
    active,
    hasGeminiKey: Boolean(keys?.geminiApiKey),
    hasElevenLabsKey: Boolean(keys?.elevenLabsApiKey),
  })
}
