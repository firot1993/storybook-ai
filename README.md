# Storybook AI

Storybook AI is a Next.js application for creating AI-powered children's storybooks and narrated videos.

Current product flow is **v2 storybook-first**:
1. Create/select characters
2. Create/select a storybook
3. Generate A/B/C synopsis options
4. Generate a chapter from selected synopsis
5. Generate director-style script and produce video via FFmpeg pipeline

## Quick Start (Local)

Follow these steps to run the full app locally.

### 1. Install prerequisites

- Node.js 20+
- npm
- PostgreSQL 15+ (or Docker)
- FFmpeg available on your shell `PATH`
- `GEMINI_API_KEY`
- `ELEVENLABS_API_KEY` if you want voice preview or narration audio

FFmpeg install examples:

```bash
# macOS
brew install ffmpeg

# Ubuntu / Debian
sudo apt-get update
sudo apt-get install -y ffmpeg
```

### 2. Start PostgreSQL

Fastest option with Docker:

```bash
docker run --name storybook-ai-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=storybook_ai \
  -p 5432:5432 \
  -d postgres:15
```

If you already run PostgreSQL locally, create a database named `storybook_ai` and use its connection string for `DATABASE_URL`.

### 3. Create `.env.local`

```bash
cp .env.local.example .env.local
```

Set at least these values:

```bash
GEMINI_API_KEY=your_real_key
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/storybook_ai
STORAGE_LOCAL_PATH=.storybook-storage
```

Optional but commonly needed:

```bash
ELEVENLABS_API_KEY=your_real_key_if_you_need_audio
FFMPEG_PATH=/absolute/path/to/ffmpeg
```

Notes:

- `DATABASE_URL` is required for local runtime.
- If `ffmpeg` is already on your `PATH`, leave `FFMPEG_PATH` unset.
- Generated files are written to `STORAGE_LOCAL_PATH`. If you leave it unset, the app uses `/tmp/storybook`.

### 4. Install dependencies and initialize the database

```bash
npm install
npx prisma generate
npx prisma db push
```

### 5. Run the app

```bash
npm run dev
```

Open `http://localhost:3000`.

### 6. Verify the local deployment

Check the health endpoint:

```bash
curl http://localhost:3000/api/health
```

You should get a `200` response with `"ready": true`.

Then verify the main flow in the browser:

- `http://localhost:3000/character`
- `http://localhost:3000/storybook`
- `http://localhost:3000/story/create`

### 7. Run a local production build

If you want to verify the production build locally:

```bash
npm run build
npm run start
```

## Quick Start (Google Cloud)

`./onboard.sh` is the one-command path for a fresh GCP deployment. It can:

- Create or reuse a project
- Link billing when it can resolve an open billing account
- Create the GCS bucket, Cloud SQL instance, Artifact Registry repo, secrets, and Cloud Run service
- Build the container with Cloud Build
- Push the Prisma schema before deployment
- Verify the deployed service at `/api/health`

### Prerequisites

- Node.js 20+
- npm
- `gcloud` CLI installed
- `gcloud auth login` completed
- A usable billing account, or `GCP_BILLING_ACCOUNT` exported
- `GEMINI_API_KEY` exported or stored in `.env.local`

Optional values can come from shell env vars or `.env.local`, including:

- `ELEVENLABS_API_KEY`
- `INVITE_CODE`
- `BYOK_ENCRYPTION_KEY`

### Run it

```bash
cp .env.local.example .env.local
./onboard.sh
```

For non-interactive use:

```bash
AUTO_APPROVE=true GCP_PROJECT_ID=your-project-id GCP_BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX ./onboard.sh
```

Useful overrides:

- `GCP_PROJECT_ID`
- `GCP_REGION`
- `GCS_BUCKET`
- `GCP_SQL_INSTANCE`
- `GCP_SQL_TIER`
- `GCP_SQL_AUTHORIZED_NETWORK`
- `GCP_RUNTIME_SERVICE_ACCOUNT`
- `GCP_CLOUD_RUN_MEMORY`
- `GCP_CLOUD_RUN_CPU`
- `GCP_CLOUD_RUN_TIMEOUT`
- `GCP_CLOUD_RUN_CONCURRENCY`
- `GCP_CLOUD_RUN_MAX_INSTANCES`
- `GCP_CLOUD_RUN_MIN_INSTANCES`
- `FORCE_BUILD`

The script installs npm dependencies automatically when `node_modules/` is missing.

## Tech Stack

- Framework: Next.js (App Router), React, TypeScript
- Styling: Tailwind CSS
- Data: Prisma + PostgreSQL
- AI:
  - Text and image generation via Gemini models
  - TTS via ElevenLabs
  - STT via Gemini
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

Required for local runtime:
- `GEMINI_API_KEY`
- `DATABASE_URL`

Recommended for local runtime:
- `STORAGE_LOCAL_PATH` (default: `/tmp/storybook`)

Optional:
- `ELEVENLABS_API_KEY` (required only for voice preview and narration)
- `GEMINI_TEXT_MODEL` (default: `gemini-3-flash-preview`)
- `GEMINI_IMAGE_MODEL` (default: `gemini-3.1-flash-image-preview`)
- `GEMINI_INTERLEAVED_CHUNK_SIZE` (default: `1`)
- `GEMINI_TTS_VOICE`
- `ELEVENLABS_MODEL_ID` (default: `eleven_v3`)
- `ELEVENLABS_CONCURRENCY` (default: `3`)
- `ELEVENLABS_SPEED` (default: `0.9`, range: `0.7-1.2`)
- `ELEVENLABS_STABILITY` (default: `0.5` / `50%`)
- `ELEVENLABS_STYLE` (default: `0.15` / `15%`)
- `FFMPEG_PATH`
- `FFMPEG_THREADS` (default: auto; tuned to leave CPU headroom, `3` on a 4 vCPU machine)
- `FFMPEG_X264_PRESET` (default: `veryfast`)
- `FFMPEG_SUBTITLE_X264_PRESET` (default: same as `FFMPEG_X264_PRESET`)
- `FFMPEG_CRF` (default: `24`)
- `FFMPEG_AUDIO_BITRATE` (default: `128k`)
- `INVITE_CODE`

Recommended for a Google Cloud runtime with 4 vCPU / 4 GB RAM:

```bash
FFMPEG_THREADS=3
FFMPEG_X264_PRESET=veryfast
FFMPEG_SUBTITLE_X264_PRESET=veryfast
FFMPEG_CRF=24
FFMPEG_AUDIO_BITRATE=128k
```

## Local Development

After the quick start above, use these checks during development:

```bash
npm run lint
npx tsc --noEmit
npm run test --if-present
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
