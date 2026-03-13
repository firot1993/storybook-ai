---
name: gcp-deploy
description: Build and deploy the app to GCP Cloud Run. Rebuilds the Docker image via Cloud Build and deploys a new revision. Use when the user says "deploy", "push to prod", "redeploy", etc.
---

# GCP Deploy for Storybook AI

Quick deploy workflow — builds a new image and deploys to Cloud Run.

## Prerequisites check

Verify the project and existing service:

```bash
gcloud config get project
gcloud run services describe storybook-ai --region=us-central1 --format='value(status.url)' 2>/dev/null
```

If no service exists, suggest running `/gcp-onboard` first.

## Step 1: Build and push via Cloud Build

```bash
gcloud builds submit --tag us-central1-docker.pkg.dev/PROJECT_ID/storybook/app:latest
```

## Step 2: Deploy new revision

Read `.env.local` to build the env vars and secrets flags. Split into:

**Secrets** (use `--set-secrets`) — sensitive values:
- `GEMINI_API_KEY`
- `DATABASE_URL`
- `INVITE_CODE`

**Env vars** (use `--set-env-vars`) — plain config:
- `GEMINI_TEXT_MODEL`, `GEMINI_IMAGE_MODEL`, `GEMINI_TTS_MODEL`, `GEMINI_STT_MODEL`
- `GEMINI_TTS_VOICE`
- `GEMINI_TTS_MIN_INTERVAL_MS`, `GEMINI_TTS_MAX_RETRIES`, `GEMINI_TTS_RETRY_BASE_MS`
- `GCS_BUCKET`
- `NEXT_PUBLIC_BASE_URL`

```bash
gcloud run deploy storybook-ai \
  --image=us-central1-docker.pkg.dev/PROJECT_ID/storybook/app:latest \
  --region=us-central1 \
  --allow-unauthenticated \
  --set-secrets="GEMINI_API_KEY=gemini-api-key:latest,DATABASE_URL=database-url:latest,INVITE_CODE=invite-code:latest" \
  --set-env-vars="GEMINI_TEXT_MODEL=...,GEMINI_IMAGE_MODEL=...,GCS_BUCKET=storybook-ai-files,NEXT_PUBLIC_BASE_URL=https://THE_URL" \
  --memory=1Gi \
  --cpu=1
```

## Step 3: Push Prisma schema if changed

Check if the Prisma schema has changed since last deploy:

```bash
git diff HEAD~1 --name-only | grep prisma/schema.prisma
```

If changed, push the schema to Cloud SQL:

```bash
DATABASE_URL=$(gcloud secrets versions access latest --secret=database-url) npx prisma db push
```

## Step 4: Verify

```bash
SERVICE_URL=$(gcloud run services describe storybook-ai --region=us-central1 --format='value(status.url)')
curl -sI "$SERVICE_URL" | head -5
```

Report the service URL and HTTP status to the user.
