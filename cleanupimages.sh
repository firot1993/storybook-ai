#!/bin/bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get project 2>/dev/null || true)}"
REGION="${GCP_REGION:-us-central1}"
AR_REPO="${GCP_AR_REPO:-storybook}"
PACKAGE_NAME="${GCP_IMAGE_NAME:-app}"
YES="${YES:-false}"

usage() {
  cat <<'EOF'
Usage: ./cleanupimages.sh [--yes]

Deletes old Artifact Registry container image versions for the configured app
while preserving the version currently tagged as `latest`.

Environment overrides:
  GCP_PROJECT_ID   Google Cloud project ID
  GCP_REGION       Artifact Registry region (default: us-central1)
  GCP_AR_REPO      Artifact Registry repo name (default: storybook)
  GCP_IMAGE_NAME   Image/package name (default: app)
  YES=true         Skip confirmation prompt
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -y|--yes)
      YES="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command gcloud

if [[ -z "${PROJECT_ID}" || "${PROJECT_ID}" == "(unset)" ]]; then
  echo "GCP project is not configured. Set GCP_PROJECT_ID or run: gcloud config set project <project-id>" >&2
  exit 1
fi

IMAGE_PATH="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/${PACKAGE_NAME}"

echo "▶ Artifact Registry image cleanup"
echo "  Project: ${PROJECT_ID}"
echo "  Region:  ${REGION}"
echo "  Repo:    ${AR_REPO}"
echo "  Image:   ${IMAGE_PATH}"
echo ""

latest_version_ref="$(
  gcloud artifacts tags list \
    --project="${PROJECT_ID}" \
    --location="${REGION}" \
    --repository="${AR_REPO}" \
    --package="${PACKAGE_NAME}" \
    --filter='name~"/tags/latest$"' \
    --limit=1 \
    --format='value(version)'
)"

if [[ -z "${latest_version_ref}" ]]; then
  echo "  WARNING: No \`latest\` tag found. Falling back to the most recently updated version."
  latest_version_ref="$(
    gcloud artifacts versions list \
      --project="${PROJECT_ID}" \
      --location="${REGION}" \
      --repository="${AR_REPO}" \
      --package="${PACKAGE_NAME}" \
      --sort-by='~update_time' \
      --limit=1 \
      --format='value(name)'
  )"
fi

if [[ -z "${latest_version_ref}" ]]; then
  echo "  No image versions found. Nothing to delete."
  exit 0
fi

latest_version_id="${latest_version_ref##*/}"

mapfile -t version_refs < <(
  gcloud artifacts versions list \
    --project="${PROJECT_ID}" \
    --location="${REGION}" \
    --repository="${AR_REPO}" \
    --package="${PACKAGE_NAME}" \
    --sort-by='~update_time' \
    --format='value(name)'
)

if [[ ${#version_refs[@]} -le 1 ]]; then
  echo "  Only one image version exists. Nothing to delete."
  exit 0
fi

declare -a to_delete=()
for version_ref in "${version_refs[@]}"; do
  version_id="${version_ref##*/}"
  if [[ "${version_id}" != "${latest_version_id}" ]]; then
    to_delete+=("${version_id}")
  fi
done

if [[ ${#to_delete[@]} -eq 0 ]]; then
  echo "  Nothing to delete. The latest-tagged version is already the only version."
  exit 0
fi

echo "  Keeping: ${latest_version_id}"
echo "  Deleting ${#to_delete[@]} older version(s):"
for version in "${to_delete[@]}"; do
  echo "    - ${version}"
done
echo ""

if [[ "${YES}" != "true" ]]; then
  read -r -p "Delete these old image versions? (y/N) " confirm
  if [[ ! "${confirm}" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
  fi
fi

for version in "${to_delete[@]}"; do
  echo "  Deleting ${version}..."
  gcloud artifacts versions delete "${version}" \
    --project="${PROJECT_ID}" \
    --location="${REGION}" \
    --repository="${AR_REPO}" \
    --package="${PACKAGE_NAME}" \
    --delete-tags \
    --quiet
done

echo ""
echo "✅ Cleanup complete. Preserved ${latest_version_id}."
