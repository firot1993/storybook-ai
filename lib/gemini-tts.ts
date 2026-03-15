import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'

const TTS_MODEL = process.env.ELEVENLABS_MODEL_ID?.trim() || 'eleven_multilingual_v2'
const DEFAULT_VOICE_NAME = 'Kore'
const WAV_SAMPLE_RATE = 24000
const WAV_CHANNELS = 1
const WAV_BITS_PER_SAMPLE = 16
const TTS_CONCURRENCY = Number(process.env.ELEVENLABS_CONCURRENCY ?? 5)

// Map Gemini voice names to ElevenLabs voice IDs.
// Gender alignment follows GEMINI_VOICES in lib/gemini.ts.
const VOICE_MAP: Record<string, string> = {
  // Young / child-appropriate voices (used for character assignment)
  Puck:     'pNInz6obpgDQGcFmaJgB',  // Adam — upbeat, playful (neutral→male)
  Leda:     'EXAVITQu4vr4xnSDxMaL',  // Bella — youthful, bright female
  Zephyr:   'jsCqWAovK2LkecY7zXl4',  // Freya — bright, energetic (neutral→female)
  Fenrir:   'TxGEqnHWrfWFTfGW9XjX',  // Josh — excitable, lively male
  Aoede:    'jBpfuIE2acCO8z3wKNLl',  // Lily — breezy, warm female

  // Narrator / adult voices
  Kore:     '21m00Tcm4TlvDq8ikWAM',  // Rachel — confident, clear female
  Charon:   'ErXwobaYiN019PkySvjV',  // Antoni — calm, informative male
  Sulafat:  'XB0fDUnXU5powFXDhCwa',  // Charlotte — warm, nurturing female
  Achird:   'VR6AewLTigWG4xSOukaG',  // Arnold — friendly, casual male
  Achernar: 'MF3mGyEYCl7XYWbV9V6O',  // Elli — soft, gentle female
  Orus:     'N2lVS1w4EtoT3dr4eOWO',  // Callum — steady, reliable male
  Gacrux:   '2EiwWnXFnvU5JabPnv8n',  // Clyde — mature, measured male
}

type GeminiTtsErrorDetails = {
  status: number
  message: string
}

export class GeminiTtsError extends Error {
  status: number

  constructor({ status, message }: GeminiTtsErrorDetails) {
    super(message)
    this.status = status
  }
}

export function clampPositiveInt(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  const parsed = Math.trunc(value)
  return parsed > 0 ? parsed : fallback
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

function normalizeText(text: string, apiKey?: string): string {
  const normalizedText = typeof text === 'string' ? text.trim() : ''
  if (!normalizedText) {
    throw new GeminiTtsError({
      status: 400,
      message: 'Story content is required to generate audio.',
    })
  }

  if (!apiKey && !process.env.ELEVENLABS_API_KEY) {
    throw new GeminiTtsError({
      status: 503,
      message: 'ELEVENLABS_API_KEY is not configured.',
    })
  }

  return normalizedText
}

// Cached ElevenLabs client instances keyed by API key
const clientCache = new Map<string, ElevenLabsClient>()

function getElevenLabsClient(apiKey?: string): ElevenLabsClient {
  const key = apiKey || process.env.ELEVENLABS_API_KEY || ''
  const cached = clientCache.get(key)
  if (cached) return cached

  const client = new ElevenLabsClient({ apiKey: key || undefined })
  clientCache.set(key, client)
  return client
}

function resolveVoiceId(voiceName: string): string {
  return VOICE_MAP[voiceName] || voiceName
}

function createSemaphore(limit: number) {
  let active = 0
  const queue: Array<() => void> = []

  return async function <T>(fn: () => Promise<T>): Promise<T> {
    if (active >= limit) {
      await new Promise<void>((resolve) => queue.push(resolve))
    }
    active++
    try {
      return await fn()
    } finally {
      active--
      const next = queue.shift()
      if (next) next()
    }
  }
}

async function collectStream(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }
  return Buffer.concat(chunks)
}

