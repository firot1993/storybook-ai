import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  decryptByokPayload,
  encryptApiKey,
  encryptByokPayload,
} from '../byok'

describe('BYOK payload helpers', () => {
  const originalEncryptionKey = process.env.BYOK_ENCRYPTION_KEY
  const originalGeminiKey = process.env.GEMINI_API_KEY

  beforeEach(() => {
    process.env.BYOK_ENCRYPTION_KEY = 'test-byok-encryption-key'
    process.env.GEMINI_API_KEY = 'server-gemini-key'
  })

  afterEach(() => {
    process.env.BYOK_ENCRYPTION_KEY = originalEncryptionKey
    process.env.GEMINI_API_KEY = originalGeminiKey
  })

  it('round-trips a payload that contains both Gemini and ElevenLabs keys', () => {
    const encrypted = encryptByokPayload({
      geminiApiKey: ' gemini-test-key ',
      elevenLabsApiKey: ' elevenlabs-test-key ',
    })

    expect(decryptByokPayload(encrypted)).toEqual({
      geminiApiKey: 'gemini-test-key',
      elevenLabsApiKey: 'elevenlabs-test-key',
    })
  })

  it('treats legacy string cookies as Gemini-only BYOK payloads', () => {
    const encrypted = encryptApiKey('legacy-gemini-key')

    expect(decryptByokPayload(encrypted)).toEqual({
      geminiApiKey: 'legacy-gemini-key',
    })
  })
})
