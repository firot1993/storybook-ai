import fs from 'fs/promises'
import path from 'path'
import { Storage } from '@google-cloud/storage'

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.srt': 'text/plain',
}

const LOCAL_BASE = process.env.STORAGE_LOCAL_PATH || '/tmp/storybook'
const GCS_BUCKET = process.env.GCS_BUCKET

const gcs = GCS_BUCKET ? new Storage() : null
const bucket = gcs && GCS_BUCKET ? gcs.bucket(GCS_BUCKET) : null

/**
 * Ensure directory exists for a file path.
 */
async function ensureDir(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}

/**
 * Get the public GCS URL for a relative path.
 */
export function getPublicUrl(relativePath: string): string {
  return `https://storage.googleapis.com/${GCS_BUCKET}/${relativePath}`
}

/**
 * Save a file to local storage (and GCS when enabled).
 * Returns GCS public URL in production, or local API URL in dev.
 */
export async function saveFile(
  content: Buffer | string,
  relativePath: string
): Promise<string> {
  // Always write locally (FFmpeg and other tools need local files)
  const fullPath = path.join(LOCAL_BASE, relativePath)
  await ensureDir(fullPath)
  await fs.writeFile(fullPath, content)

  // Upload to GCS if enabled
  if (bucket) {
    const file = bucket.file(relativePath)
    const ext = path.extname(relativePath).toLowerCase()
    await file.save(Buffer.isBuffer(content) ? content : Buffer.from(content), {
      resumable: false,
      contentType: MIME_TYPES[ext] || 'application/octet-stream',
    })
    return getPublicUrl(relativePath)
  }

  return `/api/files/${relativePath}`
}

/**
 * Read file as Buffer. Tries local first, falls back to GCS.
 */
export async function readFile(relativePath: string): Promise<Buffer> {
  const localPath = path.join(LOCAL_BASE, relativePath)

  // Try local first
  try {
    return await fs.readFile(localPath)
  } catch {
    // Not found locally — try GCS
  }

  if (bucket) {
    const [contents] = await bucket.file(relativePath).download()
    // Cache locally for subsequent reads
    await ensureDir(localPath)
    await fs.writeFile(localPath, contents)
    return contents
  }

  // Re-throw the original local error if no GCS
  return fs.readFile(localPath)
}

/**
 * Get the absolute local filesystem path (needed by FFmpeg).
 */
export function getLocalPath(relativePath: string): string {
  return path.join(LOCAL_BASE, relativePath)
}

/**
 * Decode a base64 string (with or without data-URL prefix) and save to storage.
 * Returns the public URL for the saved file.
 */
export async function saveImageFromBase64(
  base64Data: string,
  relativePath: string
): Promise<string> {
  // Strip data-URL prefix if present (e.g. "data:image/jpeg;base64,...")
  const raw = base64Data.replace(/^data:[^;]+;base64,/, '')
  const buffer = Buffer.from(raw, 'base64')
  return saveFile(buffer, relativePath)
}

/**
 * Read an image and return its base64-encoded content.
 * Accepts either a data URL (returned as-is without prefix) or a storage URL
 * (reads the file from storage and encodes it).
 */
export async function imageToBase64(urlOrDataUrl: string): Promise<string | undefined> {
  if (!urlOrDataUrl) return undefined

  // Already a data URL — strip prefix and return raw base64
  if (urlOrDataUrl.startsWith('data:')) {
    return urlOrDataUrl.replace(/^data:[^;]+;base64,/, '')
  }

  // Extract relative path from our API URL pattern: /api/files/<relativePath>
  const apiPrefix = '/api/files/'
  const idx = urlOrDataUrl.indexOf(apiPrefix)
  if (idx !== -1) {
    const relativePath = urlOrDataUrl.slice(idx + apiPrefix.length)
    const buf = await readFile(relativePath)
    return buf.toString('base64')
  }

  // GCS URL — extract relative path after bucket name
  if (urlOrDataUrl.includes('storage.googleapis.com') && GCS_BUCKET) {
    const gcsPrefix = `https://storage.googleapis.com/${GCS_BUCKET}/`
    if (urlOrDataUrl.startsWith(gcsPrefix)) {
      const relativePath = urlOrDataUrl.slice(gcsPrefix.length)
      const buf = await readFile(relativePath)
      return buf.toString('base64')
    }
  }

  return undefined
}

/**
 * Check if a file exists locally or in GCS.
 */
export async function fileExists(relativePath: string): Promise<boolean> {
  try {
    await fs.access(path.join(LOCAL_BASE, relativePath))
    return true
  } catch {
    // Not found locally — check GCS
  }

  if (bucket) {
    const [exists] = await bucket.file(relativePath).exists()
    return exists
  }

  return false
}
