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
- `ELEVENLABS_MODEL_ID` (default: `eleven_multilingual_v2`)
- `ELEVENLABS_CONCURRENCY` (default: `5`)
- `ELEVENLABS_SPEED` (default: `0.9`, range: `0.7-1.2`)
- `ELEVENLABS_STABILITY` (default: `0.5` / `50%`)
- `ELEVENLABS_STYLE` (default: `0.15` / `15%`)
- `BANANA_API_URL`
- `BANANA_API_KEY`
- `BANANA_MODEL_KEY`
- `FFMPEG_PATH`
- `FFMPEG_THREADS` (default: auto; tuned to leave CPU headroom, `3` on a 4 vCPU machine)
- `FFMPEG_X264_PRESET` (default: `veryfast`)
- `FFMPEG_SUBTITLE_X264_PRESET` (default: same as `FFMPEG_X264_PRESET`)
- `FFMPEG_CRF` (default: `24`)
- `FFMPEG_AUDIO_BITRATE` (default: `128k`)
- `STORAGE_LOCAL_PATH` (default: `/tmp/storybook`)
- `NEXT_PUBLIC_BASE_URL` (default: `http://localhost:3000`)

Recommended for a Google Cloud runtime with 4 vCPU / 4 GB RAM:

```bash
FFMPEG_THREADS=3
FFMPEG_X264_PRESET=veryfast
FFMPEG_SUBTITLE_X264_PRESET=veryfast
FFMPEG_CRF=24
FFMPEG_AUDIO_BITRATE=128k
```

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

## Manual Integration Tests

Manual tests hit the real Gemini API and are excluded from CI. They test the full
story generation pipeline (synopsis → story + NPC portraits + cover image) and
save all artifacts to `lib/__tests__/test-output/<timestamp>/` for inspection.

### Prerequisites

- `GEMINI_API_KEY` set in `.env.local`
- `DATABASE_URL` set in `.env.local` (only for the `db` test)
- Dev server running at `localhost:3000` (only to look up storybook IDs)

### Run all manual tests

```bash
npm run test:manual
```

### Run a single locale

```bash
npm run test:manual -- -t en    # English only
npm run test:manual -- -t zh    # Chinese only
```

### Run with a real storybook from the database

First, find your storybook ID:

```bash
curl http://localhost:3000/api/storybook | jq '.storybooks[] | {id, name}'
```

Then run the `db` test with that ID:

```bash
STORYBOOK_ID=<id> npm run test:manual -- -t db
STORYBOOK_ID=cmmqj10b40000m5qtct82pt1z TEST_LOCALE=en TEST_KEYWORDS="Follow the new, silent stream" npm run test:manual -- -t db
```

This reads the storybook's characters, protagonist image, art style, and age
range from the database — exactly like the production API route does.

Optional env vars for the `db` test:

| Variable | Default | Description |
|---|---|---|
| `TEST_LOCALE` | `zh` | Story locale (`en` or `zh`) |
| `TEST_KEYWORDS` | `冒险, 友谊, 魔法` / `adventure, friendship, magic` | Synopsis background keywords |
| `TEST_THEME` | `探索与友谊` / `exploration and friendship` | Story theme |
| `TEST_SCENE_COUNT` | `4` | Number of director script scenes to generate |

### Output

Each run creates a timestamped folder:

```
lib/__tests__/test-output/<timestamp>/
  en/  (or zh/ or db/)
    all-synopses.json    # 3 generated synopsis options (A/B/C)
    synopsis.txt         # the one used
    raw-response.json    # raw Gemini API response
    debug.txt            # response part sequence + image section labels
    story.txt            # final story text
    npc-<Name>.jpg       # NPC portrait images
    cover.jpg            # cover image
    storybook.json       # (db test only) resolved storybook metadata
    protagonist-ref.jpg  # (db test only) protagonist reference image
    director-script.json # (db test only) generated director storyboard scenes
    scene-*-frame-*.jpg  # (db test only) pre-generated scene frame images
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
