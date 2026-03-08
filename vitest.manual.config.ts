import { defineConfig } from 'vitest/config'
import fs from 'fs'
import path from 'path'

// Load .env.local into process.env so manual tests can read GEMINI_API_KEY
function loadEnvLocal() {
  const envPath = path.resolve(__dirname, '.env.local')
  if (!fs.existsSync(envPath)) return
  const content = fs.readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex < 0) continue
    const key = trimmed.slice(0, eqIndex).trim()
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

loadEnvLocal()

export default defineConfig({
  test: {
    globals: true,
    include: ['**/*.manual.test.*'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
