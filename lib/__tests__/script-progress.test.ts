import { describe, expect, it } from 'vitest'

import { mergeMonotonicScriptProgress } from '../script-progress'

describe('mergeMonotonicScriptProgress', () => {
  it('keeps scene generation progress monotonic when later events go backward', () => {
    const initial = mergeMonotonicScriptProgress(null, {
      scenesGenerated: 2,
      totalScenes: 4,
    })

    const merged = mergeMonotonicScriptProgress(initial, {
      scenesGenerated: 1,
      totalScenes: 4,
    })

    expect(merged).toEqual({
      scenesGenerated: 2,
      totalScenes: 4,
    })
  })

  it('preserves the highest total scene count and clamps generated scenes to it', () => {
    const previous = {
      scenesGenerated: 3,
      totalScenes: 4,
    }

    const merged = mergeMonotonicScriptProgress(previous, {
      scenesGenerated: 9,
      totalScenes: 2,
    })

    expect(merged).toEqual({
      scenesGenerated: 4,
      totalScenes: 4,
    })
  })
})
