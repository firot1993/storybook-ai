import { GoogleGenAI } from '@google/genai'

const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
})

const TTS_MODEL = process.env.GEMINI_TTS_MODEL?.trim() || 'gemini-2.5-flash-preview-tts'
const DEFAULT_VOICE_NAME = 'Kore'
const WAV_SAMPLE_RATE = 24000
const WAV_CHANNELS = 1
const WAV_BITS_PER_SAMPLE = 16
const TTS_MIN_INTERVAL_MS = Number(process.env.GEMINI_TTS_MIN_INTERVAL_MS ?? 6500)
const TTS_MAX_RETRIES = Number(process.env.GEMINI_TTS_MAX_RETRIES ?? 4)
const TTS_RETRY_BASE_MS = Number(process.env.GEMINI_TTS_RETRY_BASE_MS ?? 5000)

let ttsNextAvailableAt = 0
let ttsGate: Promise<void> = Promise.resolve()

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

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function clampPositiveInt(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  const parsed = Math.trunc(value)
  return parsed > 0 ? parsed : fallback
}

export function parseRetryDelayMs(message: string): number | null {
  const messageText = typeof message === 'string' ? message : ''
  if (!messageText) return null

  const retryInMatch = messageText.match(/Please retry in\s+([0-9.]+)s/i)
  if (retryInMatch) {
    const seconds = Number.parseFloat(retryInMatch[1])
    if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds * 1000)
  }

  const retryDelayMatch = messageText.match(/"retryDelay"\s*:\s*"([0-9.]+)s"/i)
  if (retryDelayMatch) {
    const seconds = Number.parseFloat(retryDelayMatch[1])
    if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds * 1000)
  }

  return null
}

async function acquireTtsRequestSlot(additionalDelayMs = 0): Promise<void> {
  const minInterval = clampPositiveInt(TTS_MIN_INTERVAL_MS, 6500)
  const extraDelay = Math.max(0, Math.trunc(additionalDelayMs))

  const reserve = async () => {
    const now = Date.now()
    const waitMs = Math.max(0, ttsNextAvailableAt - now) + extraDelay
    if (waitMs > 0) await sleep(waitMs)
    ttsNextAvailableAt = Date.now() + minInterval
  }

  ttsGate = ttsGate.then(reserve, reserve)
  await ttsGate
}

export function toDataUrl(base64: string, mimeType: string): string {
  return `data:${mimeType};base64,${base64}`
}

export function looksLikeWav(buffer: Buffer): boolean {
  if (buffer.length < 12) return false
  return (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WAVE'
  )
}

