/**
 * DeepSeek-backed TextProvider.
 *
 * Uses the DeepSeek chat-completions endpoint which is OpenAI-compatible.
 * No extra SDK needed — plain fetch with the standard chat/completions
 * contract.
 *
 * Environment variables:
 *   DEEPSEEK_API_KEY   — required when this provider is active
 *   DEEPSEEK_BASE_URL  — optional, defaults to https://api.deepseek.com
 *   DEEPSEEK_MODEL     — optional, defaults to deepseek-chat
 */

import type { TextProvider, TextGenerationOptions } from './types'

const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_MODEL = 'deepseek-chat'

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string }
  }>
  error?: { message?: string; type?: string }
}

export class DeepSeekTextProvider implements TextProvider {
  readonly name = 'deepseek'
  private apiKey: string
  private baseUrl: string
  private defaultModel: string

  constructor(options?: { apiKey?: string; baseUrl?: string; model?: string }) {
    this.apiKey = options?.apiKey
      || process.env.DEEPSEEK_API_KEY
      || ''
    this.baseUrl = (options?.baseUrl
      || process.env.DEEPSEEK_BASE_URL
      || DEFAULT_BASE_URL).replace(/\/+$/, '')
    this.defaultModel = options?.model
      || process.env.DEEPSEEK_MODEL?.trim()
      || DEFAULT_MODEL
  }

  async generateText(prompt: string, options?: TextGenerationOptions): Promise<string> {
    if (!this.apiKey) {
      throw new Error('DeepSeek API key is not configured. Set DEEPSEEK_API_KEY environment variable.')
    }

    const model = options?.model ?? this.defaultModel
    const url = `${this.baseUrl}/v1/chat/completions`

    const body = {
      model,
      messages: [{ role: 'user' as const, content: prompt }],
      ...(options?.temperature != null ? { temperature: options.temperature } : {}),
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(
        `DeepSeek API error (${response.status}): ${errorText.slice(0, 500)}`
      )
    }

    const data = (await response.json()) as ChatCompletionResponse

    if (data.error) {
      throw new Error(`DeepSeek API error: ${data.error.message ?? JSON.stringify(data.error)}`)
    }

    return data.choices?.[0]?.message?.content ?? ''
  }
}
