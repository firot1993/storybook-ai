import { prisma } from './prisma'
import { decodeStoryAudioPayload, encodeStoryAudioPayload } from './story-audio'

function buildPair(a: string, b: string) {
  const [characterAId, characterBId] = [a, b].sort()
  return {
    characterAId,
    characterBId,
    pairKey: `${characterAId}:${characterBId}`,
  }
}

// ── Characters ──────────────────────────────────────────────

export async function createCharacter(data: {
  name?: string
  description?: string
  originalImage: string
  cartoonImage: string
}) {
  return prisma.character.create({ data })
}

export async function updateCharacter(id: string, data: { name?: string; description?: string }) {
  return prisma.character.update({ where: { id }, data })
}

export async function updateCharacterName(id: string, name: string) {
  return prisma.character.update({ where: { id }, data: { name } })
}

export async function listCharacters() {
  return prisma.character.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      cartoonImage: true,
      createdAt: true,
      _count: { select: { stories: true } },
    },
  })
}

export async function getCharacter(id: string) {
  return prisma.character.findUnique({ where: { id } })
}

export async function deleteCharacter(id: string) {
  // Delete the character (junction table rows are removed automatically)
  await prisma.character.delete({ where: { id } })

  // Clean up orphan stories (stories with no characters left)
  await prisma.story.deleteMany({
    where: { characters: { none: {} } },
  })
}

// ── Character Relationships ─────────────────────────────────

export async function listCharacterRelationships() {
  return prisma.characterRelationship.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      characterA: {
        select: { id: true, name: true, cartoonImage: true },
      },
      characterB: {
        select: { id: true, name: true, cartoonImage: true },
      },
    },
  })
}

export async function getCharacterRelationship(characterAId: string, characterBId: string) {
  const pair = buildPair(characterAId, characterBId)
  return prisma.characterRelationship.findUnique({
    where: { pairKey: pair.pairKey },
    include: {
      characterA: {
        select: { id: true, name: true, cartoonImage: true },
      },
      characterB: {
        select: { id: true, name: true, cartoonImage: true },
      },
    },
  })
}

export async function setCharacterRelationship(
  characterAId: string,
  characterBId: string,
  relationship: string
) {
  if (!characterAId || !characterBId || characterAId === characterBId) {
    throw new Error('A relationship requires two different characters')
  }

  const pair = buildPair(characterAId, characterBId)
  const value = relationship.trim()

  if (!value) {
    await prisma.characterRelationship.deleteMany({
      where: { pairKey: pair.pairKey },
    })
    return null
  }

  return prisma.characterRelationship.upsert({
    where: { pairKey: pair.pairKey },
    create: {
      pairKey: pair.pairKey,
      characterAId: pair.characterAId,
      characterBId: pair.characterBId,
      relationship: value,
    },
    update: {
      relationship: value,
    },
    include: {
      characterA: {
        select: { id: true, name: true, cartoonImage: true },
      },
      characterB: {
        select: { id: true, name: true, cartoonImage: true },
      },
    },
  })
}

export async function getRelationshipForCharacters(characterIds: string[]): Promise<string> {
  const uniqueIds = [...new Set(characterIds.filter(Boolean))]
  if (uniqueIds.length !== 2) {
    return ''
  }

  const relationship = await getCharacterRelationship(uniqueIds[0], uniqueIds[1])
  return relationship?.relationship ?? ''
}

// ── Stories ─────────────────────────────────────────────────

export async function createStory(data: {
  characterIds: string[]
  title: string
  content: string
  images: string[]
  audioUrl?: string
  sceneAudioUrls?: string[]
}) {
  return prisma.story.create({
    data: {
      title: data.title,
      content: data.content,
      images: JSON.stringify(data.images),
      audioUrl: encodeStoryAudioPayload({
        audioUrl: data.audioUrl ?? '',
        sceneAudioUrls: data.sceneAudioUrls ?? [],
      }),
      characters: {
        connect: data.characterIds.map((id) => ({ id })),
      },
    },
  })
}

export async function getStory(id: string) {
  const story = await prisma.story.findUnique({
    where: { id },
    include: { characters: true },
  })
  if (!story) return null
  const decodedAudio = decodeStoryAudioPayload(story.audioUrl)
  return {
    ...story,
    images: JSON.parse(story.images) as string[],
    audioUrl: decodedAudio.audioUrl,
    sceneAudioUrls: decodedAudio.sceneAudioUrls,
  }
}

export async function updateStoryAudio(
  id: string,
  audio: { audioUrl?: string; sceneAudioUrls?: string[] }
) {
  return prisma.story.update({
    where: { id },
    data: {
      audioUrl: encodeStoryAudioPayload({
        audioUrl: audio.audioUrl ?? '',
        sceneAudioUrls: audio.sceneAudioUrls ?? [],
      }),
    },
  })
}

export async function listStoriesByCharacter(characterId: string) {
  const stories = await prisma.story.findMany({
    where: { characters: { some: { id: characterId } } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      images: true,
      createdAt: true,
    },
  })
  return stories.map(s => ({
    ...s,
    images: JSON.parse(s.images) as string[],
  }))
}

export async function listAllStories() {
  const stories = await prisma.story.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      characters: {
        select: {
          id: true,
          name: true,
          cartoonImage: true,
        }
      }
    }
  })
  return stories.map(s => ({
    ...s,
    images: JSON.parse(s.images) as string[],
    ...decodeStoryAudioPayload(s.audioUrl),
  }))
}

export async function deleteStory(id: string) {
  return prisma.story.delete({ where: { id } })
}
