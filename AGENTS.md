# Storybook AI - Agent Guide

## Scope
This repository is on the **v2-only** flow.

Do not reintroduce removed v1 pages/APIs such as:
- `/story/options`, `/story/synopsis`, `/story/script`
- `/video/create`, `/video/[id]`
- `/api/story/generate`, `/api/story/options`, `/api/story/synopsis`, `/api/story/script`

## Product Overview
Storybook AI is a Next.js app that:
- Generates child-friendly character art from photos (multi-style)
- Builds storybooks with AI-generated synopsis/story chapters
- Generates narrated story video from director-style scene scripts

## Tech Stack
- Next.js (App Router), React, TypeScript
- Tailwind CSS
- Prisma + SQLite
- Google Gemini models:
  - Text generation
  - Image generation
  - TTS (voice narration)
  - STT (voice transcription)
- FFmpeg via `fluent-ffmpeg` for video composition

## Current App Routes
- `/` landing page
- `/character` character library
- `/character/create` character creation (multi-style + voice)
- `/character/name` character metadata edit
- `/storybook` storybook library
- `/story/create` storybook wizard (book selection -> synopsis -> chapter -> start video)
- `/story/play?id=<storyId>` playback + video progress

## Active API Routes
- `GET/POST /api/character`
- `GET/PATCH/DELETE /api/character/[id]`
- `POST /api/companions/suggest`
- `GET /api/files/[...path]`
- `GET /api/health`
- `GET/DELETE /api/story/[id]`
- `POST /api/story/audio`
- `POST /api/story/director-script`
- `GET/POST /api/storybook`
- `GET/PATCH/DELETE /api/storybook/[id]`
- `POST /api/storybook/[id]/synopsis`
- `POST /api/storybook/[id]/story`
- `POST /api/video/start`
- `POST /api/voice/preview`
- `POST /api/voice/transcribe`

## Video Pipeline (Current)
`POST /api/video/start` performs async stages:
1. Generate scene images
2. Generate scene narration audio
3. Compose per-scene clips (image + audio)
4. Concatenate clips into raw MP4
5. Build + burn subtitles into final MP4

Output files are written under local storage path and served via `/api/files/...`.

## Key Libraries
- `lib/gemini.ts`: text/image generation helpers, director script, synopsis/storybook helpers
- `lib/gemini-tts.ts`: narration + voice preview
- `lib/gemini-stt.ts`: audio transcription
- `lib/image-generation.ts`: Gemini image generation helpers for companion art and scene illustrations
- `lib/ffmpeg.ts`: clip compose, concat, subtitle burn, duration/subtitle cue helpers
- `lib/storage.ts`: local file storage helpers
- `lib/db.ts`: Prisma data access layer

## Environment Variables
Required:
- `GEMINI_API_KEY`

Optional:
- `GEMINI_TTS_VOICE`
- `FFMPEG_PATH`
- `STORAGE_LOCAL_PATH` (default `/tmp/storybook`)
- `NEXT_PUBLIC_BASE_URL` (default `http://localhost:3000`)

## Development Commands
- `npm install`
- `npm run dev`
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

## CI
GitHub Actions workflow:
- `.github/workflows/basic-check.yml`

Checks currently run on push/PR:
- `npm ci`
- `npm run lint`
- `npx tsc --noEmit`
- `npm run test --if-present`

## Agent Notes
- Keep changes aligned with v2 storybook + director-script architecture.
- Prefer extending current APIs over adding parallel legacy paths.
- Validate API input and preserve typed payloads in `types/index.ts`.
- If changing pipeline behavior, update both API and UI progress expectations.
