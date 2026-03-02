import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'
import { generateCharacterWithStyleRef, getGeminiErrorResponse } from '@/lib/gemini'
import { createCharacter, listCharacters } from '@/lib/db'
import { STYLES } from '@/lib/styles'
import type { Character } from '@/types'

// GET /api/character — List all saved characters
export async function GET() {
  const characters = await listCharacters()
  return NextResponse.json({ characters })
}

function loadStyleRefBase64(referenceImageUrl: string): string {
  try {
    const filePath = join(process.cwd(), 'public', referenceImageUrl)
    const buf = readFileSync(filePath)
    return buf.toString('base64')
  } catch {
    return ''
  }
}

// POST /api/character — Generate character portraits in ALL 5 styles and save to DB
export async function POST(request: NextRequest) {
  try {
    const {
      imageBase64,
      name = '',
      styleId = '',
      age,
    } = await request.json()

    if (!imageBase64) {
      return NextResponse.json(
        { error: 'imageBase64 is required' },
        { status: 400 }
      )
    }

    const ageDesc = typeof age === 'number' && age > 0 ? `${age}-year-old` : ''

    // Load all 5 style reference images from disk (server-side, no HTTP)
    const styleRefs = STYLES.map((s) => ({
      styleId: s.id,
      ref: loadStyleRefBase64(s.referenceImageUrl),
    }))

    // Generate all 5 style portraits in parallel
    const generationResults = await Promise.all(
      STYLES.map(async (s) => {
        const styleRefBase64 = styleRefs.find((r) => r.styleId === s.id)?.ref ?? ''
        try {
          const result = await generateCharacterWithStyleRef(
            imageBase64,
            styleRefBase64,
            s.characterPrompt,
            ageDesc
          )
          if (!result.imageData) return { styleId: s.id, dataUrl: null }
          return {
            styleId: s.id,
            dataUrl: `data:${result.mimeType};base64,${result.imageData}`,
          }
        } catch (err) {
          console.error(`[Character] Style ${s.id} generation failed:`, err)
          return { styleId: s.id, dataUrl: null }
        }
      })
    )

    // Build styleImages map
    const styleImages: Record<string, string> = {}
    for (const r of generationResults) {
      if (r.dataUrl) styleImages[r.styleId] = r.dataUrl
    }

    // Pick primary style for cartoonImage (requested styleId > first successful > error)
    const primaryStyleId =
      (styleId && styleImages[styleId]) ? styleId :
      (STYLES.find((s) => styleImages[s.id])?.id ?? '')

    const cartoonImage = styleImages[primaryStyleId]

    if (!cartoonImage) {
      const { status, message } = getGeminiErrorResponse(new Error('No image returned'))
      return NextResponse.json({ error: message }, { status })
    }

    const originalImage = `data:image/jpeg;base64,${imageBase64}`

    const dbCharacter = await createCharacter({
      name: name.trim(),
      originalImage,
      cartoonImage,
      styleImages,
      style: primaryStyleId,
      age: typeof age === 'number' ? age : null,
    })

    const character: Character = {
      id: dbCharacter.id,
      name: dbCharacter.name,
      originalImage,
      cartoonImage,
      styleImages,
      style: primaryStyleId,
      age: dbCharacter.age ?? undefined,
      voiceName: dbCharacter.voiceName,
      createdAt: dbCharacter.createdAt,
    }

    return NextResponse.json({ character })
  } catch (error) {
    console.error('[Character POST] Error:', error)
    const { status, message } = getGeminiErrorResponse(error)
    return NextResponse.json({ error: message }, { status: status === 500 ? 500 : status })
  }
}
