import { NextResponse } from 'next/server'

// GET /api/health - Basic API readiness check
export async function GET() {
  const hasGemini = Boolean(process.env.GEMINI_API_KEY)
  const hasElevenLabs = Boolean(process.env.ELEVENLABS_API_KEY)

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
        elevenLabsApiKey: {
          ready: hasElevenLabs,
          message: hasElevenLabs
            ? 'Configured'
            : 'Missing ELEVENLABS_API_KEY (optional, audio narration will be disabled)',
        },
      },
    },
    { status }
  )
}
