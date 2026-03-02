import { NextRequest, NextResponse } from 'next/server'
import { getStorybook, getCharacter } from '@/lib/db'
import { generateSynopsisVersions } from '@/lib/gemini'
import type { SynopsisOption } from '@/types'

// POST /api/storybook/[id]/synopsis
// 根据故事书配置 + 背景关键词，生成 A/B/C 三版梗概
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const { storyName, backgroundKeywords, ageRange } = await request.json()

    if (!backgroundKeywords?.trim()) {
      return NextResponse.json({ error: '请输入背景关键词' }, { status: 400 })
    }

    const storybook = await getStorybook(id)
    if (!storybook) return NextResponse.json({ error: 'Storybook not found' }, { status: 404 })

    // 获取主角名称
    const protagonistEntry = storybook.characters.find((c) => c.role === 'protagonist')
    const protagonistChar = protagonistEntry?.id ? await getCharacter(protagonistEntry.id) : null
    const protagonistName = protagonistChar?.name || '小主角'

    // 获取所有配角名称（支持多个，可能是AI推荐的直接name，也可能是真实角色id）
    const supportingEntries = storybook.characters.filter((c) => c.role === 'supporting')
    const supportingNames = await Promise.all(
      supportingEntries.map(async (c) => {
        if (c.name) return c.name
        if (c.id) {
          const char = await getCharacter(c.id)
          return char?.name || null
        }
        return null
      })
    )
    const supportingName = supportingNames.filter(Boolean).join('、') || '小伙伴'

    const versions = await generateSynopsisVersions({
      storyName: storyName?.trim() || storybook.name,
      protagonistName,
      supportingName,
      backgroundKeywords: backgroundKeywords.trim(),
      ageRange: ageRange || storybook.ageRange,
    })

    const options: SynopsisOption[] = [
      { version: 'A', label: '感官体验型', title: versions.A.title, content: versions.A.content },
      { version: 'B', label: '情感互动型', title: versions.B.title, content: versions.B.content },
      { version: 'C', label: '勇气冒险型', title: versions.C.title, content: versions.C.content },
    ]

    return NextResponse.json({ options })
  } catch (error) {
    console.error('[POST /api/storybook/[id]/synopsis]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
