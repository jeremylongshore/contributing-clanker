#!/bin/bash
# Setup IAM for Bounty Orchestrator Agent Engine Deployment
#
# This script configures the required IAM roles for:
# 1. Deployment Principal (CI/CD via GitHub Actions with WIF)
# 2. Runtime Identity (Agent Service Account for deployed agent)
#
# Prerequisites:
# - gcloud CLI authenticated with Owner/IAM Admin permissions
# - Project intentional-bounty exists
# - Workload Identity Federation pool configured

set -e

PROJECT_ID="${PROJECT_ID:-intentional-bounty}"
REGION="${REGION:-us-central1}"

echo "Configuring IAM for Bounty Orchestrator"
echo "  Project: $PROJECT_ID"
echo "  Region: $REGION"
echo ""

# ============================================
# 1. Create Staging Bucket (required for deployment)
# ============================================
echo "1. Creating staging bucket..."
STAGING_BUCKET="gs://${PROJECT_ID}-staging"

if gsutil ls "$STAGING_BUCKET" 2>/dev/null; then
    echo "   Bucket already exists: $STAGING_BUCKET"
else
    gsutil mb -p "$PROJECT_ID" -l "$REGION" "$STAGING_BUCKET"
    echo "   Created: $STAGING_BUCKET"
fi

# ============================================
# 2. Create Runtime Service Account (Agent SA)
# ============================================
echo ""
echo "2. Creating runtime service account..."
AGENT_SA="bounty-agent"
AGENT_SA_EMAIL="${AGENT_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

if gcloud iam service-accounts describe "$AGENT_SA_EMAIL" --project="$PROJECT_ID" 2>/dev/null; then
    echo "   Service account already exists: $AGENT_SA_EMAIL"
else
    gcloud iam service-accounts create "$AGENT_SA" \
        --display-name="Bounty Orchestrator Agent" \
        --description="Runtime identity for bounty-orchestrator in Agent Engine" \
        --project="$PROJECT_ID"
    echo "   Created: $AGENT_SA_EMAIL"
fi

# ============================================
# 3. Grant Roles to Runtime SA
# ============================================
echo ""
echo "3. Granting roles to runtime service account..."

# Vertex AI access (for LLM calls and Agent Engine runtime)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$AGENT_SA_EMAIL" \
    --role="roles/aiplatform.user" \
    --condition=None --quiet
echo "   Granted: roles/aiplatform.user"

# Storage access (for reading artifacts)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$AGENT_SA_EMAIL" \
    --role="roles/storage.objectViewer" \
    --condition=None --quiet
echo "   Granted: roles/storage.objectViewer"

# Logging (for structured logs)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$AGENT_SA_EMAIL" \
    --role="roles/logging.logWriter" \
    --condition=None --quiet
echo "   Granted: roles/logging.logWriter"

# ============================================
# 4. Create Deployer Service Account (CI/CD SA)
# ============================================
echo ""
echo "4. Creating deployer service account..."
DEPLOYER_SA="github-actions"
DEPLOYER_SA_EMAIL="${DEPLOYER_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

if gcloud iam service-accounts describe "$DEPLOYER_SA_EMAIL" --project="$PROJECT_ID" 2>/dev/null; then
    echo "   Service account already exists: $DEPLOYER_SA_EMAIL"
else
    gcloud iam service-accounts create "$DEPLOYER_SA" \
        --display-name="GitHub Actions Deployer" \
        --description="CI/CD identity for deploying via WIF" \
        --project="$PROJECT_ID"
    echo "   Created: $DEPLOYER_SA_EMAIL"
fi

# ============================================
# 5. Grant Roles to Deployer SA
# ============================================
echo ""
echo "5. Granting roles to deployer service account..."

# Vertex AI access (for creating Agent Engine deployments)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$DEPLOYER_SA_EMAIL" \
    --role="roles/aiplatform.user" \
    --condition=None --quiet