// Gemini TTS typically returns PCM16 mono @ 24kHz. Wrap raw PCM in a WAV header for browser playback.
export function wrapPcm16ToWav(pcmData: Buffer): Buffer {
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

export function normalizeToPlayableWav(audioBuffer: Buffer, mimeType?: string): Buffer {
  if (mimeType?.toLowerCase().includes('wav') && looksLikeWav(audioBuffer)) {
    return audioBuffer
  }

  return wrapPcm16ToWav(audioBuffer)
}

function normalizeText(text: string): string {
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

  return normalizedText
}

function extractAudioDataPart(response: GeminiTtsResponse): { data: string; mimeType?: string } {
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

  return {
    data: audioBase64,
    mimeType: audioPart?.inlineData?.mimeType,
  }
}

async function requestGeminiAudio(
  text: string,
  speechConfig: Record<string, unknown>
): Promise<string> {
  const normalizedText = normalizeText(text)
  const maxAttempts = clampPositiveInt(TTS_MAX_RETRIES, 4)
  const retryBaseMs = clampPositiveInt(TTS_RETRY_BASE_MS, 5000)
  let retryDelayMs = 0

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await acquireTtsRequestSlot(retryDelayMs)
    retryDelayMs = 0

    let response: GeminiTtsResponse
    try {
      response = (await genAI.models.generateContent({
        model: TTS_MODEL,
        contents: [{ parts: [{ text: normalizedText }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig,
        },
      })) as GeminiTtsResponse
    } catch (error) {
      const apiError = error as { status?: number; message?: string }
      const geminiError = new GeminiTtsError({
        status: typeof apiError?.status === 'number' ? apiError.status : 502,
        message: apiError?.message || 'Gemini TTS request failed.',
      })
      const shouldRetry = geminiError.status === 429 || geminiError.status === 503
      if (!shouldRetry || attempt === maxAttempts) throw geminiError

      const serverSuggestedDelay = parseRetryDelayMs(geminiError.message)
      retryDelayMs = serverSuggestedDelay ?? retryBaseMs * attempt
      continue
    }

    const { data, mimeType } = extractAudioDataPart(response)
    const decodedAudio = Buffer.from(data, 'base64')
    if (decodedAudio.byteLength === 0) {
      if (attempt === maxAttempts) {
        throw new GeminiTtsError({
          status: 502,
          message: 'Gemini TTS returned empty audio data.',
        })
      }
      retryDelayMs = retryBaseMs * attempt
      continue
    }

    const wavBuffer = normalizeToPlayableWav(decodedAudio, mimeType)
    return toDataUrl(wavBuffer.toString('base64'), 'audio/wav')
  }

  throw new GeminiTtsError({
    status: 502,
    message: 'Gemini TTS failed after retries.',
  })
}

export function toSingleSpeakerNarrationScript(sceneText: string): string {
  const lines = sceneText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const scriptedLines = lines.map((line) => {
    const cleaned = line.replace(/\*+/g, '').trim()

    if (/^narrator\s*:/i.test(cleaned)) {
      return cleaned.replace(/^narrator\s*:/i, '').trim()
    }

    const namedSpeaker = cleaned.match(/^([A-Za-z][A-Za-z' -]{0,30})\s*:\s*(.+)$/)
    if (namedSpeaker) {
      const speaker = namedSpeaker[1].trim()
      const quote = namedSpeaker[2].trim().replace(/^["“]|["”]$/g, '')
      return `${speaker} says, "${quote}".`
    }

    const quotedSpeaker = cleaned.match(/^([A-Za-z][A-Za-z' -]{0,30})\s*["“]\s*(.+?)\s*["”]?$/)
    if (quotedSpeaker) {
      const speaker = quotedSpeaker[1].trim()
      const quote = quotedSpeaker[2].trim().replace(/^["“]|["”]$/g, '')
      return `${speaker} says, "${quote}".`
    }

    const pureQuote = cleaned.match(/^["“](.+?)["”]$/)
    if (pureQuote) {
      return `"${pureQuote[1].trim()}"`
    }

    return cleaned
  })

  if (scriptedLines.length === 0) {
    return 'A gentle bedtime moment.'
  }

  return scriptedLines.join('\n')
}

export async function generateVoicePreviewAudioUrl(voiceName: string, text: string): Promise<string> {
  return requestGeminiAudio(text, {
    voiceConfig: {
      prebuiltVoiceConfig: { voiceName },
    },
  })
}

export async function generateNarrationAudioUrl(text: string): Promise<string> {
  const voiceName = process.env.GEMINI_TTS_VOICE || DEFAULT_VOICE_NAME
  return requestGeminiAudio(text, {
    voiceConfig: {
      prebuiltVoiceConfig: { voiceName },
    },
  })
}

export async function generateSceneNarrationAudioUrl(sceneText: string): Promise<string> {
  const voiceName = process.env.GEMINI_TTS_VOICE || DEFAULT_VOICE_NAME
  const scriptedScene = toSingleSpeakerNarrationScript(sceneText)
  return requestGeminiAudio(scriptedScene, {
    voiceConfig: {
      prebuiltVoiceConfig: { voiceName },
    },
  })
}

/**
 * V2: Generate audio for a single subtitle line.
 * Keeps line granularity so downstream subtitle timing can align with real audio durations.
 */
export async function generateSceneLineNarrationAudioUrlV2(lineText: string): Promise<string> {
  const voiceName = process.env.GEMINI_TTS_VOICE || DEFAULT_VOICE_NAME
  const scriptedLine = toSingleSpeakerNarrationScript(lineText)
  return requestGeminiAudio(scriptedLine, {
    voiceConfig: {
      prebuiltVoiceConfig: { voiceName },
    },
  })
}

/**
 * V2: Generate per-line scene narration audio URLs.
 */
export async function generateSceneLineNarrationAudioUrlsV2(lines: string[]): Promise<string[]> {
  const results: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    try {
      results.push(await generateSceneLineNarrationAudioUrlV2(line))
    } catch (error) {
      console.warn(`[Gemini TTS V2] Line ${i} audio generation failed:`, error)
      throw error
    }
  }
  return results
}

export async function generateSceneNarrationAudioUrls(scenes: string[]): Promise<string[]> {
  const results: string[] = []

  for (const scene of scenes) {
    try {
      results.push(await generateSceneNarrationAudioUrl(scene))
    } catch (error) {
      console.warn('[Gemini TTS] Scene audio generation failed:', error)
      results.push('')
    }
  }

  return results
}
