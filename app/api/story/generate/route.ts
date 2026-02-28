import { NextRequest, NextResponse } from 'next/server'
import { generateStory, generateStoryImage } from '@/lib/gemini'
import { db, storage } from '@/lib/firebase'
import { doc, getDoc, addDoc, collection } from 'firebase/firestore'
import { ref, uploadString, getDownloadURL } from 'firebase/storage'
import { Story } from '@/types'

// POST /api/story/generate - Generate full story with images
export async function POST(request: NextRequest) {
  try {
    const { characterId, optionIndex } = await request.json()

    if (!characterId || optionIndex === undefined) {
      return NextResponse.json(
        { error: 'Character ID and option index are required' },
        { status: 400 }
      )
    }

    // Get character data
    const characterDoc = await getDoc(doc(db, 'characters', characterId))
    if (!characterDoc.exists()) {
      return NextResponse.json(
        { error: 'Character not found' },
        { status: 404 }
      )
    }

    const character = characterDoc.data()
    
    // Get selected option from localStorage (sent in request body ideally)
    // For simplicity, we'll regenerate or you can pass the option in body
    const { keywords, ageGroup } = await request.json()
    
    // Generate story text using Gemini 3 Flash
    const storyText = await generateStory(
      character.name || 'the character',
      keywords,
      ageGroup
    )

    // Split into scenes (simple split by paragraphs)
    const scenes = storyText.split('\n\n').filter(s => s.trim().length > 0)

    // Generate images for each scene using Gemini 3.1 Flash Image
    const imageUrls: string[] = []
    
    for (const scene of scenes.slice(0, 5)) { // Max 5 scenes
      const imageData = await generateStoryImage(
        scene.substring(0, 200), // First 200 chars as prompt
        character.cartoonImage
      )

      if (imageData) {
        // Upload to Firebase Storage
        const imageRef = ref(storage, `stories/${Date.now()}_${imageUrls.length}.jpg`)
        await uploadString(imageRef, imageData, 'base64')
        const imageUrl = await getDownloadURL(imageRef)
        imageUrls.push(imageUrl)
      }
    }

    // Generate audio using ElevenLabs
    const audioResponse = await fetch('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM', {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': process.env.ELEVENLABS_API_KEY || '',
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

    let audioUrl = ''
    if (audioResponse.ok) {
      const audioBuffer = await audioResponse.arrayBuffer()
      const audioBase64 = Buffer.from(audioBuffer).toString('base64')
      const audioRef = ref(storage, `stories/${Date.now()}_audio.mp3`)
      await uploadString(audioRef, audioBase64, 'base64')
      audioUrl = await getDownloadURL(audioRef)
    }

    // Save story to Firestore
    const storyData = {
      characterId,
      title: `${character.name}'s Adventure`,
      content: storyText,
      images: imageUrls,
      audioUrl,
      createdAt: new Date(),
    }

    const docRef = await addDoc(collection(db, 'stories'), storyData)

    const story: Story = {
      id: docRef.id,
      ...storyData,
      createdAt: new Date(),
    }

    return NextResponse.json({ story })
  } catch (error) {
    console.error('Error generating story:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
