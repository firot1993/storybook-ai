import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import type { CompanionSuggestion } from '@/types'

const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});

const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL?.trim() || 'gemini-3-flash-preview';
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL?.trim() || 'gemini-3.1-flash-image-preview';

/**
 * Estimated pricing per 1 million tokens.
 * Values are based on Gemini 1.5 Flash rates as a baseline.
 */
const PRICING: Record<string, { input: number; output: number }> = {
  [TEXT_MODEL]: { input: 0.075, output: 0.30 },
  [IMAGE_MODEL]: { input: 0.075, output: 0.30 },
  default: { input: 0.075, output: 0.30 },
};

/**
 * Predicts the cost of a request based on input tokens.
 * Note: This only estimates the input cost. Total cost includes generated output.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function estimatePrice(model: string, prompt: string | any[]) {
  try {
    const contents = typeof prompt === 'string' ? [{ role: 'user', parts: [{ text: prompt }] }] : prompt;
    const { totalTokens } = await genAI.models.countTokens({
      model,
      contents,
    });

    const rates = PRICING[model] || PRICING.default;
    const estimatedInputCost = ((totalTokens ?? 0) / 1_000_000) * rates.input;

    return {
      totalTokens,
      estimatedInputCost,
      formattedCost: `$${estimatedInputCost.toFixed(6)}`,
    };
  } catch (error) {
    console.warn('Cost estimation failed:', error);
    return null;
  }
}

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

export type GeminiImageDiagnostics = {
  candidateCount: number;
  finishReasons: string[];
  partKinds: string[];
  blockedBySafety: boolean;
  textPreview: string;
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

function buildImageDiagnostics(response: GeminiImageResponse): GeminiImageDiagnostics {
  const candidates = response.candidates ?? [];
  const partKinds = candidates.flatMap((candidate) =>
    (candidate.content?.parts ?? []).map((part) => {
      if (part.inlineData?.data) return `inlineData:${part.inlineData.mimeType ?? 'unknown'}`;
      if (part.text) return 'text';
      return 'unknown';
    })
  );
  const textPreview = candidates
    .flatMap((candidate) => (candidate.content?.parts ?? []).map((part) => part.text ?? ''))
    .find((text) => text.trim().length > 0)
    ?.slice(0, 200) ?? '';

  const blockedBySafety = candidates.some((candidate) =>
    (candidate.safetyRatings ?? []).some((rating) => Boolean(rating.blocked))
  );

  return {
    candidateCount: candidates.length,
    finishReasons: candidates.map((candidate) => candidate.finishReason ?? 'unknown'),
    partKinds,
    blockedBySafety,
    textPreview,
  };
}


export async function generateCharacterImageWithDiagnostics(
  imageBase64: string,
  style: string = 'cute cartoon character'
): Promise<{
  imageData?: string;
  mimeType: string;
  diagnostics: GeminiImageDiagnostics;
}> {
  const prompt = `Transform this photo into a ${style}, children's book illustration style, vibrant colors, friendly expression, simple background`;

  const response = (await genAI.models.generateContent({
    model: IMAGE_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          {
            inlineData: {
              data: imageBase64,
              mimeType: 'image/jpeg',
            },
          },
        ],
      },
    ],
  })) as GeminiImageResponse;

  const rawImage = extractImageData(response);
  let imageData = rawImage;
  let mimeType = 'image/png';
  if (rawImage) {
    const compressed = await compressImage(rawImage, 512, 75);
    imageData = compressed.data;
    mimeType = compressed.mimeType;
  }

  return {
    imageData,
    mimeType,
    diagnostics: buildImageDiagnostics(response),
  };
}

export async function generateCharacterImage(imageBase64: string, style?: string) {
  const result = await generateCharacterImageWithDiagnostics(imageBase64, style);
  return result.imageData;
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
  // Parse age from ageDesc like "2-year-old" → 2
  const ageNum = ageDesc ? parseInt(ageDesc, 10) : NaN

  let ageInstruction = ''
  if (!isNaN(ageNum) && ageNum > 0) {
    if (ageNum <= 3) {
      ageInstruction =
        `IMPORTANT — The character is ${ageNum} years old. ` +
        `Faithfully extract the facial features (eye shape, eye size, face shape, face fat/thin ratio, nose shape) from the USER PHOTO and preserve them. ` +
        `Only adjust the overall head-to-body proportion to match a toddler: larger head relative to body, shorter limbs. ` +
        `Do NOT add generic "big eyes" or "chubby cheeks" that don't exist in the photo.\n`
    } else if (ageNum <= 6) {
      ageInstruction =
        `IMPORTANT — The character is ${ageNum} years old. ` +
        `Faithfully extract the facial features (eye shape, eye size, face shape, face fat/thin ratio, nose shape) from the USER PHOTO and preserve them. ` +
        `Only adjust the overall proportion to match a young child: slightly larger head relative to body, soft skin texture. ` +
        `Do NOT impose generic child features — keep the actual person's facial structure.\n`
    } else {
      ageInstruction =
        `IMPORTANT — The character is ${ageNum} years old. ` +
        `Faithfully extract the facial features (eye shape, eye size, face shape, face fat/thin ratio, nose shape) from the USER PHOTO and preserve them. ` +
        `Adjust the overall proportion to match a child of this age. ` +
        `Do NOT impose generic child features — keep the actual person's facial structure.\n`
    }
  }

  const prompt =
    `[Character Reconstruction Task]\n` +
    `Image 1 is the STYLE REFERENCE. Image 2 is the USER PHOTO.\n\n` +
    `${ageInstruction}` +
    `Requirements:\n` +
    `1. Extract facial features (eye shape, eye size, face shape, fat/thin ratio, nose, lips) from the USER PHOTO (Image 2) and faithfully preserve them in the illustration. Also extract hairstyle, hair color, eye color, skin tone.\n` +
    `2. Fully reconstruct the character in the hand-drawn artistic style shown in Image 1.\n` +
    `3. Hand-drawn style emphasis: ${stylePrompt}\n` +
    `4. Apply gentle anime/picture-book stylization — line art should be 2D anime-style, avoid realistic texture.\n` +
    `5. Use flat-style shadow lighting: avoid realistic gradients; achieve depth through clearly defined cartoon shadow shapes.\n` +
    `6. Convey an overall warm, breathable children's picture-book artistic quality.\n\n` +
    `Output: upper-body front-facing portrait, centered composition, clean simple background, friendly smile.`

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

/**
 * Generate a standalone example character in a given art style
 * (no user photo — used to create style preview thumbnails).
 */
