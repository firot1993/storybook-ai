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
      styleImages: JSON.stringify(data.styleImages ?? {}),
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

export async function listCharacters() {
  return prisma.character.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      cartoonImage: true,
      style: true,
      age: true,
      voiceName: true,
      createdAt: true,
    },
  })
}

export async function getCharacter(id: string) {
  return prisma.character.findUnique({ where: { id } })
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
      characters: JSON.stringify(data.characters),
    },
  })
}

export async function listStorybooks() {
  const books = await prisma.storybook.findMany({
    orderBy: { createdAt: 'desc' },
    include: { chapters: { select: { id: true, title: true, synopsis: true, status: true, createdAt: true }, orderBy: { createdAt: 'asc' } } },
  })
  return books.map((b) => ({
    ...b,
    characters: JSON.parse(b.characters) as import('@/types').StorybookCharacter[],
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
    characters: JSON.parse(b.characters) as import('@/types').StorybookCharacter[],
    chapters: b.chapters.map((s) => ({
      ...s,
      characterIds: JSON.parse(s.characterIds) as string[],
      images: JSON.parse(s.images) as string[],
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
      ...(data.characters !== undefined ? { characters: JSON.stringify(data.characters) } : {}),
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
      characterIds: JSON.stringify(data.characterIds),
      title: data.title,
      synopsis: data.synopsis ?? '',
      content: data.content,
      mainImage: data.mainImage ?? '',
      status: data.status ?? 'draft',
      images: JSON.stringify(data.images),
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
      ...(data.images !== undefined ? { images: JSON.stringify(data.images) } : {}),
    },
  })
}

export async function getStory(id: string) {
  const story = await prisma.story.findUnique({ where: { id } })
  if (!story) return null
  const decodedAudio = decodeStoryAudioPayload(story.audioUrl)
  return {
    ...story,
    characterIds: JSON.parse(story.characterIds) as string[],
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
    where: { characterIds: { contains: characterId } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, images: true, createdAt: true },
  })
  return stories.map((s) => ({
    ...s,
    images: JSON.parse(s.images) as string[],
  }))
}

export async function listAllStories() {
  const stories = await prisma.story.findMany({ orderBy: { createdAt: 'desc' } })
  return stories.map((s) => ({
    ...s,
    characterIds: JSON.parse(s.characterIds) as string[],
    images: JSON.parse(s.images) as string[],
    ...decodeStoryAudioPayload(s.audioUrl),
  }))
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

// ── Synopsis ────────────────────────────────────────────────

export async function createSynopsis(data: {
  characterIds: string[]
  theme: string
  keywords: string
  ageGroup: string
  content: string
}) {
  return prisma.synopsis.create({
    data: {
      characterIds: JSON.stringify(data.characterIds),
      theme: data.theme,
      keywords: data.keywords,
      ageGroup: data.ageGroup,
      content: data.content,
    },
  })
}

export async function getSynopsis(id: string) {
  const s = await prisma.synopsis.findUnique({ where: { id } })
  if (!s) return null
  return { ...s, characterIds: JSON.parse(s.characterIds) as string[] }
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
      scenesJson: JSON.stringify(data.scenes),
      totalDuration: data.totalDuration,
    },
  })
}

export async function getScript(id: string) {
  const s = await prisma.script.findUnique({ where: { id } })
  if (!s) return null
  return { ...s, scenes: JSON.parse(s.scenesJson) as import('@/types').ScriptScene[] }
}

export async function getScriptByStory(storyId: string) {
  const s = await prisma.script.findFirst({
    where: { storyId },
    orderBy: { createdAt: 'desc' },
  })
  if (!s) return null
  return { ...s, scenes: JSON.parse(s.scenesJson) as import('@/types').ScriptScene[] }
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
      videoSettings: JSON.stringify(data.videoSettings ?? {}),
    },
  })
}

export async function getVideoProject(id: string) {
  const vp = await prisma.videoProject.findUnique({ where: { id } })
  if (!vp) return null
  return {
    ...vp,
    sceneVideoUrls: JSON.parse(vp.sceneVideoUrls) as string[],
    subtitles: JSON.parse(vp.subtitlesJson) as import('@/types').SubtitleCue[],
    videoSettings: JSON.parse(vp.videoSettings) as Record<string, unknown>,
  }
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
      ...(data.sceneVideoUrls ? { sceneVideoUrls: JSON.stringify(data.sceneVideoUrls) } : {}),
      ...(data.rawVideoUrl !== undefined ? { rawVideoUrl: data.rawVideoUrl } : {}),
      ...(data.subtitles ? { subtitlesJson: JSON.stringify(data.subtitles) } : {}),
      ...(data.finalVideoUrl !== undefined ? { finalVideoUrl: data.finalVideoUrl } : {}),
      ...(data.errorMessage !== undefined ? { errorMessage: data.errorMessage } : {}),
    },
  })
}

export async function listVideoProjects() {
  const projects = await prisma.videoProject.findMany({
    orderBy: { createdAt: 'desc' },
    include: { story: { select: { title: true } } },
  })
  return projects.map((vp) => ({
    ...vp,
    sceneVideoUrls: JSON.parse(vp.sceneVideoUrls) as string[],
    subtitles: JSON.parse(vp.subtitlesJson) as import('@/types').SubtitleCue[],
  }))
}

export async function deleteVideoProject(id: string) {
  return prisma.videoProject.delete({ where: { id } })
}

export async function getVideoProjectByStoryId(storyId: string) {
  const vp = await prisma.videoProject.findFirst({
    where: { storyId },
    orderBy: { createdAt: 'desc' },
  })
  if (!vp) return null
  return {
    ...vp,
    sceneVideoUrls: JSON.parse(vp.sceneVideoUrls) as string[],
    subtitles: JSON.parse(vp.subtitlesJson) as import('@/types').SubtitleCue[],
    videoSettings: JSON.parse(vp.videoSettings) as Record<string, unknown>,
  }
}
