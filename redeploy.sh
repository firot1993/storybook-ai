#!/bin/bash
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────
PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="${GCP_SERVICE_NAME:-storybook-ai-v2}"
AR_REPO="${GCP_AR_REPO:-storybook}"
IMAGE_NAME="${GCP_IMAGE_NAME:-app}"
BUCKET="${GCS_BUCKET:-storybook-ai-files}"
ENV_FILE="${ENV_FILE:-.env.local}"
DOCKER_PLATFORM="${DOCKER_PLATFORM:-linux/amd64}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command gcloud
require_command curl
require_command docker

if [[ -z "${PROJECT_ID}" || "${PROJECT_ID}" == "(unset)" ]]; then
  echo "GCP project is not configured. Set GCP_PROJECT_ID or run: gcloud config set project <project-id>" >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not available. Start Docker and retry." >&2
  exit 1
fi

SOURCE_REF="manual"
if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  SOURCE_REF="$(git rev-parse --short HEAD 2>/dev/null || echo manual)"
  if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
    SOURCE_REF="${SOURCE_REF}-dirty"
  fi
fi

BUILD_TAG="$(date -u +%Y%m%d-%H%M%S)-${SOURCE_REF}"
IMAGE_BASE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/${IMAGE_NAME}"
IMAGE="${IMAGE_BASE}:${BUILD_TAG}"
IMAGE_LATEST="${IMAGE_BASE}:latest"

echo "▶ Redeploy ${SERVICE_NAME}"
echo "  Project: ${PROJECT_ID}"
echo "  Region:  ${REGION}"
echo "  Docker:  ${DOCKER_PLATFORM}"
echo "  Source:  ${SOURCE_REF}"
echo "  Image:   ${IMAGE}"
echo "  Latest:  ${IMAGE_LATEST}"
echo ""

# ── Step 1: Auth ──────────────────────────────────────────────
echo "── Configuring Docker auth ──"
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet >/dev/null
echo "  Docker auth configured."
echo ""

# ── Step 2: Build + Push ──────────────────────────────────────
echo "── Building and pushing Docker image ──"
if docker buildx version >/dev/null 2>&1; then
  docker buildx build \
    --platform="${DOCKER_PLATFORM}" \
    --tag="${IMAGE}" \
    --tag="${IMAGE_LATEST}" \
    --push \
    .
else
  docker build \
    --platform="${DOCKER_PLATFORM}" \
    --tag="${IMAGE}" \
    --tag="${IMAGE_LATEST}" \
    .
  docker push "${IMAGE}"
  docker push "${IMAGE_LATEST}"
fi
echo "  Image built and pushed."
echo ""

# ── Step 3: Deploy ────────────────────────────────────────────
echo "── Deploying to Cloud Run ──"

ENV_VARS="NODE_ENV=production,GCS_BUCKET=${BUCKET}"
if [[ -f "$ENV_FILE" ]]; then
  for key in GEMINI_TEXT_MODEL GEMINI_IMAGE_MODEL GEMINI_STT_MODEL \
             GEMINI_TTS_VOICE ELEVENLABS_MODEL_ID ELEVENLABS_CONCURRENCY \
             ELEVENLABS_SPEED ELEVENLABS_STABILITY ELEVENLABS_STYLE; do
    val=$(grep -E "^${key}=" "$ENV_FILE" | cut -d'=' -f2-)
    if [[ -n "$val" ]]; then
      ENV_VARS="${ENV_VARS},${key}=${val}"
    fi
  done
fi

SECRETS_FLAG="GEMINI_API_KEY=gemini-api-key:latest,DATABASE_URL=database-url:latest"
if gcloud secrets describe elevenlabs-api-key --project="${PROJECT_ID}" &>/dev/null; then
  SECRETS_FLAG="${SECRETS_FLAG},ELEVENLABS_API_KEY=elevenlabs-api-key:latest"
fi
if gcloud secrets describe invite-code --project="${PROJECT_ID}" &>/dev/null; then
  SECRETS_FLAG="${SECRETS_FLAG},INVITE_CODE=invite-code:latest"
fi

gcloud run deploy "$SERVICE_NAME" \
  --project="${PROJECT_ID}" \
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

# ── Step 4: Verify ────────────────────────────────────────────
SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(status.url)')"
LATEST_CREATED_REVISION="$(gcloud run services describe "$SERVICE_NAME" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(status.latestCreatedRevisionName)')"
LATEST_READY_REVISION="$(gcloud run services describe "$SERVICE_NAME" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(status.latestReadyRevisionName)')"
DEPLOYED_IMAGE="$(gcloud run services describe "$SERVICE_NAME" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(spec.template.spec.containers[0].image)' 2>/dev/null || true)"

echo "  Checking service health..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SERVICE_URL")
if [[ "$HTTP_CODE" -ge 200 && "$HTTP_CODE" -lt 400 ]]; then
  echo "  Health check passed (HTTP ${HTTP_CODE})."
  echo ""
  echo "── Cleaning up old Artifact Registry images ──"
  GCP_PROJECT_ID="${PROJECT_ID}" \
  GCP_REGION="${REGION}" \
  GCP_AR_REPO="${AR_REPO}" \
  GCP_IMAGE_NAME="${IMAGE_NAME}" \
  YES=true \
  bash ./cleanupimages.sh --yes
else
  echo "  WARNING: Service returned HTTP ${HTTP_CODE}. Check logs:"
  echo "    gcloud run services logs read ${SERVICE_NAME} --project=${PROJECT_ID} --region=${REGION}"
  echo "  Skipping image cleanup because deploy verification did not pass."
fi
echo "  Requested image: ${IMAGE}"
if [[ -n "${DEPLOYED_IMAGE}" ]]; then
  echo "  Service image:   ${DEPLOYED_IMAGE}"
fi
echo "  Created rev:     ${LATEST_CREATED_REVISION}"
echo "  Ready rev:       ${LATEST_READY_REVISION}"
echo ""
echo "✅ Redeployed: ${SERVICE_URL}"
