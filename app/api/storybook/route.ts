import { NextRequest, NextResponse } from 'next/server'
import { createCharacter, createStorybook, getCharacter, listStorybooks } from '@/lib/db'
import { generateCompanionCharacterCartoon } from '@/lib/image-generation'
import { saveImageFromBase64 } from '@/lib/storage'
import { getStyleById } from '@/lib/styles'
import type { StorybookCharacter } from '@/types'

function getStorageImageExtension(mimeType?: string): string {
  switch ((mimeType || '').toLowerCase()) {
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    default:
      return 'jpg'
  }
}

async function ensureSupportingCharacterAssets(params: {
  characters: StorybookCharacter[]
  styleId: string
}): Promise<StorybookCharacter[]> {
  const { characters, styleId } = params
  const styleConfig = getStyleById(styleId)
  const stylePrompt = styleConfig?.characterPrompt || styleConfig?.description || 'cute cartoon character'
  const nextCharacters: StorybookCharacter[] = []

  for (const c of characters) {
    if (c.role !== 'supporting') {
      nextCharacters.push(c)
      continue
    }

    if (c.id) {
      const existing = await getCharacter(c.id)
      const image =
        existing && styleId
          ? (existing.styleImages?.[styleId] || existing.cartoonImage)
          : existing?.cartoonImage

      nextCharacters.push({
        ...c,
        name: c.name?.trim() || existing?.name || c.name,
        isNpc: false,
        ...(image ? { image } : {}),
      })
      continue
    }

    if (!c.name?.trim()) {
      nextCharacters.push({
        ...c,
        isNpc: false,
      })
      continue
    }

    const name = c.name.trim().slice(0, 30)
    try {
      const image = await generateCompanionCharacterCartoon(
        name,
        `Friendly supporting companion in a children's story.`,
        stylePrompt
      )
      const extension = getStorageImageExtension(image.mimeType)
      const imageUrl = await saveImageFromBase64(
        image.data,
        `characters/${crypto.randomUUID()}/${styleId || 'default'}.${extension}`
      )
      const created = await createCharacter({
        name,
        cartoonImage: imageUrl,
        styleImages: styleId ? { [styleId]: imageUrl } : undefined,
        style: styleConfig?.description || stylePrompt,
      })
      nextCharacters.push({
        ...c,
        id: created.id,
        name,
        isNpc: false,
        image: imageUrl,
      })
    } catch (error) {
      console.warn(`[POST /api/storybook] Supporting character image generation failed for "${name}":`, error)
      nextCharacters.push({
        ...c,
        name,
        isNpc: false,
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
      ageRange: ageRange ?? '',
      styleId: styleId ?? '',
      characters: enrichedCharacters,
    })

    return NextResponse.json({ storybook })
  } catch (error) {
    console.error('[POST /api/storybook]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
