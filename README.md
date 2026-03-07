# Storybook AI

Storybook AI is a Next.js application for creating AI-powered children's storybooks and narrated videos.

Current product flow is **v2 storybook-first**:
1. Create/select characters
2. Create/select a storybook
3. Generate A/B/C synopsis options
4. Generate a chapter from selected synopsis
5. Generate director-style script and produce video via FFmpeg pipeline

## Tech Stack

- Framework: Next.js (App Router), React, TypeScript
- Styling: Tailwind CSS
- Data: Prisma + SQLite (local)
- AI:
  - Text/Image generation via Gemini models
  - TTS via Gemini (configurable via `GEMINI_TTS_MODEL`)
  - STT via Gemini (configurable via `GEMINI_STT_MODEL`)
- Video composition: FFmpeg (`fluent-ffmpeg`)

## Main Routes

- `/` Landing page
- `/character` Character library
- `/character/create` Character generation (multi-style)
- `/character/name` Character metadata editing
- `/storybook` Storybook library
- `/story/create` Storybook creation wizard
- `/story/play?id=<storyId>` Story playback + video progress

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

## Environment Variables

Required:
- `GEMINI_API_KEY`

Optional:
- `GEMINI_TEXT_MODEL` (default: `gemini-3-flash-preview`)
- `GEMINI_IMAGE_MODEL` (default: `gemini-3.1-flash-image-preview`)
- `GEMINI_TTS_MODEL` (default: `gemini-2.5-flash-preview-tts`)
- `GEMINI_STT_MODEL` (default: `gemini-2.0-flash`)
- `GEMINI_TTS_VOICE`
- `BANANA_API_URL`
- `BANANA_API_KEY`
- `BANANA_MODEL_KEY`
- `FFMPEG_PATH`
- `STORAGE_LOCAL_PATH` (default: `/tmp/storybook`)
- `NEXT_PUBLIC_BASE_URL` (default: `http://localhost:3000`)

## Local Development

Install dependencies:

```bash
npm install
```

Run development server:

```bash
npm run dev
```

Run checks:

```bash
npm run lint
npx tsc --noEmit
npm run test --if-present
```

Production build:

```bash
npm run build
npm run start
```

## CI

GitHub Actions workflow: `.github/workflows/basic-check.yml`

Checks on `push` and `pull_request`:
- `npm ci`
- `npm run lint`
- `npx tsc --noEmit`
- `npm run test --if-present`

## Notes

- Legacy v1 story/video pages and routes have been removed.
- Keep new changes aligned with the v2 storybook + director-script pipeline.
