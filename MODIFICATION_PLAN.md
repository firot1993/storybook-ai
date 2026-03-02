# Storybook AI — 具体修改方案 v2

> 对应 ARCHITECTURE.md v2，从绘本阅读器升级为 AI 视频生产管线
> 涵盖：语音输入 + Nano Banana 图片生成 + 梗概→故事→脚本→视频合成→字幕

---

## 改动全景图

```
新增文件（lib）:     gemini-stt.ts | banana-img.ts | ffmpeg.ts | storage.ts
新增文件（API）:     /api/voice/transcribe | /api/story/synopsis | /api/story/script
                   /api/video/start | /api/video/[id]/status | /api/video/[id]
                   /api/video/[id]/subtitles
新增文件（pages）:   /story/synopsis | /story/script | /video/create | /video/[id]
修改文件（lib）:     gemini.ts（新增synopsis/script函数）
修改文件（API）:     /api/character → 支持语音描述+Banana图片生成
                   /api/story/generate → 不再同步生图/配音
修改文件（pages）:   /character → 增加语音录入入口
修改文件（DB）:      prisma/schema.prisma → 新增 Synopsis/Script/VideoProject 表
修改文件（types）:   types/index.ts → 补全所有 v2 类型
```

---

## 阶段一：基础设施（先做）

### 【S1-1】更新 Prisma Schema

**文件**: `prisma/schema.prisma`

在现有 `Character`、`Story`、`CharacterRelationship` 基础上，新增三张表，并扩展 `Character` 和 `Story`。

**修改点：**

1. `Character` 新增字段：
```prisma
model Character {
  // 现有字段...
  voiceInputUrl  String?          // 语音录音 URL（可选保留）
  style          String   @default("")  // 卡通风格
  updatedAt      DateTime @updatedAt    // 新增
  // 现有关联...
}
```

2. `Story` 新增字段：
```prisma
model Story {
  // 现有字段...
  synopsisId    String?
  synopsis      Synopsis?      @relation(fields: [synopsisId], references: [id])
  scripts       Script[]
  videoProjects VideoProject[]
  updatedAt     DateTime @updatedAt
}
```

3. 新增三张表（全量）：
```prisma
model Synopsis {
  id           String   @id @default(cuid())
  characterIds String   // JSON string array
  theme        String   @default("")
  keywords     String   @default("")
  ageGroup     String   @default("4-6")
  content      String
  createdAt    DateTime @default(now())
  stories      Story[]
}

model Script {
  id            String   @id @default(cuid())
  storyId       String
  scenesJson    String   // JSON: ScriptScene[]
  totalDuration Int      @default(0)
  createdAt     DateTime @default(now())
  story         Story          @relation(fields: [storyId], references: [id], onDelete: Cascade)
  videoProjects VideoProject[]
}

model VideoProject {
  id             String   @id @default(cuid())
  storyId        String
  scriptId       String
  status         String   @default("pending")
  progress       Int      @default(0)
  sceneVideoUrls String   @default("[]")
  rawVideoUrl    String   @default("")
  subtitlesJson  String   @default("[]")
  finalVideoUrl  String   @default("")
  errorMessage   String   @default("")
  videoSettings  String   @default("{}")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  story          Story    @relation(fields: [storyId], references: [id], onDelete: Cascade)
  script         Script   @relation(fields: [scriptId], references: [id])
}
```

**执行迁移：**
```bash
npx prisma migrate dev --name add_synopsis_script_video
```

---

### 【S1-2】更新 TypeScript 类型

**文件**: `types/index.ts`

在现有类型基础上追加：

```typescript
// ── 脚本相关 ──────────────────────────────────────────────

export interface ScriptDialogueLine {
  speaker: string    // 角色名 or "Narrator"
  text: string
}

export interface ScriptScene {
  index: number
  title: string
  narration: string
  dialogue: ScriptDialogueLine[]
  imagePrompt: string
  estimatedDuration: number  // 秒
  imageUrl?: string
  audioUrl?: string
  videoClipUrl?: string
}

export interface Script {
  id: string
  storyId: string
  scenes: ScriptScene[]
  totalDuration: number
  createdAt: Date
}

// ── 梗概 ──────────────────────────────────────────────────

export interface Synopsis {
  id: string
  characterIds: string[]
  theme: string
  keywords: string
  ageGroup: '2-4' | '4-6' | '6-8'
  content: string
  createdAt: Date
}

// ── 字幕 ──────────────────────────────────────────────────

export interface SubtitleCue {
  index: number
  startTime: number   // ms
  endTime: number     // ms
  text: string
}

// ── 视频项目 ───────────────────────────────────────────────

export type VideoProjectStatus =
  | 'pending'
  | 'generating_images'
  | 'generating_audio'
  | 'composing'
  | 'editing'
  | 'adding_subtitles'
  | 'complete'
  | 'failed'

export interface VideoSettings {
  resolution: '1280x720' | '1080x1080' | '1920x1080'
  fps: 24 | 30
  transitionType: 'fade' | 'cut'
  subtitleStyle: {
    fontSize: number
    color: string
    position: 'top' | 'bottom' | 'center'
  }
}

export interface VideoProject {
  id: string
  storyId: string
  scriptId: string
  status: VideoProjectStatus
  progress: number
  sceneVideoUrls: string[]
  rawVideoUrl: string
  subtitles: SubtitleCue[]
  finalVideoUrl: string
  errorMessage?: string
  videoSettings: VideoSettings
  createdAt: Date
  updatedAt: Date
}

// ── 语音转写 ───────────────────────────────────────────────

export interface TranscribeResponse {
  transcript: string
  confidence?: number
  language?: string
}

// ── API 请求 ───────────────────────────────────────────────

export interface GenerateSynopsisRequest {
  characterIds: string[]
  characterNames: string[]
  characterDescriptions?: string[]
  theme: string
  keywords: string
  ageGroup: '2-4' | '4-6' | '6-8'
  relationship?: string
}

export interface GenerateScriptRequest {
  storyId: string
  characterNames: string[]
  characterDescriptions?: string[]
}

export interface StartVideoRequest {
  scriptId: string
  storyId: string
  videoSettings?: Partial<VideoSettings>
}

// ── 更新 GenerateStoryOptionsRequest ──────────────────────

export interface GenerateStoryOptionsRequest {
  synopsisId?: string           // v2 新增：基于梗概生成选项
  characterIds?: string[]
  characterNames: string[]
  characterDescriptions?: string[]
  keywords: string
  ageGroup: '2-4' | '4-6' | '6-8'
  relationship?: string
}

// ── 更新 Story（新增 synopsisId）─────────────────────────

export interface Story {
  id: string
  synopsisId?: string           // v2 新增
  characterIds: string[]
  title: string
  content: string
  images: string[]
  audioUrl: string
  sceneAudioUrls?: string[]
  createdAt: Date
}

// ── 更新 Character（新增 voice/style）────────────────────

export interface Character {
  id: string
  name: string
  description: string
  voiceInputUrl?: string        // v2 新增
  originalImage: string
  cartoonImage: string
  style: string                 // v2 新增
  createdAt: Date
}
```

