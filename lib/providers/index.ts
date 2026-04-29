/**
 * Provider factory and barrel exports.
 *
 * Usage:
 *   import { getTextProvider, type TextProvider } from '@/lib/providers'
 *
 * The active text provider is determined by the TEXT_PROVIDER env var:
 *   - "gemini"   (default)
 *   - "deepseek"
 *
 * Per-request BYOK overrides can supply an apiKey to create a one-off provider.
 */

export type { TextProvider, TextGenerationOptions } from './types'
export { GeminiTextProvider } from './gemini-text'
export { DeepSeekTextProvider } from './deepseek'

import type { TextProvider } from './types'
import { GeminiTextProvider } from './gemini-text'
import { DeepSeekTextProvider } from './deepseek'

export type TextProviderName = 'gemini' | 'deepseek'

/**
 * Resolve which text provider is active from the TEXT_PROVIDER env var.
 */
function resolveProviderName(): TextProviderName {
  const env = (process.env.TEXT_PROVIDER ?? '').trim().toLowerCase()
  if (env === 'deepseek') return 'deepseek'
  return 'gemini'
}

/**
 * Return a TextProvider instance.
 *
 * @param options.provider  — explicit provider name (overrides env)
 * @param options.apiKey    — per-request API key (BYOK)
 * @param options.model     — per-request model override
 */
export function getTextProvider(
  options?: { provider?: TextProviderName; apiKey?: string; model?: string }
): TextProvider {
  const name = options?.provider ?? resolveProviderName()

  switch (name) {
    case 'deepseek':
      return new DeepSeekTextProvider({
        apiKey: options?.apiKey,
        model: options?.model,
      })
    case 'gemini':
    default:
      return new GeminiTextProvider({
        apiKey: options?.apiKey,
        model: options?.model,
      })
  }
}
