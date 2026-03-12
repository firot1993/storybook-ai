import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import type { CompanionSuggestion } from '@/types'
import {
  buildCharacterWithStyleRefPrompt,
  buildCompanionSuggestionsPrompt,
  buildInterleavedDirectorScriptPrompt,
  buildReferenceImageLabel,
  buildDirectorScriptPrompt,
  buildProtagonistReferencePrompt,
  buildStoryImagePrompt,
  buildStoryWithAssetsPrompt,
  buildSynopsisVersionsPrompt,
  buildVoiceAssignmentPrompt,
  DEFAULT_STORY_IMAGE_REFERENCE_HINT,
} from './ai-prompts'
import type { Locale } from './i18n/shared'

const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});

const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL?.trim() || 'gemini-3-flash-preview';
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL?.trim() || 'gemini-3.1-flash-image-preview';

/**
 * Compress a base64 PNG image: resize to fit within maxDim and convert to JPEG.
 * Returns a smaller base64 string and 'image/jpeg' mime type.
 */
async function compressImage(
  base64Data: string,
  maxDim: number = 512,
  quality: number = 70
): Promise<{ data: string; mimeType: string }> {
  try {
    const inputBuffer = Buffer.from(base64Data, 'base64');
    const outputBuffer = await sharp(inputBuffer)
      .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
    return {
      data: outputBuffer.toString('base64'),
      mimeType: 'image/jpeg',
    };
  } catch (error) {
    console.warn('Image compression failed, using original:', error);
    return { data: base64Data, mimeType: 'image/png' };
  }
}

type GeminiErrorShape = {
  status?: number;
  message?: string;
  cause?: {
    code?: string;
    message?: string;
  };
};

type GeminiPart = {
  text?: string;
  inlineData?: {
    data?: string;
    mimeType?: string;
  };
};

type GeminiCandidate = {
  finishReason?: string;
  content?: {
    parts?: GeminiPart[];
  };
  safetyRatings?: Array<{
    blocked?: boolean;
    category?: string;
    probability?: string;
  }>;
};

type GeminiImageResponse = {
  candidates?: GeminiCandidate[];
  text?: string;
};

export function getGeminiErrorResponse(error: unknown): { status: number; message: string } {
  const geminiError = error as GeminiErrorShape;
  const status = geminiError?.status;
  const message = geminiError?.message ?? '';
  const causeCode = geminiError?.cause?.code ?? '';
  const causeMessage = geminiError?.cause?.message ?? '';
  const combinedMessage = `${message} ${causeMessage}`.toLowerCase();

  if (status === 429) {
    return {
      status: 429,
      message:
        'Rate limit reached for AI generation. Please wait a minute and try again, or check Gemini API quota limits.',
    };
  }

  if (causeCode === 'UND_ERR_CONNECT_TIMEOUT' || combinedMessage.includes('connect timeout')) {
    return {
      status: 503,
      message: 'Unable to reach the AI service right now. Please retry in a moment.',
    };
  }

  if (status === 401 || status === 403) {
    return {
      status,
      message: 'AI service authentication failed. Check GEMINI_API_KEY and project access.',
    };
  }

  if (status === 400) {
    if (combinedMessage.includes('token count exceeds')) {
      return {
        status: 400,
        message: 'Request is too large for the model token limit. Please shorten scene/context input.',
      };
    }

    return {
      status: 400,
      message: 'Invalid request sent to AI service. Please try a different image.',
    };
  }

  return {
    status: 500,
    message: 'Character generation failed due to an AI service error.',
  };
}

function extractImageData(response: GeminiImageResponse): string | undefined {
  for (const candidate of response.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      const data = part.inlineData?.data;
      if (data) return data;
    }
  }
  return undefined;
}

function extractInterleavedCharacterSectionName(label: string): string | undefined {
  const npcMatch = label.match(
    /(?:【角色\s*[-—–:：]\s*(.+?)】)|(?:\[(?:CHARACTER|NPC)\s*[-:]\s*(.+?)\])/i
  )
  const name = npcMatch?.[1] ?? npcMatch?.[2]
  return name?.trim() || undefined
}

function hasInterleavedCoverSection(label: string): boolean {
  return label.includes('【封面】') || label.includes('[COVER]')
}

