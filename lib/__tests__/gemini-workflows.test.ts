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
    expect(prompt).not.toMatch(/[\u4e00-\u9fff]/)
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
    expect(prompt).toContain('[CHARACTER - <Character Name>]')
    expect(prompt).toContain('[COVER]')
    expect(prompt).toContain(
      'All story prose, dialogue, NPC descriptions, and choice text must be written in English.'
    )
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
    expect(prompt).not.toMatch(/[\u4e00-\u9fff]/)
    expect(scenes).toHaveLength(1)
    expect(scenes[0].imagePrompts?.[0]).toContain(
      'Characters in this frame: Luna, Milo(brave otter friend). Must include all characters'
    )
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
