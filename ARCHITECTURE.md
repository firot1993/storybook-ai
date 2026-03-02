# Storybook AI — 整体架构文档 v2

> 基于 `image-file/prototyep.png` 原型需求重新设计
> 核心变更：语音输入 → 视频生产管线（梗概 → 故事 → 脚本 → 配图 → 合成视频 → 剪辑 → 字幕）

---

## 一、系统总体架构

### 1.1 架构演进

```
v1（当前）: 照片 → 卡通角色 → 故事文本 → 配图 → 绘本阅读器
v2（目标）: 语音输入 → 角色描述 → 梗概 → 故事全文 → 脚本 → 配图(Nano Banana) → 视频合成 → 剪辑 → 字幕
```

### 1.2 整体模块图

```
┌────────────────────────────────────────────────────────────────────┐
│                          浏览器客户端                                 │
│                                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  ┌───────────┐  │
│  │  角色创建    │  │   故事创建    │  │  视频制作  │  │  作品库   │  │
│  │  /character  │  │ /story/create│  │  /video    │  │  /library │  │
│  │  - 语音输入  │  │  - 梗概生成  │  │  - 合成    │  │  - 角色   │  │
│  │  - 图片上传  │  │  - 故事生成  │  │  - 剪辑    │  │  - 故事   │  │
│  │  - 卡通化   │  │  - 脚本生成  │  │  - 字幕    │  │  - 视频   │  │
│  └─────────────┘  └──────────────┘  └────────────┘  └───────────┘  │
│                                                                      │
│              ← localStorage / IndexedDB / Blob URLs →               │
└────────────────────────────────────────────────────────────────────┘
                              ↕ HTTP/JSON (+ SSE for streaming)
┌────────────────────────────────────────────────────────────────────┐
│                        Next.js API 层                                │
│                                                                      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌───────────┐  │
│  │  语音 API    │ │  角色 API    │ │  故事 API    │ │  视频 API │  │
│  │ /api/voice   │ │ /api/character│ │ /api/story   │ │ /api/video│  │
│  └──────────────┘ └──────────────┘ └──────────────┘ └───────────┘  │
│                                                                      │
└────────────────────────────────────────────────────────────────────┘
                              ↕
┌────────────────────────────────────────────────────────────────────┐
│                         服务层 (lib/)                                │
│                                                                      │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐  │
│  │  gemini.ts  │ │gemini-tts.ts │ │ banana-img.ts│ │  ffmpeg.ts │  │
│  │  文本生成    │ │  语音合成     │ │ 图片生成      │ │  视频合成  │  │
│  │  语音转文字  │ │              │ │ (Nano Banana)│ │  字幕生成  │  │
│  └─────────────┘ └──────────────┘ └──────────────┘ └────────────┘  │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐  │
│  │    db.ts    │ │story-scenes.ts│ │story-audio.ts│ │ storage.ts │  │
│  │  数据库操作  │ │  场景分割     │ │  音频编码     │ │  文件存储  │  │
│  └─────────────┘ └──────────────┘ └──────────────┘ └────────────┘  │
└────────────────────────────────────────────────────────────────────┘
                              ↕
┌────────────────────────────────────────────────────────────────────┐
│                          数据层                                      │
│   SQLite (Prisma) + 文件系统(/tmp or 云存储)                          │
│                                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │Character │ │ Synopsis │ │  Story   │ │  Script  │ │  Video   │  │
│  │          │ │  梗概     │ │  故事    │ │  脚本    │ │ Project  │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
└────────────────────────────────────────────────────────────────────┘
                              ↕
┌────────────────────────────────────────────────────────────────────┐
│                       外部 AI 服务                                    │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │   Google Gemini   │  │  Nano Banana │  │        FFmpeg          │ │
│  │  - STT (语音转文字)│  │  图片生成 API │  │  - 图片序列 → 视频     │ │
│  │  - 文本生成       │  │  (T2I Model) │  │  - 视频拼接            │ │
│  │  - TTS (文字转语音)│  │              │  │  - 字幕叠加            │ │
│  └──────────────────┘  └──────────────┘  └────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

---

## 二、核心生产管线

```
┌──────────────────────────────────────────────────────────────────────┐
│                       完整内容生产管线                                  │
│                                                                        │
│  [语音录入]──→ STT转写 ──→ [角色名称 + 描述]                            │
│      ↓                           ↓                                     │
│  (Gemini STT)            Nano Banana T2I                               │
│                                  ↓                                     │
│                          [角色卡通图片]                                  │
│                                  ↓                                     │
│                     ┌────────────────────────┐                         │
│                     │  角色 + 主题 + 关键词    │                         │
│                     └────────────────────────┘                         │
│                                  ↓                                     │
│                    Gemini Text ──→ [梗概 Synopsis]                      │
│                                  ↓ (~200字大纲)                         │
│                    Gemini Text ──→ [故事全文 Story]                      │
│                                  ↓ (含[Scene]标记)                      │
│                    Gemini Text ──→ [脚本 Script]                        │
│                                  ↓ (每场景: 台词+动作+画面描述)           │
│            ┌─────────────────────┼──────────────────────┐              │
│            ↓                     ↓                      ↓              │
│   Nano Banana T2I          Gemini TTS             字幕文本生成           │
│   [场景配图 × N]           [场景音频 × N]          [SRT字幕轨道]           │
│            └─────────────────────┼──────────────────────┘              │
│                                  ↓                                     │
│                    FFmpeg ──→ [场景视频片段 × N]                          │
│                    (图片+音频 → 单场景 MP4)                               │
│                                  ↓                                     │
│                    FFmpeg ──→ [完整视频 (合成)]                           │
│                    (concat N clips → full.mp4)                          │
│                                  ↓                                     │
│                    FFmpeg ──→ [最终视频 (含字幕)]                         │
│                    (burn subtitles → final.mp4)                         │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 三、数据模型（v2 完整版）

