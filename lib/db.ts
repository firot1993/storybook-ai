import { prisma } from './prisma'

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

// ── Stories ─────────────────────────────────────────────────

export async function createStory(data: {
  characterIds: string[]
  title: string
  content: string
  images: string[]
  audioUrl?: string
}) {
  return prisma.story.create({
    data: {
      title: data.title,
      content: data.content,
      images: JSON.stringify(data.images),
      audioUrl: data.audioUrl ?? '',
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
  return {
    ...story,
    images: JSON.parse(story.images) as string[],
  }
}

export async function updateStoryAudio(id: string, audioUrl: string) {
  return prisma.story.update({
    where: { id },
    data: { audioUrl },
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
  }))
}

export async function deleteStory(id: string) {
  return prisma.story.delete({ where: { id } })
}