function stripInterleavedStorySections(text: string): string {
  return text
    .replace(/^[\s\S]*?(?:【故事正文】|\[STORY BODY\])\s*/m, '')
    .replace(/(?:【故事正文】|\[STORY BODY\])/g, '')
    .replace(/(?:【角色\s*[-—–:：]\s*[\s\S]*$)|(?:\[(?:CHARACTER|NPC)\s*[-:]\s*[\s\S]*$)/ig, '')
    .replace(/(?:【封面】|\[COVER\])[\s\S]*$/g, '')
    .trim()
}

/**
 * Generate a character portrait using:
 *   - userPhotoBase64: the user's reference photo (face likeness)
 *   - styleRefBase64:  a reference image showing the target art style
 *   - stylePrompt:     detailed text description of the desired style
 *   - ageDesc:         optional age description (e.g. "5-year-old")
 *
 * Passes both images to Gemini so it can match the person's appearance
 * while adopting the visual style of the reference image.
 */
export async function generateCharacterWithStyleRef(
  userPhotoBase64: string,
  styleRefBase64: string,
  stylePrompt: string,
  ageDesc = ''
): Promise<{ imageData?: string; mimeType: string }> {
  const prompt = buildCharacterWithStyleRefPrompt(stylePrompt, ageDesc)

  const response = (await genAI.models.generateContent({
    model: IMAGE_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          // Image 1: style reference
          { inlineData: { data: styleRefBase64, mimeType: 'image/jpeg' } },
          // Image 2: user's photo (likeness)
          { inlineData: { data: userPhotoBase64, mimeType: 'image/jpeg' } },
        ],
      },
    ],
  })) as GeminiImageResponse

  const rawImage = extractImageData(response)
  if (!rawImage) return { mimeType: 'image/jpeg' }

  const compressed = await compressImage(rawImage, 768, 80)
  return { imageData: compressed.data, mimeType: compressed.mimeType }
}

// ── JSON parsing helpers ──────────────────────────────────────

/** Strip markdown fences, locate the first `{...}` block, fix trailing commas, and parse. */
function safeParseJsonObject(raw: string): unknown {
  let text = raw.replace(/```json|```/g, '').trim()
  const m = text.match(/\{[\s\S]*\}/)
  if (m) text = m[0]
  text = text.replace(/,\s*([}\]])/g, '$1')
  return JSON.parse(text)
}

/** Strip markdown fences, locate the first `[...]` block, fix trailing commas, and parse. */
function safeParseJsonArray(raw: string): unknown[] {
  let text = raw.replace(/```json|```/g, '').trim()
  const m = text.match(/\[[\s\S]*\]/)
  if (m) text = m[0]
  text = text.replace(/,\s*([}\]])/g, '$1')
  const parsed = JSON.parse(text)
  return Array.isArray(parsed) ? parsed : []
}

// ── Storybook v2: 三版梗概生成 ───────────────────────────────

/**
 * 按照新的提示词模板生成 A/B/C 三版故事梗概。
 */
export async function generateSynopsisVersions(params: {
  storyName: string
  protagonistName: string
  supportingName: string
  backgroundKeywords: string
  ageRange: string
  locale?: Locale
  protagonistPronoun?: string
  protagonistRole?: string
  previousStoryTitle?: string
  previousStoryContent?: string
  previousStoryChoices?: string[]
}): Promise<{ A: { title: string; content: string }; B: { title: string; content: string }; C: { title: string; content: string } }> {
  const {
    storyName,
    protagonistName,
    supportingName,
    backgroundKeywords,
    ageRange,
    locale = 'zh',
    protagonistPronoun,
    protagonistRole,
    previousStoryTitle,
    previousStoryContent,
    previousStoryChoices,
  } = params

  const prompt = buildSynopsisVersionsPrompt({
    storyName,
    protagonistName,
    supportingName,
    backgroundKeywords,
    ageRange,
    locale,
    protagonistPronoun,
    protagonistRole,
    previousStoryTitle,
    previousStoryContent,
    previousStoryChoices,
  })

  const response = await genAI.models.generateContent({ model: TEXT_MODEL, contents: prompt })

  try {
    const parsed = safeParseJsonObject(response.text ?? '{}') as Record<string, unknown>
    const pick = (v: unknown) => {
      if (!v) return { title: '', content: '' }
      if (typeof v === 'string') return { title: '', content: v }
      const o = v as Record<string, string>
      return { title: o.title ?? '', content: o.content ?? '' }
    }
    return { A: pick(parsed.A), B: pick(parsed.B), C: pick(parsed.C) }
  } catch (e) {
    console.error('[generateSynopsisVersions] Failed to parse JSON:', e)
    const raw = response.text ?? ''
    const extractVersion = (key: string) => {
      // try "key": {"title": ..., "content": ...} or "key": "..."
      const objM = raw.match(new RegExp(`"${key}"\\s*:\\s*\\{[^}]*"content"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"[^}]*\\}`))
      if (objM) return { title: '', content: objM[1].replace(/\\n/g, '\n') }
      const strM = raw.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"` ))
      return { title: '', content: strM ? strM[1].replace(/\\n/g, '\n') : '' }
    }
    return { A: extractVersion('A'), B: extractVersion('B'), C: extractVersion('C') }
  }
}

// ── Storybook v2: 冒险小伙伴推荐 ─────────────────────────────

/**
 * 根据主角和故事元素，生成 3 个 AI 推荐的冒险小伙伴。
 */
