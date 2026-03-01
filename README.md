# Storybook AI

Storybook AI is a Next.js app that turns user photos into cartoon characters, generates illustrated bedtime stories, and narrates each scene with Gemini TTS.

## Stack

- Framework: Next.js 15, React 19, TypeScript
- Styling: Tailwind CSS
- AI:
  - `gemini-2.5-flash-image` for character and scene images
  - `gemini-3-flash-preview` for story text and story options
  - `gemini-2.5-flash-preview-tts` for narration audio
- Data: Prisma + SQLite (`prisma/dev.db`)
- Deployment target: Vercel (with external persistent DB recommended)

## Current Features

- Generate cartoon character(s) from uploaded photos
- Generate 3 story options from keywords + age group
- Generate full story text and scene images
- Scene-based audio generation
- Narration vs character speech separation in TTS script
- Auto page progression while scene audio plays
- Regenerate audio for stories missing narration

## Architecture Overview

### Frontend

- App Router pages under `app/`
- Client state persisted with localStorage / IndexedDB helpers (`lib/client-story-store.ts`)

### Backend

- Next.js route handlers under `app/api/`
- Prisma access layer in `lib/db.ts`
- Gemini wrappers in `lib/gemini.ts` and `lib/gemini-tts.ts`
- Story scene parsing shared in `lib/story-scenes.ts`

### Audio Storage Compatibility

`Story.audioUrl` in DB stores either:

- Legacy plain single audio URL string, or
- Encoded JSON payload containing `audioUrl` + `sceneAudioUrls`

Encoding/decoding helpers live in `lib/story-audio.ts` to keep old stories compatible.

## API Routes

- `GET /api/health` readiness check
- `GET /api/character` list characters
- `POST /api/character` generate/save character
- `GET|PATCH|DELETE /api/character/[id]` character CRUD
- `GET /api/character/[id]/stories` list a character's stories
- `GET /api/story` list all stories
- `POST /api/story/options` generate story options
- `POST /api/story/generate` generate story + images + scene audio
- `POST /api/story/audio` regenerate scene audio
- `GET|DELETE /api/story/[id]` story fetch/delete

## Local Development

### 1. Install

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

Required:

- `GEMINI_API_KEY`

Optional (TTS voices):

- `GEMINI_TTS_VOICE` (single-speaker fallback, default `Kore`)
- `GEMINI_TTS_NARRATOR_VOICE` (default `Kore`)
- `GEMINI_TTS_CHARACTER_VOICE` (default `Puck`)

### 3. Run

```bash
npm run dev
```

Open `http://localhost:3000`.

### 4. Build and lint

```bash
npm run lint
npm run build
```

## Database Notes

- Local development uses SQLite file `prisma/dev.db`.
- Prisma schema is in `prisma/schema.prisma`.
- For Vercel production, SQLite file storage is not durable across deployments/invocations.
- Use a persistent hosted DB adapter for production if you need durable story/character data.

## Deployment Notes (Vercel)

- Set environment variables in Vercel project settings.
- Ensure `GEMINI_API_KEY` is configured.
- If you keep SQLite, treat it as ephemeral (demo-only).
- For production persistence, migrate Prisma datasource to a hosted database.

## License

MIT
