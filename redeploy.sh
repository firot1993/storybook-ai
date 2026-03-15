#!/bin/bash
set -e

# ── Configuration ─────────────────────────────────────────────
PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get project)}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="storybook-ai-v2"
AR_REPO="storybook"
BUCKET="${GCS_BUCKET:-storybook-ai-files}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/app:latest"
ENV_FILE=".env.local"

echo "▶ Redeploy ${SERVICE_NAME}"
echo "  Project: ${PROJECT_ID}"
echo "  Image:   ${IMAGE}"
echo ""

# ── Step 1: Build ─────────────────────────────────────────────
echo "── Building Docker image ──"
gcloud builds submit --tag "$IMAGE" .
echo "  Image built and pushed."
echo ""

# ── Step 2: Deploy ────────────────────────────────────────────
echo "── Deploying to Cloud Run ──"

ENV_VARS="NODE_ENV=production,GCS_BUCKET=${BUCKET}"
if [[ -f "$ENV_FILE" ]]; then
  for key in GEMINI_TEXT_MODEL GEMINI_IMAGE_MODEL GEMINI_STT_MODEL \
             GEMINI_TTS_VOICE ELEVENLABS_MODEL_ID ELEVENLABS_CONCURRENCY; do
    val=$(grep -E "^${key}=" "$ENV_FILE" | cut -d'=' -f2-)
    if [[ -n "$val" ]]; then
      ENV_VARS="${ENV_VARS},${key}=${val}"
    fi
  done
fi

SECRETS_FLAG="GEMINI_API_KEY=gemini-api-key:latest,DATABASE_URL=database-url:latest"
if gcloud secrets describe elevenlabs-api-key &>/dev/null; then
  SECRETS_FLAG="${SECRETS_FLAG},ELEVENLABS_API_KEY=elevenlabs-api-key:latest"
fi
if gcloud secrets describe invite-code &>/dev/null; then
  SECRETS_FLAG="${SECRETS_FLAG},INVITE_CODE=invite-code:latest"
fi

gcloud run deploy "$SERVICE_NAME" \
  --image="$IMAGE" \
  --region="$REGION" \
  --allow-unauthenticated \
  --memory=4Gi \
  --cpu=4 \
  --timeout=300 \
  --concurrency=10 \
  --set-secrets="$SECRETS_FLAG" \
  --set-env-vars="$ENV_VARS"
echo "  Deployed."
echo ""

# ── Step 3: Verify ────────────────────────────────────────────
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format='value(status.url)')
echo "  Checking service health..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SERVICE_URL")
if [[ "$HTTP_CODE" -ge 200 && "$HTTP_CODE" -lt 400 ]]; then
  echo "  Health check passed (HTTP ${HTTP_CODE})."
else
  echo "  WARNING: Service returned HTTP ${HTTP_CODE}. Check logs:"
  echo "    gcloud run services logs read ${SERVICE_NAME} --region=${REGION}"
fi
echo ""
echo "✅ Redeployed: ${SERVICE_URL}"