export async function generateCompanionSuggestions(params: {
  protagonistName: string
  backgroundKeywords: string
  ageRange: string
  locale?: Locale
  protagonistPronoun?: string
  protagonistRole?: string
}): Promise<CompanionSuggestion[]> {
  const { protagonistName, backgroundKeywords, ageRange, locale = 'zh', protagonistPronoun, protagonistRole } = params

  const prompt = buildCompanionSuggestionsPrompt({
    protagonistName,
    backgroundKeywords,
    ageRange,
    locale,
    protagonistPronoun,
    protagonistRole,
  })

  const response = await genAI.models.generateContent({ model: TEXT_MODEL, contents: prompt })

  try {
    const parsed = safeParseJsonArray(response.text ?? '')
    return parsed.slice(0, 3) as CompanionSuggestion[]
  } catch (e) {
    console.error('[generateCompanionSuggestions] Failed to parse JSON:', e)
    return []
  }
}

// ── Storybook v2: 单次交错生成（故事 + 封面 + NPC立绘） ──────

/**
 * Single interleaved Gemini call that generates story text, cover image,
 * and NPC character portrait images all at once using
 * `responseModalities: ['TEXT', 'IMAGE']`.
 */
export async function generateStoryWithAssets(params: {
  storyName: string
  protagonistName: string
  supportingName: string
  synopsis: string
  ageRange: string
  styleDesc: string
  locale?: Locale
  theme?: string
  characterImageBase64?: string
  protagonistPronoun?: string
  protagonistRole?: string
  needsSupportingCharacter?: boolean
  previousStoryTitle?: string
  previousStoryContent?: string
  previousStoryChoices?: string[]
}): Promise<{
  story: string
  choices: string[]
  npcs: Array<{ name: string; description: string }>
  supporting?: { name: string; description: string }
  coverImage?: { data: string; mimeType: string }
  npcImages: Map<string, { data: string; mimeType: string }>
  _debug?: {
    rawResponse: unknown
    rawText: string
    imageSectionLabels: string[]
    responseParts: Array<{ type: 'text'; text: string } | { type: 'image'; mimeType: string }>
  }
}> {
  const {
    storyName,
    protagonistName,
    supportingName,
    synopsis,
    ageRange,
    styleDesc,
    locale = 'zh',
    theme,
    characterImageBase64,
    protagonistPronoun,
    protagonistRole,
    needsSupportingCharacter,
    previousStoryTitle,
    previousStoryContent,
    previousStoryChoices,
  } = params

  const debugTag = '[generateStoryWithAssets]'
  const styleLabel = styleDesc || 'dreamlike watercolor, macaron palette, warm soft light'
  const hasCharacterImageRef = Boolean(characterImageBase64)

  const prompt = buildStoryWithAssetsPrompt({
    storyName,
    protagonistName,
    supportingName,
    synopsis,
    ageRange,
    styleDesc,
    locale,
    theme,
    hasCharacterImageRef,
    protagonistPronoun,
    protagonistRole,
    needsSupportingCharacter,
    previousStoryTitle,
    previousStoryContent,
    previousStoryChoices,
  })

  console.log(`${debugTag} Start`, {
    storyName,
    protagonistName,
    supportingName,
    ageRange,
    styleLabel,
    hasCharacterImageRef,
    synopsisChars: synopsis.length,
    hasPreviousStoryContext: Boolean(previousStoryContent),
    promptChars: prompt.length,
  })

  // Build content parts: text prompt + optional protagonist reference image
  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
    { text: prompt },
  ]

  if (characterImageBase64) {
    const isJpeg = characterImageBase64.startsWith('/9j/')
    parts.push({
      text: buildProtagonistReferencePrompt(protagonistName),
    })
    parts.push({
      inlineData: {
        data: characterImageBase64,
        mimeType: isJpeg ? 'image/jpeg' : 'image/png',
      },
    })
  }

  const response = (await genAI.models.generateContent({
    model: IMAGE_MODEL,
    contents: [{ role: 'user', parts }],
    config: { responseModalities: ['TEXT', 'IMAGE'] },
  })) as GeminiImageResponse

  // Walk response parts sequentially to extract text + images
  const responseParts = response.candidates?.[0]?.content?.parts ?? []
  const textPartCount = responseParts.filter((part) => Boolean(part.text)).length
  const imagePartCount = responseParts.filter((part) => Boolean(part.inlineData?.data)).length
  console.log(`${debugTag} Response`, {
    candidateCount: response.candidates?.length ?? 0,
    totalParts: responseParts.length,
    textPartCount,
    imagePartCount,
  })

  let allText = ''
  const images: Array<{ data: string; mimeType: string }> = []
  // Track which section each image belongs to based on preceding text.
  // Each image consumes (and clears) the accumulated text since the last image,
  // so that a single text chunk containing multiple section headers is only
  // matched against the first image that follows it.
  const imageSectionLabels: string[] = []
  let pendingTextSinceLastImage = ''
  const debugParts: Array<{ type: 'text'; text: string } | { type: 'image'; mimeType: string }> = []

  for (const part of responseParts) {
    if (part.text) {
      allText += part.text
      pendingTextSinceLastImage += part.text
      debugParts.push({ type: 'text', text: part.text })
    } else if (part.inlineData?.data) {
      const rawData = part.inlineData.data
      const compressed = await compressImage(rawData, 768, 80)
      images.push({ data: compressed.data, mimeType: compressed.mimeType })
      imageSectionLabels.push(pendingTextSinceLastImage)
      pendingTextSinceLastImage = ''
      debugParts.push({ type: 'image', mimeType: part.inlineData.mimeType ?? 'unknown' })
    }
  }

  // Parse story text, choices, and NPCs from collected text
  const rawText = allText.trim()

  const choicesMatch = rawText.match(/<!--CHOICES:(.*?)-->/)
  let choices: string[] = []
  if (choicesMatch) {
    try { choices = JSON.parse(choicesMatch[1]) as string[] } catch { /* ignore */ }
  }

  const npcsMatch = rawText.match(/<!--NPCS:(.*?)-->/)
  let npcs: Array<{ name: string; description: string }> = []
  if (npcsMatch) {
    try {
      const parsed = JSON.parse(npcsMatch[1]) as Array<{ name?: string; description?: string }>
      npcs = (Array.isArray(parsed) ? parsed : [])
        .map((npc) => ({
          name: (npc?.name ?? '').trim(),
          description: (npc?.description ?? '').trim(),
        }))
        .filter((npc) => npc.name.length > 0)
    } catch {
      // ignore malformed NPC payload
    }
  }

  const supportingMatch = rawText.match(/<!--SUPPORTING:(.*?)-->/)
  let supporting: { name: string; description: string } | undefined
  if (supportingMatch) {
    try {
      const parsed = JSON.parse(supportingMatch[1]) as { name?: string; description?: string }
      const name = (parsed?.name ?? '').trim()
      const description = (parsed?.description ?? '').trim()
      if (name) {
        supporting = { name, description }
      }
    } catch {
      // ignore malformed SUPPORTING payload
    }
  }

  let story = rawText
    .replace(/<!--CHOICES:.*?-->/g, '')
    .replace(/<!--NPCS:.*?-->/g, '')
    .replace(/<!--SUPPORTING:.*?-->/g, '')

  story = stripInterleavedStorySections(story)
  console.log(`${debugTag} ParsedText`, {
    rawTextChars: rawText.length,
    storyChars: story.length,
    choicesCount: choices.length,
    npcCount: npcs.length,
    imageCount: images.length,
  })

  // Map images to NPC portraits vs cover based on preceding text labels
  const npcImages = new Map<string, { data: string; mimeType: string }>()
  let coverImage: { data: string; mimeType: string } | undefined

  // Track which image indices have been assigned
  const assignedImageIndices = new Set<number>()

  for (let i = 0; i < images.length; i++) {
    const label = imageSectionLabels[i] || ''
    // Try NPC match first — more specific than cover
    const npcName = extractInterleavedCharacterSectionName(label)
    if (npcName) {
      npcImages.set(npcName, images[i])
      assignedImageIndices.add(i)
    } else if (hasInterleavedCoverSection(label)) {
      coverImage = images[i]
      assignedImageIndices.add(i)
    } else {
      if (i === images.length - 1 && !coverImage) {
        // Last image is likely the cover if not yet assigned
        coverImage = images[i]
        assignedImageIndices.add(i)
      }
    }
  }

  // Fallback pass: try NPC-name-in-label matching for unmapped images
  const npcNamesFromList = npcs.map((npc) => npc.name)
  const mappedNpcNames = new Set(npcImages.keys())

  for (let i = 0; i < images.length; i++) {
    if (assignedImageIndices.has(i)) continue
    const label = imageSectionLabels[i] || ''
    if (!label) continue
    for (const npcName of npcNamesFromList) {
      if (!mappedNpcNames.has(npcName) && label.includes(npcName)) {
        npcImages.set(npcName, images[i])
        assignedImageIndices.add(i)
        mappedNpcNames.add(npcName)
        break
      }
    }
  }

  // Positional fallback: assign remaining unmapped images to unmapped NPCs in order
  const unmappedNpcNames = npcNamesFromList.filter((name) => !mappedNpcNames.has(name))
  const unmappedImageIndices = Array.from({ length: images.length }, (_, i) => i)
    .filter((i) => !assignedImageIndices.has(i))

  for (let j = 0; j < Math.min(unmappedNpcNames.length, unmappedImageIndices.length); j++) {
    npcImages.set(unmappedNpcNames[j], images[unmappedImageIndices[j]])
    assignedImageIndices.add(unmappedImageIndices[j])
  }

  const npcImageNames = Array.from(npcImages.keys())
  const mappedImageCount = npcImages.size + (coverImage ? 1 : 0)
  console.log(`${debugTag} ImageMapping`, {
    coverAssigned: Boolean(coverImage),
    npcImageCount: npcImages.size,
    npcImageNames,
    totalImageCount: images.length,
    unmappedImageCount: Math.max(0, images.length - mappedImageCount),
  })

  if (npcs.length > 0 && npcImages.size === 0) {
    console.warn(`${debugTag} NPCs parsed but no NPC images mapped`, {
      npcNames: npcs.map((npc) => npc.name),
      imageSectionLabels,
    })
  }

  return {
    story,
    choices,
    npcs,
    supporting,
    coverImage,
    npcImages,
    _debug: { rawResponse: response, rawText: allText, imageSectionLabels, responseParts: debugParts },
  }
}

