import { describe, it, expect } from 'vitest'
import { getLocalPath } from '../storage'

describe('getLocalPath', () => {
  it('joins base path with relative path', () => {
    const result = getLocalPath('videos/proj123/scene-0.mp4')
    expect(result).toContain('videos/proj123/scene-0.mp4')
    // Should use the LOCAL_BASE prefix
    expect(result).toMatch(/^\//)
  })

  it('handles nested paths', () => {
    const result = getLocalPath('a/b/c/d.txt')
    expect(result).toContain('a/b/c/d.txt')
  })
})
