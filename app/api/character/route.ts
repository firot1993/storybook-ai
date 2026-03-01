import { NextRequest, NextResponse } from 'next/server'
import { generateCharacterImageWithDiagnostics, getGeminiErrorResponse, type GeminiImageDiagnostics } from '@/lib/gemini'
import { Character } from '@/types'

function guessImageMimeType(diagnostics?: GeminiImageDiagnostics): string {
  const inlinePart = diagnostics?.partKinds.find((kind) => kind.startsWith('inlineData:'))
  if (!inlinePart) return 'image/png'
  const mimeType = inlinePart.split(':')[1]
  return mimeType || 'image/png'
}

// POST /api/character - Generate character from photo (local mode: session-only persistence)
export async function POST(request: NextRequest) {
  try {
    const { imageBase64 } = await request.json()

    if (!imageBase64) {
      return NextResponse.json(
        { error: 'Image is required' },
        { status: 400 }
      )
    }

    let generatedImageData: string | undefined
    let generationDiagnostics: GeminiImageDiagnostics | undefined
    try {
      const generationResult = await generateCharacterImageWithDiagnostics(imageBase64)
      generatedImageData = generationResult.imageData
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

    const character: Character = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: '',
      originalImage: `data:image/jpeg;base64,${imageBase64}`,
      cartoonImage: `data:${guessImageMimeType(generationDiagnostics)};base64,${generatedImageData}`,
      createdAt: new Date(),
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
