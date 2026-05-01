# Phase 7 Infrastructure Cutover Runbook

**Status**: staged in repo, NOT executed in GCP yet.

This runbook tracks the manual GCP/Firebase ops that need to run by hand to complete the rebrand from `bounty-system` to `contribute-system`. Code-level config changes are already merged. Data migration, bucket migration, and Cloud Run service cutover require human-supervised execution.

GCP project ID `intentional-bounty` is intentionally **unchanged** (shared across IS repos — not worth the migration cost).

## 1. Cloud Run / Firebase service cutover

**Old service:** `bounty-dashboard` (Cloud Run, us-central1)
**New service:** `contributions-dashboard`

`contribute-system/firebase.json` and `.github/workflows/deploy-dashboard.yml` already point at the new `serviceId`. Pushing to master will create the new service — old one will keep serving traffic until DNS / Firebase Hosting flips.

Steps:

```bash
# Verify the workflow file
grep SERVICE_NAME .github/workflows/deploy-dashboard.yml
# Should show: SERVICE_NAME: contributions-dashboard

# Push a master commit to trigger deployment of the new service
git push origin master

# After workflow succeeds, verify new service is live
gcloud run services describe contributions-dashboard --region=us-central1 \
  --project=intentional-bounty --format="value(status.url)"

# Smoke-test the new URL
curl -fsS "$(gcloud run services describe contributions-dashboard --region=us-central1 --project=intentional-bounty --format='value(status.url)')"

# When confident the new service is healthy AND data migration is done (see §2 below):
gcloud run services delete bounty-dashboard --region=us-central1 \
  --project=intentional-bounty --quiet
```

## 2. Firestore data migration: `bounties` → `contributions`

Migration script: `contribute-system/scripts/migrate-firestore.ts`

Steps:

```bash
cd contribute-system
# Ensure the script's dependencies are installed
pnpm install

# Authenticate (need datastore.user role on intentional-bounty)
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
export GOOGLE_CLOUD_PROJECT=intentional-bounty

# Dry-run first
pnpm tsx scripts/migrate-firestore.ts --dry-run

# Live copy (does NOT delete source yet)
pnpm tsx scripts/migrate-firestore.ts

# Verify in console + dashboard
# https://console.firebase.google.com/project/intentional-bounty/firestore/data/contributions

# Deploy updated rules + indexes
firebase deploy --only firestore --project=intentional-bounty

# After ≥1 week of soak with no issues, delete the old collection
pnpm tsx scripts/migrate-firestore.ts --delete-source
```

**Rollback**: while both collections exist (≤1 week window), revert the dashboard to read from `bounties` by reverting the `COLLECTIONS.CONTRIBUTIONS` constant in `packages/core/src/index.ts` and redeploying. After `--delete-source` runs, rollback requires restoring from a Firestore backup.

## 3. GCS bucket migration: `bounty-proofs` → `contribution-proofs`

Steps:

```bash
# Create new bucket (same region as the old one)
gsutil mb -l us-central1 -p intentional-bounty gs://contribution-proofs

# Set lifecycle / IAM to match the old bucket
gsutil iam get gs://bounty-proofs > /tmp/old-iam.json
gsutil iam set /tmp/old-iam.json gs://contribution-proofs

# Sync existing objects (idempotent — re-runnable as long as old bucket exists)
gsutil -m rsync -r gs://bounty-proofs gs://contribution-proofs

# Tell every active user / CI environment to update their CLI config
contribute config set proofBucket gs://contribution-proofs

# After ≥1 week soak, delete the old bucket
gsutil -m rm -r gs://bounty-proofs
gsutil rb gs://bounty-proofs
```

The `contribute` CLI does NOT hardcode a bucket name — `proofBucket` is a runtime config value (see `packages/cli/src/lib/recorder.ts`). So no code redeploy is needed; users just `contribute config set` to point to the new bucket.

## 4. Verification checklist (post-cutover)

- [ ] `gcloud run services list --project=intentional-bounty` shows `contributions-dashboard` healthy
- [ ] Dashboard at the Firebase Hosting URL renders the contributions collection (not the bounties one)
- [ ] `firebase firestore:databases:list` confirms `contributions` indexes are built
- [ ] `gsutil ls gs://contribution-proofs/**` shows expected object count (compare to `gsutil ls gs://bounty-proofs/**`)
- [ ] At least one new `contribute work start … work stop` cycle uploads successfully to the new bucket
- [ ] CLI users have updated `contribute config set proofBucket gs://contribution-proofs`

## 5. Cleanup (after ≥1 week soak)

- [ ] `pnpm tsx scripts/migrate-firestore.ts --delete-source` (drops the legacy `bounties` collection)
- [ ] `gsutil rb gs://bounty-proofs`
- [ ] `gcloud run services delete bounty-dashboard --region=us-central1`
- [ ] Delete this runbook (or move to 067-archive/ in the master meta-repo)

---

**Owner**: Jeremy Longshore
**Created**: 2026-04-30 (alongside Phase 1-6 of bounty → contribute rebrand)
**Status**: NOT YET EXECUTED — code is rebranded, infra still on old names
