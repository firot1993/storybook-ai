import { describe, it, expect, vi } from 'vitest'

// Mock the db module to avoid Prisma dependency
vi.mock('@/lib/db', () => ({
  getCharacter: vi.fn(),
}))

import { resolveStorybookStyle } from '../storybook-helpers'

describe('resolveStorybookStyle', () => {
  it('returns the description for a valid styleId', () => {
    const result = resolveStorybookStyle({ styleId: 'ghibli' })
    expect(result).toBe('宫崎骏手绘动画风格，温暖自然色调')
  })

  it('returns the description for watercolor style', () => {
    const result = resolveStorybookStyle({ styleId: 'watercolor' })
    expect(result).toBe('蜡笔水彩混合，柔和马卡龙色调，梦幻感')
  })

  it('returns default description for unknown styleId', () => {
    const result = resolveStorybookStyle({ styleId: 'nonexistent' })
    expect(result).toBe('梦幻水彩、马卡龙色调、星光熠熠的氛围')
  })

  it('returns default description for empty styleId', () => {
    const result = resolveStorybookStyle({ styleId: '' })
    expect(result).toBe('梦幻水彩、马卡龙色调、星光熠熠的氛围')
  })
})
