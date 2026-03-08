/**
 * Manual integration test for the full story generation pipeline.
 *
 * Requires GEMINI_API_KEY (loaded from .env.local via vitest.manual.config.ts).
 * Excluded from CI — run explicitly:
 *
 *   npm run test:manual              # run en + zh with hardcoded params
 *   npm run test:manual -- -t en     # English only
 *   npm run test:manual -- -t zh     # Chinese only
 *   npm run test:manual -- -t db     # read a real storybook from DB
 *
 * The "db" test also requires DATABASE_URL (from .env.local) and STORYBOOK_ID:
 *
 *   STORYBOOK_ID=<id> npm run test:manual -- -t db
 *
 * Generated artifacts are saved to lib/__tests__/test-output/<timestamp>/<test>/
 */
import fs from 'fs'
import path from 'path'
import { beforeAll, describe, expect, it } from 'vitest'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

const importGemini = GEMINI_API_KEY
  ? () => import('../gemini')
  : () => Promise.reject(new Error('GEMINI_API_KEY not set'))

const OUTPUT_ROOT = path.resolve(__dirname, 'test-output')

let runDir = ''

function mimeToExt(mimeType: string): string {
  if (mimeType.includes('png')) return '.png'
  if (mimeType.includes('webp')) return '.webp'
  return '.jpg'
}

function saveImage(dir: string, name: string, img: { data: string; mimeType: string }) {
  const filePath = path.join(dir, `${name}${mimeToExt(img.mimeType)}`)
  fs.writeFileSync(filePath, Buffer.from(img.data, 'base64'))
  console.log(`  Saved: ${filePath}`)
}

function saveStoryResult(
  tag: string,
  dir: string,
  synopsis: { title: string; content: string },
  result: {
    story: string
    choices: string[]
    npcs: Array<{ name: string; description: string }>
    coverImage?: { data: string; mimeType: string }
    npcImages: Map<string, { data: string; mimeType: string }>
    _debug?: {
      rawResponse: unknown
      rawText: string
      imageSectionLabels: string[]
      responseParts: Array<{ type: 'text'; text: string } | { type: 'image'; mimeType: string }>
    }
  }
) {
  fs.mkdirSync(dir, { recursive: true })

  console.log(`\n=== ${tag} ===`)
  console.log('Output dir:', dir)
  console.log('Synopsis used:', synopsis)
  console.log('Story length:', result.story.length)
  console.log('Story text (first 500 chars):\n---')
  console.log(result.story.slice(0, 500))
  console.log('---')
  console.log('Choices:', result.choices)
  console.log('NPCs:', result.npcs)
  console.log('NPC images mapped:', Array.from(result.npcImages.keys()))
  console.log('Cover image present:', Boolean(result.coverImage))

  // Save synopsis
  fs.writeFileSync(
    path.join(dir, 'synopsis.txt'),
    `Title: ${synopsis.title}\n\n${synopsis.content}`,
    'utf-8'
  )

  // Save raw Gemini API response
  if (result._debug) {
    const rawResponseJson = JSON.stringify(
      result._debug.rawResponse,
      (_key, value) => {
        if (typeof value === 'string' && value.length > 200) {
          return `${value.slice(0, 100)}...[${value.length} chars total]`
        }
        return value
      },
      2
    )
    fs.writeFileSync(path.join(dir, 'raw-response.json'), rawResponseJson, 'utf-8')

    const debugOutput: string[] = []
    debugOutput.push(`=== Raw Response Debug: ${tag} ===\n`)

    debugOutput.push(`--- Response part sequence (${result._debug.responseParts.length} parts) ---`)
    for (let i = 0; i < result._debug.responseParts.length; i++) {
      const part = result._debug.responseParts[i]
      if (part.type === 'text') {
        debugOutput.push(`[Part ${i}] TEXT (${part.text.length} chars):`)
        debugOutput.push(part.text)
        debugOutput.push('')
      } else {
        debugOutput.push(`[Part ${i}] IMAGE (${part.mimeType})\n`)
      }
    }

    debugOutput.push(`--- Image section labels (${result._debug.imageSectionLabels.length} labels) ---`)
    for (let i = 0; i < result._debug.imageSectionLabels.length; i++) {
      const label = result._debug.imageSectionLabels[i]
      debugOutput.push(`[Image ${i}] label (${label.length} chars):`)
      debugOutput.push(label || '(empty)')
      debugOutput.push('')
    }

    debugOutput.push(`--- Full raw text (${result._debug.rawText.length} chars) ---`)
    debugOutput.push(result._debug.rawText)

    fs.writeFileSync(path.join(dir, 'debug.txt'), debugOutput.join('\n'), 'utf-8')
  }

  // Save story text
  fs.writeFileSync(path.join(dir, 'story.txt'), result.story, 'utf-8')

  // Save NPC images
  for (const [name, img] of result.npcImages) {
    console.log(`  NPC "${name}": ${img.mimeType}, ${img.data.length} base64 chars`)
    saveImage(dir, `npc-${name}`, img)
  }

  // Save cover image
  if (result.coverImage) {
    console.log(`  Cover: ${result.coverImage.mimeType}, ${result.coverImage.data.length} base64 chars`)
    saveImage(dir, 'cover', result.coverImage)
  }

  const unmappedNpcs = result.npcs.filter((npc) => !result.npcImages.has(npc.name))
  if (unmappedNpcs.length > 0) {
    console.warn('  ⚠ Unmapped NPCs:', unmappedNpcs.map((n) => n.name))
  }

  console.log(`=== End ${tag} ===\n`)
}

