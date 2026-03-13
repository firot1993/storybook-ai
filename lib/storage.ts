import fs from 'fs/promises'
import path from 'path'
import { Storage } from '@google-cloud/storage'

const LOCAL_BASE = process.env.STORAGE_LOCAL_PATH || '/tmp/storybook'
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
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
    await file.save(Buffer.isBuffer(content) ? content : Buffer.from(content), {
      resumable: false,
    })
    return getPublicUrl(relativePath)
  }

  return `${BASE_URL}/api/files/${relativePath}`
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
