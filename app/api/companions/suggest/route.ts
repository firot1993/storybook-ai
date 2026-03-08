import { NextRequest, NextResponse } from 'next/server'
import { getCharacter } from '@/lib/db'
import { generateCompanionSuggestions } from '@/lib/gemini'
import { normalizeLocale } from '@/lib/i18n/shared'

// POST /api/companions/suggest
// 根据主角信息生成 3 个 AI 推荐冒险小伙伴（不需要故事书ID）
export async function POST(request: NextRequest) {
  try {
    const { protagonistId, backgroundKeywords, ageRange, locale: localeRaw } = await request.json()
    const locale = normalizeLocale(localeRaw)

    const protagonistChar = protagonistId ? await getCharacter(protagonistId) : null
    const protagonistName = protagonistChar?.name || (locale === 'zh' ? '小主角' : 'Little hero')
    const protagonistPronoun = protagonistChar?.pronoun || ''
    const protagonistRole = protagonistChar?.role || ''

    const companions = await generateCompanionSuggestions({
      protagonistName,
      backgroundKeywords: backgroundKeywords?.trim() || (locale === 'zh' ? '奇幻冒险' : 'fantasy adventure'),
      ageRange: ageRange || '4-6',
      locale,
      protagonistPronoun,
      protagonistRole,
    })

    return NextResponse.json({ companions })
  } catch (error) {
    console.error('[POST /api/companions/suggest]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
