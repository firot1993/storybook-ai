/**
 * Gemini-backed TextProvider.
 *
 * Wraps the existing @google/genai SDK so text-only generation calls
 * can go through the provider interface while keeping backward-compat.
 */

import type { TextProvider, TextGenerationOptions } from './types'
import { getGeminiClient } from '../gemini-client'

const DEFAULT_TEXT_MODEL = 'gemini-3-flash-preview'

export class GeminiTextProvider implements TextProvider {
  readonly name = 'gemini'
  private apiKey?: string
  private defaultModel: string

  constructor(options?: { apiKey?: string; model?: string }) {
    this.apiKey = options?.apiKey
    this.defaultModel = options?.model
      || process.env.GEMINI_TEXT_MODEL?.trim()
      || DEFAULT_TEXT_MODEL
  }

  async generateText(prompt: string, options?: TextGenerationOptions): Promise<string> {
    const client = getGeminiClient(this.apiKey)
    const model = options?.model ?? this.defaultModel
    const response = await client.models.generateContent({
      model,
      contents: prompt,
      ...(options?.temperature != null
        ? { config: { temperature: options.temperature } }
        : {}),
    })
    // The SDK provides a convenience `.text` accessor but also stores
    // the raw response in `.candidates[0].content.parts`. We try both
    // to remain compatible with test mocks and the real SDK.
    if (response.text) return response.text

    type CandidateResponse = {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const parts = (response as CandidateResponse).candidates?.[0]?.content?.parts
    if (parts) {
      return parts
        .filter((p) => typeof p.text === 'string')
        .map((p) => p.text)
        .join('')
    }
    return ''
  }
}
