import { GoogleGenAI } from '@google/genai'

const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
})

const TTS_MODEL = 'gemini-2.5-flash-preview-tts'
const DEFAULT_VOICE_NAME = 'Kore'
const DEFAULT_CHARACTER_VOICE_NAME = 'Puck'
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
    throw new GeminiTtsError({
      status: typeof apiError?.status === 'number' ? apiError.status : 502,
      message: apiError?.message || 'Gemini TTS request failed.',
    })
  }

  const { data, mimeType } = extractAudioDataPart(response)

  const decodedAudio = Buffer.from(data, 'base64')
  if (decodedAudio.byteLength === 0) {
    throw new GeminiTtsError({
      status: 502,
      message: 'Gemini TTS returned empty audio data.',
    })
  }

  const wavBuffer = normalizeToPlayableWav(decodedAudio, mimeType)
  return toDataUrl(wavBuffer.toString('base64'), 'audio/wav')
}

function toTwoSpeakerScript(sceneText: string): string {
  const lines = sceneText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const scriptedLines = lines.map((line) => {
    const cleaned = line.replace(/\*+/g, '').trim()

    // Keep explicit narrator tags if the model provided them.
    if (/^narrator\s*:/i.test(cleaned)) {
      return `Narrator: ${cleaned.replace(/^narrator\s*:/i, '').trim()}`
    }

    // Any named speaker becomes the character channel (Gemini supports exactly 2 speakers here).
    const namedSpeaker = cleaned.match(/^[A-Za-z][A-Za-z' -]{0,30}\s*:\s*(.+)$/)
    if (namedSpeaker) {
      return `Character: ${namedSpeaker[1].trim()}`
    }

    // Pure quoted lines are treated as spoken character lines.
    const pureQuote = cleaned.match(/^["“](.+?)["”]$/)
    if (pureQuote) {
      return `Character: ${pureQuote[1].trim()}`
    }

    return `Narrator: ${cleaned}`
  })

  if (scriptedLines.length === 0) {
    return 'Narrator: A gentle bedtime moment.'
  }

  return scriptedLines.join('\n')
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
  const narratorVoice = process.env.GEMINI_TTS_NARRATOR_VOICE || process.env.GEMINI_TTS_VOICE || DEFAULT_VOICE_NAME
  const characterVoice = process.env.GEMINI_TTS_CHARACTER_VOICE || DEFAULT_CHARACTER_VOICE_NAME
  const scriptedScene = toTwoSpeakerScript(sceneText)

  try {
    return await requestGeminiAudio(scriptedScene, {
      multiSpeakerVoiceConfig: {
        speakerVoiceConfigs: [
          {
            speaker: 'Narrator',
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: narratorVoice },
            },
          },
          {
            speaker: 'Character',
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: characterVoice },
            },
          },
        ],
      },
    })
  } catch (error) {
    // Graceful fallback to single speaker keeps narration available even if multi-speaker is unavailable.
    console.warn('[Gemini TTS] Multi-speaker generation failed, falling back to single voice:', error)
    return generateNarrationAudioUrl(sceneText)
  }
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
