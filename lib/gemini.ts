import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Gemini 3 Flash - 用于文本生成
export const textModel = genAI.getGenerativeModel({
  model: 'gemini-3-flash',
});

// Gemini 3.1 Flash Image - 用于图像生成
export const imageModel = genAI.getGenerativeModel({
  model: 'gemini-3.1-flash-image',
});

export async function generateStoryOptions(
  characterName: string,
  keywords: string,
  ageGroup: string
) {
  const prompt = `Create 3 children's story options for a character named ${characterName}.
Keywords: ${keywords}
Age: ${ageGroup} years old

Format:
1. [Title] - [One sentence description]
2. [Title] - [One sentence description]
3. [Title] - [One sentence description]`;

  const result = await textModel.generateContent(prompt);
  const response = await result.response;
  const text = response.text();

  // Parse options
  const options = text
    .split('\n')
    .filter(line => line.match(/^\d\./))
    .map(line => {
      const match = line.match(/^\d\.\s*\[(.+?)\]\s*-\s*(.+)$/);
      if (match) {
        return {
          title: match[1].trim(),
          description: match[2].trim(),
        };
      }
      return null;
    })
    .filter(Boolean) as { title: string; description: string }[];

  return options;
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

  const result = await textModel.generateContent(prompt);
  const response = await result.response;
  return response.text();
}

export async function generateCharacterImage(imageBase64: string) {
  const prompt = 'Transform this photo into a cute cartoon character, children's book illustration style, vibrant colors, friendly expression, simple background';

  const result = await imageModel.generateContent([
    prompt,
    {
      inlineData: {
        data: imageBase64,
        mimeType: 'image/jpeg',
      },
    },
  ]);

  const response = await result.response;
  // Get generated image data
  const imageData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  return imageData;
}

export async function generateStoryImage(
  sceneDescription: string,
  characterReference: string
) {
  const prompt = `Children's book illustration: ${sceneDescription}. 
Style: Warm, soft colors, storybook illustration style, friendly and magical.
Character reference: ${characterReference}`;

  const result = await imageModel.generateContent(prompt);
  const response = await result.response;
  const imageData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  return imageData;
}
