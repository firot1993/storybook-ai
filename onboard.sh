#!/bin/bash
set -euo pipefail

trap 'echo ""; echo "ERROR: Onboarding failed near line ${LINENO}. Fix the issue and rerun ./onboard.sh."' ERR

step() {
  echo "== Step $1: $2 =="
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

normalize_project_id() {
  local value="$1"
  if [[ "$value" == "(unset)" ]]; then
    printf '\n'
    return
  fi
  printf '%s\n' "$value"
}

trim_wrapping_quotes() {
  local value="$1"

  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi

  printf '%s\n' "$value"
}

sanitize_bucket_name() {
  local value="$1"

  value="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  value="$(printf '%s' "$value" | sed 's/[^a-z0-9._-]/-/g')"
  value="$(printf '%s' "$value" | sed 's/^[^a-z0-9]*//; s/[^a-z0-9]*$//')"

  printf '%s\n' "$value"
}

is_placeholder_value() {
  local value="${1:-}"
  local normalized

  normalized="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  case "$normalized" in
    ""|changeme|replace-me|replace_me|your_*|example|example-*|placeholder|null|none)
      return 0
      ;;
  esac

  return 1
}

env_value_from_file() {
  local key="$1"
  local file="$2"
  local line

  [[ -f "$file" ]] || return 0

  line="$(
    grep -E "^[[:space:]]*${key}=" "$file" | tail -n 1 || true
  )"
  [[ -n "$line" ]] || return 0

  line="${line#*=}"
  line="${line%$'\r'}"
  trim_wrapping_quotes "$line"
}

resolve_value() {
  local key="$1"
  local env_val="${!key-}"
  local file_val=""

  if [[ -n "$env_val" ]]; then
    trim_wrapping_quotes "$env_val"
    return 0
  fi

  if [[ -f "$ENV_FILE" ]]; then
    file_val="$(env_value_from_file "$key" "$ENV_FILE")"
    if [[ -n "$file_val" ]]; then
      printf '%s\n' "$file_val"
      return 0
    fi
  fi

  printf '\n'
}

confirm_or_exit() {
  if [[ "$AUTO_APPROVE" == "true" ]]; then
    return 0
  fi

  read -r -p "Proceed with these settings? (y/N) " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || {
    echo "Aborted."
    exit 0
  }
}

upsert_secret() {
  local secret_name="$1"
  local secret_value="$2"

  if gcloud secrets describe "$secret_name" --project="$PROJECT_ID" >/dev/null 2>&1; then
    printf '%s' "$secret_value" | gcloud secrets versions add "$secret_name" \
      --project="$PROJECT_ID" \
      --data-file=-
  else
    printf '%s' "$secret_value" | gcloud secrets create "$secret_name" \
      --project="$PROJECT_ID" \
      --replication-policy=automatic \
      --data-file=-
  fi
}

extract_db_password_from_url() {
  local db_url="$1"
  printf '%s' "$db_url" | sed -n 's#^[^:]*://[^:]*:\([^@]*\)@.*#\1#p'
}

extract_db_name_from_url() {
  local db_url="$1"
  printf '%s' "$db_url" | sed -n 's#^.*/\([^/?]*\)\(\?.*\)\?$#\1#p'
}

