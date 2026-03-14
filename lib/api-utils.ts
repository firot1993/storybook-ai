import type { NextRequest } from 'next/server'
import { getByokKey } from './byok'

/**
 * Resolve the Gemini API key from the request.
 * Returns the BYOK key if present (decrypted from cookie), or undefined to use the server default.
 */
export function resolveApiKey(request: NextRequest): string | undefined {
  return getByokKey(request) ?? undefined
}