---

### 【S1-3】安装新依赖

```bash
# 视频处理
npm install fluent-ffmpeg
npm install --save-dev @types/fluent-ffmpeg

# 语音录制（前端）
npm install recordrtc
npm install --save-dev @types/recordrtc

# 文件存储（可选云存储）
npm install @aws-sdk/client-s3   # 如需 S3/R2
```

---

## 阶段二：新建服务层文件（lib/）

### 【S2-1】新建 `lib/gemini-stt.ts` — 语音转文字

```typescript
// lib/gemini-stt.ts
import { GoogleGenAI } from '@google/genai'

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })
const STT_MODEL = 'gemini-2.0-flash'  // 支持音频 inline data 的 Gemini 模型

type SttErrorShape = { status?: number; message?: string }

export class GeminiSttError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/**
 * 将音频 base64 转为文字（Gemini Multimodal）
 */
export async function transcribeAudio(
  audioBase64: string,
  mimeType: 'audio/webm' | 'audio/ogg' | 'audio/wav' | 'audio/mp4',
  hint = 'Transcribe the spoken content accurately. Return only the transcribed text.'
): Promise<{ transcript: string; confidence?: number }> {
  if (!process.env.GEMINI_API_KEY) {
    throw new GeminiSttError(503, 'GEMINI_API_KEY is not configured.')
  }

  try {
    const response = await genAI.models.generateContent({
      model: STT_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { text: hint },
            { inlineData: { data: audioBase64, mimeType } },
          ],
        },
      ],
    })

    const transcript = response.text?.trim() ?? ''
    if (!transcript) {
      throw new GeminiSttError(502, 'Speech-to-text returned empty result.')
    }

    return { transcript }
  } catch (error) {
    if (error instanceof GeminiSttError) throw error
    const e = error as SttErrorShape
    throw new GeminiSttError(
      e?.status ?? 500,
      e?.message ?? 'Speech-to-text failed.'
    )
  }
}

/**
 * 从转写文本中提取角色信息（名称 + 描述）
 */
export async function extractCharacterInfo(
  transcript: string
): Promise<{ name?: string; description?: string }> {
  const prompt = `From this voice input, extract:
1. The character's name (if mentioned)
2. The character's description (appearance, personality, traits)

Voice input: "${transcript}"

Return JSON only:
{
  "name": "extracted name or null",
  "description": "extracted description or null"
}`

  const response = await genAI.models.generateContent({
    model: STT_MODEL,
    contents: prompt,
  })

  try {
    const text = response.text ?? '{}'
    const cleaned = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return {
      name: parsed.name || undefined,
      description: parsed.description || undefined,
    }
  } catch {
    return { description: transcript }
  }
}
```

---

### 【S2-2】新建 `lib/banana-img.ts` — Nano Banana 图片生成

