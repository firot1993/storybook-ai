# Storybook AI — 智能儿童故事创作平台

> 基于 Google Gemini 的 AI 驱动儿童故事生成与视频制作平台。上传照片创建专属角色，输入关键词生成个性化童话，自动合成带配音与字幕的故事视频。

---

## 目录

1. [功能概览](#功能概览)
2. [整体架构](#整体架构)
3. [技术栈](#技术栈)
4. [AI 模型](#ai-模型)
5. [数据库设计](#数据库设计)
6. [API 路由](#api-路由)
7. [环境变量](#环境变量)
8. [本地开发部署](#本地开发部署)
9. [服务器生产部署](#服务器生产部署)
10. [Docker 部署](#docker-部署)

---

## 功能概览

| 功能 | 描述 |
|------|------|
| 🎨 角色生成 | 上传照片，AI 自动生成 5 种画风的专属卡通形象 |
| 📚 故事书管理 | 创建故事书，绑定主角与配角，管理多个故事章节 |
| ✍️ AI 故事创作 | 输入关键词，生成三版梗概供选择，再生成完整童话 |
| 🎬 视频制作 | 自动生成分镜插画 + 语音配音 + 字幕，合成完整故事视频 |
| 🎙️ 语音输入 | 录音转文字，支持语音描述角色信息 |
| 🔀 命运抉择 | 故事结尾提供互动选项，延续故事到下一集 |

---

## 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Next.js 15 App Router                     │
├──────────────────────────┬──────────────────────────────────────┤
│       前端页面 (Client)   │          API 路由 (Server)           │
│                          │                                       │
│  /                首页   │  /api/character      角色管理         │
│  /character       角色库  │  /api/storybook      故事书管理       │
│  /storybook       书库   │  /api/story          故事章节         │
│  /story/create    创作   │  /api/video          视频管线         │
│  /story/play      阅读   │  /api/voice          语音服务         │
│  /video/[id]      视频   │  /api/files          文件服务         │
└──────────────────────────┴──────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
             ┌────────────┐  ┌──────────────┐  ┌─────────┐
             │  SQLite DB  │  │ Google Gemini│  │ FFmpeg  │
             │  (Prisma)   │  │   API Suite  │  │ 视频合成 │
             └────────────┘  └──────────────┘  └─────────┘
                                    │
                ┌───────────────────┼───────────────────┐
                ▼                   ▼                   ▼
         ┌───────────┐       ┌───────────┐       ┌───────────┐
         │  Text Gen  │       │ Image Gen │       │  TTS/STT  │
         │ (stories)  │       │(portraits │       │  (audio)  │
         │            │       │  scenes)  │       │           │
         └───────────┘       └───────────┘       └───────────┘
```

### 故事创作流程

```
选择/创建故事书
      │
      ▼
输入灵感关键词 ──► AI 生成三版梗概 (A/B/C)
      │
      ▼ (用户选择梗概)
生成完整童话 + 封面插画
      │
      ▼
点击「开始制作视频」
      │
      ▼
生成视频脚本 (ScriptScene[])
      │
      ▼
异步视频管线 ────────────────────────────────────────────────────┐
  Stage 1: 并行生成分镜插画 (Gemini Image / Banana.dev)          │
  Stage 2: 逐场景 TTS 配音 (Gemini TTS)                         │
  Stage 3: 每场景合成短片 (FFmpeg: 图片 + 音频 → MP4)            │
  Stage 4: 拼接所有场景 (FFmpeg concat)                          │
  Stage 5: 生成 SRT 字幕 + 烧录字幕 (FFmpeg subtitles)          │
  Stage 6: 保存最终视频 → 更新 DB → 推送完成事件                 │
      │                                                          │
      ▼                                                          │
播放页轮询进度 (每 3 秒) ◄─────────────────────────────────────┘
      │
      ▼ (status = complete)
自动播放最终视频
```

### 文件存储结构

```
$STORAGE_LOCAL_PATH/          (默认: /tmp/storybook)
└── videos/
    └── {projectId}/
        ├── scene-0.jpg       # 分镜插画
        ├── scene-0.wav       # 场景配音
        ├── scene-0.mp4       # 场景短片
        ├── scene-1.jpg / .wav / .mp4
        ├── raw.mp4           # 拼接后原始视频
        ├── subtitles.srt     # 字幕文件
        └── final.mp4         # 最终成品视频
```

---

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js (App Router) | 15.3 |
| UI | React + TypeScript | 19 / 5.8 |
| 样式 | Tailwind CSS | 3.4 |
| 数据库 | SQLite + Prisma ORM | 7.4 |
| AI | Google Gemini API | `@google/genai` 1.29 |
| 视频 | FFmpeg (fluent-ffmpeg) | 2.1 |
| 客户端存储 | IndexedDB | 浏览器原生 |
| 部署 | Next.js Standalone + Docker | — |

---

## AI 模型

### 文本生成

| 模型 | 用途 |
|------|------|
| `gemini-2.5-flash-preview-05-20` | 故事全文生成、梗概生成、视频脚本生成、角色伴侣推荐 |

**调用场景：**
- 根据关键词生成三版梗概（A: 感官体验型 / B: 情感互动型 / C: 勇气冒险型）
- 根据选定梗概生成完整英文童话（含对话 + 结尾互动选项 `<!--CHOICES:[...]-->`）
- 生成 `ScriptScene[]` 视频脚本（含旁白、对话、镜头描述、时长估算、图片提示词）

### 图像生成

| 模型 | 用途 |
|------|------|
| `gemini-2.0-flash-preview-image-generation` | 角色卡通形象生成（5 种画风）、故事封面插画、视频分镜插画 |

**5 种画风：**

| ID | 名称 | 风格描述 |
|----|------|----------|
| `ghibli` | 吉卜力水彩 | 手绘水彩、柔和光线、宫崎骏氛围 |
| `watercolor` | 梦幻水彩 | 马卡龙色调、星光闪烁、梦幻插画 |
| `plush3d` | 3D 毛绒玩具 | 超写实毛绒材质、柔软圆润、工作室灯光 |
| `claymation` | 黏土定格动画 | 细腻黏土纹理、马卡龙配色、温暖光线 |
| `pencil` | 彩铅手绘 | 手工彩色铅笔、柔和笔触、白色纸张背景 |

### 语音合成（TTS）

| 模型 | 用途 |
|------|------|
| `gemini-2.5-flash-preview-tts` | 故事朗读配音、视频场景语音 |

- 输出格式：PCM 24kHz → 自动封装为 WAV
- 默认语音：`Kore`（可通过 `GEMINI_TTS_VOICE` 环境变量配置）
- 支持语音：`Kore` `Puck` `Aoede` `Charon` `Fenrir` 等

### 语音识别（STT）

| 模型 | 用途 |
|------|------|
| `gemini-2.5-flash-preview-05-20` (multimodal) | 语音录音转文字、从语音中提取角色信息 |

### 备用图像生成（Banana.dev）

当 `BANANA_API_KEY` 配置时，分镜插画生成优先使用 Banana.dev T2I API；未配置时自动降级为 Gemini Image。

---

## 数据库设计

```
Character
├── id, name, age
├── originalImage   (base64, 用户上传原图)
├── cartoonImage    (base64, 默认画风卡通形象)
├── styleImages     (JSON: { ghibli: base64, watercolor: base64, ... })
└── voiceName       (TTS 语音名称)

Storybook
├── id, name, ageRange, styleId
├── characters      (JSON: [{ id, role: "protagonist"|"supporting" }])
└── chapters        → Story[]

Synopsis
├── id, theme, keywords, ageGroup
└── content         (AI 生成梗概文本)

Story
├── id, title, synopsis, content
├── storybookId     → Storybook (nullable, 兼容旧数据)
├── synopsisId      → Synopsis
├── mainImage       (base64, 封面插画)
├── images          (JSON: 分场景插画 URL[])
├── audioUrl        (TTS 配音 URL)
└── status          ("draft" | "complete")

Script
├── id, storyId     → Story
├── scenesJson      (JSON: ScriptScene[])
│   ├── sceneNumber, title
│   ├── narration, dialogue[]
│   ├── imagePrompt
│   └── estimatedDuration (seconds)
└── totalDuration

VideoProject
├── id, storyId, scriptId
├── status          ("pending" | "generating_images" | "generating_audio" |
│                    "composing" | "editing" | "adding_subtitles" |
│                    "complete" | "failed")
├── progress        (0–100)
├── sceneVideoUrls  (JSON: 各场景 MP4 URL[])
├── rawVideoUrl     (拼接后原始视频)
├── subtitlesJson   (JSON: SubtitleCue[])
├── finalVideoUrl   (最终成品视频)
└── errorMessage    (失败原因)
```

---

## API 路由

<details>
<summary>展开完整路由列表</summary>

### 角色管理
| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/character` | GET | 获取所有角色列表 |
| `/api/character` | POST | 上传照片生成 5 种画风角色形象 |
| `/api/character/[id]` | GET | 获取单个角色详情 |
| `/api/character/[id]` | PATCH | 更新角色名称/年龄/语音 |
| `/api/character/[id]` | DELETE | 删除角色 |

### 故事书管理
| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/storybook` | GET | 获取所有故事书（含章节数） |
| `/api/storybook` | POST | 创建新故事书 |
| `/api/storybook/[id]` | GET | 获取故事书详情（含章节列表） |
| `/api/storybook/[id]` | PATCH | 更新故事书信息 |
| `/api/storybook/[id]/synopsis` | POST | 生成三版故事梗概 |
| `/api/storybook/[id]/story` | POST | 根据梗概生成完整故事章节 |
| `/api/storybook/[id]/companions` | POST | AI 推荐配角建议 |

### 故事管理
| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/story/[id]` | GET | 获取故事详情 + 关联视频项目 |
| `/api/story/[id]` | DELETE | 删除故事 |
| `/api/story/script` | POST | 生成视频脚本 (ScriptScene[]) |
| `/api/story/audio` | POST | 生成/重生成故事配音 |

### 视频管线
| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/video/start` | POST | 启动异步视频制作管线，立即返回 projectId |
| `/api/video/[id]` | GET | 获取视频项目状态 |
| `/api/video/[id]/status` | GET | SSE 实时进度推送 |
| `/api/video/[id]/subtitles` | PATCH | 编辑字幕并重新烧录 |

### 语音服务
| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/voice/transcribe` | POST | 音频文件转文字 |
| `/api/voice/preview` | POST | 生成语音试听音频 |

### 文件服务
| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/files/[...path]` | GET | 提供本地存储文件的 HTTP 访问 |

</details>

---

## 环境变量

在项目根目录创建 `.env.local` 文件：

```bash
# ── 必填 ──────────────────────────────────────────────────────────
# Google Gemini API 密钥（从 https://aistudio.google.com 获取）
GEMINI_API_KEY=your_gemini_api_key_here

# ── 可选：语音配置 ─────────────────────────────────────────────────
# TTS 语音名称（默认: Kore）
# 可选值: Kore | Puck | Aoede | Charon | Fenrir | Leda | Orus | Zephyr
GEMINI_TTS_VOICE=Kore

# ── 可选：文件存储 ─────────────────────────────────────────────────
# 视频/音频文件本地存储路径（默认: /tmp/storybook）
STORAGE_LOCAL_PATH=/var/data/storybook

# 对外访问的 base URL（用于生成文件访问链接）
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# ── 可选：Banana.dev 图像生成（备用，未配置则使用 Gemini Image）──
BANANA_API_URL=https://api.banana.dev
BANANA_API_KEY=your_banana_api_key
BANANA_MODEL_KEY=your_model_key

# ── 可选：自定义 FFmpeg 路径 ────────────────────────────────────────
# 如 FFmpeg 不在系统 PATH 中，可手动指定路径
# FFMPEG_PATH=/usr/local/bin/ffmpeg
```

---

## 本地开发部署

### 前置依赖

| 依赖 | 版本要求 | 安装方式 |
|------|----------|----------|
| Node.js | ≥ 20 | https://nodejs.org |
| npm / pnpm | 最新 | 随 Node.js 附带 |
| FFmpeg | 任意稳定版 | 见下方说明 |

**安装 FFmpeg：**

```bash
# macOS
brew install ffmpeg

# Ubuntu / Debian
sudo apt update && sudo apt install -y ffmpeg

# CentOS / RHEL
sudo yum install -y ffmpeg

# 验证安装
ffmpeg -version
```

### 步骤

```bash
# 1. 克隆仓库
git clone https://github.com/firot1993/storybook-ai.git
cd storybook-ai

# 2. 切换到新版本分支
git checkout new-version

# 3. 安装依赖
npm install

# 4. 配置环境变量
cp .env.local.example .env.local
# 编辑 .env.local，填入 GEMINI_API_KEY

# 5. 初始化数据库
npx prisma migrate dev --name init

# 6. 启动开发服务器
npm run dev
```

访问 http://localhost:3000 即可使用。

---

## 服务器生产部署

### 方式一：直接部署（Node.js + PM2）

适合有 Linux 服务器（Ubuntu / CentOS）的场景。

```bash
# 1. 服务器安装依赖
sudo apt update
sudo apt install -y nodejs npm ffmpeg git
sudo npm install -g pm2

# 2. 克隆并安装
git clone https://github.com/firot1993/storybook-ai.git
cd storybook-ai
git checkout new-version
npm install

# 3. 配置环境变量
cp .env.local.example .env.local
vim .env.local
# 填入:
#   GEMINI_API_KEY=xxx
#   STORAGE_LOCAL_PATH=/var/data/storybook
#   NEXT_PUBLIC_BASE_URL=https://你的域名

# 4. 创建存储目录
mkdir -p /var/data/storybook

# 5. 数据库迁移
npx prisma migrate deploy

# 6. 构建生产版本
npm run build

# 7. 用 PM2 启动（开机自启）
pm2 start npm --name "storybook-ai" -- start
pm2 save
pm2 startup
```

**Nginx 反向代理配置（可选）：**

```nginx
server {
    listen 80;
    server_name 你的域名.com;

    # 上传文件大小限制（角色图片可能较大）
    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;

        # SSE 支持（视频进度推送）
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }
}
```

---

## Docker 部署

项目根目录已包含 `Dockerfile`，支持容器化部署。

### 使用 Docker Compose（推荐）

创建 `docker-compose.yml`：

```yaml
version: '3.8'

services:
  storybook-ai:
    build: .
    ports:
      - "3000:3000"
    environment:
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - GEMINI_TTS_VOICE=${GEMINI_TTS_VOICE:-Kore}
      - STORAGE_LOCAL_PATH=/data/storybook
      - NEXT_PUBLIC_BASE_URL=${NEXT_PUBLIC_BASE_URL:-http://localhost:3000}
      - NODE_ENV=production
    volumes:
      # 持久化存储视频/音频文件
      - storybook_data:/data/storybook
      # 持久化 SQLite 数据库
      - storybook_db:/app/prisma

volumes:
  storybook_data:
  storybook_db:
```

启动：

```bash
# 构建并启动
GEMINI_API_KEY=your_key NEXT_PUBLIC_BASE_URL=https://你的域名 docker compose up -d

# 查看日志
docker compose logs -f

# 停止
docker compose down
```

### 手动 Docker 构建

```bash
# 构建镜像
docker build -t storybook-ai .

# 运行容器
docker run -d \
  --name storybook-ai \
  -p 3000:3000 \
  -e GEMINI_API_KEY=your_key \
  -e STORAGE_LOCAL_PATH=/data/storybook \
  -e NEXT_PUBLIC_BASE_URL=http://localhost:3000 \
  -v storybook_data:/data/storybook \
  -v storybook_db:/app/prisma \
  storybook-ai
```

### 注意事项

> **FFmpeg**：Dockerfile 中需确保已安装 FFmpeg。如构建时缺少，可在 `Dockerfile` 中添加：
> ```dockerfile
> RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
> ```

> **存储持久化**：视频文件存储在容器内部，必须挂载 volume 防止容器重启后丢失。

> **数据库持久化**：SQLite 文件位于 `prisma/` 目录，同样需要挂载 volume。

---

## 常见问题

**Q: 视频制作失败，提示 "No scene clips were generated"**
> 检查 FFmpeg 是否正确安装：`ffmpeg -version`，以及 `STORAGE_LOCAL_PATH` 目录是否有写入权限。

**Q: 角色图片生成失败**
> 确认 `GEMINI_API_KEY` 有效，且已开通 Gemini Image 生成权限（需在 Google AI Studio 中启用）。

**Q: 视频进度条不更新**
> 确保 Nginx 配置了 `proxy_buffering off`（SSE 需要关闭缓冲），或使用直连 3000 端口访问。

**Q: 数据库迁移失败**
> 生产环境使用 `npx prisma migrate deploy`（非 `migrate dev`），确保 `prisma/` 目录可写。