### 3.1 Character（角色）

```typescript
interface Character {
  id: string
  name: string              // 来自语音输入或手动输入
  description: string       // 角色描述（语音转文字 or 手动）
  voiceInputUrl?: string    // 原始语音录音（可选保留）
  originalImage?: string    // 用户上传的原始照片 data URL
  cartoonImage: string      // Nano Banana 生成的卡通图 data URL / 文件路径
  style: string             // 风格选项
  createdAt: Date
}
```

### 3.2 Synopsis（梗概）— 新增

```typescript
interface Synopsis {
  id: string
  characterIds: string[]    // 关联角色 IDs
  theme: string             // 故事主题
  keywords: string          // 关键词
  ageGroup: '2-4' | '4-6' | '6-8'
  content: string           // 梗概正文（约200字大纲）
  createdAt: Date
}
```

### 3.3 Story（故事）— 扩展

```typescript
interface Story {
  id: string
  synopsisId?: string       // 关联梗概
  characterIds: string[]
  title: string
  content: string           // 全文（含 [Scene X] 标记）
  images: string[]          // Nano Banana 生成的场景配图
  audioUrl: string          // 全文音频
  sceneAudioUrls: string[]  // 逐场景音频
  createdAt: Date
}
```

### 3.4 Script（脚本）— 新增

```typescript
interface Script {
  id: string
  storyId: string
  scenes: ScriptScene[]
  totalDuration: number     // 预估总时长（秒）
  createdAt: Date
}

interface ScriptScene {
  index: number             // 场景序号（从0开始）
  title: string             // 场景小标题
  narration: string         // 旁白文字（用于TTS + 字幕）
  dialogue: Array<{
    speaker: string         // 角色名或 "Narrator"
    text: string            // 台词内容
  }>
  imagePrompt: string       // 优化后的图片生成 prompt
  estimatedDuration: number // 预估时长（秒，基于文字量）
  imageUrl?: string         // 生成后的场景图片 URL
  audioUrl?: string         // 生成后的场景音频 URL
  videoClipUrl?: string     // 生成后的场景视频片段 URL
}
```

### 3.5 VideoProject（视频项目）— 新增

```typescript
interface VideoProject {
  id: string
  storyId: string
  scriptId: string
  status: 'pending' | 'generating_images' | 'generating_audio' |
          'composing' | 'editing' | 'adding_subtitles' | 'complete' | 'failed'
  progress: number          // 0-100
  sceneVideoUrls: string[]  // 各场景视频片段路径
  rawVideoUrl?: string      // 合成后（无字幕）视频路径
  subtitles: SubtitleCue[]  // SRT 字幕轨道
  finalVideoUrl?: string    // 最终含字幕视频路径
  errorMessage?: string
  createdAt: Date
  updatedAt: Date
}

interface SubtitleCue {
  index: number
  startTime: number         // 毫秒
  endTime: number           // 毫秒
  text: string              // 字幕文字
}
```

