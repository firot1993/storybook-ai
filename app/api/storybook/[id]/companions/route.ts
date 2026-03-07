import { NextRequest, NextResponse } from 'next/server'
import { getStorybook } from '@/lib/db'
import { generateCompanionSuggestions } from '@/lib/gemini'
import { normalizeLocale } from '@/lib/i18n/shared'
import { resolveStorybookCharacters } from '@/lib/storybook-helpers'

// POST /api/storybook/[id]/companions
// 根据故事书主角和关键词，生成 3 个 AI 推荐冒险小伙伴
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const { backgroundKeywords, locale: localeRaw } = await request.json()
    const locale = normalizeLocale(localeRaw)

    const storybook = await getStorybook(id)
    if (!storybook) return NextResponse.json({ error: 'Storybook not found' }, { status: 404 })

    const { protagonistName } = await resolveStorybookCharacters(storybook, locale)

    const companions = await generateCompanionSuggestions({
      protagonistName,
      backgroundKeywords: backgroundKeywords?.trim() || (locale === 'zh' ? '奇幻冒险' : 'fantasy adventure'),
      ageRange: storybook.ageRange,
      locale,
    })

    return NextResponse.json({ companions })
  } catch (error) {
    console.error('[POST /api/storybook/[id]/companions]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
