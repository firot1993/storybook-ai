import { GoogleGenAI } from '@google/genai'

const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
})

const TTS_MODEL = 'gemini-2.5-flash-preview-tts'
const DEFAULT_VOICE_NAME = 'Kore'
const WAV_SAMPLE_RATE = 24000
const WAV_CHANNELS = 1
const WAV_BITS_PER_SAMPLE = 16

type GeminiTtsErrorDetails = {
  status: number
  message: string
}

type GeminiAudioPart = {
  inlineData?: {
    data?: string
    mimeType?: string
  }
}

type GeminiTtsResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiAudioPart[]
    }
  }>
}

export class GeminiTtsError extends Error {
  status: number

  constructor({ status, message }: GeminiTtsErrorDetails) {
    super(message)
    this.status = status
  }
}

function toDataUrl(base64: string, mimeType: string): string {
  return `data:${mimeType};base64,${base64}`
}

function looksLikeWav(buffer: Buffer): boolean {
  if (buffer.length < 12) return false
  return (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WAVE'
  )
}

// Gemini TTS typically returns PCM16 mono @ 24kHz. Wrap raw PCM in a WAV header for browser playback.
function wrapPcm16ToWav(pcmData: Buffer): Buffer {
  const blockAlign = (WAV_CHANNELS * WAV_BITS_PER_SAMPLE) / 8
  const byteRate = WAV_SAMPLE_RATE * blockAlign
  const dataSize = pcmData.length
  const wavHeader = Buffer.alloc(44)

  wavHeader.write('RIFF', 0)
  wavHeader.writeUInt32LE(36 + dataSize, 4)
  wavHeader.write('WAVE', 8)
  wavHeader.write('fmt ', 12)
  wavHeader.writeUInt32LE(16, 16)
  wavHeader.writeUInt16LE(1, 20) // PCM format
  wavHeader.writeUInt16LE(WAV_CHANNELS, 22)
  wavHeader.writeUInt32LE(WAV_SAMPLE_RATE, 24)
  wavHeader.writeUInt32LE(byteRate, 28)
  wavHeader.writeUInt16LE(blockAlign, 32)
  wavHeader.writeUInt16LE(WAV_BITS_PER_SAMPLE, 34)
  wavHeader.write('data', 36)
  wavHeader.writeUInt32LE(dataSize, 40)

  return Buffer.concat([wavHeader, pcmData])
}

function normalizeToPlayableWav(audioBuffer: Buffer, mimeType?: string): Buffer {
  if (mimeType?.toLowerCase().includes('wav') && looksLikeWav(audioBuffer)) {
    return audioBuffer
  }

  return wrapPcm16ToWav(audioBuffer)
}

export async function generateNarrationAudioUrl(text: string): Promise<string> {
  const normalizedText = typeof text === 'string' ? text.trim() : ''
  if (!normalizedText) {
    throw new GeminiTtsError({
      status: 400,
      message: 'Story content is required to generate audio.',
    })
  }

  if (!process.env.GEMINI_API_KEY) {
    throw new GeminiTtsError({
      status: 503,
      message: 'GEMINI_API_KEY is not configured.',
    })
  }

  const voiceName = process.env.GEMINI_TTS_VOICE || DEFAULT_VOICE_NAME

  let response: GeminiTtsResponse
  try {
    response = (await genAI.models.generateContent({
      model: TTS_MODEL,
      contents: [{ parts: [{ text: normalizedText }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    })) as GeminiTtsResponse
  } catch (error) {
    const apiError = error as { status?: number; message?: string }
    throw new GeminiTtsError({
      status: typeof apiError?.status === 'number' ? apiError.status : 502,
      message: apiError?.message || 'Gemini TTS request failed.',
    })
  }

  const audioPart = response.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .find((part) => Boolean(part.inlineData?.data))

  const audioBase64 = audioPart?.inlineData?.data
  if (!audioBase64) {
    throw new GeminiTtsError({
      status: 502,
      message: 'Gemini TTS returned no audio data.',
    })
  }

  const decodedAudio = Buffer.from(audioBase64, 'base64')
  if (decodedAudio.byteLength === 0) {
    throw new GeminiTtsError({
      status: 502,
      message: 'Gemini TTS returned empty audio data.',
    })
  }

  const wavBuffer = normalizeToPlayableWav(decodedAudio, audioPart?.inlineData?.mimeType)
  return toDataUrl(wavBuffer.toString('base64'), 'audio/wav')
}
