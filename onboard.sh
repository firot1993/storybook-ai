#!/bin/bash
set -e

# ── Configuration ─────────────────────────────────────────────
PROJECT_ID="${GCP_PROJECT_ID:-storybook-ai}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="storybook-ai"
SQL_INSTANCE="storybook-db"
SQL_TIER="${GCP_SQL_TIER:-db-f1-micro}"
AR_REPO="storybook"
BUCKET="${GCS_BUCKET:-storybook-ai-files}"
DB_NAME="storybook_ai"

echo "▶ GCP Onboarding for ${SERVICE_NAME}"
echo "  Project: ${PROJECT_ID}"
echo "  Region:  ${REGION}"
echo ""
echo "Override defaults with env vars:"
echo "  GCP_PROJECT_ID, GCP_REGION, GCP_SQL_TIER, GCS_BUCKET"
echo ""
read -p "Proceed with these settings? (y/N) " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }
echo ""

# ── Helper ────────────────────────────────────────────────────
step() {
  echo "── Step $1: $2 ──"
}

skip_if_exists() {
  local label="$1"
  local check_cmd="$2"
  if eval "$check_cmd" &>/dev/null; then
    echo "  ${label} already exists, skipping."
    return 0
  fi
  return 1
}

# ── Prerequisites ─────────────────────────────────────────────
step 0 "Prerequisites"
if ! command -v gcloud &>/dev/null; then
  echo "  gcloud CLI not found. Install it from https://cloud.google.com/sdk/docs/install"
  exit 1
fi
echo "  gcloud CLI: OK"

if ! gcloud auth list --filter="status:ACTIVE" --format="value(account)" 2>/dev/null | head -1 | grep -q .; then
  echo "  Not authenticated. Run: gcloud auth login"
  exit 1
fi
echo "  Authentication: OK"
echo ""

# ── Step 1: Create or select project ─────────────────────────
step 1 "Project setup"
if gcloud projects describe "$PROJECT_ID" &>/dev/null; then
  echo "  Project ${PROJECT_ID} exists."
else
  echo "  Creating project ${PROJECT_ID}..."
  gcloud projects create "$PROJECT_ID" --name="Storybook AI"
fi
gcloud config set project "$PROJECT_ID"
echo "  Active project: ${PROJECT_ID}"
echo ""

# ── Step 2: Enable APIs ──────────────────────────────────────
step 2 "Enable APIs"
echo "  Enabling required APIs..."
gcloud services enable \
  storage.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com
echo "  APIs enabled."
echo ""

# ── Step 3: Create GCS bucket ────────────────────────────────
step 3 "GCS bucket"
if ! skip_if_exists "Bucket gs://${BUCKET}" "gcloud storage buckets describe gs://${BUCKET}"; then
  echo "  Creating bucket gs://${BUCKET}..."
  gcloud storage buckets create "gs://${BUCKET}" \
    --location="$REGION" \
    --uniform-bucket-level-access
  gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
    --member=allUsers \
    --role=roles/storage.objectViewer
  echo "  Bucket created with public read access."
fi
echo ""

# ── Step 4: Create Cloud SQL instance ────────────────────────
step 4 "Cloud SQL (PostgreSQL)"
if ! skip_if_exists "SQL instance ${SQL_INSTANCE}" "gcloud sql instances describe ${SQL_INSTANCE}"; then
  echo "  Creating Cloud SQL instance ${SQL_INSTANCE} (tier: ${SQL_TIER})..."
  echo "  This may take several minutes."
  gcloud sql instances create "$SQL_INSTANCE" \
    --database-version=POSTGRES_15 \
    --tier="$SQL_TIER" \
    --region="$REGION" \
    --storage-size=10GB \
    --storage-type=HDD \
    --assign-ip \
    --authorized-networks=0.0.0.0/0

  # Set password
  DB_PASS=$(openssl rand -hex 16)
  gcloud sql users set-password postgres --instance="$SQL_INSTANCE" --password="$DB_PASS"
  echo "  Password set."

  # Create database
  gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE"
  echo "  Database ${DB_NAME} created."

  # Build connection string and store as secret
  DB_IP=$(gcloud sql instances describe "$SQL_INSTANCE" --format='value(ipAddresses[0].ipAddress)')
  DB_URL="postgresql://postgres:${DB_PASS}@${DB_IP}:5432/${DB_NAME}"
  echo -n "$DB_URL" | gcloud secrets create database-url --data-file=- 2>/dev/null \
    || echo -n "$DB_URL" | gcloud secrets versions add database-url --data-file=-
  echo "  Connection string stored in Secret Manager (database-url)."

  # Push Prisma schema
  echo "  Pushing Prisma schema..."
  DATABASE_URL="$DB_URL" npx prisma db push
  echo "  Schema pushed."
else
  DB_URL=$(gcloud secrets versions access latest --secret=database-url 2>/dev/null || true)
fi
echo ""

# ── Step 5: Set up Artifact Registry ─────────────────────────
step 5 "Artifact Registry"
if ! skip_if_exists "Repo ${AR_REPO}" "gcloud artifacts repositories describe ${AR_REPO} --location=${REGION}"; then
  echo "  Creating Artifact Registry repo ${AR_REPO}..."
  gcloud artifacts repositories create "$AR_REPO" \
    --repository-format=docker \
    --location="$REGION"
  echo "  Repo created."
