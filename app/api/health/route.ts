import { NextResponse } from 'next/server'

// GET /api/health - Basic API readiness check
export async function GET() {
  const hasGemini = Boolean(process.env.GEMINI_API_KEY)

  const ready = hasGemini
  const status = ready ? 200 : 503

  return NextResponse.json(
    {
      ready,
      message: ready
        ? 'API is ready.'
        : 'Missing required environment variable: GEMINI_API_KEY',
      checks: {
        geminiApiKey: {
          ready: hasGemini,
          message: hasGemini ? 'Configured' : 'Missing GEMINI_API_KEY',
        },
        geminiTtsVoice: {
          ready: true,
          message: process.env.GEMINI_TTS_VOICE
            ? `Configured (${process.env.GEMINI_TTS_VOICE})`
            : 'Using default voice (Kore)',
        },
      },
    },
    { status }
  )
}
