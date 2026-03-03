import { NextRequest, NextResponse } from 'next/server'
import { getCharacter } from '@/lib/db'
import { generateCompanionSuggestions } from '@/lib/gemini'

// POST /api/companions/suggest
// 根据主角信息生成 3 个 AI 推荐冒险小伙伴（不需要故事书ID）
export async function POST(request: NextRequest) {
  try {
    const { protagonistId, backgroundKeywords, ageRange } = await request.json()

    const protagonistChar = protagonistId ? await getCharacter(protagonistId) : null
    const protagonistName = protagonistChar?.name || '小主角'

    const companions = await generateCompanionSuggestions({
      protagonistName,
      backgroundKeywords: backgroundKeywords?.trim() || '奇幻冒险',
      ageRange: ageRange || '4-6',
    })

    return NextResponse.json({ companions })
  } catch (error) {
    console.error('[POST /api/companions/suggest]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
