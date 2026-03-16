import type { NextRequest } from 'next/server'
import { getByokElevenLabsKey, getByokKey } from './byok'

/**
 * Resolve the Gemini API key from the request.
 * Returns the BYOK key if present (decrypted from cookie), or undefined to use the server default.
 */
export function resolveApiKey(request: NextRequest): string | undefined {
  return getByokKey(request) ?? undefined
}

export function resolveGeminiApiKey(request: NextRequest): string | undefined {
  return resolveApiKey(request)
}

export function resolveElevenLabsApiKey(request: NextRequest): string | undefined {
  return getByokElevenLabsKey(request) ?? undefined
}