```typescript
// lib/banana-img.ts
import sharp from 'sharp'  // 已有依赖

const BANANA_API_URL = process.env.BANANA_API_URL || 'https://api.banana.dev'
const BANANA_API_KEY = process.env.BANANA_API_KEY || ''
const BANANA_MODEL_KEY = process.env.BANANA_MODEL_KEY || ''

export class BananaImageError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

interface BananaT2IOptions {
  negativePrompt?: string
  width?: number
  height?: number
  steps?: number
  guidanceScale?: number
  seed?: number
}

interface BananaResponse {
  id?: string
  message?: string
  outputs?: Array<{
    image?: string    // base64
    images?: string[] // base64 array (模型相关)
  }>
  // Banana.dev v4 格式
  modelOutputs?: Array<{
    image_base64?: string
  }>
}

/**
 * 文字描述 → 图片（T2I）
 */
export async function generateImageFromText(
  prompt: string,
  options: BananaT2IOptions = {}
): Promise<{ imageBase64: string; mimeType: 'image/jpeg' }> {
  if (!BANANA_API_KEY || !BANANA_MODEL_KEY) {
    throw new BananaImageError(503, 'BANANA_API_KEY or BANANA_MODEL_KEY is not configured.')
  }

  const {
    negativePrompt = 'text, watermark, signature, blurry, low quality, ugly, scary',
    width = 768,
    height = 768,
    steps = 20,
    guidanceScale = 7.5,
    seed,
  } = options

  const requestBody = {
    modelKey: BANANA_MODEL_KEY,
    modelInputs: {
      prompt,
      negative_prompt: negativePrompt,
      width,
      height,
      num_inference_steps: steps,
      guidance_scale: guidanceScale,
      ...(seed !== undefined ? { seed } : {}),
    },
    startOnly: false,
  }

  let response: Response
  try {
    response = await fetch(`${BANANA_API_URL}/start/v4/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${BANANA_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    })
  } catch (networkError) {
    throw new BananaImageError(503, 'Cannot reach Banana image API. Check BANANA_API_URL.')
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new BananaImageError(
      response.status,
      `Banana API error ${response.status}: ${errorText.slice(0, 200)}`
    )
  }

  const data: BananaResponse = await response.json()

  // 兼容不同响应格式提取 base64
  const rawBase64 =
    data.modelOutputs?.[0]?.image_base64 ||
    data.outputs?.[0]?.image ||
    (data.outputs?.[0]?.images ?? [])[0]

  if (!rawBase64) {
    throw new BananaImageError(502, 'Banana API returned no image data.')
  }

  // 压缩到合理大小
  const compressed = await compressGeneratedImage(rawBase64)
  return { imageBase64: compressed.data, mimeType: 'image/jpeg' }
}

/**
 * 参考图片 + 文字描述 → 图片（I2I，用于角色一致性）
 */
export async function generateImageFromReference(
  prompt: string,
  referenceImageBase64: string,
  strength = 0.7
): Promise<{ imageBase64: string; mimeType: 'image/jpeg' }> {
  return generateImageFromText(
    prompt,
    {
      // 注：具体 I2I 参数取决于 Banana 上部署的模型，这里提供通用结构
      // 实际使用时需按模型文档调整字段名
    }
  )
}

/**
 * 压缩图片（复用自 gemini.ts 的逻辑）
 */
export async function compressGeneratedImage(
  base64Data: string,
  maxDim = 768,
  quality = 80
): Promise<{ data: string; mimeType: 'image/jpeg' }> {
  try {
    const inputBuffer = Buffer.from(base64Data, 'base64')
    const outputBuffer = await sharp(inputBuffer)
      .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer()
    return { data: outputBuffer.toString('base64'), mimeType: 'image/jpeg' }
  } catch {
    return { data: base64Data, mimeType: 'image/jpeg' }
  }
}
```

---

### 【S2-3】新建 `lib/ffmpeg.ts` — 视频处理

```typescript
// lib/ffmpeg.ts
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs/promises'
import path from 'path'

if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH)
}

export interface SubtitleCue {
  index: number
  startTime: number  // ms
  endTime: number    // ms
  text: string
}

/**
 * 单张图片 + 音频 → 视频片段
 */
export function createSceneVideoClip(
  imagePath: string,
  audioPath: string,
  outputPath: string,
  options: { resolution?: string; fps?: number } = {}
): Promise<void> {
  const { resolution = '1280x720', fps = 24 } = options

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(imagePath)
      .inputOptions(['-loop 1'])
      .input(audioPath)
      .outputOptions([
        `-vf scale=${resolution.replace('x', ':')}:force_original_aspect_ratio=decrease,pad=${resolution.replace('x', ':')}:(ow-iw)/2:(oh-ih)/2`,
        `-r ${fps}`,
        '-c:v libx264',
        '-tune stillimage',
        '-c:a aac',
        '-b:a 192k',
        '-pix_fmt yuv420p',
        '-shortest',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(new Error(`FFmpeg scene clip failed: ${err.message}`)))
      .run()
  })
}

/**
 * 拼接多个视频片段
 */
export async function concatenateVideos(
  clipPaths: string[],
  outputPath: string,
  options: { transitionType?: 'cut' | 'fade'; transitionDuration?: number } = {}
): Promise<void> {
  // 生成 concat 文件列表
  const concatListPath = outputPath.replace('.mp4', '_concat.txt')
  const concatContent = clipPaths.map(p => `file '${p}'`).join('\n')
  await fs.writeFile(concatListPath, concatContent, 'utf-8')

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatListPath)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions(['-c copy'])
      .output(outputPath)
      .on('end', async () => {
        await fs.unlink(concatListPath).catch(() => {})
        resolve()
      })
      .on('error', (err) => reject(new Error(`FFmpeg concat failed: ${err.message}`)))
      .run()
  })
}

/**
 * 烧录字幕到视频
 */
export function burnSubtitles(
  inputVideoPath: string,
  srtPath: string,
  outputPath: string,
  style: {
    fontSize?: number
    fontColor?: string
    position?: 'top' | 'bottom' | 'center'
    fontFamily?: string
  } = {}
): Promise<void> {
  const {
    fontSize = 28,
    fontColor = 'white',
    position = 'bottom',
    fontFamily = 'Arial',
  } = style

  const marginV = position === 'bottom' ? 40 : position === 'top' ? 40 : 0
  const alignment = position === 'top' ? 6 : position === 'center' ? 5 : 2

  const subtitleFilter = [
    `subtitles='${srtPath.replace(/'/g, "\\'")}'`,
    `:force_style='FontSize=${fontSize}`,
    `,PrimaryColour=&H${fontColorToHex(fontColor)}&`,
    `,FontName=${fontFamily}`,
    `,MarginV=${marginV}`,
    `,Alignment=${alignment}'`,
  ].join('')

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(inputVideoPath)
      .outputOptions([`-vf ${subtitleFilter}`, '-c:a copy'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(new Error(`FFmpeg subtitles failed: ${err.message}`)))
      .run()
  })
}

