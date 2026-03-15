import { beforeEach, describe, it, expect, vi } from 'vitest'

const convertMock = vi.fn()

// Mock @elevenlabs/elevenlabs-js before importing the module under test
vi.mock('@elevenlabs/elevenlabs-js', () => ({
  ElevenLabsClient: class {
    textToSpeech = {
      convert: convertMock,
    }
  },
}))

import {
  clampPositiveInt,
  clampTtsSpeed,
  clampUnitInterval,
  looksLikeWav,
  wrapPcm16ToWav,
  normalizeToPlayableWav,
  toDataUrl,
  toSingleSpeakerNarrationScript,
  GeminiTtsError,
  generateVoicePreviewAudioUrl,
} from '../gemini-tts'

beforeEach(() => {
  convertMock.mockReset()
  delete process.env.ELEVENLABS_SPEED
})

describe('GeminiTtsError', () => {
  it('stores status and message', () => {
    const err = new GeminiTtsError({ status: 429, message: 'Rate limited' })
    expect(err.status).toBe(429)
    expect(err.message).toBe('Rate limited')
    expect(err).toBeInstanceOf(Error)
  })
})

describe('clampPositiveInt', () => {
  it('returns the value when it is a positive integer', () => {
    expect(clampPositiveInt(5, 10)).toBe(5)
  })

  it('returns fallback for zero', () => {
    expect(clampPositiveInt(0, 10)).toBe(10)
  })

  it('returns fallback for negative', () => {
    expect(clampPositiveInt(-3, 10)).toBe(10)
  })

  it('truncates floating point to integer', () => {
    expect(clampPositiveInt(3.7, 10)).toBe(3)
  })

  it('returns fallback for NaN', () => {
    expect(clampPositiveInt(NaN, 10)).toBe(10)
  })

  it('returns fallback for Infinity', () => {
    expect(clampPositiveInt(Infinity, 10)).toBe(10)
  })
})

describe('clampTtsSpeed', () => {
  it('returns the value when it is within the supported range', () => {
    expect(clampTtsSpeed(0.9, 1)).toBe(0.9)
  })

  it('clamps too-small values up to the minimum', () => {
    expect(clampTtsSpeed(0.2, 1)).toBe(0.7)
  })

  it('clamps too-large values down to the maximum', () => {
    expect(clampTtsSpeed(2, 1)).toBe(1.2)
  })

  it('returns fallback for NaN', () => {
    expect(clampTtsSpeed(NaN, 0.9)).toBe(0.9)
  })
})

describe('clampUnitInterval', () => {
  it('returns the value when it is already between 0 and 1', () => {
    expect(clampUnitInterval(0.5, 0.2)).toBe(0.5)
  })

  it('interprets percentage-style inputs', () => {
    expect(clampUnitInterval(50, 0.2)).toBe(0.5)
  })

  it('clamps too-small values up to zero', () => {
    expect(clampUnitInterval(-3, 0.2)).toBe(0)
  })

  it('clamps too-large values down to one', () => {
    expect(clampUnitInterval(120, 0.2)).toBe(1)
  })

  it('returns fallback for NaN', () => {
    expect(clampUnitInterval(NaN, 0.15)).toBe(0.15)
  })
})

describe('looksLikeWav', () => {
  it('returns true for a valid WAV header', () => {
    const buf = Buffer.alloc(44)
    buf.write('RIFF', 0)
    buf.write('WAVE', 8)
    expect(looksLikeWav(buf)).toBe(true)
  })

  it('returns false for a too-short buffer', () => {
    expect(looksLikeWav(Buffer.alloc(8))).toBe(false)
  })

  it('returns false for non-WAV data', () => {
    const buf = Buffer.alloc(44)
    buf.write('ID3v', 0)
    expect(looksLikeWav(buf)).toBe(false)
  })
})

describe('wrapPcm16ToWav', () => {
  it('produces a valid WAV header', () => {
    const pcm = Buffer.alloc(100)
    const wav = wrapPcm16ToWav(pcm)
    expect(wav.length).toBe(44 + 100)
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE')
    expect(wav.toString('ascii', 12, 16)).toBe('fmt ')
    expect(wav.toString('ascii', 36, 40)).toBe('data')
  })

  it('sets correct file size in header', () => {
    const pcm = Buffer.alloc(200)
    const wav = wrapPcm16ToWav(pcm)
    expect(wav.readUInt32LE(4)).toBe(36 + 200)
  })

  it('sets correct data size in header', () => {
    const pcm = Buffer.alloc(200)
    const wav = wrapPcm16ToWav(pcm)
    expect(wav.readUInt32LE(40)).toBe(200)
  })

  it('sets PCM format (1)', () => {
    const wav = wrapPcm16ToWav(Buffer.alloc(10))
    expect(wav.readUInt16LE(20)).toBe(1)
  })

  it('sets mono channel', () => {
    const wav = wrapPcm16ToWav(Buffer.alloc(10))
    expect(wav.readUInt16LE(22)).toBe(1)
  })

  it('sets 24000 sample rate', () => {
    const wav = wrapPcm16ToWav(Buffer.alloc(10))
    expect(wav.readUInt32LE(24)).toBe(24000)
  })

  it('sets 16 bits per sample', () => {
    const wav = wrapPcm16ToWav(Buffer.alloc(10))
    expect(wav.readUInt16LE(34)).toBe(16)
  })
})