// ── Storybook v2: 动漫导演分镜脚本生成 ──────────────────────

/**
 * 生成完整的动漫导演分镜脚本（可配置分镜数量范围），每个分镜包含：
 * - 场景描述、镜头设计、动画动作(8s)、旁白VO、对话
 * - 三帧图片 prompt（开头帧/中间帧/结尾帧，16:9，英文）
 *
 * 返回格式与 ScriptScene[] 兼容，imagePrompts 包含三帧 prompt。
 */
export async function generateStorybookDirectorScript(params: {
  storyName: string
  protagonistName: string
  supportingName: string
  storyContent: string
  ageRange: string
  styleDesc: string
  locale?: Locale
  characterPool?: string[]
  characterProfiles?: Array<{ name: string; description?: string }>
  minSceneCount?: number
  maxSceneCount?: number
  protagonistPronoun?: string
  protagonistRole?: string
}): Promise<import('@/types').DirectorStoryboardScene[]> {
  const {
    storyName,
    protagonistName,
    supportingName,
    storyContent,
    ageRange,
    styleDesc,
    locale = 'zh',
    characterPool = [],
    characterProfiles = [],
    minSceneCount = 15,
    maxSceneCount = 18,
    protagonistPronoun,
    protagonistRole,
  } = params

  const minScenes = Math.max(1, Math.trunc(minSceneCount))
  const maxScenes = Math.max(minScenes, Math.trunc(maxSceneCount))
  const normalizeName = (name: string) => name.replace(/\s+/g, '').toLowerCase()
  const canonicalByKey = new Map<string, string>()
  const detailsByKey = new Map<string, string>()
  for (const rawName of characterPool) {
    const trimmed = rawName.trim()
    if (!trimmed) continue
    const key = normalizeName(trimmed)
    if (!canonicalByKey.has(key)) canonicalByKey.set(key, trimmed)
  }
  for (const profile of characterProfiles) {
    const name = profile.name?.trim() || ''
    if (!name) continue
    const key = normalizeName(name)
    if (!canonicalByKey.has(key)) canonicalByKey.set(key, name)
    const description = profile.description?.trim() || ''
    if (description && !detailsByKey.has(key)) {
      detailsByKey.set(key, description.slice(0, 120))
    }
  }
  if (!canonicalByKey.has(normalizeName(protagonistName))) {
    canonicalByKey.set(normalizeName(protagonistName), protagonistName)
  }
  const characterPoolText = Array.from(canonicalByKey.values()).join(', ')
  const characterProfileText = Array.from(canonicalByKey.entries())
    .map(([key, name]) => {
      const detail = detailsByKey.get(key)
      return detail ? `${name}: ${detail}` : name
    })
    .join('\n')

  const prompt = buildDirectorScriptPrompt({
    storyName,
    protagonistName,
    supportingName,
    storyContent,
    ageRange,
    styleDesc,
    locale,
    characterPoolText,
    characterProfileText,
    minSceneCount: minScenes,
    maxSceneCount: maxScenes,
    protagonistPronoun,
    protagonistRole,
  })

  const response = await genAI.models.generateContent({ model: TEXT_MODEL, contents: prompt })

  try {
    const rawScenes = safeParseJsonArray(response.text ?? '') as Array<{
      index: number
      sceneDescription: string
      cameraDesign: string
      animationAction: string
      voiceOver: string
      dialogue: { speaker: string; text: string }[]
      charactersUsed?: unknown
      estimatedDuration: number
      openingFramePrompt: string
      midActionFramePrompt: string
      endingFramePrompt: string
    }>

    return rawScenes.map((s) => {
      const usedList: string[] = []
      const seen = new Set<string>()
      const rawList = Array.isArray(s.charactersUsed)
        ? s.charactersUsed
        : typeof s.charactersUsed === 'string'
          ? s.charactersUsed.split(/[、,，/|]/)
          : []

      const pushName = (raw: unknown) => {
        if (typeof raw !== 'string') return
        const trimmed = raw.trim()
        if (!trimmed) return
        const key = normalizeName(trimmed)
        const canonical = canonicalByKey.get(key) ?? trimmed
        const canonicalKey = normalizeName(canonical)
        if (seen.has(canonicalKey)) return
        seen.add(canonicalKey)
        usedList.push(canonical)
      }

      rawList.forEach(pushName)
      s.dialogue?.forEach((line) => pushName(line?.speaker))

      const withCharacters = (promptText: string | undefined) => {
        const base = (promptText ?? '').trim()
        if (usedList.length === 0) return base
        const label = usedList
          .map((name) => {
            const detail = detailsByKey.get(normalizeName(name))
            return detail ? `${name}(${detail})` : name
          })
          .join(', ')
        const lc = base.toLowerCase()
        if (lc.includes('must include all characters') || lc.includes('characters in this frame')) {
          return base
        }
        return `${base} Characters in this frame: ${label}. Must include all characters, keep each one clearly visible, consistent, and recognizable.`
      }

      const openingFramePrompt = withCharacters(s.openingFramePrompt)
      const midActionFramePrompt = withCharacters(s.midActionFramePrompt)
      const endingFramePrompt = withCharacters(s.endingFramePrompt)

      return {
        charactersUsed: usedList,
        index: s.index - 1,  // convert to 0-based
        title: s.sceneDescription?.slice(0, 40) ?? (locale === 'zh' ? `分镜 ${s.index}` : `Scene ${s.index}`),
        narration: s.voiceOver ?? '',
        dialogue: s.dialogue ?? [],
        imagePrompt: openingFramePrompt,
        imagePrompts: [
          openingFramePrompt,
          midActionFramePrompt,
          endingFramePrompt,
        ],
        estimatedDuration: s.estimatedDuration ?? 10,
        sceneDescription: s.sceneDescription ?? '',
        cameraDesign: s.cameraDesign ?? '',
        animationAction: s.animationAction ?? '',
      }
    })
  } catch (e) {
    console.error('[generateStorybookDirectorScript] Parse error:', e, '\nRaw:', response.text?.slice(0, 500))
    return []
  }
}

