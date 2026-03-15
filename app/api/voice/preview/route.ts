import { NextRequest, NextResponse } from 'next/server'
import { GeminiTtsError, generateVoicePreviewAudioUrl } from '@/lib/gemini-tts'

function getPreviewText(charName: string, locale?: string): string {
  if (locale === 'en') {
    return `Hi everyone! I'm ${charName}, and I love adventures and telling stories! Let's go on one together!`
  }
  return `大家好！我是${charName}，我最喜欢冒险和讲故事了！让我们一起出发吧！`
}

export async function POST(request: NextRequest) {
  try {
    const { voiceName, name, locale } = await request.json()
    if (!voiceName) {
      return NextResponse.json({ error: 'voiceName is required' }, { status: 400 })
    }
    const charName = typeof name === 'string' && name.trim() ? name.trim() : (locale === 'en' ? 'little one' : '小朋友')
    const text = getPreviewText(charName, locale)
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
