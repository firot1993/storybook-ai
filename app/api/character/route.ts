import { NextRequest, NextResponse } from 'next/server'
import { db, storage } from '@/lib/firebase'
import { generateCharacterImage } from '@/lib/gemini'
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore'
import { ref, uploadString, getDownloadURL } from 'firebase/storage'
import { Character } from '@/types'

// POST /api/character - Generate character from photo
export async function POST(request: NextRequest) {
  try {
    const { imageBase64 } = await request.json()

    if (!imageBase64) {
      return NextResponse.json(
        { error: 'Image is required' },
        { status: 400 }
      )
    }

    // 1. Generate cartoon character using Gemini 3.1 Flash Image
    const generatedImageData = await generateCharacterImage(imageBase64)

    if (!generatedImageData) {
      return NextResponse.json(
        { error: 'Failed to generate character' },
        { status: 500 }
      )
    }

    // 2. Upload original image to Firebase Storage
    const originalRef = ref(storage, `characters/${Date.now()}_original.jpg`)
    await uploadString(originalRef, imageBase64, 'base64')
    const originalUrl = await getDownloadURL(originalRef)

    // 3. Upload generated image to Firebase Storage
    const cartoonRef = ref(storage, `characters/${Date.now()}_cartoon.jpg`)
    await uploadString(cartoonRef, generatedImageData, 'base64')
    const cartoonUrl = await getDownloadURL(cartoonRef)

    // 4. Save to Firestore
    const characterData = {
      name: '',
      originalImage: originalUrl,
      cartoonImage: cartoonUrl,
      createdAt: new Date(),
    }

    const docRef = await addDoc(collection(db, 'characters'), characterData)

    const character: Character = {
      id: docRef.id,
      ...characterData,
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