// ── Interleaved director script + scene image generation ──────

/**
 * Single interleaved Gemini call that generates both the director storyboard
 * script AND scene illustration images in one pass using
 * `responseModalities: ['TEXT', 'IMAGE']`.
 *
 * Falls back to text-only `generateStorybookDirectorScript()` on failure.
 */
export async function generateInterleavedDirectorScript(params: {
  storyName: string
  protagonistName: string
  supportingName: string
  storyContent: string
  ageRange: string
  styleDesc: string
  locale?: Locale
  characterPool?: string[]
  characterProfiles?: Array<{ name: string; description?: string }>
  sceneCount?: number
  protagonistPronoun?: string
  protagonistRole?: string
  characterImagesBase64?: string[]
  characterNames?: string[]
}): Promise<{
  scenes: import('@/types').DirectorStoryboardScene[]
  sceneImages: Map<number, Array<{ data: string; mimeType: string }>>
}> {
  const {
    storyName,
    protagonistName,
    supportingName,
    storyContent,
    ageRange,
    styleDesc,
    locale = 'zh',
    characterPool = [],
    characterProfiles = [],
    sceneCount = 3,
    protagonistPronoun,
    protagonistRole,
    characterImagesBase64 = [],
    characterNames = [],
  } = params

  const debugTag = '[generateInterleavedDirectorScript]'

  // Build character name normalization maps (same as generateStorybookDirectorScript)
  const normalizeName = (name: string) => name.replace(/\s+/g, '').toLowerCase()
  const canonicalByKey = new Map<string, string>()
  const detailsByKey = new Map<string, string>()
  for (const rawName of characterPool) {
    const trimmed = rawName.trim()
    if (!trimmed) continue
    const key = normalizeName(trimmed)
    if (!canonicalByKey.has(key)) canonicalByKey.set(key, trimmed)
  }
  for (const profile of characterProfiles) {
    const name = profile.name?.trim() || ''
    if (!name) continue
    const key = normalizeName(name)
    if (!canonicalByKey.has(key)) canonicalByKey.set(key, name)
    const description = profile.description?.trim() || ''
    if (description && !detailsByKey.has(key)) {
      detailsByKey.set(key, description.slice(0, 120))
    }
  }
  if (!canonicalByKey.has(normalizeName(protagonistName))) {
    canonicalByKey.set(normalizeName(protagonistName), protagonistName)
  }
  const characterPoolText = Array.from(canonicalByKey.values()).join(', ')
  const characterProfileText = Array.from(canonicalByKey.entries())
    .map(([key, name]) => {
      const detail = detailsByKey.get(key)
      return detail ? `${name}: ${detail}` : name
    })
    .join('\n')

  const prompt = buildInterleavedDirectorScriptPrompt({
    storyName,
    protagonistName,
    supportingName,
    storyContent,
    ageRange,
    styleDesc,
    locale,
    characterPoolText,
    characterProfileText,
    sceneCount,
    protagonistPronoun,
    protagonistRole,
  })

  console.log(`${debugTag} Start`, {
    storyName,
    protagonistName,
    supportingName,
    ageRange,
    sceneCount,
    characterImageCount: characterImagesBase64.length,
    promptChars: prompt.length,
  })

  // Build content parts: text prompt + optional character reference images
  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
    { text: prompt },
  ]

  for (let i = 0; i < characterImagesBase64.length; i++) {
    const imgBase64 = characterImagesBase64[i]
    const name = characterNames[i] || `Character ${i + 1}`
    parts.push({ text: `Reference image for ${name}:` })
    const isJpeg = imgBase64.startsWith('/9j/')
    parts.push({
      inlineData: {
        data: imgBase64,
        mimeType: isJpeg ? 'image/jpeg' : 'image/png',
      },
    })
  }

  const response = (await genAI.models.generateContent({
    model: IMAGE_MODEL,
    contents: [{ role: 'user', parts }],
    config: { responseModalities: ['TEXT', 'IMAGE'] },
  })) as GeminiImageResponse

  // Walk response parts sequentially: extract SCENE_META from text, map images to scenes
  const responseParts = response.candidates?.[0]?.content?.parts ?? []
  const textPartCount = responseParts.filter((part) => Boolean(part.text)).length
  const imagePartCount = responseParts.filter((part) => Boolean(part.inlineData?.data)).length
  console.log(`${debugTag} Response`, {
    totalParts: responseParts.length,
    textPartCount,
    imagePartCount,
  })

  const sceneMetaList: Array<{
    index: number
    sceneDescription: string
    cameraDesign: string
    animationAction: string
    voiceOver: string
    dialogue: { speaker: string; text: string }[]
    charactersUsed?: unknown
    estimatedDuration: number
    openingFramePrompt: string
    midActionFramePrompt: string
    endingFramePrompt: string
  }> = []
  const sceneImages = new Map<number, Array<{ data: string; mimeType: string }>>()
  const MAX_FRAMES_PER_SCENE = 3

  // Track the last parsed scene index so the next image can be mapped to it
  let lastParsedSceneIndex = -1

  for (const part of responseParts) {
    if (part.text) {
      // Extract all SCENE_META markers from this text part
      const metaRegex = /<!--SCENE_META:(.*?)-->/g
      let match: RegExpExecArray | null
      while ((match = metaRegex.exec(part.text)) !== null) {
        try {
          const meta = JSON.parse(match[1])
          sceneMetaList.push(meta)
          lastParsedSceneIndex = sceneMetaList.length - 1
        } catch (e) {
          console.warn(`${debugTag} Failed to parse SCENE_META:`, e)
        }
      }
    } else if (part.inlineData?.data && lastParsedSceneIndex >= 0) {
      // Collect up to 3 images per scene (opening, mid-action, ending)
      const frames = sceneImages.get(lastParsedSceneIndex) ?? []
      if (frames.length < MAX_FRAMES_PER_SCENE) {
        const compressed = await compressImage(part.inlineData.data, 768, 80)
        frames.push(compressed)
        sceneImages.set(lastParsedSceneIndex, frames)
      }
    }
  }

  const sceneImageCounts = Array.from(sceneImages.entries())
    .map(([idx, frames]) => `scene ${idx}: ${frames.length}`)
    .join(', ')
  console.log(`${debugTag} Parsed`, {
    sceneMetaCount: sceneMetaList.length,
    sceneImageCount: sceneImages.size,
    sceneImageCounts,
    totalImages: Array.from(sceneImages.values()).reduce((sum, frames) => sum + frames.length, 0),
  })

  if (sceneMetaList.length === 0) {
    throw new Error('Interleaved director script returned no scene metadata')
  }

  // Convert raw scene metadata to DirectorStoryboardScene (same logic as generateStorybookDirectorScript)
  const scenes: import('@/types').DirectorStoryboardScene[] = sceneMetaList.map((s) => {
    const usedList: string[] = []
    const seen = new Set<string>()
    const rawList = Array.isArray(s.charactersUsed)
      ? s.charactersUsed
      : typeof s.charactersUsed === 'string'
        ? s.charactersUsed.split(/[、,，/|]/)
        : []

    const pushName = (raw: unknown) => {
      if (typeof raw !== 'string') return
      const trimmed = raw.trim()
      if (!trimmed) return
      const key = normalizeName(trimmed)
      const canonical = canonicalByKey.get(key) ?? trimmed
      const canonicalKey = normalizeName(canonical)
      if (seen.has(canonicalKey)) return
      seen.add(canonicalKey)
      usedList.push(canonical)
    }

    rawList.forEach(pushName)
    s.dialogue?.forEach((line) => pushName(line?.speaker))

    const withCharacters = (promptText: string | undefined) => {
      const base = (promptText ?? '').trim()
      if (usedList.length === 0) return base
      const label = usedList
        .map((name) => {
          const detail = detailsByKey.get(normalizeName(name))
          return detail ? `${name}(${detail})` : name
        })
        .join(', ')
      const lc = base.toLowerCase()
      if (lc.includes('must include all characters') || lc.includes('characters in this frame')) {
        return base
      }
      return `${base} Characters in this frame: ${label}. Must include all characters, keep each one clearly visible, consistent, and recognizable.`
    }

    const openingFramePrompt = withCharacters(s.openingFramePrompt)
    const midActionFramePrompt = withCharacters(s.midActionFramePrompt)
    const endingFramePrompt = withCharacters(s.endingFramePrompt)

    return {
      charactersUsed: usedList,
      index: s.index - 1, // convert to 0-based
      title: s.sceneDescription?.slice(0, 40) ?? (locale === 'zh' ? `分镜 ${s.index}` : `Scene ${s.index}`),
      narration: s.voiceOver ?? '',
      dialogue: s.dialogue ?? [],
      imagePrompt: openingFramePrompt,
      imagePrompts: [
        openingFramePrompt,
        midActionFramePrompt,
        endingFramePrompt,
      ],
      estimatedDuration: s.estimatedDuration ?? 10,
      sceneDescription: s.sceneDescription ?? '',
      cameraDesign: s.cameraDesign ?? '',
      animationAction: s.animationAction ?? '',
    }
  })

  return { scenes, sceneImages }
}