ensure_billing_account() {
  local billing_enabled
  local open_accounts=()
  local raw_accounts

  billing_enabled="$(
    gcloud billing projects describe "$PROJECT_ID" \
      --format='value(billingEnabled)' \
      2>/dev/null || true
  )"

  if [[ "$billing_enabled" == "True" || "$billing_enabled" == "true" ]]; then
    echo "  Billing already enabled."
    return 0
  fi

  if [[ -z "$BILLING_ACCOUNT" ]]; then
    raw_accounts="$(
      gcloud billing accounts list \
        --filter='open=true' \
        --format='value(name)' \
        2>/dev/null || true
    )"

    if [[ -n "$raw_accounts" ]]; then
      while IFS= read -r account; do
        [[ -n "$account" ]] || continue
        open_accounts+=("${account#billingAccounts/}")
      done <<< "$raw_accounts"
    fi

    if [[ "${#open_accounts[@]}" -eq 1 ]]; then
      BILLING_ACCOUNT="${open_accounts[0]}"
      echo "  Using billing account ${BILLING_ACCOUNT}."
    elif [[ "${#open_accounts[@]}" -gt 1 && -t 0 ]]; then
      echo "  Multiple open billing accounts were found:"
      printf '    %s\n' "${open_accounts[@]}"
      read -r -p "  Billing account ID to link: " BILLING_ACCOUNT
    else
      echo "  Billing is not enabled for ${PROJECT_ID}."
      echo "  Set GCP_BILLING_ACCOUNT and rerun, or link billing manually:"
      echo "    gcloud billing projects link ${PROJECT_ID} --billing-account=ACCOUNT_ID"
      exit 1
    fi
  fi

  if [[ -z "$BILLING_ACCOUNT" ]]; then
    echo "Billing account ID is empty." >&2
    exit 1
  fi

  echo "  Linking project to billing account ${BILLING_ACCOUNT}..."
  gcloud billing projects link "$PROJECT_ID" \
    --billing-account="$BILLING_ACCOUNT" \
    --quiet
}

ensure_node_modules() {
  if [[ -d node_modules ]]; then
    echo "  node_modules already present."
    return 0
  fi

  echo "  Installing npm dependencies with npm ci..."
  npm ci
}

ensure_runtime_service_account() {
  if gcloud iam service-accounts describe "$RUNTIME_SERVICE_ACCOUNT_EMAIL" \
    --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "  Service account ${RUNTIME_SERVICE_ACCOUNT_EMAIL} exists."
    return 0
  fi

  echo "  Creating service account ${RUNTIME_SERVICE_ACCOUNT_EMAIL}..."
  gcloud iam service-accounts create "$RUNTIME_SERVICE_ACCOUNT_NAME" \
    --project="$PROJECT_ID" \
    --display-name="Storybook AI runtime"
}