export async function generateStyleExampleCharacter(
  stylePrompt: string,
  styleRefBase64: string,
  label: string
): Promise<{ imageData?: string; mimeType: string }> {
  const prompt =
    `Generate a children's storybook character portrait of a cute friendly child character ` +
    `in exactly the same art style shown in the reference image. ` +
    `Style: ${stylePrompt}. ` +
    `The character (named "${label}") should have a round friendly face, big expressive eyes, ` +
    `upper-body centered portrait, clean simple background, warm friendly expression. ` +
    `Match the art style of the reference image precisely.`

  const response = (await genAI.models.generateContent({
    model: IMAGE_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { data: styleRefBase64, mimeType: 'image/jpeg' } },
        ],
      },
    ],
  })) as GeminiImageResponse

  const rawImage = extractImageData(response)
  if (!rawImage) return { mimeType: 'image/jpeg' }

  const compressed = await compressImage(rawImage, 512, 80)
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
}): Promise<{ A: { title: string; content: string }; B: { title: string; content: string }; C: { title: string; content: string } }> {
  const { storyName, protagonistName, supportingName, backgroundKeywords, ageRange } = params

  const prompt = `[系统设定]
你是一位享誉全球的儿童绘本作家，擅长用最纯真、富有想象力的笔触为孩子们编织梦幻。你的文字风格融合了《小王子》的诗意哲思与《月亮忘记了》的治愈氛围。

[创作指令]
请根据以下【创作参数】，严格按照以下要求，生成三本不同侧重点的童话故事梗概。
字数要求：每篇 50-100 字。
叙事公式：[宁静起航] + [奇幻探索] + [温暖治愈结尾]。
语言风格：多用感官动词（闻到、触摸、听见），语言具备节奏感，适合大声朗读。
视觉契合：画面需体现梦幻水彩感，强调光影与色彩的流动。

[创作参数]
故事名称：${storyName}
主角：${protagonistName}
配角：${supportingName}
核心元素：${backgroundKeywords}
小读者年龄：${ageRange}岁

[生成任务]
请输出三版梗概，严格按如下 JSON 格式返回，不要包含任何其他内容：
{
  "A": {"title": "简短标题（4-6字）", "content": "版本A内容（感官体验型：将宇宙想象成一个巨大的、充满惊喜的游乐场，侧重于对环境、色彩和气味的描绘）"},
  "B": {"title": "简短标题（4-6字）", "content": "版本B内容（情感互动型：侧重于主角与配角之间的温馨对话与陪伴）"},
  "C": {"title": "简短标题（4-6字）", "content": "版本C内容（勇气冒险型：侧重于克服小小困难，找回丢失的美好）"}
}`

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
}): Promise<CompanionSuggestion[]> {
  const { protagonistName, backgroundKeywords, ageRange } = params

  const prompt = `你是一位儿童故事创作专家。请为以下主角推荐3个可爱的冒险小伙伴（动物或奇幻生物）。
主角：${protagonistName}
故事元素：${backgroundKeywords}
小读者年龄：${ageRange}岁

要求：每个小伙伴需要有独特的个性，适合${ageRange}岁小朋友的审美，充满奇幻感。
严格按如下 JSON 格式返回，不要包含任何其他内容：
[
  {"emoji": "🐱", "name": "伙伴名称", "description": "一句话描述特点（15字内）"},
  {"emoji": "🦋", "name": "伙伴名称", "description": "一句话描述特点（15字内）"},
  {"emoji": "🐉", "name": "伙伴名称", "description": "一句话描述特点（15字内）"}
]`

  const response = await genAI.models.generateContent({ model: TEXT_MODEL, contents: prompt })

  try {
    const parsed = safeParseJsonArray(response.text ?? '')
    return parsed.slice(0, 3) as CompanionSuggestion[]
  } catch (e) {
    console.error('[generateCompanionSuggestions] Failed to parse JSON:', e)
    return []
  }
}

