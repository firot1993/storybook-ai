import { NextRequest, NextResponse } from 'next/server'
import { getStorybook, updateStorybook } from '@/lib/db'

// GET /api/storybook/[id] — 获取故事书详情（含章节列表）
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const storybook = await getStorybook(id)
  if (!storybook) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ storybook })
}

// PATCH /api/storybook/[id] — 更新故事书基本信息
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = await request.json()
    const updated = await updateStorybook(id, {
      name: body.name,
      ageRange: body.ageRange,
      styleId: body.styleId,
      characters: body.characters,
    })
    return NextResponse.json({ storybook: updated })
  } catch (error) {
    console.error('[PATCH /api/storybook/[id]]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