// ── Story image (original, kept for fallback) ─────────────────

export async function generateStoryImage(
  sceneDescription: string,
  characterReference: string,
  characterImagesBase64?: string[],
  characterNames?: string[]
) {
  const normalizedScene = sceneDescription.replace(/\s+/g, ' ').slice(0, 260);

  const textHint = characterReference
    ? characterReference.replace(/\s+/g, ' ').slice(0, 240)
    : DEFAULT_STORY_IMAGE_REFERENCE_HINT;

  const hasMultiple = characterImagesBase64 && characterImagesBase64.length > 1;
  
  let multiRefLabel = '';
  if (hasMultiple && characterNames && characterNames.length === characterImagesBase64.length) {
    multiRefLabel = ' Each reference image below is labeled with the character name.';
  }

  const prompt = buildStoryImagePrompt({
    sceneDescription: normalizedScene,
    hasMultipleReferences: Boolean(hasMultiple),
    multiRefLabel,
    textHint,
  })

  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
    { text: prompt },
  ];

  if (characterImagesBase64) {
    for (let i = 0; i < characterImagesBase64.length; i++) {
      const imgBase64 = characterImagesBase64[i];
      const name = characterNames && characterNames[i] ? characterNames[i] : `Character ${i + 1}`;
      
      if (hasMultiple) {
        parts.push({ text: buildReferenceImageLabel(name) });
      }
      
      const isJpeg = imgBase64.startsWith('/9j/');
      parts.push({
        inlineData: {
          data: imgBase64,
          mimeType: isJpeg ? 'image/jpeg' : 'image/png',
        },
      });
    }
  }

  const response = (await genAI.models.generateContent({
    model: IMAGE_MODEL,
    contents: [
      {
        role: 'user',
        parts,
      },
    ],
  })) as GeminiImageResponse;
  const rawImage = extractImageData(response);
  if (!rawImage) return undefined;

  const compressed = await compressImage(rawImage, 640, 70);
  return { data: compressed.data, mimeType: compressed.mimeType };
}