/**
 * 生成 SRT 字幕文件
 */
export async function generateSrtFile(
  subtitles: SubtitleCue[],
  outputPath: string
): Promise<void> {
  const srtContent = subtitles
    .map((cue) => {
      const start = msToSrtTime(cue.startTime)
      const end = msToSrtTime(cue.endTime)
      return `${cue.index}\n${start} --> ${end}\n${cue.text}`
    })
    .join('\n\n')

  await fs.writeFile(outputPath, srtContent, 'utf-8')
}

/**
 * 获取视频时长（毫秒）
 */
export function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return reject(err)
      const duration = metadata.format.duration ?? 0
      resolve(Math.round(duration * 1000))
    })
  })
}

// ── 工具函数 ────────────────────────────────────────────────

function msToSrtTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const milliseconds = ms % 1000
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${padMs(milliseconds)}`
}

function pad(n: number) { return String(n).padStart(2, '0') }
function padMs(n: number) { return String(n).padStart(3, '0') }

function fontColorToHex(color: string): string {
  const map: Record<string, string> = {
    white: 'FFFFFF',
    yellow: '00FFFF',  // SRT/ASS 颜色格式：BGR
    black: '000000',
  }
  return map[color.toLowerCase()] || 'FFFFFF'
}

/**
 * 根据脚本场景计算字幕时间轴（在实际音频时长已知后调用）
 */
export function calculateSubtitleTimings(
  scenes: Array<{
    narration: string
    dialogue: Array<{ speaker: string; text: string }>
    actualDurationMs: number  // 真实音频时长
  }>
): SubtitleCue[] {
  let currentTimeMs = 0
  const cues: SubtitleCue[] = []
  let cueIndex = 1

  for (const scene of scenes) {
    const allLines = [
      scene.narration,
      ...scene.dialogue.map((d) => `${d.speaker}: ${d.text}`),
    ].filter(Boolean)

    const msPerLine = Math.floor(scene.actualDurationMs / allLines.length)

    for (const text of allLines) {
      cues.push({
        index: cueIndex++,
        startTime: currentTimeMs,
        endTime: currentTimeMs + msPerLine,
        text,
      })
      currentTimeMs += msPerLine
    }
  }

  return cues
}
```

---

### 【S2-4】新建 `lib/storage.ts` — 文件存储抽象

```typescript
// lib/storage.ts
import fs from 'fs/promises'
import path from 'path'

const STORAGE_TYPE = process.env.STORAGE_TYPE || 'local'
const LOCAL_STORAGE_PATH = process.env.STORAGE_LOCAL_PATH || '/tmp/storybook'
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

/**
 * 保存文件，返回可访问 URL
 */
export async function saveFile(
  content: Buffer | string,
  relativePath: string  // e.g. "videos/proj123/scene-0.mp4"
): Promise<string> {
  if (STORAGE_TYPE === 'local') {
    const fullPath = path.join(LOCAL_STORAGE_PATH, relativePath)
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, content)
    // 通过 Next.js public 路径或 API 路由提供访问
    return `${BASE_URL}/api/files/${relativePath}`
  }

  // TODO: 云存储实现（R2/S3）
  throw new Error(`Storage type "${STORAGE_TYPE}" not implemented yet.`)
}

/**
 * 读取文件内容（Buffer）
 */
export async function readFile(relativePath: string): Promise<Buffer> {
  if (STORAGE_TYPE === 'local') {
    const fullPath = path.join(LOCAL_STORAGE_PATH, relativePath)
    return fs.readFile(fullPath)
  }
  throw new Error(`Storage type "${STORAGE_TYPE}" not implemented yet.`)
}

/**
 * 获取本地文件绝对路径（FFmpeg 需要实际路径）
 */
export function getLocalPath(relativePath: string): string {
  return path.join(LOCAL_STORAGE_PATH, relativePath)
}

/**
 * 删除项目相关所有文件
 */
export async function deleteProjectFiles(projectId: string): Promise<void> {
  if (STORAGE_TYPE === 'local') {
    const dir = path.join(LOCAL_STORAGE_PATH, 'videos', projectId)
    await fs.rm(dir, { recursive: true, force: true })
  }
}
```

---

### 【S2-5】更新 `lib/gemini.ts` — 新增梗概与脚本生成

在现有文件末尾追加以下函数：

```typescript
// 追加到 lib/gemini.ts

/**
 * 根据角色信息和关键词生成故事梗概（~200字）
 */
export async function generateSynopsis(
  characterNames: string[],
  characterDescriptions: string[],
  theme: string,
  keywords: string,
  ageGroup: string,
  relationship?: string
): Promise<string> {
  const namesLabel = characterNames.length === 1
    ? `a character named ${characterNames[0]}`
    : `characters named ${characterNames.join(' and ')}`

  const characterContext = characterNames
    .map((name, i) => `- ${name}: ${characterDescriptions[i] || 'A friendly character'}`)
    .join('\n')

  const relationshipLine = relationship
    ? `\nRelationship: ${relationship}`
    : ''

  const prompt = `Create a short story outline (~200 words) for children aged ${ageGroup}.

Characters:
${characterContext}
${relationshipLine}
Theme: ${theme}
Keywords: ${keywords}

The outline should include:
1. Setting (where and when)
2. The main problem or adventure
3. How characters work together
4. The happy resolution