### 3.6 CharacterRelationship（角色关系）— 保持不变

```typescript
interface CharacterRelationship {
  pairKey: string
  characterAId: string
  characterBId: string
  relationship: string
  updatedAt: Date
}
```

---

## 四、完整 API 规范（v2）

### 4.1 语音 API（新增）

#### `POST /api/voice/transcribe` — 语音转文字

将用户录音转为文字，用于角色名称/描述等输入场景。

**Request:** `multipart/form-data`
```
audio: File (WebM/OGG/WAV, 最大 10MB)
hint?: string  // 提示词，帮助 Gemini 理解语境（如 "character name and description"）
```

**Response 200:**
```json
{
  "transcript": "小女孩名叫Luna，她有蓝色的长发，喜欢探索海洋...",
  "confidence": 0.95,
  "language": "zh"
}
```

---

### 4.2 角色 API（更新）

#### `POST /api/character` — 生成角色（支持语音描述 + Nano Banana 图像）

**Request:**
```json
{
  "imageBase64": "string (可选，用户上传照片)",
  "voiceTranscript": "string (可选，语音转文字结果)",
  "name": "string (可选，从语音提取或手填)",
  "description": "string (角色描述)",
  "style": "string (风格选项)"
}
```

**处理逻辑:**
- 若有 `imageBase64` → 使用照片参考生成卡通角色
- 若只有 `voiceTranscript/description` → 纯文字描述生成角色图片
- 图片生成统一走 **Nano Banana T2I API**

**Response 200:**
```json
{
  "character": {
    "id": "string",
    "name": "string",
    "description": "string",
    "originalImage": "data:image/jpeg;base64,... (if provided)",
    "cartoonImage": "string (Nano Banana 返回的图片 URL or base64)",
    "createdAt": "ISO8601"
  }
}
```

---

#### `GET /api/character` — 列出所有角色

**Response 200:**
```json
{
  "characters": [{
    "id": "string",
    "name": "string",
    "description": "string",
    "cartoonImage": "string",
    "createdAt": "ISO8601",
    "_count": { "stories": 0 }
  }]
}
```

---

#### `PATCH /api/character/[id]` — 更新角色

**Request:**
```json
{
  "name": "string",
  "description": "string (可选)"
}
```

---

#### `DELETE /api/character/[id]` — 删除角色

**Response 200:** `{ "success": true }`

---

### 4.3 故事 API（重构为多阶段）

#### `POST /api/story/synopsis` — 第一步：生成梗概（新增）

**Request:**
```json
{
  "characterIds": ["string"],
  "characterNames": ["string"],
  "characterDescriptions": ["string"],
  "theme": "string",
  "keywords": "string",
  "ageGroup": "2-4 | 4-6 | 6-8",
  "relationship": "string (可选)"
}
```

**Response 200:**
```json
{
  "synopsis": {
    "id": "string",
    "content": "string (约200字大纲，含开头/冲突/高潮/结局)",
    "theme": "string",
    "estimatedSceneCount": 5
  }
}
```

---

#### `POST /api/story/options` — 第二步：基于梗概生成故事选项（更新）

**Request:**
```json
{
  "synopsisId": "string (可选，若有梗概则基于梗概细化)",
  "characterIds": ["string"],
  "characterNames": ["string"],
  "characterDescriptions": ["string"],
  "keywords": "string",
  "ageGroup": "2-4 | 4-6 | 6-8",
  "relationship": "string (可选)"
}
```

**Response 200:**
```json
{
  "options": [
    { "title": "string", "description": "string" },
    { "title": "string", "description": "string" },
    { "title": "string", "description": "string" }
  ]
}
```

---

#### `POST /api/story/generate` — 第三步：生成故事全文（更新）

**Request:**
```json
{
  "synopsisId": "string (可选)",
  "characterIds": ["string"],
  "characterNames": ["string"],
  "characterImages": ["data:... (base64)"],
  "characterDescriptions": ["string"],
  "optionIndex": 0,
  "optionTitle": "string",
  "optionDescription": "string",
  "keywords": "string",
  "ageGroup": "2-4 | 4-6 | 6-8",
  "relationship": "string (可选)"
}
```

**Response 200:**
```json
{
  "story": {
    "id": "string",
    "title": "string",
    "content": "string (含 [Scene X] 标记的全文)",
    "synopsisId": "string",
    "characterIds": ["string"],
    "createdAt": "ISO8601"
  }
}
```

