import { NextRequest, NextResponse } from 'next/server'
import { getStorybook } from '@/lib/db'
import { generateCompanionSuggestions } from '@/lib/gemini'
import { resolveStorybookCharacters } from '@/lib/storybook-helpers'

// POST /api/storybook/[id]/companions
// 根据故事书主角和关键词，生成 3 个 AI 推荐冒险小伙伴
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const { backgroundKeywords } = await request.json()

    const storybook = await getStorybook(id)
    if (!storybook) return NextResponse.json({ error: 'Storybook not found' }, { status: 404 })

    const { protagonistName } = await resolveStorybookCharacters(storybook)

    const companions = await generateCompanionSuggestions({
      protagonistName,
      backgroundKeywords: backgroundKeywords?.trim() || '奇幻冒险',
      ageRange: storybook.ageRange,
    })

    return NextResponse.json({ companions })
  } catch (error) {
    console.error('[POST /api/storybook/[id]/companions]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
