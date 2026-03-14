import { NextRequest, NextResponse } from 'next/server'
import { transcribeAudio, extractCharacterInfo, GeminiSttError } from '@/lib/gemini-stt'
import { resolveApiKey } from '@/lib/api-utils'

// POST /api/voice/transcribe
// Body: multipart/form-data with "audio" (File) and optional "hint" (string)
export async function POST(request: NextRequest) {
  const apiKey = resolveApiKey(request)
  try {
    const formData = await request.formData()
    const audioFile = formData.get('audio') as File | null
    const hint = (formData.get('hint') as string | null) ?? undefined
    const extractInfo = formData.get('extractCharacterInfo') === 'true'

    if (!audioFile) {
      return NextResponse.json({ error: 'Audio file is required' }, { status: 400 })
    }
    if (audioFile.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Audio file must be under 10MB' }, { status: 400 })
    }

    const arrayBuffer = await audioFile.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const mimeType = audioFile.type || 'audio/webm'

    const transcript = await transcribeAudio(base64, mimeType, hint, apiKey)
    const characterInfo = extractInfo ? await extractCharacterInfo(transcript, apiKey) : undefined

    return NextResponse.json({
      transcript,
      ...(characterInfo ? { characterInfo } : {}),
    })
  } catch (error) {
    if (error instanceof GeminiSttError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[STT] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
