import { describe, it, expect } from 'vitest'
import { buildPreviousStoryExcerpt, extractStoryChoices, normalizeStoryChoices, splitStoryIntoScenes } from '../story-scenes'

describe('extractStoryChoices', () => {
  it('returns choices from a valid CHOICES marker', () => {
    const content = 'Some story text <!--CHOICES:["Go left","Go right","Stay"]-->'
    expect(extractStoryChoices(content)).toEqual(['Go left', 'Go right', 'Stay'])
  })

  it('returns empty array when no marker is present', () => {
    expect(extractStoryChoices('Just a plain story')).toEqual([])
  })

  it('returns empty array for malformed JSON in marker', () => {
    const content = '<!--CHOICES:not valid json-->'
    expect(extractStoryChoices(content)).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(extractStoryChoices('')).toEqual([])
  })

  it('extracts choices from marker embedded in longer text', () => {
    const content = 'Once upon a time...\n<!--CHOICES:["A","B"]-->\nThe end.'
    expect(extractStoryChoices(content)).toEqual(['A', 'B'])
  })
})

describe('splitStoryIntoScenes', () => {
  it('splits by [Scene N] markers', () => {
    const content = '[Scene 1] The beginning\n\n[Scene 2] The middle\n\n[Scene 3] The end'
    const scenes = splitStoryIntoScenes(content)
    expect(scenes).toEqual(['The beginning', 'The middle', 'The end'])
  })

  it('strips CHOICES marker before splitting', () => {
    const content = '[Scene 1] Hello\n\n[Scene 2] World<!--CHOICES:["a","b"]-->'
    const scenes = splitStoryIntoScenes(content)
    expect(scenes).toHaveLength(2)
    expect(scenes[0]).toBe('Hello')
    expect(scenes[1]).toBe('World')
  })

  it('falls back to paragraph splitting when no scene markers exist', () => {
    const content = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.'
    const scenes = splitStoryIntoScenes(content)
    // Without [Scene N] markers, falls back to splitting on double newlines.
    expect(scenes).toHaveLength(3)
    expect(scenes[0]).toBe('Paragraph one.')
    expect(scenes[1]).toBe('Paragraph two.')
    expect(scenes[2]).toBe('Paragraph three.')
  })

  it('returns empty array for empty string', () => {
    expect(splitStoryIntoScenes('')).toEqual([])
  })

  it('returns empty array for non-string input', () => {
    // @ts-expect-error testing invalid input
    expect(splitStoryIntoScenes(null)).toEqual([])
    // @ts-expect-error testing invalid input
    expect(splitStoryIntoScenes(undefined)).toEqual([])
  })

  it('handles bold scene markers like **[Scene 1]**', () => {
    const content = '**[Scene 1]** Start here\n\n**[Scene 2]** Continue'
    const scenes = splitStoryIntoScenes(content)
    expect(scenes).toEqual(['Start here', 'Continue'])
  })

  it('handles case-insensitive scene markers', () => {
    const content = '[scene 1] First\n\n[SCENE 2] Second'
    const scenes = splitStoryIntoScenes(content)
    expect(scenes).toEqual(['First', 'Second'])
  })

  it('handles scene markers with extra text like [Scene 1: The Forest]', () => {
    const content = '[Scene 1: The Forest] Trees everywhere\n\n[Scene 2: The Lake] Water glistens'
    const scenes = splitStoryIntoScenes(content)
    expect(scenes).toEqual(['Trees everywhere', 'Water glistens'])
  })
})

describe('normalizeStoryChoices', () => {
  it('trims, filters, and limits parsed choices', () => {
    const content = '<!--CHOICES:["  Go left  ","","Stay still","Run","Extra"]-->'
    expect(normalizeStoryChoices(content)).toEqual(['Go left', 'Stay still', 'Run'])
  })

  it('respects a custom max choice limit', () => {
    const content = '<!--CHOICES:["A","B","C"]-->'
    expect(normalizeStoryChoices(content, 2)).toEqual(['A', 'B'])
  })
})

describe('buildPreviousStoryExcerpt', () => {
  it('removes choices marker content before creating excerpt', () => {
    const content = 'Story body\n<!--CHOICES:["A","B"]-->'
    expect(buildPreviousStoryExcerpt(content)).toBe('Story body')
  })

  it('keeps the tail when content exceeds the max length', () => {
    const content = '1234567890'
    expect(buildPreviousStoryExcerpt(content, 4)).toBe('7890')
  })
})
