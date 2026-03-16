import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import type { NextRequest } from 'next/server'
import type { NextResponse } from 'next/server'

const COOKIE_NAME = 'storybook-byok'
const READY_COOKIE_NAME = 'storybook-byok-ready'
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

export type ByokKeys = {
  geminiApiKey?: string
  elevenLabsApiKey?: string
}

function getEncryptionKey(): Buffer {
  const envKey = process.env.BYOK_ENCRYPTION_KEY
  if (envKey) {
    // Hash the env key to get exactly 32 bytes for AES-256
    return createHash('sha256').update(envKey).digest()
  }
  // Fallback: derive from GEMINI_API_KEY for dev simplicity
  const geminiKey = process.env.GEMINI_API_KEY || 'default-dev-key'
  return createHash('sha256').update(`byok-${geminiKey}`).digest()
}

export function encryptApiKey(key: string): string {
  const encKey = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, encKey, iv, { authTagLength: AUTH_TAG_LENGTH })
  const encrypted = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  // Format: base64(iv + authTag + encrypted)
  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

export function decryptApiKey(encrypted: string): string {
  const encKey = getEncryptionKey()
  const data = Buffer.from(encrypted, 'base64')
  const iv = data.subarray(0, IV_LENGTH)
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, encKey, iv, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(authTag)
  return decipher.update(ciphertext) + decipher.final('utf8')
}

function normalizeOptionalKey(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeByokKeys(payload: ByokKeys): ByokKeys {
  const geminiApiKey = normalizeOptionalKey(payload.geminiApiKey)
  const elevenLabsApiKey = normalizeOptionalKey(payload.elevenLabsApiKey)

  return {
    ...(geminiApiKey ? { geminiApiKey } : {}),
    ...(elevenLabsApiKey ? { elevenLabsApiKey } : {}),
  }
}

function hasByokKeys(payload: ByokKeys | null | undefined): payload is ByokKeys {
  return Boolean(payload?.geminiApiKey || payload?.elevenLabsApiKey)
}

export function parseByokPayload(raw: string): ByokKeys {
  const trimmed = raw.trim()
  if (!trimmed) return {}

  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return normalizeByokKeys(parsed as ByokKeys)
    }
  } catch {
    // Legacy cookie payloads stored the raw Gemini key string directly.
  }

  return normalizeByokKeys({ geminiApiKey: trimmed })
}

export function encryptByokPayload(payload: ByokKeys): string {
  return encryptApiKey(JSON.stringify(normalizeByokKeys(payload)))
}

export function decryptByokPayload(encrypted: string): ByokKeys {
  return parseByokPayload(decryptApiKey(encrypted))
}

export function getByokKeys(request: NextRequest): ByokKeys | null {
  const cookie = request.cookies.get(COOKIE_NAME)?.value
  if (!cookie) return null
  try {
    const payload = decryptByokPayload(cookie)
    return hasByokKeys(payload) ? payload : null
  } catch {
    return null
  }
}

export function getByokKey(request: NextRequest): string | null {
  return getByokKeys(request)?.geminiApiKey ?? null
}

export function getByokElevenLabsKey(request: NextRequest): string | null {
  return getByokKeys(request)?.elevenLabsApiKey ?? null
}

export function setByokCookie(response: NextResponse, payload: ByokKeys): void {
  const normalized = normalizeByokKeys(payload)
  const encrypted = encryptByokPayload(normalized)
  const hasCompletePayload = Boolean(normalized.geminiApiKey && normalized.elevenLabsApiKey)

  response.cookies.set(COOKIE_NAME, encrypted, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  })
  response.cookies.set(READY_COOKIE_NAME, hasCompletePayload ? '1' : '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: hasCompletePayload ? 60 * 60 * 24 * 30 : 0,
    path: '/',
  })
}

export function clearByokCookie(response: NextResponse): void {
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
  response.cookies.set(READY_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
}

export { COOKIE_NAME as BYOK_COOKIE_NAME, READY_COOKIE_NAME as BYOK_READY_COOKIE_NAME }
