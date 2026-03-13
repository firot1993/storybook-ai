---
name: gcp-onboard
description: Walk the user through setting up Google Cloud for this project. Run each step interactively — check what's already done, skip completed steps, and confirm before destructive or billing-related actions.
---

# GCP Onboarding for Storybook AI

Walk the user through setting up Google Cloud for this project. Run each step interactively — check what's already done, skip completed steps, and confirm before destructive or billing-related actions.

## Prerequisites check

Before starting, verify what's already in place:

```bash
which gcloud          # CLI installed?
gcloud auth list      # Already authenticated?
gcloud config get project  # Project set?
```

## Step 1: Install gcloud CLI

Skip if already installed.

```bash
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
gcloud init
```

## Step 2: Authenticate

```bash
gcloud auth login
gcloud auth application-default login
```

## Step 3: Create or select a project

Ask the user for their preferred project ID, or use `storybook-ai`.

```bash
gcloud projects create PROJECT_ID --name="Storybook AI"
gcloud config set project PROJECT_ID
```

If the project already exists, just set it.

## Step 4: Enable APIs

```bash
gcloud services enable \
  storage.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com
```

## Step 5: Create GCS bucket

Ask the user for a bucket name (default: `storybook-ai-files`) and region (default: `us-central1`).

```bash
gcloud storage buckets create gs://BUCKET_NAME \
  --location=REGION \
  --uniform-bucket-level-access

gcloud storage buckets add-iam-policy-binding gs://BUCKET_NAME \
  --member=allUsers \
  --role=roles/storage.objectViewer
```

## Step 6: Create Cloud SQL (PostgreSQL)

Ask the user for their preferred tier (default: `db-f1-micro` at ~$0.25/day).

```bash
gcloud sql instances create storybook-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=REGION \
  --storage-size=10GB \
  --storage-type=HDD \
  --assign-ip \
  --authorized-networks=0.0.0.0/0
```

Set a password using hex to avoid URL-encoding issues:

```bash
DB_PASS=$(openssl rand -hex 16)
gcloud sql users set-password postgres --instance=storybook-db --password="$DB_PASS"
```

Create the database:

```bash
gcloud sql databases create storybook_ai --instance=storybook-db
```

Get the instance IP:

```bash
gcloud sql instances describe storybook-db --format='value(ipAddresses[0].ipAddress)'
```

Build the connection string and store in Secret Manager:

```bash
DB_IP=$(gcloud sql instances describe storybook-db --format='value(ipAddresses[0].ipAddress)')
DB_URL="postgresql://postgres:${DB_PASS}@${DB_IP}:5432/storybook_ai"
echo -n "$DB_URL" | gcloud secrets create database-url --data-file=- 2>/dev/null \
  || echo -n "$DB_URL" | gcloud secrets versions add database-url --data-file=-
```

Push the Prisma schema:

```bash
DATABASE_URL="$DB_URL" npx prisma db push
```

To retrieve the password later:

```bash
gcloud secrets versions access latest --secret=database-url
```

## Step 7: Set up Artifact Registry

```bash
gcloud artifacts repositories create storybook \
  --repository-format=docker \
  --location=REGION

gcloud auth configure-docker REGION-docker.pkg.dev
```

## Step 8: Build and push Docker image

If Docker is available locally:

```bash
docker build -t REGION-docker.pkg.dev/PROJECT_ID/storybook/app:latest .
docker push REGION-docker.pkg.dev/PROJECT_ID/storybook/app:latest
```

If Docker is not installed, use Cloud Build instead (no local Docker needed):

```bash
gcloud builds submit --tag REGION-docker.pkg.dev/PROJECT_ID/storybook/app:latest
```

## Step 9: Deploy to Cloud Run

Read the user's `.env.local` file. Skip comments and blank lines. Split each `KEY=VALUE` into **secrets** vs **env vars**:

**Secrets** (use `--set-secrets`) — values that are sensitive:
- `GEMINI_API_KEY`
- `DATABASE_URL`
- `INVITE_CODE`

**Env vars** (use `--set-env-vars`) — plain config, not sensitive:
- `GEMINI_TEXT_MODEL`, `GEMINI_IMAGE_MODEL`, `GEMINI_TTS_MODEL`, `GEMINI_STT_MODEL`
- `GEMINI_TTS_VOICE`
- `GEMINI_TTS_MIN_INTERVAL_MS`, `GEMINI_TTS_MAX_RETRIES`, `GEMINI_TTS_RETRY_BASE_MS`
- `GCS_BUCKET`
- `NEXT_PUBLIC_*` (must be env vars since they are inlined at build time)

For each secret, create or update in Secret Manager (lowercase-hyphenated name, e.g. `GEMINI_API_KEY` → `gemini-api-key`):

```bash
echo -n "VALUE" | gcloud secrets create SECRET_NAME --data-file=- 2>/dev/null \
  || echo -n "VALUE" | gcloud secrets versions add SECRET_NAME --data-file=-
```

Then deploy with both flags:

```bash
gcloud run deploy storybook-ai \
  --image=REGION-docker.pkg.dev/PROJECT_ID/storybook/app:latest \
  --region=REGION \
  --allow-unauthenticated \
  --set-secrets="GEMINI_API_KEY=gemini-api-key:latest,DATABASE_URL=database-url:latest,INVITE_CODE=invite-code:latest" \
  --set-env-vars="GEMINI_TEXT_MODEL=...,GEMINI_IMAGE_MODEL=...,GEMINI_TTS_MODEL=...,GEMINI_STT_MODEL=...,GEMINI_TTS_VOICE=...,GEMINI_TTS_MIN_INTERVAL_MS=...,GEMINI_TTS_MAX_RETRIES=...,GEMINI_TTS_RETRY_BASE_MS=...,GCS_BUCKET=BUCKET_NAME" \
  --memory=1Gi \
  --cpu=1
```

## Step 10: Post-deploy

```bash
# Get the service URL
gcloud run services describe storybook-ai --region=REGION --format='value(status.url)'

# Update NEXT_PUBLIC_BASE_URL with the actual URL
gcloud run services update storybook-ai \
  --region=REGION \
  --set-env-vars="NEXT_PUBLIC_BASE_URL=https://THE_URL"
```

## Step 11: Verify

```bash
# Hit the service
curl -I https://THE_URL

# After running the pipeline, check GCS
gcloud storage ls gs://BUCKET_NAME/
```

## Local GCS testing

To test GCS integration locally without deploying:

```bash
export GCS_BUCKET=BUCKET_NAME
npm run dev
```

Credentials come from `gcloud auth application-default login` (step 2).
