import { describe, it, expect, vi } from 'vitest'

// Mock the db module to avoid Prisma dependency
vi.mock('@/lib/db', () => ({
  getCharacter: vi.fn(),
}))

import { resolveStorybookStyle } from '../storybook-helpers'

describe('resolveStorybookStyle', () => {
  it('returns the description for a valid styleId', () => {
    const result = resolveStorybookStyle({ styleId: 'ghibli' })
    expect(result).toBe('hand-drawn anime, warm natural palette, gentle sunlit atmosphere')
  })

  it('returns the description for watercolor style', () => {
    const result = resolveStorybookStyle({ styleId: 'watercolor' })
    expect(result).toBe('soft crayon and watercolor blend, muted pastel palette, dreamy mood')
  })

  it('returns default description for unknown styleId', () => {
    const result = resolveStorybookStyle({ styleId: 'nonexistent' })
    expect(result).toBe('dreamlike watercolor, macaron palette, sparkling starlit atmosphere')
  })

  it('returns default description for empty styleId', () => {
    const result = resolveStorybookStyle({ styleId: '' })
    expect(result).toBe('dreamlike watercolor, macaron palette, sparkling starlit atmosphere')
  })
})
