#!/bin/bash
set -e

# ── Configuration ─────────────────────────────────────────────
PROJECT_ID="${GCP_PROJECT_ID:-your-gcp-project-id}"
SERVICE_NAME="storybook-ai"
REGION="asia-east1"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "▶ Deploying ${SERVICE_NAME} to Cloud Run (${REGION})..."
echo "  Project: ${PROJECT_ID}"
echo "  Image:   ${IMAGE}"
echo ""

# ── Build & Push image ────────────────────────────────────────
echo "▶ Building container image..."
gcloud builds submit --tag "${IMAGE}" .

# ── Deploy to Cloud Run ───────────────────────────────────────
echo "▶ Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE}" \
  --platform managed \
  --region "${REGION}" \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --concurrency 10 \
  --set-env-vars "NODE_ENV=production" \
  --set-secrets "GEMINI_API_KEY=GEMINI_API_KEY:latest" \
  --set-env-vars "GEMINI_TTS_VOICE=${GEMINI_TTS_VOICE:-Kore}" \
  --set-env-vars "NEXT_PUBLIC_BASE_URL=https://${SERVICE_NAME}-$(gcloud config get-value project 2>/dev/null | tr ':' '-').${REGION}.run.app"

echo ""
echo "✅ Deploy complete!"
echo "   URL: $(gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format 'value(status.url)')"
