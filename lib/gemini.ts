import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import type { CompanionSuggestion } from '@/types'

const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});

const TEXT_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-3.1-flash-image-preview';

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

export type StoryOption = {
  title: string;
  description: string;
};

export type StoryOptionsDiagnostics = {
  strategy: 'strict' | 'loose' | 'fallback' | 'none';
  parsedCount: number;
  lineCount: number;
  rawTextPreview: string;
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

export async function generateStoryOptions(
  characterNames: string[],
  keywords: string,
  ageGroup: string,
  relationship?: string
) {
  const result = await generateStoryOptionsWithDiagnostics(characterNames, keywords, ageGroup, undefined, relationship);
  return result.options;
}

function parseStoryOptionLine(line: string): StoryOption | null {
  const strictMatch = line.match(/^\d[\.\)]\s*\[(.+?)\]\s*-\s*(.+)$/);
  if (strictMatch) {
    return {
      title: strictMatch[1].trim(),
      description: strictMatch[2].trim(),
    };
  }

  const cleaned = line
    .replace(/^\s*\d+\s*[\.\)\-:]\s*/, '')
    .replace(/^\s*[-*•]\s*/, '')
    .trim();

  if (!cleaned) return null;

  const withSeparator = cleaned.match(/^["“]?(.+?)["”]?\s*[-:]\s*(.+)$/);
  if (withSeparator) {
    return {
      title: withSeparator[1].trim(),
      description: withSeparator[2].trim(),
    };
  }

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length < 3) return null;

  const title = words.slice(0, Math.min(6, words.length)).join(' ');
  return {
    title,
    description: cleaned,
  };
}

function parseStoryOptionsFromText(text: string): { options: StoryOption[]; strategy: StoryOptionsDiagnostics['strategy'] } {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const strictOptions = lines
    .filter((line) => /^\d[\.\)]\s*\[.+\]\s*-\s*.+$/.test(line))
    .map((line) => parseStoryOptionLine(line))
    .filter(Boolean) as StoryOption[];

  if (strictOptions.length > 0) {
    return { options: strictOptions.slice(0, 3), strategy: 'strict' };
  }

  const looseCandidates = lines.filter((line) => /^\d+\s*[\.\)\-:]/.test(line) || /^[-*•]\s+/.test(line));
  const looseOptions = looseCandidates
    .map((line) => parseStoryOptionLine(line))
    .filter(Boolean) as StoryOption[];

  if (looseOptions.length > 0) {
    return { options: looseOptions.slice(0, 3), strategy: 'loose' };
  }

  const fallbackChunks = text
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .slice(0, 3);

  const fallbackOptions = fallbackChunks
    .map((chunk, index) => {
      const sentence = chunk.replace(/\s+/g, ' ').trim();
      if (!sentence) return null;
      const titleWords = sentence.replace(/^[\d\.\)\-:\s]+/, '').split(/\s+/).slice(0, 6);
      const title = titleWords.join(' ') || `Story Option ${index + 1}`;
      return {
        title,
        description: sentence,
      };
    })
    .filter(Boolean) as StoryOption[];

  if (fallbackOptions.length > 0) {
    return { options: fallbackOptions, strategy: 'fallback' };
  }

  return { options: [], strategy: 'none' };
}