Write in simple, warm language. Use [Opening], [Problem], [Adventure], [Resolution] labels.
Return only the outline text, no extra commentary.`

  const response = await genAI.models.generateContent({
    model: TEXT_MODEL,
    contents: prompt,
  })
  return response.text?.trim() ?? ''
}

/**
 * 将故事全文转化为结构化脚本（逐场景台词 + 图片 prompt）
 */
export async function generateScript(
  storyContent: string,
  characterNames: string[],
  characterDescriptions: string[]
): Promise<import('@/types').ScriptScene[]> {
  const characterContext = characterNames
    .map((name, i) => `- ${name}: ${characterDescriptions[i] || 'A friendly character'}`)
    .join('\n')

  const prompt = `Convert this children's story into a structured script for video production.

Characters:
${characterContext}

Story:
${storyContent}

For each [Scene X] section, output a JSON object with:
- index: scene number (0-based)
- title: short scene title (max 5 words)
- narration: the narrator text for this scene (combined narration lines)
- dialogue: array of {speaker, text} for character lines
- imagePrompt: a detailed image generation prompt for this scene (children's book style, describe visual elements, mood, colors, characters' actions)
- estimatedDuration: estimated audio duration in seconds (based on text length, ~2.5 words per second)

Return a JSON array of scene objects. No other text outside the JSON.
Example:
[
  {
    "index": 0,
    "title": "A Magical Discovery",
    "narration": "In a sparkling ocean, Luna found a glowing shell.",
    "dialogue": [
      { "speaker": "Luna", "text": "What is this beautiful shell?" }
    ],
    "imagePrompt": "Children's picture book illustration: young girl with long blue hair crouching on a sandy beach, finding a glowing magical shell, warm golden sunset, gentle waves, soft watercolor style, friendly and magical mood",
    "estimatedDuration": 20
  }
]`

  const response = await genAI.models.generateContent({
    model: TEXT_MODEL,
    contents: prompt,
  })

  try {
    const text = response.text ?? '[]'
    const cleaned = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.error('Failed to parse script JSON:', error)
    return []
  }
}
```

---

### 【S2-6】更新 `lib/db.ts` — 新增 Synopsis/Script/VideoProject 操作

在现有文件末尾追加：

```typescript
// 追加到 lib/db.ts

import type { ScriptScene, SubtitleCue, VideoSettings } from '@/types'

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
  scenes: ScriptScene[]
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
  return { ...s, scenes: JSON.parse(s.scenesJson) as ScriptScene[] }
}

export async function getScriptByStory(storyId: string) {
  const s = await prisma.script.findFirst({ where: { storyId }, orderBy: { createdAt: 'desc' } })
  if (!s) return null
  return { ...s, scenes: JSON.parse(s.scenesJson) as ScriptScene[] }
}

// ── VideoProject ────────────────────────────────────────────

export async function createVideoProject(data: {
  storyId: string
  scriptId: string
  videoSettings?: Partial<VideoSettings>
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
    subtitles: JSON.parse(vp.subtitlesJson) as SubtitleCue[],
    videoSettings: JSON.parse(vp.videoSettings) as Partial<VideoSettings>,
  }
}

export async function updateVideoProjectStatus(
  id: string,
  data: {
    status: string
    progress?: number
    sceneVideoUrls?: string[]
    rawVideoUrl?: string
    subtitles?: SubtitleCue[]
    finalVideoUrl?: string
    errorMessage?: string
  }
) {
  return prisma.videoProject.update({
    where: { id },
    data: {
      status: data.status,
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
  return projects.map(vp => ({
    ...vp,
    sceneVideoUrls: JSON.parse(vp.sceneVideoUrls) as string[],
    subtitles: JSON.parse(vp.subtitlesJson) as SubtitleCue[],
  }))
}

export async function deleteVideoProject(id: string) {
  return prisma.videoProject.delete({ where: { id } })
}
```

---

## 阶段三：新建 API 路由

### 【S3-1】新建 `app/api/voice/transcribe/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { transcribeAudio, extractCharacterInfo, GeminiSttError } from '@/lib/gemini-stt'

