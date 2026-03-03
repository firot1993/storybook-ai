import fs from 'fs/promises'
import path from 'path'

const LOCAL_BASE = process.env.STORAGE_LOCAL_PATH || '/tmp/storybook'
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

/**
 * Ensure directory exists for a file path.
 */
async function ensureDir(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}

/**
 * Save a file to local storage. Returns the public URL.
 * relativePath example: "videos/proj123/scene-0.mp4"
 */
export async function saveFile(
  content: Buffer | string,
  relativePath: string
): Promise<string> {
  const fullPath = path.join(LOCAL_BASE, relativePath)
  await ensureDir(fullPath)
  await fs.writeFile(fullPath, content)
  return `${BASE_URL}/api/files/${relativePath}`
}

/**
 * Read file as Buffer.
 */
export async function readFile(relativePath: string): Promise<Buffer> {
  return fs.readFile(path.join(LOCAL_BASE, relativePath))
}

/**
 * Get the absolute local filesystem path (needed by FFmpeg).
 */
export function getLocalPath(relativePath: string): string {
  return path.join(LOCAL_BASE, relativePath)
}

/**
 * Delete all files for a project directory.
 */
export async function deleteProjectFiles(projectId: string): Promise<void> {
  const dir = path.join(LOCAL_BASE, 'videos', projectId)
  await fs.rm(dir, { recursive: true, force: true })
}

/**
 * Check if a local file exists.
 */
export async function fileExists(relativePath: string): Promise<boolean> {
  try {
    await fs.access(path.join(LOCAL_BASE, relativePath))
    return true
  } catch {
    return false
  }
}
