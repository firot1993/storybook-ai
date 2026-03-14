import { NextRequest, NextResponse } from 'next/server'
import { getGeminiClient } from '@/lib/gemini-client'
import { setByokCookie, clearByokCookie, BYOK_COOKIE_NAME } from '@/lib/byok'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { apiKey } = body as { apiKey?: string }

  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return NextResponse.json({ error: 'API key is required' }, { status: 400 })
  }

  const trimmedKey = apiKey.trim()

  // Validate by making a lightweight Gemini API call
  try {
    const client = getGeminiClient(trimmedKey)
    await client.models.list()
  } catch (error) {
    console.error('[BYOK] API key validation failed:', error)
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

  const response = NextResponse.json({ ok: true })
  setByokCookie(response, trimmedKey)
  return response
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  clearByokCookie(response)
  return response
}

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(BYOK_COOKIE_NAME)?.value
  return NextResponse.json({ active: Boolean(cookie) })
}