// ── Storybook v2: 完整童话生成 ───────────────────────────────

/**
 * 从选定的梗概生成完整童话故事文本。
 */
export async function generateStoryFromSynopsis(params: {
  storyName: string
  protagonistName: string
  supportingName: string
  synopsis: string
  ageRange: string
  styleDesc: string
  theme?: string
}): Promise<{ story: string; choices: string[]; npcs: Array<{ name: string; description: string }> }> {
  const { storyName, protagonistName, supportingName, synopsis, ageRange, styleDesc, theme } = params

  const prompt = `[System Role]
You are a world-renowned children's picture book author. With the gentlest, most innocent touch, you transform ordinary moments into dreamlike adventures. Your narrative style draws from the philosophical depth of "The Little Prince" and the delicate detail of "The Tale of Peter Rabbit."

[Story Parameters]
Story Title: ${storyName}
Protagonist: ${protagonistName}
Supporting Character: ${supportingName}
Background Keywords: ${synopsis}
Target Audience: ${ageRange} years old
Visual Style Reference: ${styleDesc || 'dreamlike watercolor, macaron color palette, starlit atmosphere'}

[Creative Task]
Generate a short fairy tale based on the above parameters. Requirements:
1. Sensory Writing: Don't just say "very beautiful" — describe "stars like powdered sugar scattered on a meadow."
2. Simple Dialogue: Add warm, child-like interactions between the protagonist and supporting character using "Name: dialogue" format.
3. Emotional Resonance: The story's core should convey a small lesson about ${theme || 'exploration and friendship'}.
4. Pacing: Structure must follow "a quiet beginning → a magical turning point → a warm, healing ending."
5. Open-Ended Hook: End with an interactive question that sparks young readers' imagination, or a magical cliffhanger that plants seeds for the next episode.
6. Scene Markers: Mark each natural scene with [Scene 1], [Scene 2], etc. — 3 to 4 scenes total.
7. Write the story in the same language as the protagonist's name and background keywords suggest (Chinese if the names are Chinese).
8. If the story introduces any NEW named character (not the protagonist/supporting character), list them as NPCs with concise traits.

After the story text, on a new line output exactly these two JSON blocks in this order — nothing else after them:
<!--NPCS:[{"name":"<new character name>","description":"<short traits, <=20 words>"}]-->
<!--CHOICES:["<next-episode choice 1, ≤15 chars>","<choice 2, ≤15 chars>","<choice 3, ≤15 chars>"]-->
Rules for NPCS:
- Include only newly introduced named characters; do not repeat protagonist/supporting.
- If none, return an empty array: []

Output only the story text, NPCS block, and CHOICES block. No title, no extra explanation.`

  const response = await genAI.models.generateContent({ model: TEXT_MODEL, contents: prompt })
  const raw = response.text?.trim() ?? ''

  // Extract and parse the choices block
  const choicesMatch = raw.match(/<!--CHOICES:(.*?)-->/)
  let choices: string[] = []
  if (choicesMatch) {
    try { choices = JSON.parse(choicesMatch[1]) as string[] } catch { /* ignore */ }
  }

  // Extract and parse the NPC block
  const npcsMatch = raw.match(/<!--NPCS:(.*?)-->/)
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

  // Strip machine-readable markers from story text
  const story = raw
    .replace(/<!--CHOICES:.*?-->/g, '')
    .replace(/<!--NPCS:.*?-->/g, '')
    .trim()

  return { story, choices, npcs }
}

