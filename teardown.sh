#!/bin/bash
set -e

# ── Configuration ─────────────────────────────────────────────
PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get project 2>/dev/null)}"
REGION="us-central1"
SERVICE_NAME="storybook-ai"
SQL_INSTANCE="storybook-db"
AR_REPO="storybook"
BUCKET="storybook-ai-files"
SECRETS=("database-url" "gemini-api-key" "invite-code" "elevenlabs-api-key")

echo "▶ GCP Teardown for ${SERVICE_NAME}"
echo "  Project: ${PROJECT_ID}"
echo "  Region:  ${REGION}"
echo ""
read -p "Proceed with teardown? (y/N) " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }
echo ""

# ── Helper ────────────────────────────────────────────────────
delete_if_exists() {
  local label="$1"
  local check_cmd="$2"
  local delete_cmd="$3"

  echo "── ${label} ──"
  if eval "$check_cmd" &>/dev/null; then
    echo "  Found. Deleting..."
    eval "$delete_cmd"
    echo "  Deleted."
  else
    echo "  Not found, skipping."
  fi
  echo ""
}

# ── Step 1: Cloud Run service ─────────────────────────────────
delete_if_exists "Cloud Run service: ${SERVICE_NAME}" \
  "gcloud run services describe ${SERVICE_NAME} --region=${REGION}" \
  "gcloud run services delete ${SERVICE_NAME} --region=${REGION} --quiet"

# ── Step 2: Cloud SQL instance ────────────────────────────────
delete_if_exists "Cloud SQL instance: ${SQL_INSTANCE}" \
  "gcloud sql instances describe ${SQL_INSTANCE}" \
  "gcloud sql instances delete ${SQL_INSTANCE} --quiet"

# ── Step 3: Artifact Registry repo ────────────────────────────
delete_if_exists "Artifact Registry repo: ${AR_REPO}" \
  "gcloud artifacts repositories describe ${AR_REPO} --location=${REGION}" \
  "gcloud artifacts repositories delete ${AR_REPO} --location=${REGION} --quiet"

# ── Step 4: GCS bucket (files) ────────────────────────────────
delete_if_exists "GCS bucket: ${BUCKET}" \
  "gcloud storage buckets describe gs://${BUCKET}" \
  "gcloud storage rm -r gs://${BUCKET}"

# ── Step 5: Secrets ───────────────────────────────────────────
echo "── Secrets ──"
for secret in "${SECRETS[@]}"; do
  if gcloud secrets describe "$secret" &>/dev/null; then
    echo "  Deleting secret: ${secret}"
    gcloud secrets delete "$secret" --quiet
  else
    echo "  Secret ${secret} not found, skipping."
  fi
done
echo ""

# ── Step 6: Cloud Build artifacts ─────────────────────────────
CLOUDBUILD_BUCKET="${PROJECT_ID}_cloudbuild"
delete_if_exists "Cloud Build bucket: ${CLOUDBUILD_BUCKET}" \
  "gcloud storage buckets describe gs://${CLOUDBUILD_BUCKET}" \
  "gcloud storage rm -r gs://${CLOUDBUILD_BUCKET}"

# ── Step 7: Disable APIs ─────────────────────────────────────
echo "── Disabling APIs ──"
read -p "Disable GCP APIs? Skip if you plan to re-use the project. (y/N) " disable_apis
if [[ "$disable_apis" =~ ^[Yy]$ ]]; then
  gcloud services disable \
    sqladmin.googleapis.com \
    secretmanager.googleapis.com \
    cloudbuild.googleapis.com \
    artifactregistry.googleapis.com \
    run.googleapis.com \
    --force
  echo "  APIs disabled."
else
  echo "  Skipped."
fi
echo ""

echo "✅ Teardown complete for project ${PROJECT_ID}."
