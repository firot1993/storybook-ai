import { describe, it, expect } from 'vitest'
import { buildSubtitleCues, buildSubtitleCuesV2, subtitlesContainCjk } from '../ffmpeg'
import type { ScriptScene, SubtitleCue } from '@/types'

function makeScene(overrides: Partial<ScriptScene> = {}): ScriptScene {
  return {
    index: 0,
    title: 'Test Scene',
    narration: '',
    dialogue: [],
    imagePrompt: '',
    estimatedDuration: 10,
    ...overrides,
  }
}

describe('buildSubtitleCues', () => {
  it('returns empty array for empty scenes', () => {
    expect(buildSubtitleCues([], [])).toEqual([])
  })

  it('creates cues from narration only', () => {
    const scenes = [makeScene({ narration: 'Once upon a time', estimatedDuration: 10 })]
    const cues = buildSubtitleCues(scenes, [5000])
    expect(cues).toHaveLength(1)
    expect(cues[0]).toEqual({
      index: 1,
      startTime: 0,
      endTime: 5000,
      text: 'Once upon a time',
    })
  })

  it('creates cues from narration + dialogue', () => {
    const scenes = [makeScene({
      narration: 'Narrator says',
      dialogue: [
        { speaker: 'Alice', text: 'Hello' },
        { speaker: 'Bob', text: 'Hi' },
      ],
      estimatedDuration: 9,
    })]
    const cues = buildSubtitleCues(scenes, [9000])
    expect(cues).toHaveLength(3)
    expect(cues[0].text).toBe('Narrator says')
    expect(cues[1].text).toBe('Alice: Hello')
    expect(cues[2].text).toBe('Bob: Hi')

    // Evenly distributed: 3000ms each
    expect(cues[0].startTime).toBe(0)
    expect(cues[0].endTime).toBe(3000)
    expect(cues[1].startTime).toBe(3000)
    expect(cues[1].endTime).toBe(6000)
    expect(cues[2].startTime).toBe(6000)
    expect(cues[2].endTime).toBe(9000)
  })

  it('skips scenes with no text lines', () => {
    const scenes = [
      makeScene({ narration: '', dialogue: [], estimatedDuration: 5 }),
      makeScene({ narration: 'Second scene', estimatedDuration: 5 }),
    ]
    const cues = buildSubtitleCues(scenes, [5000, 4000])
    expect(cues).toHaveLength(1)
    expect(cues[0].startTime).toBe(5000)
    expect(cues[0].endTime).toBe(9000)
  })

  it('uses estimatedDuration fallback when sceneDurationsMs is missing', () => {
    const scenes = [makeScene({ narration: 'Hello', estimatedDuration: 3 })]
    const cues = buildSubtitleCues(scenes, [])
    expect(cues).toHaveLength(1)
    expect(cues[0].endTime).toBe(3000)
  })

  it('handles multiple scenes sequentially', () => {
    const scenes = [
      makeScene({ narration: 'Scene one', estimatedDuration: 5 }),
      makeScene({ narration: 'Scene two', estimatedDuration: 5 }),
    ]
    const cues = buildSubtitleCues(scenes, [2000, 3000])
    expect(cues).toHaveLength(2)
    expect(cues[0].startTime).toBe(0)
    expect(cues[0].endTime).toBe(2000)
    expect(cues[1].startTime).toBe(2000)
    expect(cues[1].endTime).toBe(5000)
  })

  it('increments cue indexes across scenes', () => {
    const scenes = [
      makeScene({ narration: 'A' }),
      makeScene({ narration: 'B' }),
      makeScene({ narration: 'C' }),
    ]
    const cues = buildSubtitleCues(scenes, [1000, 1000, 1000])
    expect(cues.map((c) => c.index)).toEqual([1, 2, 3])
  })
})

describe('buildSubtitleCuesV2', () => {
  it('returns empty array for empty scenes', () => {
    expect(buildSubtitleCuesV2([], [])).toEqual([])
  })

  it('uses provided line-level durations', () => {
    const scenes = [makeScene({
      narration: 'Hello',
      dialogue: [{ speaker: 'A', text: 'World' }],
      estimatedDuration: 10,
    })]
    const cues = buildSubtitleCuesV2(scenes, [[2000, 3000]])
    expect(cues).toHaveLength(2)
    expect(cues[0]).toEqual({ index: 1, startTime: 0, endTime: 2000, text: 'Hello' })
    expect(cues[1]).toEqual({ index: 2, startTime: 2000, endTime: 5000, text: 'A: World' })
  })

  it('fills in missing line durations with averaged fallback', () => {
    const scenes = [makeScene({
      narration: 'Line 1',
      dialogue: [{ speaker: 'X', text: 'Line 2' }],
      estimatedDuration: 10,
    })]
    // Only first line has known duration, second is 0 (unknown)
    const cues = buildSubtitleCuesV2(scenes, [[3000, 0]], [10000])
    expect(cues).toHaveLength(2)
    expect(cues[0].endTime - cues[0].startTime).toBe(3000)
    // Second line should get (10000 - 3000) / 1 = 7000
    expect(cues[1].endTime - cues[1].startTime).toBe(7000)
  })

  it('uses hard fallback when no line durations provided', () => {
    const scenes = [makeScene({
      narration: 'A',
      dialogue: [{ speaker: 'B', text: 'C' }],
      estimatedDuration: 6,
    })]
    const cues = buildSubtitleCuesV2(scenes, [[]], [6000])
    expect(cues).toHaveLength(2)
    // Hard fallback: 6000/2 = 3000 each
    expect(cues[0].endTime - cues[0].startTime).toBe(3000)
    expect(cues[1].endTime - cues[1].startTime).toBe(3000)
  })

  it('skips scenes with no lines and advances time', () => {
    const scenes = [
      makeScene({ narration: '', dialogue: [], estimatedDuration: 5 }),
      makeScene({ narration: 'After gap', estimatedDuration: 3 }),
    ]
    const cues = buildSubtitleCuesV2(scenes, [[], [2000]], [5000, 3000])
    expect(cues).toHaveLength(1)
    expect(cues[0].startTime).toBe(5000)
    expect(cues[0].endTime).toBe(7000)
  })
})

describe('subtitlesContainCjk', () => {
  it('returns true for Chinese characters', () => {
    const cues: SubtitleCue[] = [{ index: 1, startTime: 0, endTime: 1000, text: '你好世界' }]
    expect(subtitlesContainCjk(cues)).toBe(true)
  })

  it('returns false for English only', () => {
    const cues: SubtitleCue[] = [{ index: 1, startTime: 0, endTime: 1000, text: 'Hello World' }]
    expect(subtitlesContainCjk(cues)).toBe(false)
  })

  it('returns true if any cue contains CJK', () => {
    const cues: SubtitleCue[] = [
      { index: 1, startTime: 0, endTime: 1000, text: 'Hello' },
      { index: 2, startTime: 1000, endTime: 2000, text: '再见' },
    ]
    expect(subtitlesContainCjk(cues)).toBe(true)
  })

  it('returns false for empty array', () => {
    expect(subtitlesContainCjk([])).toBe(false)
  })
})