// ── Character voice assignment ────────────────────────────────

// Child-appropriate voices targeting 5–8 year old characters
const GEMINI_VOICES = [
  { name: 'Puck',   tone: 'upbeat and playful',   gender: 'neutral', ageRange: 'young' },
  { name: 'Leda',   tone: 'youthful and bright',  gender: 'female',  ageRange: 'young' },
  { name: 'Zephyr', tone: 'bright and energetic', gender: 'neutral', ageRange: 'young' },
  { name: 'Fenrir', tone: 'excitable and lively', gender: 'male',    ageRange: 'young' },
  { name: 'Aoede',  tone: 'breezy and warm',       gender: 'female',  ageRange: 'young' },
]

export async function assignCharacterVoice(
  name: string,
  age: number | null | undefined,
  style: string,
  excludeVoice?: string,
  locale: Locale = 'zh'
): Promise<{ voiceName: string; reason: string }> {
  // Filter out the currently assigned voice so re-assign always picks a different one
  const available = excludeVoice
    ? GEMINI_VOICES.filter(v => v.name !== excludeVoice)
    : GEMINI_VOICES
  const prompt = buildVoiceAssignmentPrompt({
    name,
    age,
    style,
    locale,
    availableVoices: available,
  })

  try {
    const response = await genAI.models.generateContent({ model: TEXT_MODEL, contents: prompt })
    const parsed = safeParseJsonObject(response.text ?? '') as Record<string, string>
    if (parsed.voiceName && available.some(v => v.name === parsed.voiceName)) {
      return { voiceName: parsed.voiceName, reason: parsed.reason ?? '' }
    }
  } catch {
    // fall through to default
  }

  // Default: pick first available voice
  return {
    voiceName: available[0]?.name ?? 'Puck',
    reason: locale === 'zh' ? '已分配默认声音。' : 'Default voice assigned.',
  }
}
