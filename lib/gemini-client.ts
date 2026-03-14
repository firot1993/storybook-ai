import { GoogleGenAI } from '@google/genai'

const clientCache = new Map<string, GoogleGenAI>()

/**
 * Returns a GoogleGenAI instance. Caches by API key to avoid re-creating on every request.
 * If no apiKey is provided, uses the server's GEMINI_API_KEY from env.
 */
export function getGeminiClient(apiKey?: string): GoogleGenAI {
  const key = apiKey || process.env.GEMINI_API_KEY || ''
  const cached = clientCache.get(key)
  if (cached) return cached

  const client = new GoogleGenAI({ apiKey: key })
  clientCache.set(key, client)
  return client
}
