import { NextRequest, NextResponse } from 'next/server'
import { createCharacter, createStorybook, listStorybooks } from '@/lib/db'
import { generateCompanionCharacterCartoon } from '@/lib/banana-img'
import { getStyleById } from '@/lib/styles'
import type { StorybookCharacter } from '@/types'

async function ensureSupportingCharacterAssets(params: {
  characters: StorybookCharacter[]
  styleId: string
}): Promise<StorybookCharacter[]> {
  const { characters, styleId } = params
  const styleConfig = getStyleById(styleId)
  const stylePrompt = styleConfig?.characterPrompt || styleConfig?.description || 'cute cartoon character'
  const nextCharacters: StorybookCharacter[] = []

  for (const c of characters) {
    if (c.role !== 'supporting' || c.id || !c.name?.trim()) {
      nextCharacters.push(c)
      continue
    }

    const name = c.name.trim().slice(0, 30)
    try {
      const image = await generateCompanionCharacterCartoon(
        name,
        `Friendly supporting companion in a children's story.`,
        stylePrompt
      )
      const dataUrl = `data:${image.mimeType};base64,${image.data}`
      const created = await createCharacter({
        name,
        cartoonImage: dataUrl,
        styleImages: styleId ? { [styleId]: dataUrl } : undefined,
        style: styleConfig?.description || stylePrompt,
      })
      nextCharacters.push({
        ...c,
        id: created.id,
        name,
      })
    } catch (error) {
      console.warn(`[POST /api/storybook] Supporting character image generation failed for "${name}":`, error)
      nextCharacters.push({
        ...c,
        name,
      })
    }
  }

  return nextCharacters
}

// GET /api/storybook — 列出所有故事书（含章节数）
export async function GET() {
  const storybooks = await listStorybooks()
  return NextResponse.json({ storybooks })
}

// POST /api/storybook — 创建新故事书
export async function POST(request: NextRequest) {
  try {
    const { name, ageRange, styleId, characters } = await request.json()

    if (!name?.trim()) {
      return NextResponse.json({ error: '请输入故事书名称' }, { status: 400 })
    }

    const requestedCharacters = Array.isArray(characters) ? characters as StorybookCharacter[] : []
    const enrichedCharacters = await ensureSupportingCharacterAssets({
      characters: requestedCharacters,
      styleId: styleId ?? '',
    })

    const storybook = await createStorybook({
      name: name.trim(),
      ageRange: ageRange ?? '4-6',
      styleId: styleId ?? '',
      characters: enrichedCharacters,
    })

    return NextResponse.json({
      storybook: { ...storybook, characters: storybook.characters },
    })
  } catch (error) {
    console.error('[POST /api/storybook]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