ensure_sql_authorized_network() {
  local current_networks
  local updated_networks

  if [[ -z "$SQL_AUTHORIZED_NETWORK" ]]; then
    echo "  Detecting your public IP for Prisma schema access..."
    local detected_ip
    detected_ip="$(curl -fsSL https://api.ipify.org || true)"
    if [[ -z "$detected_ip" ]]; then
      echo "  Could not detect your public IP."
      echo "  Set GCP_SQL_AUTHORIZED_NETWORK=x.x.x.x/32 and rerun."
      exit 1
    fi
    SQL_AUTHORIZED_NETWORK="${detected_ip}/32"
  elif [[ "$SQL_AUTHORIZED_NETWORK" != */* ]]; then
    SQL_AUTHORIZED_NETWORK="${SQL_AUTHORIZED_NETWORK}/32"
  fi

  if ! gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "  Using authorized network ${SQL_AUTHORIZED_NETWORK} for initial SQL setup."
    return 0
  fi

  current_networks="$(
    gcloud sql instances describe "$SQL_INSTANCE" \
      --project="$PROJECT_ID" \
      --format='value(settings.ipConfiguration.authorizedNetworks[].value)' \
      2>/dev/null \
      | tr ';' '\n' \
      | tr ',' '\n' \
      | sed '/^$/d' \
      | paste -sd',' -
  )"

  if printf '%s\n' "$current_networks" | tr ',' '\n' | grep -Fxq "$SQL_AUTHORIZED_NETWORK"; then
    echo "  Authorized network ${SQL_AUTHORIZED_NETWORK} already present."
    return 0
  fi

  updated_networks="$SQL_AUTHORIZED_NETWORK"
  if [[ -n "$current_networks" ]]; then
    updated_networks="${current_networks},${SQL_AUTHORIZED_NETWORK}"
  fi

  echo "  Adding authorized network ${SQL_AUTHORIZED_NETWORK}..."
  gcloud sql instances patch "$SQL_INSTANCE" \
    --project="$PROJECT_ID" \
    --authorized-networks="$updated_networks" \
    --quiet
}

require_command gcloud
require_command curl
require_command npm
require_command npx
require_command openssl

CURRENT_PROJECT="$(normalize_project_id "$(gcloud config get-value project 2>/dev/null || true)")"
PROJECT_ID="${GCP_PROJECT_ID:-$CURRENT_PROJECT}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="${GCP_SERVICE_NAME:-storybook-ai-v2}"
SQL_INSTANCE="${GCP_SQL_INSTANCE:-storybook-db}"
SQL_TIER="${GCP_SQL_TIER:-db-f1-micro}"
AR_REPO="${GCP_AR_REPO:-storybook}"
IMAGE_NAME="${GCP_IMAGE_NAME:-app}"
DB_NAME="${GCP_DB_NAME:-storybook_ai}"
ENV_FILE="${ENV_FILE:-.env.local}"
FORCE_BUILD="${FORCE_BUILD:-false}"
AUTO_APPROVE="${AUTO_APPROVE:-false}"
BILLING_ACCOUNT="${GCP_BILLING_ACCOUNT:-}"
RUN_MEMORY="${GCP_CLOUD_RUN_MEMORY:-4Gi}"
RUN_CPU="${GCP_CLOUD_RUN_CPU:-4}"
RUN_TIMEOUT="${GCP_CLOUD_RUN_TIMEOUT:-300}"
RUN_CONCURRENCY="${GCP_CLOUD_RUN_CONCURRENCY:-10}"
RUN_MAX_INSTANCES="${GCP_CLOUD_RUN_MAX_INSTANCES:-3}"
RUN_MIN_INSTANCES="${GCP_CLOUD_RUN_MIN_INSTANCES:-0}"
SQL_AUTHORIZED_NETWORK="${GCP_SQL_AUTHORIZED_NETWORK:-}"

if [[ -z "$PROJECT_ID" && -t 0 ]]; then
  read -r -p "GCP project ID to create or use: " PROJECT_ID
fi

if [[ -z "$PROJECT_ID" ]]; then
  echo "Set GCP_PROJECT_ID or run interactively to choose a project ID." >&2
  exit 1
fi

BUCKET_DEFAULT="$(sanitize_bucket_name "${PROJECT_ID}-storybook-ai-files")"
BUCKET="${GCS_BUCKET:-$BUCKET_DEFAULT}"

if [[ ${#BUCKET} -lt 3 || ${#BUCKET} -gt 63 ]]; then
  echo "Bucket name must be between 3 and 63 characters. Current value: ${BUCKET}" >&2
  exit 1
fi

RUNTIME_SERVICE_ACCOUNT_INPUT="${GCP_RUNTIME_SERVICE_ACCOUNT:-${SERVICE_NAME}-runtime}"
if [[ "$RUNTIME_SERVICE_ACCOUNT_INPUT" == *"@"* ]]; then
  RUNTIME_SERVICE_ACCOUNT_EMAIL="$RUNTIME_SERVICE_ACCOUNT_INPUT"
  RUNTIME_SERVICE_ACCOUNT_NAME="${RUNTIME_SERVICE_ACCOUNT_INPUT%%@*}"
else
  RUNTIME_SERVICE_ACCOUNT_NAME="$RUNTIME_SERVICE_ACCOUNT_INPUT"
  RUNTIME_SERVICE_ACCOUNT_EMAIL="${RUNTIME_SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
fi

APP_VERSION="0.0.0"
if [[ -f package.json ]]; then
  parsed_version="$(sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' package.json | head -n 1)"
  if [[ -n "$parsed_version" ]]; then
    APP_VERSION="$parsed_version"
  fi
fi

APP_VERSION_TAG="$(printf '%s' "$APP_VERSION" | tr -c 'A-Za-z0-9._-' '-')"
IMAGE_BASE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/${IMAGE_NAME}"
IMAGE="${IMAGE_BASE}:v${APP_VERSION_TAG}"
IMAGE_LATEST="${IMAGE_BASE}:latest"

echo "GCP onboarding for ${SERVICE_NAME}"
echo "  Project:     ${PROJECT_ID}"
echo "  Region:      ${REGION}"
echo "  Service:     ${SERVICE_NAME}"
echo "  SQL:         ${SQL_INSTANCE}"
echo "  Bucket:      ${BUCKET}"
echo "  Runtime SA:  ${RUNTIME_SERVICE_ACCOUNT_EMAIL}"
echo "  Version:     ${APP_VERSION}"
echo "  Env file:    ${ENV_FILE}"
echo ""
echo "Override defaults with env vars:"
echo "  GCP_PROJECT_ID, GCP_REGION, GCP_BILLING_ACCOUNT, GCP_SQL_INSTANCE,"
echo "  GCP_SQL_TIER, GCP_AR_REPO, GCP_IMAGE_NAME, GCS_BUCKET,"
echo "  GCP_RUNTIME_SERVICE_ACCOUNT, GCP_SQL_AUTHORIZED_NETWORK,"
echo "  GCP_CLOUD_RUN_MEMORY, GCP_CLOUD_RUN_CPU, GCP_CLOUD_RUN_TIMEOUT,"
echo "  GCP_CLOUD_RUN_CONCURRENCY, GCP_CLOUD_RUN_MAX_INSTANCES,"
echo "  GCP_CLOUD_RUN_MIN_INSTANCES, ENV_FILE, FORCE_BUILD, AUTO_APPROVE"
echo ""
confirm_or_exit
echo ""

step 0 "Prerequisites"
if ! gcloud auth list --filter="status:ACTIVE" --format="value(account)" 2>/dev/null | head -1 | grep -q .; then
  echo "  Not authenticated. Run: gcloud auth login"
  exit 1
fi
echo "  gcloud auth: OK"
ensure_node_modules
echo ""

step 1 "Project setup"
if gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1; then
  echo "  Project ${PROJECT_ID} exists."
else
  echo "  Creating project ${PROJECT_ID}..."
  gcloud projects create "$PROJECT_ID" --name="Storybook AI"
fi
gcloud config set project "$PROJECT_ID" >/dev/null
echo "  Active project: ${PROJECT_ID}"
echo ""

step 2 "Billing"
ensure_billing_account
echo ""

step 3 "Enable APIs"
echo "  Enabling required APIs..."
gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  iam.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com \
  sqladmin.googleapis.com \
  storage.googleapis.com \
  --project="$PROJECT_ID"
echo "  APIs enabled."
echo ""

step 4 "GCS bucket"
if gcloud storage buckets describe "gs://${BUCKET}" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "  Bucket gs://${BUCKET} exists."
else
  echo "  Creating bucket gs://${BUCKET}..."
  gcloud storage buckets create "gs://${BUCKET}" \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --uniform-bucket-level-access
fi
if gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member=allUsers \
  --role=roles/storage.objectViewer \
  --quiet >/dev/null 2>&1; then
  echo "  Public read access ensured for generated assets."
else
  echo "  Failed to grant public read access to gs://${BUCKET}."
  echo "  This app currently serves generated media from public GCS URLs."
  exit 1
fi
echo ""

step 5 "Runtime service account"
ensure_runtime_service_account
echo "  Granting Secret Manager access..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet >/dev/null
echo "  Granting Cloud SQL access..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/cloudsql.client" \
  --quiet >/dev/null
echo "  Granting GCS write access..."
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member="serviceAccount:${RUNTIME_SERVICE_ACCOUNT_EMAIL}" \
  --role=roles/storage.objectAdmin \
  --quiet >/dev/null
echo ""

step 6 "Cloud SQL"
DB_PASSWORD=""
if gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "  SQL instance ${SQL_INSTANCE} exists."
else
  ensure_sql_authorized_network
  DB_PASSWORD="$(openssl rand -hex 16)"
  echo "  Creating Cloud SQL instance ${SQL_INSTANCE} (tier: ${SQL_TIER})..."
  echo "  This can take several minutes."
  gcloud sql instances create "$SQL_INSTANCE" \
    --project="$PROJECT_ID" \
    --database-version=POSTGRES_15 \
    --tier="$SQL_TIER" \
    --region="$REGION" \
    --storage-size=10GB \
    --storage-type=HDD \
    --assign-ip \
    --authorized-networks="$SQL_AUTHORIZED_NETWORK" \
    --root-password="$DB_PASSWORD"
fi

SQL_PUBLIC_IP="$(
  gcloud sql instances describe "$SQL_INSTANCE" \
    --project="$PROJECT_ID" \
    --format='value(ipAddresses[0].ipAddress)'
)"
if [[ -z "$SQL_PUBLIC_IP" ]]; then
  echo "  SQL instance has no public IP; enabling one for local Prisma schema access..."
  gcloud sql instances patch "$SQL_INSTANCE" \
    --project="$PROJECT_ID" \
    --assign-ip \
    --quiet
  SQL_PUBLIC_IP="$(
    gcloud sql instances describe "$SQL_INSTANCE" \
      --project="$PROJECT_ID" \
      --format='value(ipAddresses[0].ipAddress)'
  )"
fi
if [[ -z "$SQL_PUBLIC_IP" ]]; then
  echo "Could not determine a Cloud SQL public IP address." >&2
  exit 1
fi

ensure_sql_authorized_network

if [[ -z "$DB_PASSWORD" ]] && gcloud secrets describe database-url --project="$PROJECT_ID" >/dev/null 2>&1; then
  EXISTING_DB_URL="$(gcloud secrets versions access latest --secret=database-url --project="$PROJECT_ID")"
  DB_PASSWORD="$(extract_db_password_from_url "$EXISTING_DB_URL")"
  SECRET_DB_NAME="$(extract_db_name_from_url "$EXISTING_DB_URL")"
  if [[ -n "$SECRET_DB_NAME" ]]; then
    DB_NAME="$SECRET_DB_NAME"
  fi
fi

if [[ -z "$DB_PASSWORD" ]]; then
  DB_PASSWORD="$(openssl rand -hex 16)"
  echo "  Resetting postgres password so onboarding can manage DATABASE_URL..."
  gcloud sql users set-password postgres \
    --project="$PROJECT_ID" \
    --instance="$SQL_INSTANCE" \
    --password="$DB_PASSWORD"
fi

if gcloud sql databases describe "$DB_NAME" --instance="$SQL_INSTANCE" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "  Database ${DB_NAME} exists."
else
  echo "  Creating database ${DB_NAME}..."
  gcloud sql databases create "$DB_NAME" \
    --project="$PROJECT_ID" \
    --instance="$SQL_INSTANCE"
fi

INSTANCE_CONNECTION_NAME="$(
  gcloud sql instances describe "$SQL_INSTANCE" \
    --project="$PROJECT_ID" \
    --format='value(connectionName)'
)"
ADMIN_DATABASE_URL="postgresql://postgres:${DB_PASSWORD}@${SQL_PUBLIC_IP}:5432/${DB_NAME}"
RUNTIME_DATABASE_URL="postgresql://postgres:${DB_PASSWORD}@localhost:5432/${DB_NAME}?host=/cloudsql/${INSTANCE_CONNECTION_NAME}"

echo "  Storing database-url secret for Cloud Run..."
upsert_secret database-url "$RUNTIME_DATABASE_URL" >/dev/null

echo "  Pushing Prisma schema..."
DATABASE_URL="$ADMIN_DATABASE_URL" npx prisma db push
echo "  Schema pushed."
echo ""

step 7 "Artifact Registry"
if gcloud artifacts repositories describe "$AR_REPO" \
  --project="$PROJECT_ID" \
  --location="$REGION" >/dev/null 2>&1; then
  echo "  Repo ${AR_REPO} exists."
else
  echo "  Creating Artifact Registry repo ${AR_REPO}..."
  gcloud artifacts repositories create "$AR_REPO" \
    --project="$PROJECT_ID" \
    --repository-format=docker \
    --location="$REGION"
fi
echo ""

step 8 "Secrets and runtime config"
GEMINI_API_KEY_VALUE="$(resolve_value GEMINI_API_KEY)"
if is_placeholder_value "$GEMINI_API_KEY_VALUE"; then
  echo "  GEMINI_API_KEY is required."
  echo "  Set it in ${ENV_FILE} or export GEMINI_API_KEY before rerunning."
  exit 1
fi
upsert_secret gemini-api-key "$GEMINI_API_KEY_VALUE" >/dev/null
echo "  Stored gemini-api-key."

ELEVENLABS_API_KEY_VALUE="$(resolve_value ELEVENLABS_API_KEY)"
if ! is_placeholder_value "$ELEVENLABS_API_KEY_VALUE"; then
  upsert_secret elevenlabs-api-key "$ELEVENLABS_API_KEY_VALUE" >/dev/null
  echo "  Stored elevenlabs-api-key."
fi

BANANA_API_KEY_VALUE="$(resolve_value BANANA_API_KEY)"
if ! is_placeholder_value "$BANANA_API_KEY_VALUE"; then
  upsert_secret banana-api-key "$BANANA_API_KEY_VALUE" >/dev/null
  echo "  Stored banana-api-key."
fi

BANANA_MODEL_KEY_VALUE="$(resolve_value BANANA_MODEL_KEY)"
if ! is_placeholder_value "$BANANA_MODEL_KEY_VALUE"; then
  upsert_secret banana-model-key "$BANANA_MODEL_KEY_VALUE" >/dev/null
  echo "  Stored banana-model-key."
fi

INVITE_CODE_VALUE="$(resolve_value INVITE_CODE)"
if ! is_placeholder_value "$INVITE_CODE_VALUE"; then
  upsert_secret invite-code "$INVITE_CODE_VALUE" >/dev/null
  echo "  Stored invite-code."
fi

BYOK_ENCRYPTION_KEY_VALUE="$(resolve_value BYOK_ENCRYPTION_KEY)"
if is_placeholder_value "$BYOK_ENCRYPTION_KEY_VALUE"; then
  BYOK_ENCRYPTION_KEY_VALUE="$(openssl rand -hex 32)"
fi
upsert_secret byok-encryption-key "$BYOK_ENCRYPTION_KEY_VALUE" >/dev/null
echo "  Stored byok-encryption-key."

ENV_VARS="NODE_ENV=production,GCS_BUCKET=${BUCKET}"
for key in \
  GEMINI_TEXT_MODEL \
  GEMINI_IMAGE_MODEL \
  GEMINI_STT_MODEL \
  GEMINI_TTS_VOICE \
  ELEVENLABS_MODEL_ID \
  ELEVENLABS_CONCURRENCY \
  ELEVENLABS_SPEED \
  ELEVENLABS_STABILITY \
  ELEVENLABS_STYLE \
  BANANA_API_URL \
  FFMPEG_THREADS \
  FFMPEG_X264_PRESET \
  FFMPEG_SUBTITLE_X264_PRESET \
  FFMPEG_CRF \
  FFMPEG_AUDIO_BITRATE \
  SUBTITLE_FONT_NAME \
  SUBTITLE_FONT_PATH; do
  value="$(resolve_value "$key")"
  if [[ -n "$value" ]] && ! is_placeholder_value "$value"; then
    ENV_VARS="${ENV_VARS},${key}=${value}"
  fi
done

SECRETS_FLAG="GEMINI_API_KEY=gemini-api-key:latest,DATABASE_URL=database-url:latest,BYOK_ENCRYPTION_KEY=byok-encryption-key:latest"
if gcloud secrets describe elevenlabs-api-key --project="$PROJECT_ID" >/dev/null 2>&1; then
  SECRETS_FLAG="${SECRETS_FLAG},ELEVENLABS_API_KEY=elevenlabs-api-key:latest"
fi
if gcloud secrets describe banana-api-key --project="$PROJECT_ID" >/dev/null 2>&1; then
  SECRETS_FLAG="${SECRETS_FLAG},BANANA_API_KEY=banana-api-key:latest"
fi
if gcloud secrets describe banana-model-key --project="$PROJECT_ID" >/dev/null 2>&1; then
  SECRETS_FLAG="${SECRETS_FLAG},BANANA_MODEL_KEY=banana-model-key:latest"
fi
if gcloud secrets describe invite-code --project="$PROJECT_ID" >/dev/null 2>&1; then
  SECRETS_FLAG="${SECRETS_FLAG},INVITE_CODE=invite-code:latest"
fi
echo ""

step 9 "Build Docker image"
echo "  Image:  ${IMAGE}"
echo "  Latest: ${IMAGE_LATEST}"
if [[ "$FORCE_BUILD" != "true" ]] && gcloud artifacts docker images describe "$IMAGE" \
  --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "  Image already exists, skipping build."
  echo "  To force rebuild: FORCE_BUILD=true ./onboard.sh"
else
  echo "  Building with Cloud Build..."
  gcloud builds submit \
    --project="$PROJECT_ID" \
    --tag="$IMAGE" \
    .
fi
gcloud artifacts docker tags add \
  "$IMAGE" \
  "$IMAGE_LATEST" \
  --project="$PROJECT_ID" \
  --quiet
echo "  Latest tag updated."
echo ""

step 10 "Deploy to Cloud Run"
gcloud run deploy "$SERVICE_NAME" \
  --project="$PROJECT_ID" \
  --image="$IMAGE" \
  --region="$REGION" \
  --allow-unauthenticated \
  --execution-environment=gen2 \
  --service-account="$RUNTIME_SERVICE_ACCOUNT_EMAIL" \
  --set-cloudsql-instances="$INSTANCE_CONNECTION_NAME" \
  --memory="$RUN_MEMORY" \
  --cpu="$RUN_CPU" \
  --timeout="$RUN_TIMEOUT" \
  --concurrency="$RUN_CONCURRENCY" \
  --min-instances="$RUN_MIN_INSTANCES" \
  --max-instances="$RUN_MAX_INSTANCES" \
  --port=8080 \
  --set-secrets="$SECRETS_FLAG" \
  --set-env-vars="$ENV_VARS"
echo "  Cloud Run deployment finished."
echo ""

step 11 "Post-deploy config"
SERVICE_URL="$(
  gcloud run services describe "$SERVICE_NAME" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --format='value(status.url)'
)"
echo "  Service URL: ${SERVICE_URL}"
echo "  Updating NEXT_PUBLIC_BASE_URL..."
gcloud run services update "$SERVICE_NAME" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --update-env-vars="NEXT_PUBLIC_BASE_URL=${SERVICE_URL}" >/dev/null
echo ""

step 12 "Verify"
HEALTH_URL="${SERVICE_URL}/api/health"
HEALTH_BODY="$(curl -fsSL "$HEALTH_URL" || true)"
if printf '%s' "$HEALTH_BODY" | grep -q '"ready":true'; then
  echo "  Health check passed at ${HEALTH_URL}."
else
  echo "  Health check did not return ready=true."
  echo "  Logs:"
  echo "    gcloud run services logs read ${SERVICE_NAME} --project=${PROJECT_ID} --region=${REGION}"
  exit 1
fi
echo ""

echo "Onboarding complete."
echo "  URL:       ${SERVICE_URL}"
echo "  Redeploy:  ./redeploy.sh"
echo "  Logs:      gcloud run services logs read ${SERVICE_NAME} --project=${PROJECT_ID} --region=${REGION}"
