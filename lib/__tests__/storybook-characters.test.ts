import { describe, expect, it } from 'vitest'

import { mergeStorybookCharacters } from '../storybook-characters'

describe('mergeStorybookCharacters', () => {
  it('merges duplicate supporting entries by normalized name', () => {
    const characters = mergeStorybookCharacters([
      {
        id: 'old-supporting-id',
        name: 'Pip',
        role: 'supporting',
        isNpc: true,
        description: 'A fluffy cloud-bunny with glowing golden ears',
      },
      {
        id: 'new-supporting-id',
        name: 'pip',
        role: 'supporting',
        description: 'Pastel purple plush owl, moon-glimmer eyes',
        image: 'https://example.com/pip.jpg',
      } as {
        id: string
        name: string
        role: 'supporting'
        description: string
        image: string
      },
    ])

    expect(characters).toHaveLength(1)
    expect(characters[0]).toMatchObject({
      id: 'new-supporting-id',
      name: 'Pip',
      role: 'supporting',
      isNpc: false,
      description: 'Pastel purple plush owl, moon-glimmer eyes',
      image: 'https://example.com/pip.jpg',
    })
  })

  it('keeps distinct names as separate entries', () => {
    const characters = mergeStorybookCharacters([
      { id: 'protagonist-id', role: 'protagonist' },
      { id: 'supporting-id', name: 'Pip', role: 'supporting' },
      { id: 'npc-id', name: 'Milo', role: 'supporting', isNpc: true },
    ])

    expect(characters).toHaveLength(3)
  })
})