describe.skipIf(!GEMINI_API_KEY)(
  'Full pipeline: synopsis → story with assets',
  () => {
    beforeAll(() => {
      const now = new Date()
      const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
      runDir = path.join(OUTPUT_ROOT, timestamp)
      fs.mkdirSync(runDir, { recursive: true })
      console.log(`\nTest output dir: ${runDir}\n`)
    })

    it(
      'en',
      async () => {
        const { generateSynopsisVersions, generateStoryWithAssets } = await importGemini()

        const storyParams = {
          storyName: 'The Starlight Garden',
          protagonistName: 'Luna',
          supportingName: 'Milo',
          backgroundKeywords: 'starlight, hidden garden, magical creatures, friendship',
          ageRange: '4-6',
        }

        console.log('\n--- Step 1: Generating synopsis versions ---')
        const synopses = await generateSynopsisVersions({
          ...storyParams,
          locale: 'en',
        })

        console.log('Synopsis A:', synopses.A)
        console.log('Synopsis B:', synopses.B)
        console.log('Synopsis C:', synopses.C)

        const dir = path.join(runDir, 'en')
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(
          path.join(dir, 'all-synopses.json'),
          JSON.stringify(synopses, null, 2),
          'utf-8'
        )

        const chosenSynopsis = synopses.A
        expect(chosenSynopsis.content.length).toBeGreaterThan(10)

        console.log('\n--- Step 2: Generating story with assets ---')
        const result = await generateStoryWithAssets({
          storyName: storyParams.storyName,
          protagonistName: storyParams.protagonistName,
          supportingName: storyParams.supportingName,
          synopsis: chosenSynopsis.content,
          ageRange: storyParams.ageRange,
          styleDesc: 'soft watercolor storybook',
          locale: 'en',
          theme: 'wonder and friendship',
        })

        saveStoryResult('English Pipeline', dir, chosenSynopsis, result)

        expect(result.story.length).toBeGreaterThan(100)
        expect(result.choices.length).toBeGreaterThanOrEqual(1)

        if (result.npcs.length > 0) {
          expect(result.npcImages.size).toBeGreaterThanOrEqual(1)
          for (const [, img] of result.npcImages) {
            expect(img.data.length).toBeGreaterThan(0)
            expect(img.mimeType).toMatch(/^image\//)
          }
        }
      },
      180_000
    )

    it(
      'zh',
      async () => {
        const { generateSynopsisVersions, generateStoryWithAssets } = await importGemini()

        const storyParams = {
          storyName: '星光花园',
          protagonistName: '小月',
          supportingName: '米洛',
          backgroundKeywords: '星光, 隐秘花园, 神奇生物, 友谊',
          ageRange: '4-6',
        }

        console.log('\n--- Step 1: Generating synopsis versions ---')
        const synopses = await generateSynopsisVersions({
          ...storyParams,
          locale: 'zh',
        })

        console.log('Synopsis A:', synopses.A)
        console.log('Synopsis B:', synopses.B)
        console.log('Synopsis C:', synopses.C)

        const dir = path.join(runDir, 'zh')
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(
          path.join(dir, 'all-synopses.json'),
          JSON.stringify(synopses, null, 2),
          'utf-8'
        )

        const chosenSynopsis = synopses.A
        expect(chosenSynopsis.content.length).toBeGreaterThan(10)

        console.log('\n--- Step 2: Generating story with assets ---')
        const result = await generateStoryWithAssets({
          storyName: storyParams.storyName,
          protagonistName: storyParams.protagonistName,
          supportingName: storyParams.supportingName,
          synopsis: chosenSynopsis.content,
          ageRange: storyParams.ageRange,
          styleDesc: 'dreamlike watercolor, macaron palette, warm soft light',
          locale: 'zh',
          theme: '探索与友谊',
        })

        saveStoryResult('Chinese Pipeline', dir, chosenSynopsis, result)

        expect(result.story.length).toBeGreaterThan(50)
        expect(result.choices.length).toBeGreaterThanOrEqual(1)

        if (result.npcs.length > 0) {
          expect(result.npcImages.size).toBeGreaterThanOrEqual(1)
          for (const [, img] of result.npcImages) {
            expect(img.data.length).toBeGreaterThan(0)
            expect(img.mimeType).toMatch(/^image\//)
          }
        }
      },
      180_000
    )

    it(
      'db',
      async () => {
        const storybookId = process.env.STORYBOOK_ID
        if (!storybookId) {
          console.log('Skipping db test: set STORYBOOK_ID env var to run')
          return
        }

        const { generateSynopsisVersions, generateStoryWithAssets } = await importGemini()
        const { getStorybook } = await import('../db')
        const { resolveStorybookCharacters, resolveStorybookStyle } = await import('../storybook-helpers')
        const { normalizeLocale } = await import('../i18n/shared')

        // Step 0: Load storybook from DB
        console.log('\n--- Step 0: Loading storybook from DB ---')
        const storybook = await getStorybook(storybookId)
        if (!storybook) {
          throw new Error(`Storybook not found: ${storybookId}`)
        }

        const locale = normalizeLocale(process.env.TEST_LOCALE)
        const { protagonistName, supportingName, protagonistChar, protagonistPronoun, protagonistRole } =
          await resolveStorybookCharacters(storybook, locale)
        const styleDesc = resolveStorybookStyle(storybook)

        // Resolve protagonist image (same logic as production API)
        const protagonistStyleImages = (protagonistChar?.styleImages ?? {}) as Record<string, string>
        const protagonistImageUrl =
          protagonistStyleImages[storybook.styleId] || protagonistChar?.cartoonImage || ''
        const protagonistImageBase64 = protagonistImageUrl
          ? protagonistImageUrl.replace(/^data:[^;]+;base64,/, '')
          : undefined

        console.log('Storybook:', {
          id: storybook.id,
          name: storybook.name,
          ageRange: storybook.ageRange,
          styleId: storybook.styleId,
          characterCount: storybook.characters.length,
        })
        console.log('Protagonist:', protagonistName, { pronoun: protagonistPronoun, role: protagonistRole })
        console.log('Supporting:', supportingName)
        console.log('Style:', styleDesc)
        console.log('Has protagonist image:', Boolean(protagonistImageBase64))

        const dir = path.join(runDir, 'db')
        fs.mkdirSync(dir, { recursive: true })

        // Save storybook info
        fs.writeFileSync(
          path.join(dir, 'storybook.json'),
          JSON.stringify(
            {
              id: storybook.id,
              name: storybook.name,
              ageRange: storybook.ageRange,
              styleId: storybook.styleId,
              characters: storybook.characters,
              protagonistName,
              supportingName,
              protagonistPronoun,
              protagonistRole,
              styleDesc,
              hasProtagonistImage: Boolean(protagonistImageBase64),
            },
            null,
            2
          ),
          'utf-8'
        )

        // Save protagonist image if available
        if (protagonistImageBase64) {
          const isJpeg = protagonistImageBase64.startsWith('/9j/')
          fs.writeFileSync(
            path.join(dir, `protagonist-ref${isJpeg ? '.jpg' : '.png'}`),
            Buffer.from(protagonistImageBase64, 'base64')
          )
          console.log('  Saved protagonist reference image')
        }

        // Step 1: Generate synopsis
        const backgroundKeywords = process.env.TEST_KEYWORDS || (locale === 'zh' ? '冒险, 友谊, 魔法' : 'adventure, friendship, magic')

        console.log('\n--- Step 1: Generating synopsis versions ---')
        const synopses = await generateSynopsisVersions({
          storyName: storybook.name,
          protagonistName,
          supportingName,
          backgroundKeywords,
          ageRange: storybook.ageRange,
          locale,
          protagonistPronoun,
          protagonistRole,
        })

        console.log('Synopsis A:', synopses.A)
        console.log('Synopsis B:', synopses.B)
        console.log('Synopsis C:', synopses.C)

        fs.writeFileSync(
          path.join(dir, 'all-synopses.json'),
          JSON.stringify(synopses, null, 2),
          'utf-8'
        )

        const chosenSynopsis = synopses.A
        expect(chosenSynopsis.content.length).toBeGreaterThan(10)

        // Step 2: Generate story with assets
        console.log('\n--- Step 2: Generating story with assets ---')
        const result = await generateStoryWithAssets({
          storyName: storybook.name,
          protagonistName,
          supportingName,
          synopsis: chosenSynopsis.content,
          ageRange: storybook.ageRange,
          styleDesc,
          locale,
          theme: process.env.TEST_THEME || (locale === 'zh' ? '探索与友谊' : 'exploration and friendship'),
          characterImageBase64: protagonistImageBase64,
          protagonistPronoun,
          protagonistRole,
        })

        saveStoryResult('DB Pipeline', dir, chosenSynopsis, result)

        expect(result.story.length).toBeGreaterThan(50)
        expect(result.choices.length).toBeGreaterThanOrEqual(1)

        if (result.npcs.length > 0) {
          expect(result.npcImages.size).toBeGreaterThanOrEqual(1)
          for (const [, img] of result.npcImages) {
            expect(img.data.length).toBeGreaterThan(0)
            expect(img.mimeType).toMatch(/^image\//)
          }
        }
      },
      240_000
    )
  }
)
