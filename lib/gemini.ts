import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';

const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});

const TEXT_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-2.5-flash-image';

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
