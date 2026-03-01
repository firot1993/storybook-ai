import { GoogleGenAI } from '@google/genai';

const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});

const TEXT_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-2.5-flash-image';

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
  characterName: string,
  keywords: string,
  ageGroup: string
) {
  const result = await generateStoryOptionsWithDiagnostics(characterName, keywords, ageGroup);
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
  characterName: string,
  keywords: string,
  ageGroup: string
): Promise<{ options: StoryOption[]; diagnostics: StoryOptionsDiagnostics }> {
  const prompt = `Create 3 children's story options for a character named ${characterName}.
Keywords: ${keywords}
Age: ${ageGroup} years old

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
  characterName: string,
  setting: string,
  ageGroup: string
) {
  const prompt = `Write a 3-minute children's story:
Main character: ${characterName}
Setting: ${setting}
Style: Warm, fun, suitable for ${ageGroup} years old
Structure: Beginning → Adventure → Ending
Length: 500-800 words

Please divide the story into 3-5 scenes, with [Scene X] markers.`;

  const response = await genAI.models.generateContent({
    model: TEXT_MODEL,
    contents: prompt,
  });
  return response.text ?? '';
}

export async function generateCharacterImageWithDiagnostics(imageBase64: string): Promise<{
  imageData?: string;
  diagnostics: GeminiImageDiagnostics;
}> {
  const prompt = "Transform this photo into a cute cartoon character, children's book illustration style, vibrant colors, friendly expression, simple background";

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

  return {
    imageData: extractImageData(response),
    diagnostics: buildImageDiagnostics(response),
  };
}

export async function generateCharacterImage(imageBase64: string) {
  const result = await generateCharacterImageWithDiagnostics(imageBase64);
  return result.imageData;
}

export async function generateStoryImage(
  sceneDescription: string,
  characterReference: string
) {
  const normalizedScene = sceneDescription.replace(/\s+/g, ' ').slice(0, 260);
  const normalizedReference = (() => {
    if (!characterReference) {
      return 'Keep the main character appearance consistent across all scenes.';
    }

    const lower = characterReference.toLowerCase();
    const looksLikeDataUrl =
      lower.startsWith('data:') ||
      lower.includes('base64,') ||
      characterReference.length > 1000;

    if (looksLikeDataUrl) {
      return 'Main character should stay visually consistent across all scenes in this story.';
    }

    return characterReference.replace(/\s+/g, ' ').slice(0, 240);
  })();

  const prompt = `Children's book illustration: ${normalizedScene}. 
Style: Warm, soft colors, storybook illustration style, friendly and magical.
Character reference: ${normalizedReference}`;

  const response = (await genAI.models.generateContent({
    model: IMAGE_MODEL,
    contents: prompt,
  })) as GeminiImageResponse;
  const imageData = extractImageData(response);
  return imageData;
}