echo "   Granted: roles/aiplatform.user"

# Storage admin (for uploading to staging bucket)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$DEPLOYER_SA_EMAIL" \
    --role="roles/storage.admin" \
    --condition=None --quiet
echo "   Granted: roles/storage.admin"

# Service Account User (to specify runtime SA during deployment)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$DEPLOYER_SA_EMAIL" \
    --role="roles/iam.serviceAccountUser" \
    --condition=None --quiet
echo "   Granted: roles/iam.serviceAccountUser"

# ============================================
# 6. Configure Workload Identity Federation (WIF)
# ============================================
echo ""
echo "6. Checking Workload Identity Federation..."

WIF_POOL_NAME="github-actions-pool"
WIF_PROVIDER_NAME="github-provider"
GITHUB_REPO="jeremylongworthy/bounty-system"  # Update with actual repo

# Check if pool exists
if gcloud iam workload-identity-pools describe "$WIF_POOL_NAME" \
    --location="global" --project="$PROJECT_ID" 2>/dev/null; then
    echo "   WIF pool exists: $WIF_POOL_NAME"
else
    echo "   Creating WIF pool..."
    gcloud iam workload-identity-pools create "$WIF_POOL_NAME" \
        --location="global" \
        --display-name="GitHub Actions Pool" \
        --project="$PROJECT_ID"
fi

# Check if provider exists
if gcloud iam workload-identity-pools providers describe "$WIF_PROVIDER_NAME" \
    --workload-identity-pool="$WIF_POOL_NAME" \
    --location="global" --project="$PROJECT_ID" 2>/dev/null; then
    echo "   WIF provider exists: $WIF_PROVIDER_NAME"
else
    echo "   Creating WIF provider..."
    gcloud iam workload-identity-pools providers create-oidc "$WIF_PROVIDER_NAME" \
        --workload-identity-pool="$WIF_POOL_NAME" \
        --location="global" \
        --issuer-uri="https://token.actions.githubusercontent.com" \
        --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
        --project="$PROJECT_ID"
fi

# Get the WIF provider resource name
WIF_PROVIDER_RESOURCE=$(gcloud iam workload-identity-pools providers describe "$WIF_PROVIDER_NAME" \
    --workload-identity-pool="$WIF_POOL_NAME" \
    --location="global" \
    --project="$PROJECT_ID" \
    --format="value(name)")

# Allow GitHub Actions to impersonate the deployer SA
echo "   Binding WIF to deployer SA..."
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_SA_EMAIL" \
    --project="$PROJECT_ID" \
    --role="roles/iam.workloadIdentityUser" \
    --member="principalSet://iam.googleapis.com/${WIF_PROVIDER_RESOURCE}/attribute.repository/${GITHUB_REPO}" \
    --condition=None --quiet
echo "   Bound GitHub repo to deployer SA"

# ============================================
# Summary
# ============================================
echo ""
echo "============================================"
echo "IAM CONFIGURATION COMPLETE"
echo "============================================"
echo ""
echo "Runtime Service Account:"
echo "  Email: $AGENT_SA_EMAIL"
echo "  Roles: aiplatform.user, storage.objectViewer, logging.logWriter"
echo ""
echo "Deployer Service Account:"
echo "  Email: $DEPLOYER_SA_EMAIL"
echo "  Roles: aiplatform.user, storage.admin, iam.serviceAccountUser"
echo ""
echo "Workload Identity Federation:"
echo "  Pool: $WIF_POOL_NAME"
echo "  Provider: $WIF_PROVIDER_NAME"
echo "  Bound repo: $GITHUB_REPO"
echo ""
echo "GitHub Secrets to configure:"
echo "  WIF_PROVIDER: $WIF_PROVIDER_RESOURCE"
echo "  WIF_SERVICE_ACCOUNT: $DEPLOYER_SA_EMAIL"
echo ""
echo "Staging Bucket:"
echo "  $STAGING_BUCKET"
echo ""
