import { NextRequest, NextResponse } from 'next/server'
import { getStorybook } from '@/lib/db'
import { generateSynopsisVersions } from '@/lib/gemini'
import { resolveStorybookCharacters } from '@/lib/storybook-helpers'
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

    const { protagonistName, supportingName } = await resolveStorybookCharacters(storybook)

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