fi
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
echo ""

# ── Step 6: Build and push Docker image ──────────────────────
step 6 "Build Docker image"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/app:latest"
echo "  Image: ${IMAGE}"
echo "  Building with Cloud Build..."
gcloud builds submit --tag "$IMAGE" .
echo "  Image built and pushed."
echo ""

# ── Step 7: Store secrets ─────────────────────────────────────
step 7 "Secrets"
ENV_FILE=".env.local"
if [[ -f "$ENV_FILE" ]]; then
  # Store GEMINI_API_KEY
  GEMINI_KEY=$(grep -E '^GEMINI_API_KEY=' "$ENV_FILE" | cut -d'=' -f2-)
  if [[ -n "$GEMINI_KEY" && "$GEMINI_KEY" != "your_gemini_api_key_here" ]]; then
    echo -n "$GEMINI_KEY" | gcloud secrets create gemini-api-key --data-file=- 2>/dev/null \
      || echo -n "$GEMINI_KEY" | gcloud secrets versions add gemini-api-key --data-file=-
    echo "  Stored gemini-api-key."
  else
    echo "  WARNING: GEMINI_API_KEY not set in ${ENV_FILE}. Set it manually:"
    echo "    echo -n 'YOUR_KEY' | gcloud secrets create gemini-api-key --data-file=-"
  fi

  # Store INVITE_CODE
  INVITE=$(grep -E '^INVITE_CODE=' "$ENV_FILE" | cut -d'=' -f2-)
  if [[ -n "$INVITE" && "$INVITE" != "your_invite_code_here" ]]; then
    echo -n "$INVITE" | gcloud secrets create invite-code --data-file=- 2>/dev/null \
      || echo -n "$INVITE" | gcloud secrets versions add invite-code --data-file=-
    echo "  Stored invite-code."
  else
    echo "  Skipped invite-code (not set or placeholder)."
  fi
else
  echo "  WARNING: No ${ENV_FILE} found. Create secrets manually:"
  echo "    echo -n 'KEY' | gcloud secrets create gemini-api-key --data-file=-"
fi
echo ""

# ── Step 8: Deploy to Cloud Run ───────────────────────────────
step 8 "Deploy to Cloud Run"

# Build env vars from .env.local (non-secret, non-blank, non-comment lines)
ENV_VARS="NODE_ENV=production,GCS_BUCKET=${BUCKET}"
if [[ -f "$ENV_FILE" ]]; then
  for key in GEMINI_TEXT_MODEL GEMINI_IMAGE_MODEL GEMINI_TTS_MODEL GEMINI_STT_MODEL \
             GEMINI_TTS_VOICE GEMINI_TTS_MIN_INTERVAL_MS GEMINI_TTS_MAX_RETRIES \
             GEMINI_TTS_RETRY_BASE_MS; do
    val=$(grep -E "^${key}=" "$ENV_FILE" | cut -d'=' -f2-)
    if [[ -n "$val" ]]; then
      ENV_VARS="${ENV_VARS},${key}=${val}"
    fi
  done
fi

# Build secrets string
SECRETS_FLAG="GEMINI_API_KEY=gemini-api-key:latest,DATABASE_URL=database-url:latest"
# Only include invite-code if the secret exists
if gcloud secrets describe invite-code &>/dev/null; then
  SECRETS_FLAG="${SECRETS_FLAG},INVITE_CODE=invite-code:latest"
fi

echo "  Deploying ${SERVICE_NAME}..."
gcloud run deploy "$SERVICE_NAME" \
  --image="$IMAGE" \
  --region="$REGION" \
  --allow-unauthenticated \
  --memory=2Gi \
  --cpu=2 \
  --timeout=300 \
  --concurrency=10 \
  --set-secrets="$SECRETS_FLAG" \
  --set-env-vars="$ENV_VARS"
echo "  Deployed."
echo ""

# ── Step 9: Post-deploy ──────────────────────────────────────
step 9 "Post-deploy"
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format='value(status.url)')
echo "  Service URL: ${SERVICE_URL}"

echo "  Updating NEXT_PUBLIC_BASE_URL..."
gcloud run services update "$SERVICE_NAME" \
  --region="$REGION" \
  --set-env-vars="NEXT_PUBLIC_BASE_URL=${SERVICE_URL}"
echo ""

# ── Step 10: Verify ───────────────────────────────────────────
step 10 "Verify"
echo "  Checking service health..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SERVICE_URL")
if [[ "$HTTP_CODE" -ge 200 && "$HTTP_CODE" -lt 400 ]]; then
  echo "  Health check passed (HTTP ${HTTP_CODE})."
else
  echo "  WARNING: Service returned HTTP ${HTTP_CODE}. Check logs:"
  echo "    gcloud run services logs read ${SERVICE_NAME} --region=${REGION}"
fi
echo ""

echo "✅ Onboarding complete!"
echo "   URL: ${SERVICE_URL}"
echo ""
echo "Local development with GCS:"
echo "   export GCS_BUCKET=${BUCKET}"
echo "   npm run dev"
