import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { generateContentMock } = vi.hoisted(() => ({
  generateContentMock: vi.fn(),
}))

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: generateContentMock,
    }
  },
}))

import { extractCharacterInfo } from '../gemini-stt'

describe('extractCharacterInfo prompt composition', () => {
  const originalApiKey = process.env.GEMINI_API_KEY

  beforeEach(() => {
    generateContentMock.mockReset()
    process.env.GEMINI_API_KEY = 'test-key'
  })

  afterEach(() => {
    process.env.GEMINI_API_KEY = originalApiKey
  })

  it('uses an English prompt that preserves the spoken language in extracted values', async () => {
    generateContentMock.mockResolvedValue({
      text: '{"name":"小雨","description":"喜欢追月光的小孩"}',
    })

    const result = await extractCharacterInfo('我叫小雨，我喜欢追月光。')
    const prompt = generateContentMock.mock.calls[0]?.[0]?.contents as string

    expect(prompt).toContain("From this voice input, extract the character's name and description.")
    expect(prompt).toContain('Preserve the original spoken language in the extracted text values.')
    expect(prompt).toContain('Voice input: "我叫小雨，我喜欢追月光。"')
    expect(result).toEqual({
      name: '小雨',
      description: '喜欢追月光的小孩',
    })
  })
})
