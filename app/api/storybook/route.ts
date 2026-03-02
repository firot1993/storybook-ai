import { NextRequest, NextResponse } from 'next/server'
import { createStorybook, listStorybooks } from '@/lib/db'

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

    const storybook = await createStorybook({
      name: name.trim(),
      ageRange: ageRange ?? '4-6',
      styleId: styleId ?? '',
      characters: characters ?? [],
    })

    return NextResponse.json({
      storybook: { ...storybook, characters: JSON.parse(storybook.characters) },
    })
  } catch (error) {
    console.error('[POST /api/storybook]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