// POST /api/voice/transcribe
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const audioFile = formData.get('audio') as File | null
    const hint = formData.get('hint') as string | undefined

    if (!audioFile) {
      return NextResponse.json({ error: 'Audio file is required' }, { status: 400 })
    }

    if (audioFile.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Audio file must be under 10MB' }, { status: 400 })
    }

    const arrayBuffer = await audioFile.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const mimeType = (audioFile.type || 'audio/webm') as 'audio/webm'

    const { transcript } = await transcribeAudio(base64, mimeType, hint)

    // 如果是角色描述场景，同时提取结构化信息
    const extract = hint?.includes('character')
    const characterInfo = extract ? await extractCharacterInfo(transcript) : undefined

    return NextResponse.json({
      transcript,
      ...(characterInfo ? { characterInfo } : {}),
    })
  } catch (error) {
    if (error instanceof GeminiSttError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Transcription error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

---

### 【S3-2】新建 `app/api/story/synopsis/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { generateSynopsis } from '@/lib/gemini'
import { getGeminiErrorResponse } from '@/lib/gemini'
import { createSynopsis, getRelationshipForCharacters } from '@/lib/db'

// POST /api/story/synopsis
export async function POST(request: NextRequest) {
  try {
    const {
      characterIds = [],
      characterNames = [],
      characterDescriptions = [],
      theme = '',
      keywords,
      ageGroup = '4-6',
      relationship,
    } = await request.json()

    if (!keywords || !characterNames.length) {
      return NextResponse.json(
        { error: 'characterNames and keywords are required' },
        { status: 400 }
      )
    }

    const normalizedRelationship =
      relationship ||
      (characterIds.length === 2 ? await getRelationshipForCharacters(characterIds) : '')

    let content: string
    try {
      content = await generateSynopsis(
        characterNames,
        characterDescriptions,
        theme || keywords,
        keywords,
        ageGroup,
        normalizedRelationship || undefined
      )
    } catch (error) {
      const { status, message } = getGeminiErrorResponse(error)
      return NextResponse.json({ error: message }, { status })
    }

    if (!content) {
      return NextResponse.json({ error: 'Failed to generate synopsis' }, { status: 500 })
    }

    const synopsis = await createSynopsis({
      characterIds,
      theme: theme || keywords,
      keywords,
      ageGroup,
      content,
    })

    return NextResponse.json({
      synopsis: {
        id: synopsis.id,
        content: synopsis.content,
        theme: synopsis.theme,
        estimatedSceneCount: (content.match(/\[Scene|Scene \d/g) || []).length || 5,
      },
    })
  } catch (error) {
    console.error('Synopsis generation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

---

### 【S3-3】新建 `app/api/story/script/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { generateScript } from '@/lib/gemini'
import { getGeminiErrorResponse } from '@/lib/gemini'
import { getStory, createScript } from '@/lib/db'
import type { ScriptScene } from '@/types'

// POST /api/story/script
export async function POST(request: NextRequest) {
  try {
    const { storyId, characterNames = [], characterDescriptions = [] } = await request.json()

    if (!storyId) {
      return NextResponse.json({ error: 'storyId is required' }, { status: 400 })
    }

    const story = await getStory(storyId)
    if (!story) {
      return NextResponse.json({ error: 'Story not found' }, { status: 404 })
    }

    let scenes: ScriptScene[]
    try {
      scenes = await generateScript(story.content, characterNames, characterDescriptions)
    } catch (error) {
      const { status, message } = getGeminiErrorResponse(error)
      return NextResponse.json({ error: message }, { status })
    }

    if (!scenes.length) {
      return NextResponse.json({ error: 'Failed to generate script from story' }, { status: 500 })
    }

    const totalDuration = scenes.reduce((sum, s) => sum + (s.estimatedDuration || 0), 0)
    const script = await createScript({ storyId, scenes, totalDuration })

    return NextResponse.json({
      script: {
        id: script.id,
        storyId: script.storyId,
        scenes,
        totalDuration,
        createdAt: script.createdAt,
      },
    })
  } catch (error) {
    console.error('Script generation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

---

### 【S3-4】新建 `app/api/video/start/route.ts` — 视频生产主控

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getScript, createVideoProject, updateVideoProjectStatus } from '@/lib/db'
import { generateImageFromText } from '@/lib/banana-img'
import { generateSceneNarrationAudioUrl } from '@/lib/gemini-tts'
import {
  createSceneVideoClip,
  concatenateVideos,
  burnSubtitles,
  generateSrtFile,
  getVideoDuration,
  calculateSubtitleTimings,
} from '@/lib/ffmpeg'
import { saveFile, getLocalPath } from '@/lib/storage'
import type { VideoSettings } from '@/types'

const DEFAULT_VIDEO_SETTINGS: VideoSettings = {
  resolution: '1280x720',
  fps: 24,
  transitionType: 'fade',
  subtitleStyle: { fontSize: 28, color: 'white', position: 'bottom' },
}

// POST /api/video/start — 启动视频生产（异步后台处理）
export async function POST(request: NextRequest) {
  try {
    const { scriptId, storyId, videoSettings } = await request.json()

    if (!scriptId || !storyId) {
      return NextResponse.json({ error: 'scriptId and storyId are required' }, { status: 400 })
    }

    const script = await getScript(scriptId)
    if (!script) {
      return NextResponse.json({ error: 'Script not found' }, { status: 404 })
    }

    const settings: VideoSettings = { ...DEFAULT_VIDEO_SETTINGS, ...videoSettings }
    const videoProject = await createVideoProject({ storyId, scriptId, videoSettings: settings })

    // 异步启动生产（不阻塞响应）
    runVideoPipeline(videoProject.id, script.scenes, settings).catch((err) => {
      console.error(`[Video Pipeline] Project ${videoProject.id} failed:`, err)
    })

    return NextResponse.json({
      videoProject: {
        id: videoProject.id,
        status: 'pending',
        progress: 0,
      },
    })
  } catch (error) {
    console.error('Video start error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// 实际的视频生产管线（后台异步执行）
async function runVideoPipeline(
  projectId: string,
  scenes: import('@/types').ScriptScene[],
  settings: VideoSettings
) {
  const baseDir = `videos/${projectId}`
  const sceneVideoUrls: string[] = []

  try {
    // ── 阶段1：生成场景配图 ──────────────────────────────
    await updateVideoProjectStatus(projectId, {
      status: 'generating_images',
      progress: 5,
    })

    const imageLocalPaths: string[] = []
    for (const [i, scene] of scenes.entries()) {
      const imageData = await generateImageFromText(scene.imagePrompt, {
        width: settings.resolution === '1080x1080' ? 1080 : 1280,
        height: settings.resolution === '1080x1080' ? 1080 : 720,
      })
      const imageRelPath = `${baseDir}/scene-${i}.jpg`
      await saveFile(Buffer.from(imageData.imageBase64, 'base64'), imageRelPath)
      imageLocalPaths.push(getLocalPath(imageRelPath))

      await updateVideoProjectStatus(projectId, {
        status: 'generating_images',
        progress: Math.round(5 + (i + 1) / scenes.length * 25),
      })
    }

    // ── 阶段2：生成场景音频 ──────────────────────────────
    await updateVideoProjectStatus(projectId, { status: 'generating_audio', progress: 30 })

    const audioLocalPaths: string[] = []
    const sceneDurationsMs: number[] = []
    for (const [i, scene] of scenes.entries()) {
      const sceneText = [scene.narration, ...scene.dialogue.map(d => `${d.speaker}: ${d.text}`)].join('\n')
      const audioDataUrl = await generateSceneNarrationAudioUrl(sceneText)
      const base64 = audioDataUrl.split('base64,')[1]
      const audioRelPath = `${baseDir}/scene-${i}.wav`
      await saveFile(Buffer.from(base64, 'base64'), audioRelPath)
      audioLocalPaths.push(getLocalPath(audioRelPath))

      // 用预估时长（实际获取更准确）
      sceneDurationsMs.push((scene.estimatedDuration || 20) * 1000)

      await updateVideoProjectStatus(projectId, {
        status: 'generating_audio',
        progress: Math.round(30 + (i + 1) / scenes.length * 25),
      })
    }

    // ── 阶段3：合成场景视频片段 ─────────────────────────
    await updateVideoProjectStatus(projectId, { status: 'composing', progress: 55 })

    const clipLocalPaths: string[] = []
    for (let i = 0; i < scenes.length; i++) {
      const clipRelPath = `${baseDir}/scene-${i}.mp4`
      const clipLocalPath = getLocalPath(clipRelPath)
      await createSceneVideoClip(imageLocalPaths[i], audioLocalPaths[i], clipLocalPath, {
        resolution: settings.resolution,
        fps: settings.fps,
      })

      // 获取真实时长
      const actualDuration = await getVideoDuration(clipLocalPath)
      sceneDurationsMs[i] = actualDuration

      clipLocalPaths.push(clipLocalPath)
      sceneVideoUrls.push(await saveFile(await require('fs/promises').readFile(clipLocalPath), clipRelPath))

      await updateVideoProjectStatus(projectId, {
        status: 'composing',
        sceneVideoUrls,
        progress: Math.round(55 + (i + 1) / scenes.length * 20),
      })
    }

    // ── 阶段4：拼接完整视频 ─────────────────────────────
    const rawRelPath = `${baseDir}/raw.mp4`
    const rawLocalPath = getLocalPath(rawRelPath)
    await concatenateVideos(clipLocalPaths, rawLocalPath, {
      transitionType: settings.transitionType,
    })
    const rawVideoUrl = await saveFile(await require('fs/promises').readFile(rawLocalPath), rawRelPath)

    await updateVideoProjectStatus(projectId, {
      status: 'adding_subtitles',
      rawVideoUrl,
      progress: 80,
    })

    // ── 阶段5：生成并烧录字幕 ────────────────────────────
    const scenesWithDuration = scenes.map((s, i) => ({
      narration: s.narration,
      dialogue: s.dialogue,
      actualDurationMs: sceneDurationsMs[i],
    }))
    const subtitleCues = calculateSubtitleTimings(scenesWithDuration)

    const srtRelPath = `${baseDir}/subs.srt`
    const srtLocalPath = getLocalPath(srtRelPath)
    await generateSrtFile(subtitleCues, srtLocalPath)

    const finalRelPath = `${baseDir}/final.mp4`
    const finalLocalPath = getLocalPath(finalRelPath)
    await burnSubtitles(rawLocalPath, srtLocalPath, finalLocalPath, settings.subtitleStyle)
    const finalVideoUrl = await saveFile(await require('fs/promises').readFile(finalLocalPath), finalRelPath)

    await updateVideoProjectStatus(projectId, {
      status: 'complete',
      progress: 100,
      subtitles: subtitleCues,
      finalVideoUrl,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[Video Pipeline] Error:`, error)
    await updateVideoProjectStatus(projectId, {
      status: 'failed',
      errorMessage: msg,
    })
  }
}
```

---

### 【S3-5】新建 `app/api/video/[id]/status/route.ts` — SSE 进度推送

```typescript
import { NextRequest } from 'next/server'
import { getVideoProject } from '@/lib/db'

// GET /api/video/[id]/status — SSE 进度流
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: object) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        )
      }

      const poll = async () => {
        try {
          const project = await getVideoProject(params.id)
          if (!project) {
            sendEvent('error', { message: 'Project not found' })
            controller.close()
            return
          }

          if (project.status === 'complete') {
            sendEvent('complete', {
              status: 'complete',
              progress: 100,
              finalVideoUrl: project.finalVideoUrl,
              subtitles: project.subtitles,
            })
            controller.close()
            return
          }

          if (project.status === 'failed') {
            sendEvent('error', { status: 'failed', message: project.errorMessage })
            controller.close()
            return
          }

          sendEvent('progress', {
            status: project.status,
            progress: project.progress,
          })

          // 继续轮询
          setTimeout(poll, 2000)
        } catch {
          controller.close()
        }
      }

      poll()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
```

---

## 阶段四：修改现有 API 路由

### 【S4-1】更新 `app/api/character/route.ts` — 支持 Nano Banana 图片生成

```typescript
// POST /api/character 修改点：
// 原来：调用 generateCharacterImageWithDiagnostics (Gemini Image)
// 现在：优先使用 Nano Banana，Gemini Image 作为降级

import { generateImageFromText, BananaImageError } from '@/lib/banana-img'

// 在 POST handler 中替换图片生成逻辑：
let cartoonImageBase64: string
let cartoonMimeType = 'image/jpeg'

try {
  // 构建角色图片 prompt
  const characterPrompt = imageBase64
    ? `Transform this photo into a ${style} children's book illustration: ${description || 'friendly cartoon character'}, vibrant colors, simple background, cute and expressive`
    : `Children's book illustration of: ${description || name}, ${style} style, vibrant colors, friendly expression, simple background, cute and warm`

  const result = await generateImageFromText(characterPrompt, {
    negativePrompt: 'realistic, photographic, scary, dark, adult, text, watermark',
    width: 768,
    height: 768,
  })
  cartoonImageBase64 = result.imageBase64
  cartoonMimeType = result.mimeType
} catch (bananaError) {
  if (bananaError instanceof BananaImageError && bananaError.status === 503) {
    // Banana 未配置，降级到 Gemini Image
    console.warn('[Character] Banana not configured, falling back to Gemini Image')
    const geminiResult = await generateCharacterImageWithDiagnostics(imageBase64 || '', style)
    cartoonImageBase64 = geminiResult.imageData || ''
    cartoonMimeType = geminiResult.mimeType
  } else {
    throw bananaError
  }
}
```

---

### 【S4-2】更新 `app/api/story/generate/route.ts` — 移除同步图片/音频生成

v2 中，图片和音频由 `/api/video/start` 的管线处理。`generate` 只负责生成故事文本并存库。

**修改要点：**

```typescript
// 移除以下逻辑：
// - for...of 场景图片生成循环
// - generateSceneNarrationAudioUrls 调用

// 简化后的 generate 流程：
// 1. 生成故事文本 (generateStory)
// 2. 存入 DB (createStory)
// 3. 返回 story 对象（无 images/audio，前端引导到 /story/script 页面）

const story: Story = {
  id: dbStory?.id ?? `local-story-${Date.now()}`,
  synopsisId: typeof synopsisId === 'string' ? synopsisId : undefined,
  characterIds: ids,
  title,
  content: storyText,
  images: [],          // v2: 由视频管线生成
  audioUrl: '',        // v2: 由视频管线生成
  sceneAudioUrls: [],
  createdAt: dbStory?.createdAt ?? new Date(),
}
```

---

## 阶段五：前端新增页面

### 【S5-1】更新 `app/character/page.tsx` — 增加语音录入

**在现有照片上传区域前增加语音输入区块：**

```typescript
// 核心逻辑：语音录制 → transcribe → 自动填充名称和描述

import RecordRTC from 'recordrtc'

function VoiceInputSection({ onTranscribed }: {
  onTranscribed: (name?: string, description?: string) => void
}) {
  const [isRecording, setIsRecording] = useState(false)
  const [recorder, setRecorder] = useState<RecordRTC | null>(null)

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const rtc = new RecordRTC(stream, { type: 'audio', mimeType: 'audio/webm' })
    rtc.startRecording()
    setRecorder(rtc)
    setIsRecording(true)
  }

  const stopAndTranscribe = () => {
    if (!recorder) return
    recorder.stopRecording(async () => {
      const blob = recorder.getBlob()
      const formData = new FormData()
      formData.append('audio', blob, 'recording.webm')
      formData.append('hint', 'Extract the character name and description from this voice input.')

      const res = await fetch('/api/voice/transcribe', { method: 'POST', body: formData })
      const data = await res.json()
      onTranscribed(data.characterInfo?.name, data.characterInfo?.description)
      setIsRecording(false)
    })
  }

  return (
    <div className="mb-6 p-4 border-2 border-dashed border-purple-200 rounded-xl">
      <p className="text-sm text-gray-500 mb-2">用声音描述你的角色</p>
      <button
        onClick={isRecording ? stopAndTranscribe : startRecording}
        className={`btn-primary ${isRecording ? 'bg-red-500' : ''}`}
      >
        {isRecording ? '停止录音 →' : '开始语音描述'}
      </button>
    </div>
  )
}
```

---

### 【S5-2】新建 `app/story/synopsis/page.tsx` — 梗概预览页

```typescript
// 展示生成的梗概，允许用户确认或返回修改关键词
// 确认后导向 /story/options
```

---

### 【S5-3】新建 `app/story/script/page.tsx` — 脚本预览编辑页

```typescript
// 展示生成的逐场景脚本
// 允许用户编辑台词/旁白/图片 prompt
// 确认后导向 /video/create
```

---

### 【S5-4】新建 `app/video/[id]/page.tsx` — 视频生产进度与播放

```typescript
// 连接 SSE /api/video/[id]/status 显示实时进度
// 完成后显示视频播放器 + 字幕编辑 + 下载按钮
```

---

## 实施顺序

```
Week 1: S1（基础设施）+ S2-1/2/3（新 lib 文件）
Week 2: S2-4/5/6（完善 lib）+ S3-1/2/3（新 API）
Week 3: S3-4/5（视频 API）+ S4-1/2（更新现有 API）
Week 4: S5（前端页面）+ 集成测试 + 部署配置
```

## 关键注意事项

1. **Vercel 部署限制**: 视频管线需要 FFmpeg 和文件系统，推荐自托管 Next.js（Docker）或将视频处理拆为单独的后台服务（如 Railway）。
2. **Banana API 密钥**: 需要在 Banana.dev 注册并获取模型部署 key，填入 `.env.local`。
3. **FFmpeg 安装**: 生产环境需确保 FFmpeg 已安装（`apt install ffmpeg` 或通过 Docker 镜像）。
4. **降级策略**: `banana-img.ts` 中当 Banana 未配置时，自动降级到 Gemini Image，保证开发期可用。
5. **数据库迁移**: 在执行 `prisma migrate dev` 前备份现有 `dev.db`。
