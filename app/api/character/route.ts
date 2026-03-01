import { NextRequest, NextResponse } from 'next/server'
import { generateCharacterImageWithDiagnostics, getGeminiErrorResponse, type GeminiImageDiagnostics } from '@/lib/gemini'
import { Character } from '@/types'
import { createCharacter, listCharacters } from '@/lib/db'

// GET /api/character - List all saved characters
export async function GET() {
  const characters = await listCharacters()
  return NextResponse.json({ characters })
}

// POST /api/character - Generate character from photo and save to DB
export async function POST(request: NextRequest) {
  try {
    const { imageBase64, style } = await request.json()

    if (!imageBase64) {
      return NextResponse.json(
        { error: 'Image is required' },
        { status: 400 }
      )
    }

    let generatedImageData: string | undefined
    let generatedMimeType: string = 'image/png'
    let generationDiagnostics: GeminiImageDiagnostics | undefined
    try {
      const generationResult = await generateCharacterImageWithDiagnostics(imageBase64, style)
      generatedImageData = generationResult.imageData
      generatedMimeType = generationResult.mimeType
      generationDiagnostics = generationResult.diagnostics
    } catch (error) {
      console.error('Gemini character generation error:', error)
      const { status, message } = getGeminiErrorResponse(error)
      return NextResponse.json({ error: message }, { status })
    }

    if (!generatedImageData) {
      console.error('Gemini returned no image data:', generationDiagnostics)
      return NextResponse.json(
        {
          error: 'AI returned no image. Please retry with a clearer photo.',
          ...(process.env.NODE_ENV !== 'production'
            ? { details: generationDiagnostics }
            : {}),
        },
        { status: 502 }
      )
    }

    const originalImage = `data:image/jpeg;base64,${imageBase64}`
    const cartoonImage = `data:${generatedMimeType};base64,${generatedImageData}`

    // Auto-save to DB
    const dbCharacter = await createCharacter({
      originalImage,
      cartoonImage,
    })

    const character: Character = {
      id: dbCharacter.id,
      name: '',
      description: '',
      originalImage,
      cartoonImage,
      createdAt: dbCharacter.createdAt,
    }

    return NextResponse.json({ character })
  } catch (error) {
    console.error('Error generating character:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
