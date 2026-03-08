import { NextRequest, NextResponse } from 'next/server'
import { getStory, getStorybook } from '@/lib/db'
import { generateSynopsisVersions } from '@/lib/gemini'
import { normalizeLocale } from '@/lib/i18n/shared'
import { resolveStorybookCharacters } from '@/lib/storybook-helpers'
import { buildPreviousStoryExcerpt, normalizeStoryChoices } from '@/lib/story-scenes'
import type { SynopsisOption } from '@/types'

// POST /api/storybook/[id]/synopsis
// 根据故事书配置 + 背景关键词，生成 A/B/C 三版梗概
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const { storyName, backgroundKeywords, ageRange, fromStoryId, locale: localeRaw } = await request.json()
    const locale = normalizeLocale(localeRaw)

    if (!backgroundKeywords?.trim()) {
      return NextResponse.json({ error: '请输入背景关键词' }, { status: 400 })
    }

    const storybook = await getStorybook(id)
    if (!storybook) return NextResponse.json({ error: 'Storybook not found' }, { status: 404 })

    let previousStoryContext: { title: string; content: string; choices: string[] } | undefined
    const previousStoryId = typeof fromStoryId === 'string' ? fromStoryId.trim() : ''
    const normalizedKeywords = backgroundKeywords.trim()
    if (previousStoryId) {
      const previousStory = await getStory(previousStoryId)
      if (!previousStory) {
        return NextResponse.json({ error: 'Previous story not found' }, { status: 400 })
      }
      if (previousStory.storybookId !== id) {
        return NextResponse.json({ error: 'Previous story does not belong to this storybook' }, { status: 400 })
      }

      previousStoryContext = {
        title: previousStory.title || '',
        content: buildPreviousStoryExcerpt(previousStory.content || ''),
        choices: normalizeStoryChoices(previousStory.content || ''),
      }

      if (previousStoryContext.choices.length === 0) {
        return NextResponse.json({ error: 'Previous story has no continuation choices' }, { status: 400 })
      }

      const matchesPreviousChoice = previousStoryContext.choices.some(
        (choice) => choice.toLocaleLowerCase() === normalizedKeywords.toLocaleLowerCase()
      )
      if (!matchesPreviousChoice) {
        return NextResponse.json({ error: 'Background keywords must match a previous episode choice' }, { status: 400 })
      }
    }

    const { protagonistName, supportingName, protagonistPronoun, protagonistRole } = await resolveStorybookCharacters(storybook, locale)

    const versions = await generateSynopsisVersions({
      storyName: storyName?.trim() || storybook.name,
      protagonistName,
      supportingName,
      backgroundKeywords: normalizedKeywords,
      ageRange: ageRange || storybook.ageRange,
      locale,
      protagonistPronoun,
      protagonistRole,
      previousStoryTitle: previousStoryContext?.title,
      previousStoryContent: previousStoryContext?.content,
      previousStoryChoices: previousStoryContext?.choices,
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
