import { NextRequest, NextResponse } from 'next/server'
import { generateStory, generateStoryImage, getGeminiErrorResponse } from '@/lib/gemini'
import { Story } from '@/types'

function toDataUrl(base64: string, mimeType: string): string {
  return `data:${mimeType};base64,${base64}`
}

// POST /api/story/generate - Generate full story for local mode (session-only persistence)
export async function POST(request: NextRequest) {
  try {
    const {
      characterId,
      characterName,
      characterImage,
      optionIndex,
      optionTitle,
      optionDescription,
      keywords,
      ageGroup,
    } = await request.json()

    if (!characterName || optionIndex === undefined) {
      return NextResponse.json(
        { error: 'Character name and option index are required' },
        { status: 400 }
      )
    }

    const setting = [
      typeof optionTitle === 'string' ? optionTitle : '',
      typeof optionDescription === 'string' ? optionDescription : '',
      typeof keywords === 'string' ? keywords : '',
    ]
      .filter(Boolean)
      .join(' - ')

    let storyText = ''
    try {
      storyText = await generateStory(
        characterName,
        setting || 'A magical bedtime adventure',
        typeof ageGroup === 'string' ? ageGroup : '4-6'
      )
    } catch (error) {
      console.error('Story text generation error:', error)
      const { status, message } = getGeminiErrorResponse(error)
      return NextResponse.json({ error: message }, { status })
    }

    const scenes = storyText.split('\n\n').filter((scene) => scene.trim().length > 0)
    const imageUrls: string[] = []
    const sceneErrors: Array<{ sceneIndex: number; status?: number; message: string }> = []

    for (const [index, scene] of scenes.slice(0, 5).entries()) {
      const characterVisualHint =
        typeof characterName === 'string' && characterName.trim().length > 0
          ? `Main character is ${characterName}. Keep the same look in every scene.`
          : 'Keep the same main character look in every scene.'

      try {
        const imageData = await generateStoryImage(
          scene.substring(0, 220),
          characterVisualHint
        )

        if (imageData) {
          imageUrls.push(toDataUrl(imageData, 'image/png'))
        }
      } catch (error) {
        const apiError = error as { status?: number; message?: string }
        const mapped = getGeminiErrorResponse(error)
        sceneErrors.push({
          sceneIndex: index,
          status: apiError?.status ?? mapped.status,
          message: apiError?.message ?? mapped.message,
        })
        console.error(`Story image generation failed for scene ${index + 1}:`, error)

        // Stop trying additional scene images when hard request-shape/token issues happen.
        if (
          (apiError?.status ?? mapped.status) === 400 &&
          (apiError?.message ?? '').toLowerCase().includes('token')
        ) {
          break
        }
      }
    }

    if (imageUrls.length === 0 && typeof characterImage === 'string' && characterImage.length > 0) {
      imageUrls.push(characterImage)
    }

    let audioUrl = ''
    const elevenLabsKey = process.env.ELEVENLABS_API_KEY || ''

    if (elevenLabsKey) {
      const audioResponse = await fetch('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM', {
        method: 'POST',
        headers: {
          Accept: 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': elevenLabsKey,
        },
        body: JSON.stringify({
          text: storyText,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5,
          },
        }),
      })

      if (audioResponse.ok) {
        const audioBuffer = await audioResponse.arrayBuffer()
        const audioBase64 = Buffer.from(audioBuffer).toString('base64')
        audioUrl = toDataUrl(audioBase64, 'audio/mpeg')
      } else {
        console.warn('ElevenLabs generation failed:', audioResponse.status)
      }
    }

    const storyData = {
      characterId: typeof characterId === 'string' ? characterId : `local-${characterName}`,
      title: `${characterName}'s Adventure`,
      content: storyText,
      images: imageUrls,
      audioUrl,
      createdAt: new Date(),
    }

    const story: Story = {
      id: `local-story-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...storyData,
      createdAt: new Date(),
    }

    return NextResponse.json({
      story,
      ...(process.env.NODE_ENV !== 'production' && sceneErrors.length > 0
        ? { warnings: { sceneImageErrors: sceneErrors } }
        : {}),
    })
  } catch (error) {
    console.error('Error generating story:', error)
    const apiError = error as { status?: number; message?: string }
    const status = typeof apiError?.status === 'number' ? apiError.status : 500
    const message = apiError?.message || 'Internal server error'
    return NextResponse.json(
      {
        error: message,
        ...(process.env.NODE_ENV !== 'production'
          ? {
              details: {
                status,
                message,
              },
            }
          : {}),
      },
      { status }
    )
  }
}
