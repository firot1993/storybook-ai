import { NextRequest, NextResponse } from 'next/server'
import { GeminiTtsError, generateVoicePreviewAudioUrl } from '@/lib/gemini-tts'

export async function POST(request: NextRequest) {
  try {
    const { voiceName, name } = await request.json()
    if (!voiceName) {
      return NextResponse.json({ error: 'voiceName is required' }, { status: 400 })
    }
    const charName = typeof name === 'string' && name.trim() ? name.trim() : '小朋友'
    const text = `大家好！我是${charName}，我最喜欢冒险和讲故事了！让我们一起出发吧！`
    const audioDataUrl = await generateVoicePreviewAudioUrl(voiceName, text)
    return NextResponse.json({ audioDataUrl })
  } catch (error) {
    if (error instanceof GeminiTtsError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Voice preview error:', error)
    return NextResponse.json({ error: 'Failed to generate voice preview' }, { status: 500 })
  }
}
