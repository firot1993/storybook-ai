import { NextResponse } from 'next/server'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { STYLES } from '@/lib/styles'
import { generateStyleExampleCharacter } from '@/lib/gemini'

const PUBLIC_DIR = join(process.cwd(), 'public', 'style-examples')
const STYLE_REFS_DIR = join(process.cwd(), 'public', 'style-refs')

// POST /api/styles/generate-examples
// Generates one example character image per style and saves to public/style-examples/
// Run once during setup; idempotent (skips already-generated styles unless ?force=1)
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const force = searchParams.get('force') === '1'

  const results: Record<string, string> = {}
  const errors: Record<string, string> = {}

  for (const style of STYLES) {
    const outPath = join(PUBLIC_DIR, `${style.id}.jpg`)

    if (!force && existsSync(outPath)) {
      results[style.id] = 'skipped (already exists)'
      continue
    }

    try {
      const refPath = join(STYLE_REFS_DIR, `style${STYLES.indexOf(style) + 1}.jpg`)
      if (!existsSync(refPath)) {
        errors[style.id] = `Reference image not found: ${refPath}`
        continue
      }

      const refBase64 = readFileSync(refPath).toString('base64')
      const { imageData, mimeType } = await generateStyleExampleCharacter(
        style.characterPrompt,
        refBase64,
        style.label
      )

      if (!imageData) {
        errors[style.id] = 'Gemini returned no image'
        continue
      }

      // Always save as JPEG
      const buf = Buffer.from(imageData, 'base64')
      writeFileSync(outPath, buf)
      results[style.id] = `generated (${mimeType})`
      console.log(`[StyleExamples] Generated ${style.id} → ${outPath}`)
    } catch (err) {
      errors[style.id] = err instanceof Error ? err.message : String(err)
      console.error(`[StyleExamples] Error for ${style.id}:`, err)
    }
  }

  return NextResponse.json({ results, errors })
}
