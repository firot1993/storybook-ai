import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'
import { generateCharacterWithStyleRef, getGeminiErrorResponse } from '@/lib/gemini'
import { createCharacter, listCharacters } from '@/lib/db'
import { resolveApiKey } from '@/lib/api-utils'
import { saveImageFromBase64 } from '@/lib/storage'
import { STYLES } from '@/lib/styles'
import type { Character } from '@/types'

// GET /api/character — List all saved characters
export async function GET(request: NextRequest) {
  const includeNpcRaw = request.nextUrl.searchParams.get('includeNpc')?.toLowerCase()
  const includeNpc = includeNpcRaw === '1' || includeNpcRaw === 'true' || includeNpcRaw === 'yes'
  const characters = await listCharacters({ includeNpc })
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
  const apiKey = resolveApiKey(request)
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
            ageDesc,
            apiKey
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

    // Pick primary style (requested styleId > first successful > error)
    const primaryStyleId =
      (styleId && generationResults.find((r) => r.styleId === styleId && r.dataUrl)) ? styleId :
      (STYLES.find((s) => generationResults.find((r) => r.styleId === s.id && r.dataUrl))?.id ?? '')

    const primaryResult = generationResults.find((r) => r.styleId === primaryStyleId)
    if (!primaryResult?.dataUrl) {
      const { status, message } = getGeminiErrorResponse(new Error('No image returned'))
      return NextResponse.json({ error: message }, { status })
    }

    // Generate a unique ID for storage paths (DB will use its own cuid)
    const charPathId = crypto.randomUUID()

    // Save all generated style images to storage in parallel
    const styleImages: Record<string, string> = {}
    await Promise.all(
      generationResults
        .filter((r) => r.dataUrl)
        .map(async (r) => {
          const url = await saveImageFromBase64(
            r.dataUrl!,
            `characters/${charPathId}/${r.styleId}.jpg`
          )
          styleImages[r.styleId] = url
        })
    )

    const cartoonImage = styleImages[primaryStyleId]

    // Save original uploaded image to storage
    const originalImage = await saveImageFromBase64(
      imageBase64,
      `characters/${charPathId}/original.jpg`
    )

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
      pronoun: dbCharacter.pronoun,
      role: dbCharacter.role,
      createdAt: dbCharacter.createdAt,
    }

    return NextResponse.json({ character })
  } catch (error) {
    console.error('[Character POST] Error:', error)
    const { status, message } = getGeminiErrorResponse(error)
    return NextResponse.json({ error: message }, { status: status === 500 ? 500 : status })
  }
}