describe('normalizeToPlayableWav', () => {
  it('returns existing WAV buffer unchanged if mimeType indicates wav', () => {
    const wavBuf = Buffer.alloc(44)
    wavBuf.write('RIFF', 0)
    wavBuf.write('WAVE', 8)
    const result = normalizeToPlayableWav(wavBuf, 'audio/wav')
    expect(result).toBe(wavBuf)
  })

  it('wraps raw PCM data in WAV header', () => {
    const pcm = Buffer.alloc(50)
    const result = normalizeToPlayableWav(pcm)
    expect(result.length).toBe(44 + 50)
    expect(result.toString('ascii', 0, 4)).toBe('RIFF')
  })

  it('wraps even if mimeType is wav but data is not actually WAV', () => {
    const pcm = Buffer.alloc(50)
    const result = normalizeToPlayableWav(pcm, 'audio/wav')
    expect(result.length).toBe(44 + 50)
  })
})

describe('toDataUrl', () => {
  it('creates a valid data URL', () => {
    const result = toDataUrl('aGVsbG8=', 'audio/wav')
    expect(result).toBe('data:audio/wav;base64,aGVsbG8=')
  })
})

describe('generateVoicePreviewAudioUrl', () => {
  it('passes slower voice settings to ElevenLabs by default', async () => {
    convertMock.mockResolvedValue(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Uint8Array.from([1, 2, 3, 4]))
        controller.close()
      },
    }))

    await generateVoicePreviewAudioUrl('Kore', 'Hello world', 'test-key')

    expect(convertMock).toHaveBeenCalledTimes(1)
    expect(convertMock.mock.calls[0]?.[1]).toMatchObject({
      text: 'Hello world',
      modelId: expect.any(String),
      outputFormat: 'pcm_24000',
      voiceSettings: {
        speed: 0.9,
        stability: 0.5,
        style: 0.15,
      },
    })
  })
})

describe('toSingleSpeakerNarrationScript', () => {
  it('returns fallback for empty text', () => {
    expect(toSingleSpeakerNarrationScript('')).toBe('A gentle bedtime moment.')
  })

  it('returns fallback for whitespace-only text', () => {
    expect(toSingleSpeakerNarrationScript('   \n  \n  ')).toBe('A gentle bedtime moment.')
  })

  it('removes narrator prefix', () => {
    const result = toSingleSpeakerNarrationScript('Narrator: The sun was setting.')
    expect(result).toBe('The sun was setting.')
  })

  it('converts named speaker dialogue to narration format', () => {
    const result = toSingleSpeakerNarrationScript('Alice: Hello there!')
    expect(result).toBe('Alice says, "Hello there!".')
  })

  it('handles quoted dialogue format', () => {
    const result = toSingleSpeakerNarrationScript('Bob "Let\'s go adventure!"')
    expect(result).toBe('Bob says, "Let\'s go adventure!".')
  })

  it('passes through plain text unchanged', () => {
    const result = toSingleSpeakerNarrationScript('The stars twinkled brightly.')
    expect(result).toBe('The stars twinkled brightly.')
  })

  it('wraps pure quoted text (normalizes curly quotes to straight)', () => {
    const result = toSingleSpeakerNarrationScript('\u201cWhat a wonderful day!\u201d')
    expect(result).toBe('"What a wonderful day!"')
  })

  it('strips markdown bold markers', () => {
    const result = toSingleSpeakerNarrationScript('**Hello** world')
    expect(result).toBe('Hello world')
  })

  it('handles multi-line input', () => {
    const input = 'Narrator: It was dawn.\nAlice: Good morning!\nThe birds sang.'
    const result = toSingleSpeakerNarrationScript(input)
    const lines = result.split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe('It was dawn.')
    expect(lines[1]).toBe('Alice says, "Good morning!".')
    expect(lines[2]).toBe('The birds sang.')
  })
})
