/**
 * Bounty System Infrastructure
 *
 * Provisions:
 * - Cloud Storage bucket for recordings and proofs
 * - IAM policies for service accounts
 */

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  # Uncomment to use remote state
  # backend "gcs" {
  #   bucket = "bounty-system-tfstate"
  #   prefix = "terraform/state"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

variable "project_id" {
  description = "GCP project ID"
  type        = string
  default     = "bounty-system-prod"
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment (prod, staging, dev)"
  type        = string
  default     = "prod"
}

# =============================================================================
# Cloud Storage - Proof Recordings Bucket
# =============================================================================

resource "google_storage_bucket" "proofs" {
  name          = "${var.project_id}-proofs"
  location      = var.region
  force_destroy = false

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      age = 365 # Archive after 1 year
    }
    action {
      type          = "SetStorageClass"
      storage_class = "ARCHIVE"
    }
  }

  lifecycle_rule {
    condition {
      num_newer_versions = 3
    }
    action {
      type = "Delete"
    }
  }

  cors {
    origin          = ["*"]
    method          = ["GET", "HEAD"]
    response_header = ["Content-Type"]
    max_age_seconds = 3600
  }

  labels = {
    environment = var.environment
    managed_by  = "terraform"
    service     = "bounty-system"
  }
}

# Public access for proof recordings (read-only)
resource "google_storage_bucket_iam_member" "public_read" {
  bucket = google_storage_bucket.proofs.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"

  # Only public folder is publicly readable
  condition {
    title       = "public_folder_only"
    description = "Only allow public access to /public/ folder"
    expression  = "resource.name.startsWith(\"projects/_/buckets/${google_storage_bucket.proofs.name}/objects/public/\")"
  }
}

# =============================================================================
# Service Account for CLI
# =============================================================================

resource "google_service_account" "cli" {
  account_id   = "bounty-cli"
  display_name = "Bounty CLI Service Account"
  description  = "Service account for bounty CLI tool"
}

resource "google_project_iam_member" "cli_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.cli.email}"
}

resource "google_storage_bucket_iam_member" "cli_storage" {
  bucket = google_storage_bucket.proofs.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.cli.email}"
}

# =============================================================================
# Cloud Function - GitHub Webhook
# =============================================================================

resource "google_storage_bucket" "functions" {
  name          = "${var.project_id}-functions"
  location      = var.region
  force_destroy = true

  uniform_bucket_level_access = true

  labels = {
    environment = var.environment
    managed_by  = "terraform"
  }
}

resource "google_service_account" "webhook" {
  account_id   = "bounty-webhook"
  display_name = "Bounty Webhook Function"
  description  = "Service account for GitHub webhook Cloud Function"
}

resource "google_project_iam_member" "webhook_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.webhook.email}"
}

resource "google_secret_manager_secret" "webhook_secret" {
  secret_id = "github-webhook-secret"

  replication {
    auto {}
  }

  labels = {
    environment = var.environment
    service     = "bounty-system"
  }
}

resource "google_secret_manager_secret_iam_member" "webhook_access" {
  secret_id = google_secret_manager_secret.webhook_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.webhook.email}"
}

# Note: Cloud Function deployment is done via gcloud CLI
# Use: npm run deploy in services/functions/

# =============================================================================
# Outputs
# =============================================================================

output "proof_bucket" {
  description = "GCS bucket for proof recordings"
  value       = "gs://${google_storage_bucket.proofs.name}"
}

output "proof_bucket_url" {
  description = "Public URL for proof recordings"
  value       = "https://storage.googleapis.com/${google_storage_bucket.proofs.name}"
}

output "cli_service_account" {
  description = "Service account email for CLI"
  value       = google_service_account.cli.email
}

output "webhook_service_account" {
  description = "Service account email for webhook function"
  value       = google_service_account.webhook.email
}

output "webhook_secret_name" {
  description = "Secret Manager secret name for webhook"
  value       = google_secret_manager_secret.webhook_secret.name
}