export async function generateStoryOptionsWithDiagnostics(
  characterNames: string[],
  keywords: string,
  ageGroup: string,
  characterDescriptions?: string[],
  relationship?: string
): Promise<{ options: StoryOption[]; diagnostics: StoryOptionsDiagnostics }> {
  const namesLabel = characterNames.length === 1
    ? `a character named ${characterNames[0]}`
    : `characters named ${characterNames.join(', ')}`;

  let characterContext = '';
  if (characterDescriptions && characterDescriptions.length > 0) {
    characterContext = '\nCharacter details:\n' + characterNames.map((name, i) => 
      `- ${name}: ${characterDescriptions[i] || 'A friendly character'}`
    ).join('\n');
  }
  const relationshipContext =
    typeof relationship === 'string' && relationship.trim().length > 0
      ? `\nRelationship between characters: ${relationship.trim()}`
      : '';

  const prompt = `Create 3 simple children's story ideas for ${namesLabel}.
Keywords: ${keywords}
Target age: ${ageGroup} years old
${characterContext}
${relationshipContext}

IMPORTANT rules for age ${ageGroup}:
- Use only simple, everyday words a ${ageGroup}-year-old would understand
- Story titles should be short (2-5 words) and exciting for little kids
- Descriptions should be one simple sentence using easy words
- Think like a bedtime story for a very young child
- No scary or complex themes — keep it happy, silly, or magical
${characterNames.length > 1 ? '- The story should involve ALL the characters together\n' : ''}
${relationshipContext ? '- The relationship must be reflected in how characters interact\n' : ''}
Format:
1. [Title] - [One sentence description]
2. [Title] - [One sentence description]
3. [Title] - [One sentence description]`;

  const response = await genAI.models.generateContent({
    model: TEXT_MODEL,
    contents: prompt,
  });
  const text = response.text ?? '';
  const parsed = parseStoryOptionsFromText(text);
  const diagnostics: StoryOptionsDiagnostics = {
    strategy: parsed.strategy,
    parsedCount: parsed.options.length,
    lineCount: text.split('\n').length,
    rawTextPreview: text.slice(0, 300),
  };

  return {
    options: parsed.options,
    diagnostics,
  };
}