// ── Storybook v2: 故事封面插画生成 ───────────────────────────

/**
 * 根据故事梗概和主角形象，生成一张封面主图。
 * characterImageBase64: raw base64 (无 data: 前缀)
 */
export async function generateStoryCoverImage(params: {
  synopsis: string
  protagonistName: string
  styleDesc: string
  characterImageBase64?: string
}): Promise<{ data: string; mimeType: string } | undefined> {
  const { synopsis, protagonistName, styleDesc, characterImageBase64 } = params

  const prompt = `你是一位享誉全球的治愈系童话插画师。请结合我提供的「故事梗概」捕捉情感内核，并深度参考提供的角色形象图中的手绘画风，为这篇童话创作一张极具氛围感的封面主图。

要求：
- 画面构图疏密有致，上方或下方留约1/4空白区域（预留书名位置）
- 展现出温暖、梦幻且纯真的治愈感
- 风格：${styleDesc || '梦幻水彩，马卡龙色调，温暖柔光'}
- 主角：${protagonistName}
- 竖版构图（宽:高约 3:4），适合儿童绘本封面
- 不要包含任何文字

故事梗概：${synopsis}`

  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
    { text: prompt },
  ]

  if (characterImageBase64) {
    const isJpeg = characterImageBase64.startsWith('/9j/')
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
  })) as GeminiImageResponse

  const rawImage = extractImageData(response)
  if (!rawImage) return undefined

  const compressed = await compressImage(rawImage, 768, 80)
  return { data: compressed.data, mimeType: compressed.mimeType }
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
  theme?: string
  characterImageBase64?: string
}): Promise<{
  story: string
  choices: string[]
  npcs: Array<{ name: string; description: string }>
  coverImage?: { data: string; mimeType: string }
  npcImages: Map<string, { data: string; mimeType: string }>
}> {
  const {
    storyName,
    protagonistName,
    supportingName,
    synopsis,
    ageRange,
    styleDesc,
    theme,
    characterImageBase64,
  } = params

  const debugTag = '[generateStoryWithAssets]'
  const styleLabel = styleDesc || '梦幻水彩，马卡龙色调，温暖柔光'
  const hasCharacterImageRef = Boolean(characterImageBase64)

  const prompt = `[系统设定]
你是一位享誉全球的儿童绘本创作者，擅长用最纯真、富有想象力的笔触为孩子们编织梦幻故事与插画。

[创作参数]
故事名称：${storyName}
主角：${protagonistName}
配角：${supportingName}
故事梗概：${synopsis}
目标读者年龄：${ageRange}岁
视觉风格：${styleLabel}
故事核心主题：${theme || '探索与友谊'}

[创作任务]
请按照以下格式，依次输出所有内容：

【故事正文】
根据上面的参数创作一篇短童话。要求：
1. 感官写作：不要说"很美丽"——要描述"星星像糖粉洒满草地"。
2. 简短对话：用"角色名：对话"的格式加入温馨互动。
3. 情感内核：传递关于${theme || '探索与友谊'}的小道理。
4. 节奏：安静开场 → 奇幻转折 → 温暖治愈结尾。
5. 开放钩子：以引发小读者想象的互动问题或为下一集埋伏笔的悬念结尾。
6. 场景标记：用 [Scene 1]、[Scene 2] 等标记，共3-4个场景。
7. 用主角名字和梗概暗示的语言写作（如果是中文名字则用中文写）。
8. 如果故事引入了新的命名角色（不是主角/配角），在故事文本之后列出NPC。

故事正文写完后，紧接着输出如下两个标记（各占一行）：
<!--NPCS:[{"name":"<新角色名>","description":"<简短特征，≤20字>"}]-->
<!--CHOICES:["<下集选项1，≤15字>","<选项2，≤15字>","<选项3，≤15字>"]-->
（如果没有新NPC，NPCS填空数组 []）

然后，对于NPCS中列出的每个新角色，请依次输出：
【角色 - <角色名>】
名字：<角色名>
性格：<简要性格描述>
外貌描述：<简要外貌>
然后生成这个角色的全身立绘，${styleLabel}风格，白色背景

最后输出：
【封面】
生成这个绘本的封面图，竖版构图（宽:高约3:4），${styleLabel}风格，展现故事核心场景，不包含任何文字
${hasCharacterImageRef ? `

[主角形象一致性约束]
你会收到一张参考图片。该图片就是主角「${protagonistName}」的形象参考。
所有涉及主角的画面（封面与正文相关画面）都必须保持主角的外观一致：
- 脸型、发型、发色、服饰主色、整体气质保持一致
- 不要把这张参考图当作NPC
- 不要改变主角的物种/性别设定（除非故事文本明确要求）` : ''}`

  console.log(`${debugTag} Start`, {
    storyName,
    protagonistName,
    supportingName,
    ageRange,
    styleLabel,
    hasCharacterImageRef,
    synopsisChars: synopsis.length,
    promptChars: prompt.length,
  })

  // Build content parts: text prompt + optional protagonist reference image
  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
    { text: prompt },
  ]

  if (characterImageBase64) {
    const isJpeg = characterImageBase64.startsWith('/9j/')
    parts.push({
      text:
        `Reference image below is the protagonist "${protagonistName}". ` +
        `Use it to keep protagonist appearance consistent in cover and scene-related outputs. ` +
        `Do not use it as an NPC reference.`,
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

  for (const part of responseParts) {
    if (part.text) {
      allText += part.text
      pendingTextSinceLastImage += part.text
    } else if (part.inlineData?.data) {
      const rawData = part.inlineData.data
      const compressed = await compressImage(rawData, 768, 80)
      images.push({ data: compressed.data, mimeType: compressed.mimeType })
      imageSectionLabels.push(pendingTextSinceLastImage)
      pendingTextSinceLastImage = ''
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

  let story = rawText
    .replace(/<!--CHOICES:.*?-->/g, '')
    .replace(/<!--NPCS:.*?-->/g, '')

  // Keep only main story body when wrapper sections are present.
  // Drop any preface before 【故事正文】.
  story = story.replace(/^[\s\S]*?【故事正文】\s*/m, '')
  // Strip wrapper labels and generation-only sections.
  story = story
    .replace(/【故事正文】/g, '')
    .replace(/【角色\s*[-—]\s*[\s\S]*$/g, '')
    .replace(/【封面】[\s\S]*$/g, '')
    .trim()
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

  for (let i = 0; i < images.length; i++) {
    const label = imageSectionLabels[i] || ''
    // Try NPC match first — more specific than cover
    const npcMatch = label.match(/【角色\s*[-—–]\s*(.+?)】/)
    if (npcMatch) {
      const npcName = npcMatch[1].trim()
      npcImages.set(npcName, images[i])
    } else if (label.includes('【封面】')) {
      coverImage = images[i]
    } else {
      if (i === images.length - 1 && !coverImage) {
        // Last image is likely the cover if not yet assigned
        coverImage = images[i]
      }
    }
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
    })
  }

  return { story, choices, npcs, coverImage, npcImages }
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
  characterPool?: string[]
  characterProfiles?: Array<{ name: string; description?: string }>
  minSceneCount?: number
  maxSceneCount?: number
}): Promise<import('@/types').DirectorStoryboardScene[]> {
  const {
    storyName,
    protagonistName,
    supportingName,
    storyContent,
    ageRange,
    styleDesc,
    characterPool = [],
    characterProfiles = [],
    minSceneCount = 15,
    maxSceneCount = 18,
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
  const roleList = [protagonistName, supportingName]
    .map((s) => s.trim())
    .filter(Boolean)
    .join('、')
  const characterPoolText = Array.from(canonicalByKey.values()).join('、')
  const characterProfileText = Array.from(canonicalByKey.entries())
    .map(([key, name]) => {
      const detail = detailsByKey.get(key)
      return detail ? `${name}：${detail}` : name
    })
    .join('\n')

  const prompt = `[系统设定]
你是一位享誉全球的儿童动漫导演与金牌分镜设计师，擅长将温馨的童话转化为极具视觉冲击力且节奏感极强的动漫画面。你的风格融合了新海诚的光影美学与吉卜力工作室的纯真叙事。

[创作指令]
请根据提供的【创作参数】，设计一套共 ${minScenes}-${maxScenes} 个分镜的故事书动漫化脚本。

[脚本核心规范]
- 时长掌控：每个分镜需要有支撑 8-12 秒的动画内容，避免画面停滞。
- 视觉通感：严禁使用抽象词汇。请使用具体的比喻，如"云朵像刚出炉的松饼"、"星尘像跳跳糖一样闪烁"。
- 镜头语言：明确标注景别（全景、特写、俯瞰）与运镜（推、拉、摇、移）。
- 童趣互动：对话需符合 ${ageRange} 岁心理，强调 ${protagonistName} 与 ${supportingName} 之间细微的体贴与好奇。
- 画风统一：${styleDesc || '温馨2D动漫风格'}。
- 三帧连贯性：每个分镜的【开头帧】必须与上一个分镜的【结尾帧】保持视觉衔接（位置、光影、角色姿态连贯）。
- 角色一致性：若 charactersUsed 非空，则 opening/midAction/ending 三个 frame prompt 必须明确包含所有 charactersUsed 角色名（不可遗漏）。

[创作参数]
故事名称：${storyName}
角色设定：${roleList}
可用角色池：${characterPoolText || roleList}
角色补充设定（姓名：特征）：
${characterProfileText || '无'}
核心文本：${storyContent}
受众年龄：${ageRange} 岁

[输出要求]
严格按照以下 JSON 数组格式输出，不包含任何其他内容（无 markdown 代码块）：
[
  {
    "index": 1,
    "sceneDescription": "场景描述（时间/地点/环境氛围，20字内）",
    "cameraDesign": "景别+运镜方式+画面中心点",
    "animationAction": "详细描述角色动作与环境特效变化（8s内容）",
    "voiceOver": "富有韵律感的旁白讲述（适合大声朗读）",
    "dialogue": [{"speaker": "角色名", "text": "简洁温暖的对白（10字内）"}],
    "charactersUsed": ["本分镜在画面里出现的角色名，必须来自可用角色池；无角色时填[]"],
    "estimatedDuration": 10,
    "openingFramePrompt": "16:9 children's anime illustration, ${styleDesc || 'warm 2D anime style'}: [opening frame — establishing shot with visual continuity from previous scene, character positions, lighting, atmosphere, NO text]",
    "midActionFramePrompt": "16:9 children's anime illustration, ${styleDesc || 'warm 2D anime style'}: [peak action or emotional climax moment of the scene, highest energy, NO text]",
    "endingFramePrompt": "16:9 children's anime illustration, ${styleDesc || 'warm 2D anime style'}: [scene completion state, calm after action, leaving visual hook for next scene, NO text]"
  }
]`

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
        title: s.sceneDescription?.slice(0, 40) ?? `分镜 ${s.index}`,
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
    : 'Keep the character appearances consistent across all scenes.';

  const hasMultiple = characterImagesBase64 && characterImagesBase64.length > 1;
  
  let multiRefLabel = '';
  if (hasMultiple && characterNames && characterNames.length === characterImagesBase64.length) {
    multiRefLabel = ' Each reference image below is labeled with the character name.';
  }

  const prompt = `Simple children's picture book illustration for ages 4-8: ${normalizedScene}.
Style: Bright happy colors, round friendly shapes, very simple background, cozy and warm like a bedtime story book. No text in the image.
IMPORTANT: ${hasMultiple ? `The characters in this scene MUST look exactly like the characters shown in the reference images.${multiRefLabel} Keep the same face, hair, colors, outfit, and style for each character.` : 'The main character in this scene MUST look exactly like the character shown in the reference image. Keep the same face, hair, colors, outfit, and style.'} ${textHint}`;

  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
    { text: prompt },
  ];

  if (characterImagesBase64) {
    for (let i = 0; i < characterImagesBase64.length; i++) {
      const imgBase64 = characterImagesBase64[i];
      const name = characterNames && characterNames[i] ? characterNames[i] : `Character ${i + 1}`;
      
      if (hasMultiple) {
        parts.push({ text: `Reference image for ${name}:` });
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
  excludeVoice?: string
): Promise<{ voiceName: string; reason: string }> {
  // Filter out the currently assigned voice so re-assign always picks a different one
  const available = excludeVoice
    ? GEMINI_VOICES.filter(v => v.name !== excludeVoice)
    : GEMINI_VOICES

  const voiceList = available.map(v =>
    `- ${v.name}: ${v.tone} (${v.gender})`
  ).join('\n')

  const ageDesc = age != null ? `Age: ${age} years old` : 'Age: unknown'

  const prompt = `You are casting a voice actor for a children's storybook character aged 5–8.

Character info:
- Name: ${name || 'Unnamed character'}
- ${ageDesc}
- Art style: ${style || 'cartoon'}

Available voices:
${voiceList}

Choose the single most fitting voice. Respond with valid JSON only:
{"voiceName": "VoiceName", "reason": "One sentence explaining why this voice fits."}`

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
  return { voiceName: available[0]?.name ?? 'Puck', reason: 'Default voice assigned.' }
}
