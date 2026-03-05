import { describe, it, expect } from 'vitest'
import { STYLES, getStyleById } from '../styles'

describe('STYLES', () => {
  it('contains exactly 5 styles', () => {
    expect(STYLES).toHaveLength(5)
  })

  it('has unique ids', () => {
    const ids = STYLES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('includes the expected style ids', () => {
    const ids = STYLES.map((s) => s.id)
    expect(ids).toContain('ghibli')
    expect(ids).toContain('watercolor')
    expect(ids).toContain('plush3d')
    expect(ids).toContain('claymation')
    expect(ids).toContain('pencil')
  })

  it('all styles have required fields', () => {
    for (const style of STYLES) {
      expect(style.id).toBeTruthy()
      expect(style.label).toBeTruthy()
      expect(style.emoji).toBeTruthy()
      expect(style.description).toBeTruthy()
      expect(style.characterPrompt).toBeTruthy()
      expect(style.negativePrompt).toBeTruthy()
      expect(style.referenceImageUrl).toBeTruthy()
      expect(style.exampleImageUrl).toBeTruthy()
    }
  })
})

describe('getStyleById', () => {
  it('returns the correct style for a valid id', () => {
    const style = getStyleById('ghibli')
    expect(style).toBeDefined()
    expect(style!.id).toBe('ghibli')
    expect(style!.label).toBe('吉卜力')
  })

  it('returns undefined for an unknown id', () => {
    expect(getStyleById('nonexistent')).toBeUndefined()
  })

  it('returns undefined for empty string', () => {
    expect(getStyleById('')).toBeUndefined()
  })

  it('finds each style correctly', () => {
    for (const style of STYLES) {
      const found = getStyleById(style.id)
      expect(found).toBe(style)
    }
  })
})
