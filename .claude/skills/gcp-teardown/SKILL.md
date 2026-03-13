---
name: gcp-teardown
description: Remove GCP resources created by gcp-onboard. Confirms each deletion before proceeding. Skips resources that don't exist.
---

# GCP Teardown for Storybook AI

Remove GCP resources created during onboarding. Run each step interactively — check what exists, skip missing resources, and **always confirm before deleting**.

## Prerequisites check

```bash
gcloud config get project   # Which project are we tearing down?
```

Confirm the project with the user before proceeding.

## Step 1: Delete Cloud Run service

```bash
gcloud run services list --region=us-central1 --format="value(name)" | grep storybook
```

If found, confirm then delete:

```bash
gcloud run services delete storybook-ai --region=us-central1 --quiet
```

## Step 2: Delete Cloud SQL instance

**Warning: This destroys all data. Confirm with the user.**

```bash
gcloud sql instances list --format="value(name)" | grep storybook
```

If found, confirm then delete:

```bash
gcloud sql instances delete storybook-db --quiet
```

## Step 3: Delete Artifact Registry repository

```bash
gcloud artifacts repositories list --location=us-central1 --format="value(name)" | grep storybook
```

If found, confirm then delete:

```bash
gcloud artifacts repositories delete storybook --location=us-central1 --quiet
```

## Step 4: Delete GCS bucket

**Warning: This deletes all stored files (images, audio, etc). Confirm with the user.**

```bash
gcloud storage buckets list --format="value(name)" | grep storybook
```

If found, confirm then delete:

```bash
gcloud storage rm -r gs://storybook-ai-files
```

## Step 5: Delete secrets from Secret Manager

```bash
gcloud secrets list --format="value(name)"
```

For each secret related to this project (gemini-api-key, database-url, invite-code), confirm then delete:

```bash
gcloud secrets delete SECRET_NAME --quiet
```

## Step 6: Delete Cloud Build artifacts

Cloud Build stores source tarballs in a bucket named `PROJECT_ID_cloudbuild`. Ask the user if they want to clean this up:

```bash
gcloud storage ls gs://PROJECT_ID_cloudbuild/ 2>/dev/null
```

If found, confirm then delete:

```bash
gcloud storage rm -r gs://PROJECT_ID_cloudbuild
```

## Step 7: Disable APIs (optional)

Ask the user if they want to disable the APIs. Skip if they plan to re-use the project.

```bash
gcloud services disable \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  run.googleapis.com \
  storage.googleapis.com \
  --force
```

## Step 8: Delete project (optional)

**Warning: This is irreversible and deletes everything in the project.** Only offer if the user explicitly asks.

```bash
gcloud projects delete PROJECT_ID
```

## Summary

After teardown, list what was deleted and what was skipped/kept.
