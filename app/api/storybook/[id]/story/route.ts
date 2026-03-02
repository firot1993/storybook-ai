import { NextRequest, NextResponse } from 'next/server'
import { getStorybook, getCharacter, createStory, updateStory } from '@/lib/db'
import { generateStoryFromSynopsis, generateStoryCoverImage } from '@/lib/gemini'
import { STYLES } from '@/lib/styles'
import type { Story } from '@/types'

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

    // 获取主角信息（包含styleImages）
    const protagonistEntry = storybook.characters.find((c) => c.role === 'protagonist')
    const protagonistChar = protagonistEntry?.id ? await getCharacter(protagonistEntry.id) : null
    const protagonistName = protagonistChar?.name || '小主角'

    // 获取所有配角名称（支持多个）
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

    // 获取风格描述
    const styleConfig = STYLES.find((s) => s.id === storybook.styleId)
    const styleDesc = styleConfig?.description || '梦幻水彩、马卡龙色调、星光熠熠的氛围'

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

    const { story: storyText, choices } = storyResult
    const mainImage = coverResult
      ? `data:${coverResult.mimeType};base64,${coverResult.data}`
      : ''

    // Embed choices in content so the play page can display interactive options
    const contentWithChoices = choices.length > 0
      ? `${storyText}\n<!--CHOICES:${JSON.stringify(choices)}-->`
      : storyText

    // 保存章节到数据库
    const characterIds = storybook.characters
      .filter((c) => c.id)
      .map((c) => c.id)
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

    // 如果封面在createStory之后才生成完毕，补充更新（实际上这里是同步的）
    if (mainImage && !dbStory.mainImage) {
      await updateStory(dbStory.id, { mainImage })
    }

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

    return NextResponse.json({ story, synopsisVersion: synopsisVersion ?? 'A' })
  } catch (error) {
    console.error('[POST /api/storybook/[id]/story]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