> v2 变更：`generate` 不再同步生成图片/音频，这些交由后续 `/script` 和 `/video` 流程处理

---

#### `POST /api/story/script` — 第四步：生成脚本（新增）

将故事全文转化为结构化脚本（逐场景台词 + 旁白 + 图片 prompt）

**Request:**
```json
{
  "storyId": "string",
  "characterNames": ["string"],
  "characterDescriptions": ["string"]
}
```

**Response 200:**
```json
{
  "script": {
    "id": "string",
    "storyId": "string",
    "totalDuration": 120,
    "scenes": [
      {
        "index": 0,
        "title": "场景一：相遇",
        "narration": "In a land far away, Luna discovered a glowing shell...",
        "dialogue": [
          { "speaker": "Luna", "text": "What is this magical shell?" },
          { "speaker": "Narrator", "text": "The shell began to sing." }
        ],
        "imagePrompt": "Children's book illustration: young girl with blue hair finding a glowing shell on a beach, warm sunset colors, friendly and magical atmosphere",
        "estimatedDuration": 25
      }
    ]
  }
}
```

---

#### `GET /api/story/[id]` — 获取故事详情

**Response 200:** `{ "story": { ...Story对象 } }`

---

#### `DELETE /api/story/[id]` — 删除故事

**Response 200:** `{ "success": true }`

---

### 4.4 视频 API（新增）

#### `POST /api/video/start` — 启动视频生产任务

触发完整的图片生成 → 音频生成 → 视频合成 → 字幕叠加流水线。

**Request:**
```json
{
  "scriptId": "string",
  "storyId": "string",
  "videoSettings": {
    "resolution": "1280x720 | 1080x1080 | 1920x1080",
    "fps": 24,
    "transitionType": "fade | cut | slide",
    "subtitleStyle": {
      "fontSize": 32,
      "color": "white",
      "position": "bottom"
    }
  }
}
```

**Response 200:**
```json
{
  "videoProject": {
    "id": "string",
    "status": "pending",
    "progress": 0
  }
}
```

---

#### `GET /api/video/[id]/status` — 查询视频生产状态（SSE or Polling）

支持 `Accept: text/event-stream` 则推送 SSE 进度事件；否则返回当前状态快照。

**SSE Events:**
```
event: progress
data: { "stage": "generating_images", "progress": 20, "message": "生成场景 2/5 配图..." }

event: progress
data: { "stage": "generating_audio", "progress": 50, "message": "合成场景音频..." }

event: progress
data: { "stage": "composing", "progress": 70, "message": "合成视频片段..." }

event: progress
data: { "stage": "adding_subtitles", "progress": 90, "message": "叠加字幕..." }

event: complete
data: { "status": "complete", "progress": 100, "finalVideoUrl": "/videos/[id]/final.mp4" }

event: error
data: { "status": "failed", "errorMessage": "string" }
```

---

#### `GET /api/video/[id]` — 获取视频项目详情

**Response 200:**
```json
{
  "videoProject": {
    "id": "string",
    "status": "complete",
    "progress": 100,
    "sceneVideoUrls": ["/videos/[id]/scene-0.mp4", "..."],
    "rawVideoUrl": "/videos/[id]/raw.mp4",
    "finalVideoUrl": "/videos/[id]/final.mp4",
    "subtitles": [
      { "index": 1, "startTime": 0, "endTime": 3500, "text": "In a land far away..." }
    ],
    "createdAt": "ISO8601"
  }
}
```

---

#### `PATCH /api/video/[id]/subtitles` — 编辑字幕

允许用户手动修改字幕文字后重新烧录。

**Request:**
```json
{
  "subtitles": [
    { "index": 1, "startTime": 0, "endTime": 3500, "text": "修改后的字幕文字" }
  ]
}
```

**Response 200:** 触发重新烧录字幕任务，返回新的 `videoProject` 状态。

---

#### `DELETE /api/video/[id]` — 删除视频项目

---

### 4.5 关系 API（保持不变）

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/relationship` | GET | 查询关系（`?characterAId=&characterBId=`）或列出全部 |
| `/api/relationship` | POST | 创建/更新角色关系 |

---

## 五、服务层实现规范（lib/）

### 5.1 `lib/gemini-stt.ts`（新增）— 语音转文字

```typescript
// 使用 Gemini Multimodal API 处理音频文件
export async function transcribeAudio(
  audioBase64: string,
  mimeType: 'audio/webm' | 'audio/ogg' | 'audio/wav',
  hint?: string
): Promise<{ transcript: string; confidence?: number }>

