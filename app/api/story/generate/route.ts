import { NextRequest, NextResponse } from 'next/server'
import { generateStory, generateStoryImage, getGeminiErrorResponse } from '@/lib/gemini'
import { Story } from '@/types'
import { createStory } from '@/lib/db'

function toDataUrl(base64: string, mimeType: string): string {
  return `data:${mimeType};base64,${base64}`
}

// POST /api/story/generate - Generate full story (supports 1-3 characters)
export async function POST(request: NextRequest) {
  try {
    const {
      characterIds,
      characterNames,
      characterImages,
      characterDescriptions,
      optionIndex,
      optionTitle,
      optionDescription,
      keywords,
      ageGroup,
      // Legacy single-character fields
      characterId,
      characterName,
      characterImage,
    } = await request.json()

    // Normalize to arrays, supporting both new multi-char and legacy single-char
    const names: string[] = Array.isArray(characterNames) && characterNames.length > 0
      ? characterNames
      : (typeof characterName === 'string' && characterName.trim() ? [characterName] : [])
    const ids: string[] = Array.isArray(characterIds) && characterIds.length > 0
      ? characterIds
      : (typeof characterId === 'string' ? [characterId] : [])
    const images: string[] = Array.isArray(characterImages) && characterImages.length > 0
      ? characterImages
      : (typeof characterImage === 'string' && characterImage.length > 0 ? [characterImage] : [])

    if (names.length === 0 || optionIndex === undefined) {
      return NextResponse.json(
        { error: 'Character name(s) and option index are required' },
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
        names,
        setting || 'A magical bedtime adventure',
        typeof ageGroup === 'string' ? ageGroup : '4-6',
        characterDescriptions
      )
    } catch (error) {
      console.error('Story text generation error:', error)
      const { status, message } = getGeminiErrorResponse(error)
      return NextResponse.json({ error: message }, { status })
    }

    const scenes = storyText.split('\n\n').filter((scene) => scene.trim().length > 0)
    const imageUrls: string[] = []
    const sceneErrors: Array<{ sceneIndex: number; status?: number; message: string }> = []

    // Extract raw base64 from character image data URLs
    const characterImagesBase64: string[] = images
      .map((img) => {
        if (typeof img === 'string' && img.includes('base64,')) {
          return img.split('base64,')[1]
        }
        return undefined
      })
      .filter((x): x is string => !!x)

    for (const [index, scene] of scenes.slice(0, 5).entries()) {
      const characterVisualHint = names.length === 1
        ? `Main character is ${names[0]}. Keep the same look in every scene.`
        : `Main characters are ${names.join(', ')}. Keep each character's look consistent in every scene.`

      try {
        const imageData = await generateStoryImage(
          scene.substring(0, 220),
          characterVisualHint,
          characterImagesBase64.length > 0 ? characterImagesBase64 : undefined
        )

        if (imageData) {
          imageUrls.push(toDataUrl(imageData.data, imageData.mimeType))
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

        if (
          (apiError?.status ?? mapped.status) === 400 &&
          (apiError?.message ?? '').toLowerCase().includes('token')
        ) {
          break
        }
      }
    }

    if (imageUrls.length === 0 && images.length > 0) {
      imageUrls.push(images[0])
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

    // Build title from character names
    const title = names.length === 1
      ? `${names[0]}'s Adventure`
      : names.length === 2
        ? `${names[0]} & ${names[1]}'s Adventure`
        : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}'s Adventure`

    // Auto-save to DB
    let dbStory
    if (ids.length > 0) {
      try {
        dbStory = await createStory({
          characterIds: ids,
          title,
          content: storyText,
          images: imageUrls,
          audioUrl,
        })
      } catch (dbError) {
        console.warn('Failed to save story to DB:', dbError)
      }
    }

    const story: Story = {
      id: dbStory?.id ?? `local-story-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      characterIds: ids,
      title,
      content: storyText,
      images: imageUrls,
      audioUrl,
      createdAt: dbStory?.createdAt ?? new Date(),
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