export async function generateStory(
  characterNames: string[],
  setting: string,
  ageGroup: string,
  characterDescriptions?: string[],
  relationship?: string
) {
  const ageNum = parseInt(ageGroup.split('-')[0], 10) || 4;
  const wordRange = ageNum <= 3 ? '150-250' : ageNum <= 5 ? '200-350' : '300-450';
  const sceneCount = ageNum <= 4 ? '3' : '4';
  const vocabNote = ageNum <= 4
    ? 'Use only very simple words (1-2 syllables). Very short sentences (5-8 words each). Lots of repetition and sound words (whoosh, splish, boom).'
    : ageNum <= 6
    ? 'Use simple words (mostly 1-2 syllables). Short sentences (6-10 words). Include fun sound effects and repetition.'
    : 'Use easy-to-read words. Keep sentences short and clear (8-12 words). Include some fun descriptions.';

  const charactersLine = characterNames.length === 1
    ? `Main character: ${characterNames[0]}`
    : `Main characters: ${characterNames.join(', ')}`;

  let characterContext = '';
  if (characterDescriptions && characterDescriptions.length > 0) {
    characterContext = '\nCharacter details:\n' + characterNames.map((name, i) => 
      `- ${name}: ${characterDescriptions[i] || 'A friendly character'}`
    ).join('\n');
  }
  const relationshipContext =
    typeof relationship === 'string' && relationship.trim().length > 0
      ? `\nRelationship between characters: ${relationship.trim()}`
      : '';

  const multiCharNote = characterNames.length > 1
    ? '- All characters should appear together and interact throughout the story\n'
    : '';

  const prompt = `Write a bedtime story for a ${ageGroup}-year-old child:
${charactersLine}
Setting: ${setting}
${characterContext}
${relationshipContext}

VERY IMPORTANT — this story is for a ${ageGroup}-year-old child:
- ${vocabNote}
- Keep it happy, warm, and gentle — no scary parts
- Use a simple plot: one small problem, one fun solution
- End with the characters feeling happy and safe
- Length: ${wordRange} words (keep it SHORT)
- Structure: Beginning → one small adventure → happy ending
- Divide into exactly ${sceneCount} scenes using [Scene 1], [Scene 2], etc. markers
- Each scene should be 2-4 short paragraphs
- Inside each scene, separate lines by speaker:
  - Narration lines must start with "Narrator:"
  - Spoken lines must start with "Character:"
  - Keep "Character:" lines short and playful
${multiCharNote}
${relationshipContext ? '- Keep all interactions consistent with the stated relationship\n' : ''}
Please divide the story into ${sceneCount} scenes, with [Scene X] markers.`;

  const response = await genAI.models.generateContent({
    model: TEXT_MODEL,
    contents: prompt,
  });
  return response.text ?? '';
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

// ── Synopsis generation ──────────────────────────────────────

export async function generateSynopsis(
  characterNames: string[],
  characterDescriptions: string[],
  theme: string,
  keywords: string,
  ageGroup: string,
  relationship?: string
): Promise<string> {
  const charCtx = characterNames
    .map((n, i) => `- ${n}: ${characterDescriptions[i] || 'A friendly character'}`)
    .join('\n')

  const relCtx = relationship ? `\nRelationship: ${relationship}` : ''

  const prompt = `Create a short story outline (~200 words) for children aged ${ageGroup}.

Characters:
${charCtx}
${relCtx}
Theme: ${theme}
Keywords: ${keywords}

Include these labeled sections:
[Opening] - Setting and character introduction
[Problem] - The main challenge or adventure
[Adventure] - How characters work together
[Resolution] - The happy ending

Write in simple, warm language. Return only the outline text.`

  const response = await genAI.models.generateContent({ model: TEXT_MODEL, contents: prompt })
  return response.text?.trim() ?? ''
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

  function safeParseJson(raw: string) {
    let text = raw.replace(/```json|```/g, '').trim()
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) text = jsonMatch[0]
    text = text.replace(/,\s*([}\]])/g, '$1')
    return JSON.parse(text)
  }

  try {
    const parsed = safeParseJson(response.text ?? '{}')
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
    let text = (response.text ?? '').replace(/```json|```/g, '').trim()
    const arrMatch = text.match(/\[[\s\S]*\]/)
    if (arrMatch) text = arrMatch[0]
    text = text.replace(/,\s*([}\]])/g, '$1')
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return parsed.slice(0, 3) as CompanionSuggestion[]
    return []
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
}): Promise<{ story: string; choices: string[] }> {
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

After the story text, on a new line output exactly this JSON block — nothing else after it:
<!--CHOICES:["<next-episode choice 1, ≤15 chars>","<choice 2, ≤15 chars>","<choice 3, ≤15 chars>"]-->

Output only the story text and the CHOICES block. No title, no extra explanation.`

  const response = await genAI.models.generateContent({ model: TEXT_MODEL, contents: prompt })
  const raw = response.text?.trim() ?? ''

  // Extract and parse the choices block
  const choicesMatch = raw.match(/<!--CHOICES:(.*?)-->/)
  let choices: string[] = []
  if (choicesMatch) {
    try { choices = JSON.parse(choicesMatch[1]) as string[] } catch { /* ignore */ }
  }

  // Strip the choices marker from the story text
  const story = raw.replace(/<!--CHOICES:.*?-->/, '').trim()

  return { story, choices }
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

// ── Script generation ────────────────────────────────────────

export async function generateScript(
  storyContent: string,
  characterNames: string[],
  characterDescriptions: string[]
): Promise<import('@/types').ScriptScene[]> {
  const charCtx = characterNames
    .map((n, i) => `- ${n}: ${characterDescriptions[i] || 'A friendly character'}`)
    .join('\n')

  const prompt = `Convert this children's story into a structured video script.

Characters:
${charCtx}

Story:
${storyContent}

For each [Scene X] section, output a JSON object. Return a JSON array only, no markdown.

Schema per scene:
{
  "index": 0,
  "title": "short scene title (max 5 words)",
  "narration": "narrator text combined into one paragraph",
  "dialogue": [{"speaker": "character name or Narrator", "text": "spoken line"}],
  "imagePrompt": "detailed children's book illustration prompt describing the visual scene, mood, colors, character actions",
  "estimatedDuration": 20
}

Rules:
- estimatedDuration is seconds (~2.5 words/second for TTS)
- imagePrompt must mention character appearance and scene mood
- Keep dialogue short and playful
- index is 0-based

Return valid JSON array only.`

  const response = await genAI.models.generateContent({ model: TEXT_MODEL, contents: prompt })
  try {
    const text = (response.text ?? '[]').replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    console.error('Failed to parse script JSON:', e)
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
    const text = (response.text ?? '').replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(text)
    if (parsed.voiceName && available.some(v => v.name === parsed.voiceName)) {
      return { voiceName: parsed.voiceName, reason: parsed.reason ?? '' }
    }
  } catch {
    // fall through to default
  }

  // Default: pick first available voice
  return { voiceName: available[0]?.name ?? 'Puck', reason: 'Default voice assigned.' }
}