async function requestElevenLabsAudio(
  text: string,
  voiceName: string,
  apiKey?: string
): Promise<string> {
  const normalizedText = normalizeText(text, apiKey)
  const client = getElevenLabsClient(apiKey)
  const voiceId = resolveVoiceId(voiceName)

  const stream = await client.textToSpeech.convert(voiceId, {
    text: normalizedText,
    modelId: TTS_MODEL,
    outputFormat: 'pcm_24000',
  })

  const pcmBuffer = await collectStream(stream)
  if (pcmBuffer.byteLength === 0) {
    throw new GeminiTtsError({
      status: 502,
      message: 'ElevenLabs TTS returned empty audio data.',
    })
  }

  const wavBuffer = wrapPcm16ToWav(pcmBuffer)
  return toDataUrl(wavBuffer.toString('base64'), 'audio/wav')
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
      const quote = namedSpeaker[2].trim().replace(/^[""\u201c]|[""\u201d]$/g, '')
      return `${speaker} says, "${quote}".`
    }

    const quotedSpeaker = cleaned.match(/^([A-Za-z][A-Za-z' -]{0,30})\s*["\u201c]\s*(.+?)\s*["\u201d]?$/)
    if (quotedSpeaker) {
      const speaker = quotedSpeaker[1].trim()
      const quote = quotedSpeaker[2].trim().replace(/^[""\u201c]|[""\u201d]$/g, '')
      return `${speaker} says, "${quote}".`
    }

    const pureQuote = cleaned.match(/^["\u201c](.+?)["\u201d]$/)
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

export async function generateVoicePreviewAudioUrl(voiceName: string, text: string, apiKey?: string): Promise<string> {
  return requestElevenLabsAudio(text, voiceName, apiKey)
}

export async function generateNarrationAudioUrl(text: string, apiKey?: string): Promise<string> {
  const voiceName = process.env.GEMINI_TTS_VOICE || DEFAULT_VOICE_NAME
  return requestElevenLabsAudio(text, voiceName, apiKey)
}

export async function generateSceneNarrationAudioUrl(sceneText: string, apiKey?: string): Promise<string> {
  const voiceName = process.env.GEMINI_TTS_VOICE || DEFAULT_VOICE_NAME
  const scriptedScene = toSingleSpeakerNarrationScript(sceneText)
  return requestElevenLabsAudio(scriptedScene, voiceName, apiKey)
}

/**
 * V2: Generate audio for a single subtitle line.
 * Keeps line granularity so downstream subtitle timing can align with real audio durations.
 */
export async function generateSceneLineNarrationAudioUrlV2(lineText: string, apiKey?: string): Promise<string> {
  const voiceName = process.env.GEMINI_TTS_VOICE || DEFAULT_VOICE_NAME
  const scriptedLine = toSingleSpeakerNarrationScript(lineText)
  return requestElevenLabsAudio(scriptedLine, voiceName, apiKey)
}

/**
 * V2: Generate per-line scene narration audio URLs.
 * Uses parallel requests with a semaphore for concurrency control.
 */
export async function generateSceneLineNarrationAudioUrlsV2(lines: string[], apiKey?: string): Promise<string[]> {
  const sem = createSemaphore(clampPositiveInt(TTS_CONCURRENCY, 5))
  return Promise.all(
    lines.map((line, i) =>
      sem(async () => {
        try {
          return await generateSceneLineNarrationAudioUrlV2(line, apiKey)
        } catch (error) {
          console.warn(`[ElevenLabs TTS V2] Line ${i} audio generation failed:`, error)
          throw error
        }
      })
    )
  )
}

export async function generateSceneNarrationAudioUrls(scenes: string[], apiKey?: string): Promise<string[]> {
  const sem = createSemaphore(clampPositiveInt(TTS_CONCURRENCY, 5))
  return Promise.all(
    scenes.map((scene) =>
      sem(async () => {
        try {
          return await generateSceneNarrationAudioUrl(scene, apiKey)
        } catch (error) {
          console.warn('[ElevenLabs TTS] Scene audio generation failed:', error)
          return ''
        }
      })
    )
  )
}
