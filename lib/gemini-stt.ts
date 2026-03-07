import { GoogleGenAI } from '@google/genai'
import {
  DEFAULT_TRANSCRIBE_AUDIO_HINT,
  buildExtractCharacterInfoPrompt,
} from './ai-prompts'

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })
// Gemini 2.0 Flash supports inline audio for transcription
const STT_MODEL = process.env.GEMINI_STT_MODEL?.trim() || 'gemini-2.0-flash'

type SttError = { status?: number; message?: string }

export class GeminiSttError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'GeminiSttError'
  }
}

/**
 * Transcribe audio (base64) to text via Gemini multimodal.
 * Supported mimeTypes: audio/webm, audio/ogg, audio/wav, audio/mp4
 */
export async function transcribeAudio(
  audioBase64: string,
  mimeType: string,
  hint = DEFAULT_TRANSCRIBE_AUDIO_HINT
): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    throw new GeminiSttError(503, 'GEMINI_API_KEY is not configured.')
  }
  if (!audioBase64) {
    throw new GeminiSttError(400, 'Audio data is required.')
  }

  try {
    const response = await genAI.models.generateContent({
      model: STT_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { text: hint },
            { inlineData: { data: audioBase64, mimeType } },
          ],
        },
      ],
    })

    const transcript = response.text?.trim() ?? ''
    if (!transcript) {
      throw new GeminiSttError(502, 'Speech-to-text returned empty result.')
    }
    return transcript
  } catch (error) {
    if (error instanceof GeminiSttError) throw error
    const e = error as SttError
    throw new GeminiSttError(
      e?.status ?? 500,
      e?.message ?? 'Speech-to-text failed.'
    )
  }
}

/**
 * Extract character name and description from a transcript.
 */
export async function extractCharacterInfo(
  transcript: string
): Promise<{ name?: string; description?: string }> {
  if (!process.env.GEMINI_API_KEY) return { description: transcript }

  const prompt = buildExtractCharacterInfoPrompt(transcript)

  try {
    const response = await genAI.models.generateContent({
      model: STT_MODEL,
      contents: prompt,
    })
    const text = (response.text ?? '{}').replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(text)
    return {
      name: parsed.name && parsed.name !== 'null' ? String(parsed.name) : undefined,
      description: parsed.description && parsed.description !== 'null'
        ? String(parsed.description)
        : undefined,
    }
  } catch {
    return { description: transcript }
  }
}
