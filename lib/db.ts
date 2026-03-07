import { prisma } from './prisma'
import { decodeStoryAudioPayload, encodeStoryAudioPayload } from './story-audio'

// ── Characters ──────────────────────────────────────────────

export async function createCharacter(data: {
  name?: string
  originalImage?: string
  cartoonImage: string
  styleImages?: Record<string, string>
  style?: string
  age?: number | null
  voiceName?: string
}) {
  return prisma.character.create({
    data: {
      name: data.name ?? '',
      originalImage: data.originalImage ?? '',
      cartoonImage: data.cartoonImage,
      styleImages: data.styleImages ?? {},
      style: data.style ?? '',
      age: data.age ?? null,
      voiceName: data.voiceName ?? '',
    },
  })
}

export async function updateCharacter(
  id: string,
  data: { name?: string; age?: number | null; voiceName?: string }
) {
  return prisma.character.update({ where: { id }, data })
}

type StorybookCharacterLite = {
  id?: string
  role?: string
  isNpc?: boolean
}

async function listSupportingCharacterIds(): Promise<string[]> {
  const books = await prisma.storybook.findMany({
    select: { characters: true },
  })
  const ids = new Set<string>()

  for (const book of books) {
    const parsed = book.characters as unknown
    if (!Array.isArray(parsed)) continue
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue
      const character = entry as StorybookCharacterLite
      if (character.role !== 'supporting') continue
      const id = typeof character.id === 'string' ? character.id.trim() : ''
      if (id) ids.add(id)
    }
  }

  return Array.from(ids)
}

export async function listCharacters(options?: { includeNpc?: boolean }) {
  const includeNpc = options?.includeNpc ?? false
  const supportingIds = includeNpc ? [] : await listSupportingCharacterIds()

  const rows = await prisma.character.findMany({
    ...(supportingIds.length > 0 ? { where: { id: { notIn: supportingIds } } } : {}),
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      cartoonImage: true,
      styleImages: true,
      style: true,
      age: true,
      voiceName: true,
      createdAt: true,
    },
  })

  return rows.map((r) => ({
    ...r,
    styleImages: r.styleImages as Record<string, string>,
  }))
}

export async function getCharacter(id: string) {
  const row = await prisma.character.findUnique({ where: { id } })
  if (!row) return null
  return {
    ...row,
    styleImages: row.styleImages as Record<string, string>,
  }
}

export async function deleteCharacter(id: string) {
  await prisma.character.delete({ where: { id } })
}

// ── Storybooks ──────────────────────────────────────────────

export async function createStorybook(data: {
  name: string
  ageRange: string
  styleId: string
  characters: import('@/types').StorybookCharacter[]
}) {
  return prisma.storybook.create({
    data: {
      name: data.name,
      ageRange: data.ageRange,
      styleId: data.styleId,
      characters: data.characters as unknown as import('@prisma/client').Prisma.InputJsonValue,
    },
  })
}

export async function listStorybooks() {
  const books = await prisma.storybook.findMany({
    orderBy: { createdAt: 'desc' },
    include: { chapters: { select: { id: true, title: true, synopsis: true, status: true, createdAt: true }, orderBy: { createdAt: 'asc' } } },
  })
  return books.map((b: (typeof books)[number]) => ({
    ...b,
    characters: b.characters as unknown as import('@/types').StorybookCharacter[],
  }))
}

export async function getStorybook(id: string) {
  const b = await prisma.storybook.findUnique({
    where: { id },
    include: { chapters: { orderBy: { createdAt: 'desc' } } },
  })
  if (!b) return null
  return {
    ...b,
    characters: b.characters as unknown as import('@/types').StorybookCharacter[],
    chapters: b.chapters.map((s: (typeof b.chapters)[number]) => ({
      ...s,
      characterIds: s.characterIds as unknown as string[],
      images: s.images as unknown as string[],
    })),
  }
}

export async function updateStorybook(
  id: string,
  data: { name?: string; ageRange?: string; styleId?: string; characters?: import('@/types').StorybookCharacter[] }
) {
  return prisma.storybook.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.ageRange !== undefined ? { ageRange: data.ageRange } : {}),
      ...(data.styleId !== undefined ? { styleId: data.styleId } : {}),
      ...(data.characters !== undefined ? { characters: data.characters as unknown as import('@prisma/client').Prisma.InputJsonValue } : {}),
    },
  })
}

// ── Stories ─────────────────────────────────────────────────

