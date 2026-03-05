import { describe, it, expect, vi } from 'vitest'

// Mock @google/genai before importing the module under test
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: vi.fn(), countTokens: vi.fn() }
  },
}))

// Mock sharp
vi.mock('sharp', () => ({
  default: () => ({
    resize: () => ({
      jpeg: () => ({
        toBuffer: () => Promise.resolve(Buffer.from('fake')),
      }),
    }),
  }),
}))

import { getGeminiErrorResponse } from '../gemini'

describe('getGeminiErrorResponse', () => {
  it('handles 429 rate limit', () => {
    const result = getGeminiErrorResponse({ status: 429, message: 'Too many requests' })
    expect(result.status).toBe(429)
    expect(result.message).toContain('Rate limit')
  })

  it('handles connect timeout via causeCode', () => {
    const result = getGeminiErrorResponse({
      status: 500,
      message: '',
      cause: { code: 'UND_ERR_CONNECT_TIMEOUT' },
    })
    expect(result.status).toBe(503)
    expect(result.message).toContain('Unable to reach')
  })

  it('handles connect timeout via message text', () => {
    const result = getGeminiErrorResponse({
      status: 500,
      message: 'Request failed due to connect timeout',
    })
    expect(result.status).toBe(503)
    expect(result.message).toContain('Unable to reach')
  })

  it('handles 401 auth error', () => {
    const result = getGeminiErrorResponse({ status: 401, message: 'Unauthorized' })
    expect(result.status).toBe(401)
    expect(result.message).toContain('authentication')
  })

  it('handles 403 auth error', () => {
    const result = getGeminiErrorResponse({ status: 403, message: 'Forbidden' })
    expect(result.status).toBe(403)
    expect(result.message).toContain('authentication')
  })

  it('handles 400 with token count message', () => {
    const result = getGeminiErrorResponse({
      status: 400,
      message: 'The input token count exceeds the model limit',
    })
    expect(result.status).toBe(400)
    expect(result.message).toContain('too large')
  })

  it('handles generic 400 error', () => {
    const result = getGeminiErrorResponse({ status: 400, message: 'Bad input' })
    expect(result.status).toBe(400)
    expect(result.message).toContain('Invalid request')
  })

  it('returns 500 for unknown errors', () => {
    const result = getGeminiErrorResponse({ status: 502, message: 'Bad gateway' })
    expect(result.status).toBe(500)
    expect(result.message).toContain('failed')
  })

  it('handles null/undefined error gracefully', () => {
    const result = getGeminiErrorResponse(null)
    expect(result.status).toBe(500)
    expect(result.message).toBeTruthy()
  })
})
