import { NextRequest, NextResponse } from 'next/server'
import { getStorybook } from '@/lib/db'
import { generateSynopsisVersions } from '@/lib/gemini'
import { normalizeLocale } from '@/lib/i18n/shared'
import { resolveStorybookCharacters } from '@/lib/storybook-helpers'
import type { SynopsisOption } from '@/types'

// POST /api/storybook/[id]/synopsis
// 根据故事书配置 + 背景关键词，生成 A/B/C 三版梗概
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const { storyName, backgroundKeywords, ageRange, locale: localeRaw } = await request.json()
    const locale = normalizeLocale(localeRaw)

    if (!backgroundKeywords?.trim()) {
      return NextResponse.json({ error: '请输入背景关键词' }, { status: 400 })
    }

    const storybook = await getStorybook(id)
    if (!storybook) return NextResponse.json({ error: 'Storybook not found' }, { status: 404 })

    const { protagonistName, supportingName } = await resolveStorybookCharacters(storybook, locale)

    const versions = await generateSynopsisVersions({
      storyName: storyName?.trim() || storybook.name,
      protagonistName,
      supportingName,
      backgroundKeywords: backgroundKeywords.trim(),
      ageRange: ageRange || storybook.ageRange,
      locale,
    })

    const labels = locale === 'zh'
      ? { A: '感官体验型', B: '情感互动型', C: '勇气冒险型' }
      : { A: 'Sensory Wonder', B: 'Heartfelt Bond', C: 'Brave Adventure' }

    const options: SynopsisOption[] = [
      { version: 'A', label: labels.A, title: versions.A.title, content: versions.A.content },
      { version: 'B', label: labels.B, title: versions.B.title, content: versions.B.content },
      { version: 'C', label: labels.C, title: versions.C.title, content: versions.C.content },
    ]

    return NextResponse.json({ options })
  } catch (error) {
    console.error('[POST /api/storybook/[id]/synopsis]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