// 从转写文本中提取角色信息
export async function extractCharacterInfo(
  transcript: string
): Promise<{ name?: string; description?: string }>
```

**实现原理:** Gemini 1.5/2.0 Flash 支持音频 inline data 输入，发送音频 + 提示词即可获得转写。

---

### 5.2 `lib/banana-img.ts`（新增）— Nano Banana 图片生成

```typescript
// 配置
const BANANA_API_BASE = process.env.BANANA_API_URL || 'https://api.banana.dev'
const BANANA_API_KEY = process.env.BANANA_API_KEY || ''
const BANANA_MODEL_KEY = process.env.BANANA_MODEL_KEY || ''

// 文字生成图片（T2I）
export async function generateImageFromText(
  prompt: string,
  options?: {
    negativePrompt?: string
    width?: number           // 默认 768
    height?: number          // 默认 768
    steps?: number           // 默认 20
    guidanceScale?: number   // 默认 7.5
    seed?: number
  }
): Promise<{ imageBase64: string; mimeType: string }>

// 图片参考 + 文字生成图片（I2I，用于角色一致性）
export async function generateImageFromReference(
  prompt: string,
  referenceImageBase64: string,
  strength?: number          // 0-1, 默认 0.7
): Promise<{ imageBase64: string; mimeType: string }>

// 压缩输出图片
export async function compressGeneratedImage(
  base64: string,
  maxDim?: number,
  quality?: number
): Promise<{ data: string; mimeType: string }>
```

**环境变量:**
```
BANANA_API_URL=https://api.banana.dev
BANANA_API_KEY=your_banana_api_key
BANANA_MODEL_KEY=your_model_key   # 具体模型标识（如 flux-schnell 等）
```

---

### 5.3 `lib/gemini.ts`（更新）— 新增梗概/脚本生成

```typescript
// 已有函数（保留）
export async function generateStoryOptions(...)
export async function generateStory(...)
export async function generateCharacterImageWithDiagnostics(...)  // 降级备用
export async function generateStoryImage(...)  // 降级备用

// 新增：生成梗概
export async function generateSynopsis(
  characterNames: string[],
  characterDescriptions: string[],
  theme: string,
  keywords: string,
  ageGroup: string,
  relationship?: string
): Promise<string>  // 返回约200字的故事大纲

// 新增：生成脚本
export async function generateScript(
  storyContent: string,
  characterNames: string[],
  characterDescriptions: string[]
): Promise<ScriptScene[]>

// 新增：生成字幕文本（从脚本提取）
export async function generateSubtitles(
  scenes: ScriptScene[]
): Promise<SubtitleCue[]>
```

---

### 5.4 `lib/ffmpeg.ts`（新增）— 视频处理

```typescript
import ffmpeg from 'fluent-ffmpeg'

// 场景图片 + 音频 → 单场景视频片段
export async function createSceneVideoClip(
  imagePath: string,       // 场景图片（JPG/PNG）
  audioPath: string,       // 场景音频（WAV）
  outputPath: string,      // 输出路径（MP4）
  options?: {
    resolution?: string    // 默认 "1280x720"
    fps?: number           // 默认 24
  }
): Promise<void>

// 拼接多个场景视频
export async function concatenateVideos(
  clipPaths: string[],     // 按顺序排列的场景视频路径
  outputPath: string,
  options?: {
    transitionType?: 'cut' | 'fade'
    transitionDuration?: number  // fade 时长（秒）
  }
): Promise<void>

// 向视频烧录字幕
export async function burnSubtitles(
  inputVideoPath: string,
  srtPath: string,
  outputPath: string,
  subtitleStyle?: {
    fontSize?: number
    fontColor?: string
    position?: 'top' | 'bottom' | 'center'
    fontFamily?: string
  }
): Promise<void>

// 生成 SRT 字幕文件
export function generateSrtFile(
  subtitles: SubtitleCue[],
  outputPath: string
): void

