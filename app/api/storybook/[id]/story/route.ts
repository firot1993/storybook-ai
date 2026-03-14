import { NextRequest, NextResponse } from 'next/server'
import { createCharacter, createStory, getCharacter, getStory, getStorybook, updateStorybook } from '@/lib/db'
import { generateStoryWithAssets } from '@/lib/gemini'
import { resolveApiKey } from '@/lib/api-utils'
import { normalizeLocale } from '@/lib/i18n/shared'
import { resolveStorybookCharacters, resolveStorybookStyle } from '@/lib/storybook-helpers'
import { buildPreviousStoryExcerpt, normalizeStoryChoices } from '@/lib/story-scenes'
import { imageToBase64, saveImageFromBase64 } from '@/lib/storage'
import type { Story, StorybookCharacter } from '@/types'

type NpcWithImage = StorybookCharacter & { image?: string }

async function buildNpcCharactersWithAssets(
  npcs: Array<{ name: string; description: string }>,
  existingNameSet: Set<string>,
  styleId: string,
  styleDesc: string,
  preGeneratedImages: Map<string, { data: string; mimeType: string }>
): Promise<NpcWithImage[]> {
  const additions: NpcWithImage[] = []
  const seen = new Set(existingNameSet)

  for (const npc of npcs) {
    const name = (npc.name ?? '').trim().slice(0, 30)
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const description = (npc.description ?? '').trim().slice(0, 120)
    let npcCharacterId = ''
    let npcImage: string | undefined

    // Look up pre-generated image by NPC name (try exact match, then case-insensitive)
    const preGenImage = preGeneratedImages.get(name)
      ?? Array.from(preGeneratedImages.entries()).find(
        ([k]) => k.toLowerCase() === key
      )?.[1]

    if (preGenImage) {
      const npcPathId = crypto.randomUUID()
      try {
        const imageUrl = await saveImageFromBase64(
          preGenImage.data,
          `characters/${npcPathId}/${styleId}.jpg`
        )
        npcImage = imageUrl
        const created = await createCharacter({
          name,
          cartoonImage: imageUrl,
          styleImages: { [styleId]: imageUrl },
          style: styleDesc,
        })
        npcCharacterId = created.id
      } catch (error) {
        console.warn(`[Story NPC] Failed to save character for ${name}:`, error)
      }
    }

    additions.push({
      id: npcCharacterId,
      name,
      role: 'supporting',
      description,
      isNpc: true,
      image: npcImage,
    })
  }

  return additions
}

// POST /api/storybook/[id]/story
// 从选定梗概生成完整童话 + 封面插画，保存为故事书的一个章节
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const apiKey = resolveApiKey(request)
  try {
    const {
      storyName,
      selectedSynopsis,
      synopsisVersion,
      theme,
      ageRange,
      fromStoryId,
      locale: localeRaw,
    } = await request.json()
    const locale = normalizeLocale(localeRaw)

    if (!selectedSynopsis?.trim()) {
      return NextResponse.json({ error: '请先选择一版梗概' }, { status: 400 })
    }

    const storybook = await getStorybook(id)
    if (!storybook) return NextResponse.json({ error: 'Storybook not found' }, { status: 404 })

    let previousStoryContext: { title: string; content: string; choices: string[] } | undefined
    const previousStoryId = typeof fromStoryId === 'string' ? fromStoryId.trim() : ''
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
    }

    const { protagonistName, supportingName, protagonistChar, protagonistPronoun, protagonistRole } = await resolveStorybookCharacters(storybook, locale)
    const styleDesc = resolveStorybookStyle(storybook)

    // Check if the storybook already has a named supporting character
    const hasSupportingCharacter = storybook.characters.some(
      (c) => c.role === 'supporting' && !c.isNpc
    )
    const needsSupportingCharacter = !hasSupportingCharacter

    const title = storyName?.trim() || storybook.name

    // Single interleaved call: story text + cover image + NPC portraits
    const protagonistStyleImages = (protagonistChar?.styleImages ?? {}) as Record<string, string>
    const protagonistImageUrl =
      protagonistStyleImages[storybook.styleId] || protagonistChar?.cartoonImage || ''
    const protagonistImageBase64 = protagonistImageUrl
      ? await imageToBase64(protagonistImageUrl)
      : undefined

    const {
      story: storyText,
      choices,
      npcs,
      coverImage,
      npcImages,
      supporting,
    } = await generateStoryWithAssets({
      storyName: title,
      protagonistName,
      supportingName,
      synopsis: selectedSynopsis.trim(),
      ageRange: ageRange || storybook.ageRange,
      styleDesc,
      locale,
      theme: theme ?? (locale === 'zh' ? '探索与友谊' : 'exploration and friendship'),
      characterImageBase64: protagonistImageBase64,
      protagonistPronoun,
      protagonistRole,
      needsSupportingCharacter,
      previousStoryTitle: previousStoryContext?.title,
      previousStoryContent: previousStoryContext?.content,
      previousStoryChoices: previousStoryContext?.choices,
      apiKey,
    })

    const storyPathId = crypto.randomUUID()
    const mainImage = coverImage
      ? await saveImageFromBase64(coverImage.data, `stories/${storyPathId}/cover.jpg`)
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

    // Persist AI-invented supporting character if one was generated
    let supportingCharacterAddition: NpcWithImage | undefined
    if (needsSupportingCharacter && supporting?.name) {
      const supName = supporting.name.trim().slice(0, 30)
      const supDescription = (supporting.description ?? '').trim().slice(0, 120)

      // Add supporting name to existingNames so NPC processing won't duplicate it
      existingNames.add(supName.toLowerCase())

      // Look up portrait from npcImages (the AI generated it via [CHARACTER - Name])
      const supImage = npcImages.get(supName)
        ?? Array.from(npcImages.entries()).find(
          ([k]) => k.toLowerCase() === supName.toLowerCase()
        )?.[1]

      let supCharacterId = ''
      let supImageUrl: string | undefined

      if (supImage) {
        // Remove from npcImages so it's not also treated as an NPC
        npcImages.delete(supName)
        // Also try case-insensitive delete
        for (const key of npcImages.keys()) {
          if (key.toLowerCase() === supName.toLowerCase()) {
            npcImages.delete(key)
          }
        }

        const supPathId = crypto.randomUUID()
        try {
          supImageUrl = await saveImageFromBase64(
            supImage.data,
            `characters/${supPathId}/${storybook.styleId}.jpg`
          )
          const created = await createCharacter({
            name: supName,
            cartoonImage: supImageUrl,
            styleImages: { [storybook.styleId]: supImageUrl },
            style: styleDesc,
          })
          supCharacterId = created.id
        } catch (error) {
          console.warn(`[Story Supporting] Failed to save character for ${supName}:`, error)
        }
      }

      supportingCharacterAddition = {
        id: supCharacterId,
        name: supName,
        role: 'supporting',
        description: supDescription,
        image: supImageUrl,
      }

      await updateStorybook(id, {
        characters: [...storybook.characters, supportingCharacterAddition],
      })
      // Refresh storybook characters for NPC processing below
      storybook.characters = [...storybook.characters, supportingCharacterAddition]
    }

    const npcCharacterAdditions = await buildNpcCharactersWithAssets(
      npcs,
      existingNames,
      storybook.styleId,
      styleDesc,
      npcImages
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