export async function createStory(data: {
  storybookId?: string
  characterIds: string[]
  title: string
  synopsis?: string
  content: string
  mainImage?: string
  status?: string
  images: string[]
  audioUrl?: string
  sceneAudioUrls?: string[]
  synopsisId?: string
}) {
  return prisma.story.create({
    data: {
      ...(data.storybookId ? { storybookId: data.storybookId } : {}),
      characterIds: data.characterIds,
      title: data.title,
      synopsis: data.synopsis ?? '',
      content: data.content,
      mainImage: data.mainImage ?? '',
      status: data.status ?? 'draft',
      images: data.images,
      audioUrl: encodeStoryAudioPayload({
        audioUrl: data.audioUrl ?? '',
        sceneAudioUrls: data.sceneAudioUrls ?? [],
      }),
      ...(data.synopsisId ? { synopsisId: data.synopsisId } : {}),
    },
  })
}

export async function updateStory(
  id: string,
  data: {
    title?: string
    synopsis?: string
    content?: string
    mainImage?: string
    status?: string
    images?: string[]
  }
) {
  return prisma.story.update({
    where: { id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.synopsis !== undefined ? { synopsis: data.synopsis } : {}),
      ...(data.content !== undefined ? { content: data.content } : {}),
      ...(data.mainImage !== undefined ? { mainImage: data.mainImage } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.images !== undefined ? { images: data.images } : {}),
    },
  })
}

export async function getStory(id: string) {
  const story = await prisma.story.findUnique({ where: { id } })
  if (!story) return null
  const decodedAudio = decodeStoryAudioPayload(story.audioUrl)
  return {
    ...story,
    characterIds: story.characterIds as unknown as string[],
    images: story.images as unknown as string[],
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

export async function deleteStory(id: string) {
  return prisma.story.delete({ where: { id } })
}

// ── Scenes ──────────────────────────────────────────────────

export async function createScene(data: {
  storyId: string
  index: number
  script?: string
}) {
  return prisma.scene.create({
    data: {
      storyId: data.storyId,
      index: data.index,
      script: data.script ?? '',
    },
  })
}

export async function updateScene(
  id: string,
  data: {
    script?: string
    imageUrl?: string
    lastFrame?: string
    videoUrl?: string
    status?: string
  }
) {
  return prisma.scene.update({ where: { id }, data })
}

export async function getScenesByStory(storyId: string) {
  return prisma.scene.findMany({
    where: { storyId },
    orderBy: { index: 'asc' },
  })
}

export async function deleteScenesByStory(storyId: string) {
  return prisma.scene.deleteMany({ where: { storyId } })
}

// ── Script ──────────────────────────────────────────────────

export async function createScript(data: {
  storyId: string
  scenes: import('@/types').ScriptScene[]
  totalDuration: number
}) {
  return prisma.script.create({
    data: {
      storyId: data.storyId,
      scenesJson: data.scenes as unknown as import('@prisma/client').Prisma.InputJsonValue,
      totalDuration: data.totalDuration,
    },
  })
}

export async function getScript(id: string) {
  const s = await prisma.script.findUnique({ where: { id } })
  if (!s) return null
  return { ...s, scenes: s.scenesJson as unknown as import('@/types').ScriptScene[] }
}

// ── VideoProject ────────────────────────────────────────────

export async function createVideoProject(data: {
  storyId: string
  scriptId: string
  videoSettings?: Record<string, unknown>
}) {
  return prisma.videoProject.create({
    data: {
      storyId: data.storyId,
      scriptId: data.scriptId,
      videoSettings: data.videoSettings ?? {},
    },
  })
}

export async function updateVideoProject(
  id: string,
  data: {
    status?: string
    progress?: number
    sceneVideoUrls?: string[]
    rawVideoUrl?: string
    subtitles?: import('@/types').SubtitleCue[]
    finalVideoUrl?: string
    errorMessage?: string
  }
) {
  return prisma.videoProject.update({
    where: { id },
    data: {
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.progress !== undefined ? { progress: data.progress } : {}),
      ...(data.sceneVideoUrls ? { sceneVideoUrls: data.sceneVideoUrls } : {}),
      ...(data.rawVideoUrl !== undefined ? { rawVideoUrl: data.rawVideoUrl } : {}),
      ...(data.subtitles ? { subtitlesJson: data.subtitles as unknown as import('@prisma/client').Prisma.InputJsonValue } : {}),
      ...(data.finalVideoUrl !== undefined ? { finalVideoUrl: data.finalVideoUrl } : {}),
      ...(data.errorMessage !== undefined ? { errorMessage: data.errorMessage } : {}),
    },
  })
}

export async function getVideoProjectByStoryId(storyId: string) {
  const vp = await prisma.videoProject.findFirst({
    where: { storyId },
    orderBy: { createdAt: 'desc' },
  })
  if (!vp) return null
  return {
    ...vp,
    sceneVideoUrls: vp.sceneVideoUrls as unknown as string[],
    subtitles: vp.subtitlesJson as unknown as import('@/types').SubtitleCue[],
    videoSettings: vp.videoSettings as Record<string, unknown>,
  }
}