// 获取视频时长（毫秒）
export async function getVideoDuration(videoPath: string): Promise<number>
```

**依赖:** `fluent-ffmpeg` npm 包 + 系统安装 FFmpeg 二进制

---

### 5.5 `lib/storage.ts`（新增）— 文件存储抽象

统一本地文件系统（开发）和云存储（生产）的接口。

```typescript
// 本地开发：存储到 /tmp/storybook/[projectId]/
// 生产：上传到 Cloudflare R2 / AWS S3

export async function saveFile(
  content: Buffer | string,
  path: string              // e.g. "videos/proj123/scene-0.mp4"
): Promise<string>          // 返回可访问的 URL 或文件路径

export async function getFileUrl(path: string): Promise<string>

export async function deleteProjectFiles(projectId: string): Promise<void>
```

---

## 六、页面路由（v2）

| 路由 | 功能 |
|------|------|
| `/` | 首页：创建入口 + 作品库 |
| `/character` | 语音录入 / 照片上传 / 风格选择 |
| `/character/name` | 角色确认 + 补充描述 |
| `/story/create` | 多角色选择 + 关键词/主题 |
| `/story/synopsis` | 梗概预览 + 确认（新增） |
| `/story/options` | 故事选项选择 |
| `/story/script` | 脚本预览 + 编辑（新增） |
| `/video/create` | 视频参数设置（新增） |
| `/video/[id]` | 视频生产进度 + 最终播放（新增） |
| `/library` | 角色库 + 故事库 + 视频库（重构） |

---

## 七、视频生产子流程详解

### 7.1 单场景视频合成

```
ScriptScene[i].imagePrompt
       ↓
  Nano Banana T2I
       ↓
  scene-{i}.jpg (768×768 or 1280×720)
       ↓
  FFmpeg: -loop 1 -i scene.jpg -i scene.wav
          -c:v libx264 -tune stillimage
          -c:a aac -shortest
       ↓
  scene-{i}.mp4
```

### 7.2 视频拼接与字幕

```
[scene-0.mp4, scene-1.mp4, ..., scene-N.mp4]
       ↓
  FFmpeg concat (with fade transitions)
       ↓
  raw.mp4
       ↓
  SRT 字幕文件 (基于 estimatedDuration 计算时间轴)
       ↓
  FFmpeg -vf subtitles=subs.srt
       ↓
  final.mp4
```

### 7.3 字幕时间轴计算

```typescript
function calculateSubtitleTimings(scenes: ScriptScene[]): SubtitleCue[] {
  let currentTime = 0
  const cues: SubtitleCue[] = []

  for (const scene of scenes) {
    // 合并旁白+台词为字幕段
    const texts = [scene.narration, ...scene.dialogue.map(d => `${d.speaker}: ${d.text}`)]
    const segmentDuration = scene.estimatedDuration * 1000 // ms
    const cueTime = segmentDuration / texts.length

    for (const text of texts) {
      cues.push({
        index: cues.length + 1,
        startTime: Math.round(currentTime),
        endTime: Math.round(currentTime + cueTime),
        text,
      })
      currentTime += cueTime
    }
  }
  return cues
}
```

---

## 八、Prisma Schema（v2）

```prisma
model Character {
  id             String   @id @default(cuid())
  name           String   @default("")
  description    String   @default("")
  voiceInputUrl  String?
  originalImage  String   @default("")
  cartoonImage   String   @default("")
  style          String   @default("")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  stories               Story[]                  @relation("StoryCharacters")
  relationshipsAsA      CharacterRelationship[]  @relation("RelationshipA")
  relationshipsAsB      CharacterRelationship[]  @relation("RelationshipB")
}

model Synopsis {
  id           String   @id @default(cuid())
  characterIds String   // JSON array
  theme        String   @default("")
  keywords     String   @default("")
  ageGroup     String   @default("4-6")
  content      String   // 梗概正文
  createdAt    DateTime @default(now())

  stories Story[]
}

model Story {
  id             String   @id @default(cuid())
  synopsisId     String?
  title          String
  content        String
  images         String   @default("[]")  // JSON array
  audioUrl       String   @default("")
  createdAt      DateTime @default(now())

  synopsis       Synopsis?      @relation(fields: [synopsisId], references: [id])
  characters     Character[]    @relation("StoryCharacters")
  scripts        Script[]
  videoProjects  VideoProject[]
}

model Script {
  id            String   @id @default(cuid())
  storyId       String
  scenesJson    String   // JSON: ScriptScene[]
  totalDuration Int      @default(0)  // seconds
  createdAt     DateTime @default(now())

  story         Story          @relation(fields: [storyId], references: [id], onDelete: Cascade)
  videoProjects VideoProject[]
}

