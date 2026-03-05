import { NextRequest, NextResponse } from 'next/server'
import { createCharacter, createStory, getCharacter, getStorybook, updateStorybook } from '@/lib/db'
import { generateCompanionCharacterCartoon } from '@/lib/banana-img'
import { generateStoryFromSynopsis, generateStoryCoverImage } from '@/lib/gemini'
import { resolveStorybookCharacters, resolveStorybookStyle } from '@/lib/storybook-helpers'
import type { Story, StorybookCharacter } from '@/types'

async function buildNpcCharactersWithAssets(
  npcs: Array<{ name: string; description: string }>,
  existingNameSet: Set<string>,
  styleId: string,
  styleDesc: string
): Promise<StorybookCharacter[]> {
  const additions: StorybookCharacter[] = []
  const seen = new Set(existingNameSet)

  for (const npc of npcs) {
    const name = (npc.name ?? '').trim().slice(0, 30)
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const description = (npc.description ?? '').trim().slice(0, 120)
    let npcCharacterId = ''
    try {
      const image = await generateCompanionCharacterCartoon(
        name,
        description || `${name}，故事中的小伙伴`,
        styleDesc
      )
      const dataUrl = `data:${image.mimeType};base64,${image.data}`
      const created = await createCharacter({
        name,
        cartoonImage: dataUrl,
        styleImages: { [styleId]: dataUrl },
        style: styleDesc,
      })
      npcCharacterId = created.id
    } catch (error) {
      console.warn(`[Story NPC] Failed to generate image for ${name}:`, error)
    }

    additions.push({
      id: npcCharacterId,
      name,
      role: 'supporting',
      description,
      isNpc: true,
    })
  }

  return additions
}

// POST /api/storybook/[id]/story
// 从选定梗概生成完整童话 + 封面插画，保存为故事书的一个章节
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const { storyName, selectedSynopsis, synopsisVersion, theme, ageRange } = await request.json()

    if (!selectedSynopsis?.trim()) {
      return NextResponse.json({ error: '请先选择一版梗概' }, { status: 400 })
    }

    const storybook = await getStorybook(id)
    if (!storybook) return NextResponse.json({ error: 'Storybook not found' }, { status: 404 })

    const { protagonistName, supportingName, protagonistChar } = await resolveStorybookCharacters(storybook)
    const styleDesc = resolveStorybookStyle(storybook)

    const title = storyName?.trim() || storybook.name

    // 并行生成故事文本 + 封面图
    const protagonistStyleImages = protagonistChar?.styleImages
      ? JSON.parse(protagonistChar.styleImages as unknown as string) as Record<string, string>
      : {}
    const protagonistImageUrl =
      protagonistStyleImages[storybook.styleId] || protagonistChar?.cartoonImage || ''
    const protagonistImageBase64 = protagonistImageUrl
      ? protagonistImageUrl.replace(/^data:[^;]+;base64,/, '')
      : undefined

    const [storyResult, coverResult] = await Promise.all([
      generateStoryFromSynopsis({
        storyName: title,
        protagonistName,
        supportingName,
        synopsis: selectedSynopsis.trim(),
        ageRange: ageRange || storybook.ageRange,
        styleDesc,
        theme: theme ?? '探索与友谊',
      }),
      generateStoryCoverImage({
        synopsis: selectedSynopsis.trim(),
        protagonistName,
        styleDesc,
        characterImageBase64: protagonistImageBase64,
      }).catch(() => undefined),
    ])

    const { story: storyText, choices, npcs } = storyResult
    const mainImage = coverResult
      ? `data:${coverResult.mimeType};base64,${coverResult.data}`
      : ''

    const existingNames = new Set<string>()
    for (const entry of storybook.characters) {
      if (entry.name?.trim()) {
        existingNames.add(entry.name.trim().toLowerCase())
        continue
      }
      if (entry.id) {
        const char = await getCharacter(entry.id)
        if (char?.name?.trim()) existingNames.add(char.name.trim().toLowerCase())
      }
    }
    existingNames.add(protagonistName.trim().toLowerCase())
    supportingName
      .split(/[、,，/]/)
      .map((n) => n.trim().toLowerCase())
      .filter(Boolean)
      .forEach((n) => existingNames.add(n))

    const npcCharacterAdditions = await buildNpcCharactersWithAssets(
      npcs,
      existingNames,
      storybook.styleId,
      styleDesc
    )
    if (npcCharacterAdditions.length > 0) {
      await updateStorybook(id, {
        characters: [...storybook.characters, ...npcCharacterAdditions],
      })
    }

    // Embed choices in content so the play page can display interactive options
    const contentWithChoices = choices.length > 0
      ? `${storyText}\n<!--CHOICES:${JSON.stringify(choices)}-->`
      : storyText

    // 保存章节到数据库
    const characterIds = storybook.characters
      .filter((c: { id: string }) => c.id)
      .map((c: { id: string }) => c.id)
    const dbStory = await createStory({
      storybookId: id,
      characterIds,
      title,
      synopsis: selectedSynopsis.trim(),
      content: contentWithChoices,
      mainImage,
      images: [],
      status: 'complete',
    })

    const story: Story = {
      id: dbStory.id,
      storybookId: id,
      characterIds,
      title,
      synopsis: selectedSynopsis.trim(),
      content: contentWithChoices,
      mainImage,
      status: 'complete',
      images: [],
      audioUrl: '',
      createdAt: dbStory.createdAt,
      updatedAt: dbStory.updatedAt,
    }

    return NextResponse.json({
      story,
      synopsisVersion: synopsisVersion ?? 'A',
      discoveredNpcs: npcCharacterAdditions,
    })
  } catch (error) {
    console.error('[POST /api/storybook/[id]/story]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
