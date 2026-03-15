import { beforeEach, describe, expect, it, vi } from 'vitest'

const { generateContentMock, countTokensMock } = vi.hoisted(() => ({
  generateContentMock: vi.fn(),
  countTokensMock: vi.fn(),
}))

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: generateContentMock,
      countTokens: countTokensMock,
    }
  },
}))

vi.mock('sharp', () => ({
  default: () => ({
    resize: () => ({
      jpeg: () => ({
        toBuffer: () => Promise.resolve(Buffer.from('compressed-image')),
      }),
    }),
  }),
}))

import {
  assignCharacterVoice,
  generateInterleavedDirectorScript,
  generateStoryWithAssets,
  generateStorybookDirectorScript,
  generateSynopsisVersions,
} from '../gemini'

function getPromptTextFromCall(callIndex = 0): string {
  const request = generateContentMock.mock.calls[callIndex]?.[0] as {
    contents: string | Array<{ parts?: Array<{ text?: string }> }>
  }

  if (typeof request.contents === 'string') return request.contents

  const firstPart = request.contents[0]?.parts?.find((part) => typeof part.text === 'string')
  return firstPart?.text ?? ''
}

describe('gemini workflow prompt composition', () => {
  beforeEach(() => {
    generateContentMock.mockReset()
    countTokensMock.mockReset()
  })

  it('composes an English prompt for synopsis generation while requiring Simplified Chinese output', async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        A: { title: 'Moon Path', content: 'A gentle outline.' },
        B: { title: 'Warm Light', content: 'A friendship outline.' },
        C: { title: 'Brave Steps', content: 'An adventure outline.' },
      }),
    })

    const result = await generateSynopsisVersions({
      storyName: 'Moonlight Trip',
      protagonistName: 'Luna',
      supportingName: 'Milo',
      backgroundKeywords: 'starlight, secret garden',
      ageRange: '4-6',
      locale: 'zh',
    })

    const prompt = getPromptTextFromCall()

    expect(result.A.title).toBe('Moon Path')
    expect(prompt).toContain('[System Role]')
    expect(prompt).toContain('All title and content values must be written in Simplified Chinese.')
    expect(prompt).toContain('Story title: Moonlight Trip')
    expect(prompt).not.toContain('[Continuation Context]')
    expect(prompt).not.toMatch(/[\u4e00-\u9fff]/)
  })

  it('adds continuation context to synopsis prompt when previous episode data is provided', async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        A: { title: 'Moon Path', content: 'A gentle outline.' },
        B: { title: 'Warm Light', content: 'A friendship outline.' },
        C: { title: 'Brave Steps', content: 'An adventure outline.' },
      }),
    })

    await generateSynopsisVersions({
      storyName: 'Moonlight Trip',
      protagonistName: 'Luna',
      supportingName: 'Milo',
      backgroundKeywords: 'Follow the lantern',
      ageRange: '4-6',
      locale: 'en',
      previousStoryTitle: 'Lantern in the Woods',
      previousStoryContent: '[Scene 1] A lantern appeared at dusk.',
      previousStoryChoices: ['Follow the lantern', 'Hide behind a tree'],
    })

    const prompt = getPromptTextFromCall()
    expect(prompt).toContain('[Continuation Context]')
    expect(prompt).toContain('Previous episode title: Lantern in the Woods')
    expect(prompt).toContain('Previous end-of-episode choices: Follow the lantern, Hide behind a tree')
  })

  it('uses English interleaved section markers and still parses story assets correctly', async () => {
    generateContentMock.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                text:
                  '[STORY BODY]\n' +
                  '[Scene 1] Stars drifted over the hill.\n' +
                  '<!--NPCS:[{"name":"Milo","description":"curious cloud cat"}]-->\n' +
                  '<!--CHOICES:["Follow the lantern","Call to Milo","Wait quietly"]-->\n' +
                  '[CHARACTER - Milo]\n' +
                  'Name: Milo\n' +
                  'Personality: Playful and brave\n' +
                  'Appearance: A fluffy blue cloud cat.\n',
              },
              {
                inlineData: {
                  data: Buffer.from('npc-image').toString('base64'),
                  mimeType: 'image/png',
                },
              },
              { text: '[COVER]\n' },
              {
                inlineData: {
                  data: Buffer.from('cover-image').toString('base64'),
                  mimeType: 'image/png',
                },
              },
            ],
          },
        },
      ],
    })

    const result = await generateStoryWithAssets({
      storyName: 'Moonlight Trip',
      protagonistName: 'Luna',
      supportingName: 'Milo',
      synopsis: 'A lantern appears in the night garden.',
      ageRange: '4-6',
      styleDesc: 'soft watercolor storybook',
      locale: 'en',
    })

    const prompt = getPromptTextFromCall()
    const compressedBase64 = Buffer.from('compressed-image').toString('base64')

    expect(prompt).toContain('[STORY BODY]')
    expect(prompt).toContain('[COVER]')
    expect(prompt).not.toContain('[Continuation Context]')
    expect(prompt).toContain(
      'All story prose, dialogue, NPC descriptions, and choice text must be written in English.'
    )
    expect(prompt).toContain(
      'Generate exactly ONE image total for the entire response: the cover image for this storybook.'
    )
    expect(prompt).toContain(
      'You may introduce NEW named NPCs only when the story genuinely needs them, and never more than 2 total.'
    )
    expect(prompt).toContain('[CHARACTER - <Character Name>]')
    expect(prompt).toContain('<!--NPCS:')
    expect(result.story).toBe('[Scene 1] Stars drifted over the hill.')
    expect(result.npcs).toEqual([{ name: 'Milo', description: 'curious cloud cat' }])
    expect(result.choices).toEqual(['Follow the lantern', 'Call to Milo', 'Wait quietly'])
    expect(result.npcImages.get('Milo')).toEqual({
      data: compressedBase64,
      mimeType: 'image/jpeg',
    })
    expect(result.coverImage).toEqual({
      data: compressedBase64,
      mimeType: 'image/jpeg',
    })
  })

  it('adds continuation context to story prompt when previous episode data is provided', async () => {
    generateContentMock.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                text:
                  '[STORY BODY]\n' +
                  '[Scene 1] A lantern floated toward the river.\n' +
                  '<!--NPCS:[]-->\n' +
                  '<!--CHOICES:["Cross the bridge","Follow the river","Call for help"]-->\n',
              },
              { text: '[COVER]\n' },
              {
                inlineData: {
                  data: Buffer.from('cover-image').toString('base64'),
                  mimeType: 'image/png',
                },
              },
            ],
          },
        },
      ],
    })

    await generateStoryWithAssets({
      storyName: 'Moonlight Trip',
      protagonistName: 'Luna',
      supportingName: 'Milo',
      synopsis: 'Luna follows the lantern to the old bridge.',
      ageRange: '4-6',
      styleDesc: 'soft watercolor storybook',
      locale: 'en',
      characterImagesBase64: ['abc123'],
      characterNames: ['Luna'],
      previousStoryTitle: 'Lantern in the Woods',
      previousStoryContent: '[Scene 1] A lantern appeared at dusk.',
      previousStoryChoices: ['Follow the lantern', 'Hide behind a tree'],
    })

    const prompt = getPromptTextFromCall()
    expect(prompt).toContain('[Continuation Context]')
    expect(prompt).toContain('[Character Reference Constraint]')
    expect(prompt).toContain('Previous episode title: Lantern in the Woods')
    expect(prompt).toContain('Previous end-of-episode choices: Follow the lantern, Hide behind a tree')
    expect(prompt).toContain(
      'Do NOT generate scene illustrations, alternate cover options, or any other extra images beyond the allowed character reference portraits and this single cover image.'
    )
  })

  it('composes a director-script prompt with localized text output instructions and English frame prompts', async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify([
        {
          index: 1,
          sceneDescription: '月夜森林',
          cameraDesign: '全景推进',
          animationAction: 'Luna 和 Milo 追着光点往前走。',
          voiceOver: '月光像糖霜一样落在树梢上。',
          dialogue: [{ speaker: 'Milo', text: '我们继续走吧。' }],
          charactersUsed: ['Luna', 'Milo'],
          estimatedDuration: 10,
          openingFramePrompt: 'opening frame prompt',
          midActionFramePrompt: 'mid frame prompt',
          endingFramePrompt: 'ending frame prompt',
        },
      ]),
    })

    const scenes = await generateStorybookDirectorScript({
      storyName: 'Moonlight Trip',
      protagonistName: 'Luna',
      supportingName: 'Milo',
      storyContent: '[Scene 1] A silver path appears.',
      ageRange: '4-6',
      styleDesc: 'soft watercolor storybook',
      locale: 'zh',
      characterPool: ['Luna', 'Milo'],
      characterProfiles: [{ name: 'Milo', description: 'brave otter friend' }],
      minSceneCount: 3,
      maxSceneCount: 4,
    })

    const prompt = getPromptTextFromCall()

    expect(prompt).toContain(
      'sceneDescription, cameraDesign, animationAction, voiceOver, and dialogue text values must be written in Simplified Chinese.'
    )
    expect(prompt).toContain(
      'openingFramePrompt, midActionFramePrompt, and endingFramePrompt must always stay in English for downstream image generation.'
    )
    expect(prompt).toContain(
      'Every voiceOver must begin with one or two short eleven_v3 control tags in English square brackets'
    )
    expect(prompt).toContain(
      'Return JSON-safe text only: every JSON string value must stay on a single line, any internal double quotes must be escaped, and no field may contain raw line breaks.'
    )
    expect(prompt).not.toMatch(/[\u4e00-\u9fff]/)
    expect(scenes).toHaveLength(1)
    expect(scenes[0].imagePrompts?.[0]).toContain(
      'Characters in this frame: Luna, Milo(brave otter friend). Must include all characters'
    )
  })

  it('parses split scene metadata and groups batched director images by scene order', async () => {
    generateContentMock.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                text:
                  'SCENE_META:{"index":1,"sceneDescription":"Lantern path",',
              },
              {
                text:
                  '"cameraDesign":"wide glide","animationAction":"Luna follows the lantern","voiceOver":"A lantern hummed ahead.","dialogue":[{"speaker":"Luna","text":"Wait for me."}],"charactersUsed":["Luna"],"estimatedDuration":10,"openingFramePrompt":"opening one","midActionFramePrompt":"middle one","endingFramePrompt":"ending one"}\n' +
                  'SCENE_META:{"index":2,"sceneDescription":"Bridge arrival","cameraDesign":"gentle push in","animationAction":"Milo waves from the bridge","voiceOver":"The bridge shone like silver.","dialogue":[{"speaker":"Milo","text":"Over here."}],"charactersUsed":["Luna","Milo"],"estimatedDuration":11,"openingFramePrompt":"opening two","midActionFramePrompt":"middle two","endingFramePrompt":"ending two"}',
              },
              ...Array.from({ length: 6 }, (_, i) => ({
                inlineData: {
                  data: Buffer.from(`scene-image-${i}`).toString('base64'),
                  mimeType: 'image/png',
                },
              })),
            ],
          },
        },
      ],
    })

    const previousChunkSize = process.env.GEMINI_INTERLEAVED_CHUNK_SIZE
    process.env.GEMINI_INTERLEAVED_CHUNK_SIZE = '2'

    try {
      const result = await generateInterleavedDirectorScript({
        storyName: 'Moonlight Trip',
        protagonistName: 'Luna',
        supportingName: 'Milo',
        storyContent: '[Scene 1] A lantern drifted toward the bridge.',
        ageRange: '4-6',
        styleDesc: 'soft watercolor storybook',
        locale: 'en',
        characterPool: ['Luna', 'Milo'],
        characterProfiles: [{ name: 'Milo', description: 'brave otter friend' }],
        sceneCount: 2,
      })

      expect(result.scenes).toHaveLength(2)
      expect(result.scenes[0].sceneDescription).toBe('Lantern path')
      expect(result.scenes[1].sceneDescription).toBe('Bridge arrival')
      expect(getPromptTextFromCall()).toContain(
        'Every voiceOver must begin with one or two short eleven_v3 control tags in English square brackets'
      )
      expect(getPromptTextFromCall()).toContain(
        'Return JSON-safe text only: every JSON string value must stay on a single line, any internal double quotes must be escaped, and no field may contain raw line breaks.'
      )
      expect(result.sceneImages.get(0)).toHaveLength(3)
      expect(result.sceneImages.get(1)).toHaveLength(3)
      expect(result.scenes[1].imagePrompts?.[0]).toContain(
        'Characters in this frame: Luna, Milo. Must include all characters'
      )
      expect(result.scenes[1].imagePrompts?.[0]).not.toContain('Milo(')
    } finally {
      if (previousChunkSize === undefined) {
        delete process.env.GEMINI_INTERLEAVED_CHUNK_SIZE
      } else {
        process.env.GEMINI_INTERLEAVED_CHUNK_SIZE = previousChunkSize
      }
    }
  })

  it('retries a parallel interleaved chunk after a headers timeout', async () => {
    const attemptsByChunk = new Map<string, number>()
    generateContentMock.mockImplementation(async (request) => {
      const typedRequest = request as {
        contents: Array<{ parts?: Array<{ text?: string }> }>
      }
      const prompt = typedRequest.contents[0]?.parts?.find((part) => typeof part.text === 'string')?.text ?? ''

      const buildChunkResponse = (sceneIndex: number, speaker: string) => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text:
                    `SCENE_META:{"index":${sceneIndex},"sceneDescription":"Scene ${sceneIndex}","cameraDesign":"wide glide","animationAction":"Action ${sceneIndex}","voiceOver":"[softly] Narration ${sceneIndex}.","dialogue":[{"speaker":"${speaker}","text":"Line ${sceneIndex}."}],"charactersUsed":["Luna","Milo"],"estimatedDuration":10,"openingFramePrompt":"opening ${sceneIndex}","midActionFramePrompt":"middle ${sceneIndex}","endingFramePrompt":"ending ${sceneIndex}"}`,
                },
                ...Array.from({ length: 3 }, (_, i) => ({
                  inlineData: {
                    data: Buffer.from(`parallel-scene-${sceneIndex}-image-${i}`).toString('base64'),
                    mimeType: 'image/png',
                  },
                })),
              ],
            },
          },
        ],
      })

      if (prompt.includes('Generate scenes 1 to 1 of 2 total scenes')) {
        const attempt = (attemptsByChunk.get('scene-1') ?? 0) + 1
        attemptsByChunk.set('scene-1', attempt)
        if (attempt === 1) {
          const error = new TypeError('fetch failed') as TypeError & {
            cause?: { code: string; message: string }
          }
          error.cause = { code: 'UND_ERR_HEADERS_TIMEOUT', message: 'Headers Timeout Error' }
          throw error
        }
        return buildChunkResponse(1, 'Luna')
      }

      if (prompt.includes('Generate scenes 2 to 2 of 2 total scenes')) {
        const attempt = (attemptsByChunk.get('scene-2') ?? 0) + 1
        attemptsByChunk.set('scene-2', attempt)
        return buildChunkResponse(2, 'Milo')
      }

      throw new Error(`Unexpected prompt: ${prompt.slice(0, 120)}`)
    })

    const previousChunkSize = process.env.GEMINI_INTERLEAVED_CHUNK_SIZE
    process.env.GEMINI_INTERLEAVED_CHUNK_SIZE = '1'

    try {
      const result = await generateInterleavedDirectorScript({
        storyName: 'Moonlight Trip',
        protagonistName: 'Luna',
        supportingName: 'Milo',
        storyContent: '[Scene 1] A lantern drifted toward the bridge.\n[Scene 2] Milo waved from the bridge.',
        ageRange: '4-6',
        styleDesc: 'soft watercolor storybook',
        locale: 'en',
        characterPool: ['Luna', 'Milo'],
        sceneCount: 2,
        sceneTexts: ['[Scene 1] A lantern drifted toward the bridge.', '[Scene 2] Milo waved from the bridge.'],
        sceneContexts: [
          {
            visualTheme: 'moonlit bridge path',
            timeLighting: 'dusk glow',
            keyProp: 'silver lantern',
            actionFlow: 'Luna walks forward',
            characters: ['Luna'],
          },
          {
            visualTheme: 'bridge arrival',
            timeLighting: 'moonlight shimmer',
            keyProp: 'wooden bridge',
            actionFlow: 'Milo waves from the rail',
            characters: ['Luna', 'Milo'],
          },
        ],
      })

      expect(generateContentMock).toHaveBeenCalledTimes(3)
      expect(attemptsByChunk.get('scene-1')).toBe(2)
      expect(attemptsByChunk.get('scene-2')).toBe(1)
      expect(result.scenes).toHaveLength(2)
      expect(result.sceneImages.get(0)).toHaveLength(3)
      expect(result.sceneImages.get(1)).toHaveLength(3)
    } finally {
      if (previousChunkSize === undefined) {
        delete process.env.GEMINI_INTERLEAVED_CHUNK_SIZE
      } else {
        process.env.GEMINI_INTERLEAVED_CHUNK_SIZE = previousChunkSize
      }
    }
  })

  it('maps NPC images when Gemini batches text and images separately', async () => {
    generateContentMock.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                text:
                  '[STORY BODY]\n' +
                  '[Scene 1] The forest glowed with fireflies.\n' +
                  '<!--NPCS:[{"name":"Bramble","description":"a hedgehog scout"},{"name":"Fern","description":"a shy deer"}]-->\n' +
                  '<!--CHOICES:["Enter the cave","Climb the tree","Rest by the river"]-->\n' +
                  '[CHARACTER - Bramble]\n' +
                  'Name: Bramble\n' +
                  'Personality: Bold and curious\n' +
                  'Appearance: A small hedgehog with a leaf hat.\n' +
                  '[CHARACTER - Fern]\n' +
                  'Name: Fern\n' +
                  'Personality: Gentle and observant\n' +
                  'Appearance: A young deer with soft brown eyes.\n',
              },
              // Two consecutive images with no text in between
              {
                inlineData: {
                  data: Buffer.from('bramble-image').toString('base64'),
                  mimeType: 'image/png',
                },
              },
              {
                inlineData: {
                  data: Buffer.from('fern-image').toString('base64'),
                  mimeType: 'image/png',
                },
              },
              { text: '[COVER]\n' },
              {
                inlineData: {
                  data: Buffer.from('cover-image').toString('base64'),
                  mimeType: 'image/png',
                },
              },
            ],
          },
        },
      ],
    })

    const result = await generateStoryWithAssets({
      storyName: 'Forest Friends',
      protagonistName: 'Luna',
      supportingName: 'Milo',
      synopsis: 'A walk through a magical forest.',
      ageRange: '4-6',
      styleDesc: 'soft watercolor storybook',
      locale: 'en',
    })

    const compressedBase64 = Buffer.from('compressed-image').toString('base64')

    // First image gets the full text label containing both headers;
    // extractInterleavedCharacterSectionName matches "Bramble" from the first [CHARACTER - Bramble] header.
    // Second image gets empty label, so positional fallback assigns it to "Fern".
    expect(result.npcImages.get('Bramble')).toEqual({
      data: compressedBase64,
      mimeType: 'image/jpeg',
    })
    expect(result.npcImages.get('Fern')).toEqual({
      data: compressedBase64,
      mimeType: 'image/jpeg',
    })
    expect(result.coverImage).toEqual({
      data: compressedBase64,
      mimeType: 'image/jpeg',
    })
    expect(result.npcs).toHaveLength(2)
  })

  it('maps NPC images with fuzzy header matching', async () => {
    generateContentMock.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                text:
                  '[STORY BODY]\n' +
                  '[Scene 1] The ocean sparkled.\n' +
                  '<!--NPCS:[{"name":"Coral","description":"a friendly seahorse"}]-->\n' +
                  '<!--CHOICES:["Dive deeper","Swim to shore","Follow the current"]-->\n' +
                  '[Character: Coral]\n' +
                  'Name: Coral\n' +
                  'Personality: Cheerful\n' +
                  'Appearance: A pink seahorse.\n',
              },
              {
                inlineData: {
                  data: Buffer.from('coral-image').toString('base64'),
                  mimeType: 'image/png',
                },
              },
              { text: '[COVER]\n' },
              {
                inlineData: {
                  data: Buffer.from('cover-image').toString('base64'),
                  mimeType: 'image/png',
                },
              },
            ],
          },
        },
      ],
    })

    const result = await generateStoryWithAssets({
      storyName: 'Ocean Adventure',
      protagonistName: 'Luna',
      supportingName: 'Milo',
      synopsis: 'An underwater journey.',
      ageRange: '4-6',
      styleDesc: 'soft watercolor storybook',
      locale: 'en',
    })

    const compressedBase64 = Buffer.from('compressed-image').toString('base64')

    // [Character: Coral] should be matched by the broadened regex
    expect(result.npcImages.get('Coral')).toEqual({
      data: compressedBase64,
      mimeType: 'image/jpeg',
    })
    expect(result.coverImage).toEqual({
      data: compressedBase64,
      mimeType: 'image/jpeg',
    })
  })

  it('repairs interleaved SCENE_META strings that contain raw newlines and quotes', async () => {
    generateContentMock.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                text: `SCENE_META:{"index":1,"sceneDescription":"Lantern path","cameraDesign":"wide glide","animationAction":"Luna follows the lantern","voiceOver":"[softly]
The lantern says "come closer".","dialogue":[{"speaker":"Milo","text":"He says "hello"."}],"charactersUsed":["Luna","Milo"],"estimatedDuration":10,"openingFramePrompt":"opening one","midActionFramePrompt":"middle one","endingFramePrompt":"ending one"}`,
              },
            ],
          },
        },
      ],
    })

    const result = await generateInterleavedDirectorScript({
      storyName: 'Moonlight Trip',
      protagonistName: 'Luna',
      supportingName: 'Milo',
      storyContent: '[Scene 1] A lantern drifted toward the bridge.',
      ageRange: '4-6',
      styleDesc: 'soft watercolor storybook',
      locale: 'en',
      characterPool: ['Luna', 'Milo'],
      sceneCount: 1,
    })

    expect(result.scenes).toHaveLength(1)
    expect(result.scenes[0].narration).toContain('The lantern says "come closer".')
    expect(result.scenes[0].dialogue).toEqual([
      { speaker: 'Milo', text: 'He says "hello".' },
    ])
  })

  it('falls back to schema-aware SCENE_META parsing when inner quotes break generic JSON repair', async () => {
    generateContentMock.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                text: 'SCENE_META:{"index":1,"sceneDescription":"Afternoon rest","cameraDesign":"slow push in","animationAction":"Vita whispers "Rest, little Cat," and tucks the blanket in.","voiceOver":"[softly] The room glows "golden," calm and still.","dialogue":[{"speaker":"Vita","text":"Rest, little Cat,"},{"speaker":"Cat","text":"Mm-hmm."}],"charactersUsed":["Vita","Cat"],"estimatedDuration":10,"openingFramePrompt":"opening one","midActionFramePrompt":"middle one","endingFramePrompt":"ending one"}',
              },
            ],
          },
        },
      ],
    })

    const result = await generateInterleavedDirectorScript({
      storyName: 'Amber Nap',
      protagonistName: 'Vita',
      supportingName: 'Cat',
      storyContent: '[Scene 1] Vita and Cat settle in for a nap.',
      ageRange: '4-6',
      styleDesc: 'soft watercolor storybook',
      locale: 'en',
      characterPool: ['Vita', 'Cat'],
      sceneCount: 1,
    })

    expect(result.scenes).toHaveLength(1)
    expect(result.scenes[0].animationAction).toContain('Rest, little Cat,')
    expect(result.scenes[0].narration).toContain('golden')
    expect(result.scenes[0].dialogue).toEqual([
      { speaker: 'Vita', text: 'Rest, little Cat,' },
      { speaker: 'Cat', text: 'Mm-hmm.' },
    ])
  })

  it('requests localized voice reasons and falls back with a localized default reason', async () => {
    generateContentMock.mockResolvedValueOnce({
      text: '{"voiceName":"Puck","reason":"活泼温暖，适合孩子。"}',
    })

    const assigned = await assignCharacterVoice('Luna', 6, 'storybook', undefined, 'zh')
    const prompt = getPromptTextFromCall(0)

    expect(prompt).toContain('Write the "reason" in Simplified Chinese.')
    expect(assigned).toEqual({
      voiceName: 'Puck',
      reason: '活泼温暖，适合孩子。',
    })

    generateContentMock.mockRejectedValueOnce(new Error('boom'))

    const fallback = await assignCharacterVoice('Luna', 6, 'storybook', undefined, 'zh')
    expect(fallback).toEqual({
      voiceName: 'Puck',
      reason: '已分配默认声音。',
    })
  })
})