model VideoProject {
  id               String   @id @default(cuid())
  storyId          String
  scriptId         String
  status           String   @default("pending")
  progress         Int      @default(0)
  sceneVideoUrls   String   @default("[]")   // JSON array
  rawVideoUrl      String   @default("")
  subtitlesJson    String   @default("[]")   // JSON: SubtitleCue[]
  finalVideoUrl    String   @default("")
  errorMessage     String   @default("")
  videoSettings    String   @default("{}")   // JSON
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  story  Story  @relation(fields: [storyId], references: [id], onDelete: Cascade)
  script Script @relation(fields: [scriptId], references: [id])
}

model CharacterRelationship {
  pairKey      String   @id
  characterAId String
  characterBId String
  relationship String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  characterA   Character @relation("RelationshipA", fields: [characterAId], references: [id], onDelete: Cascade)
  characterB   Character @relation("RelationshipB", fields: [characterBId], references: [id], onDelete: Cascade)
}
```

---

## 九、环境变量（v2 完整版）

```bash
# ── Google Gemini ──
GEMINI_API_KEY=your_gemini_api_key
GEMINI_TTS_VOICE=Kore                  # TTS 语音名称

# ── Nano Banana 图片生成 ──
BANANA_API_URL=https://api.banana.dev  # 或自定义 API 地址
BANANA_API_KEY=your_banana_api_key
BANANA_MODEL_KEY=your_model_key        # 具体模型标识

# ── 文件存储 ──
STORAGE_TYPE=local                     # local | s3 | r2
STORAGE_LOCAL_PATH=/tmp/storybook      # 本地存储根目录

# 生产环境云存储（可选）
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=
CLOUDFLARE_R2_ENDPOINT=
CLOUDFLARE_R2_ACCESS_KEY=
CLOUDFLARE_R2_SECRET_KEY=
CLOUDFLARE_R2_BUCKET=

# ── FFmpeg ──
FFMPEG_PATH=/usr/bin/ffmpeg            # FFmpeg 二进制路径

# ── 应用 ──
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

---

## 十、前端新增依赖

```bash
# 语音录制
npm install recordrtc              # 浏览器录音

# 视频播放
# 使用原生 <video> 标签，无需额外库

# 后端新增
npm install fluent-ffmpeg          # FFmpeg Node.js 封装
npm install @types/fluent-ffmpeg   # 类型定义
npm install sharp                  # 图片处理（已有）
```

---

## 十一、关键技术决策

| 决策点 | 选择 | 原因 |
|--------|------|------|
| 语音输入 | Gemini STT (Multimodal) | 已有 Gemini 集成，无需额外 key |
| 图片生成 | Nano Banana T2I API | 更快速、更可控的 T2I 能力 |
| 视频合成 | FFmpeg (服务端) | 成熟稳定，支持所有所需操作 |
| 字幕格式 | SRT (软字幕) + 烧录 | SRT 编辑灵活，烧录兼容所有播放器 |
| 进度推送 | SSE (Server-Sent Events) | 视频生成耗时长，需实时进度反馈 |
| 文件存储 | 本地/tmp (dev) + R2/S3 (prod) | 音视频文件大，不适合 base64/DB |
| 梗概阶段 | 独立 API 步骤 | 允许用户在生成故事前预览/调整方向 |
| 脚本阶段 | 独立 API 步骤 | 允许用户在生成视频前编辑台词/旁白 |

---

## 十二、已知挑战与风险

| 风险 | 描述 | 缓解方案 |
|------|------|---------|
| FFmpeg 部署 | Vercel Serverless 不支持 FFmpeg | 使用 Vercel Edge Functions + 外部视频处理服务，或自托管 Next.js |
| 视频文件大小 | 每个故事视频可能达 50-200MB | 使用云存储（R2/S3）而非 base64/DB |
| Banana API 延迟 | T2I 每张约 3-10 秒 | 并行生成 + 进度条展示 |
| 音频时长不准 | estimatedDuration 基于字数估算 | 生成音频后读取实际时长再计算字幕 |
| 视频生成时长 | 完整流程可能需 2-5 分钟 | SSE 实时进度 + 后台异步处理 |
| Vercel 超时 | Serverless 函数默认 60s 超时 | 拆分为多个独立 API 步骤，逐步调用 |
