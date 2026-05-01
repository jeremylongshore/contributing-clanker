# Master Contribution Dev Plan (Multi-Site, Portal, Proof-of-Work) — Enhanced

## 1) Outcome

You will have one scalable "Contribution + Rewards + Proof-of-Work" system that:
- Runs a private portal/dashboard you can log into
- Publishes polished, public progress (what's been done) using bounty rewards as the narrative + metrics
- Integrates cleanly into three existing websites:
  - startaitools.io
  - intentsolutions.io
  - jeremylongshore.com

## 2) Key Product Surfaces

### A) Public "Proof" widgets (home page ready)

Each site gets a fast-loading widget (or section) showing:
- Total bounties completed (rolling)
- Total rewards paid/earned (optional public/private toggle)
- Recent wins (last 5–10 completed items)
- Leaderboard highlights (optional)
- Links to "Proof Wall" (public) + "Portal" (private)

**Implementation detail:**
- Render via static JSON (cached) + edge/CDN delivery so home pages stay fast.

### B) Public "Proof Wall" (polished accomplishments)

A dedicated page that looks like a product showcase, not a spreadsheet:
- "Shipped" timeline (bounties completed → outcomes → evidence)
- Changelog-style summaries (what changed, why it matters)
- Impact metrics (time saved, bugs reduced, revenue influenced, deployments, etc.)
- Evidence bundles (PR links, screenshots, Lighthouse results, release tags)

### C) Private Portal (login + dashboard)

A real portal with roles:
- Owner/Admin (you)
- Maintainer/Reviewer
- Contributor
- Viewer/Client (optional)

**Core portal pages:**
- Overview (your stats on home)
- Bounty Board (open, claimed, in review, shipped)
- Claims & Submissions
- Rewards/Payouts
- Review Queue
- Audit Log
- Settings (org/site configuration)

## 3) Multi-Site Integration Strategy (No duct tape)

### Single codebase, multi-domain, brand-aware

Use one web app that can serve all three domains with theming + content driven by the incoming host.

**Recommended approach:**
- Host the portal + proof pages as a single Next.js app on Firebase Hosting (or Cloud Run behind Firebase Hosting).
- Map each domain to routes such as:
  - https://intentsolutions.io/proof
  - https://intentsolutions.io/portal
  - https://startaitools.io/proof
  - https://startaitools.io/portal
  - https://jeremylongshore.com/proof
  - https://jeremylongshore.com/portal

**Why this works:**
- Looks native (same domain)
- SEO and analytics remain per-site
- Shared backend, shared auth, shared data model
- Easy to evolve without maintaining 3 portals

**Alternative (only if needed):**
- Subdomains like portal.intentsolutions.io + proof.intentsolutions.io (cleaner separation, slightly simpler DNS/caching).

## 4) Identity, Access, and "One Login Everywhere"

### Auth

Use Firebase Auth / Google Identity Platform for:
- Email magic link
- Google login
- GitHub login (useful for contributors)

### Roles & org membership

Store roles in Firestore + enforce via:
- Custom claims (for stable role checks)
- Server-side authorization in Cloud Run APIs
- Per-org membership so you can optionally run separate bounty programs under one umbrella

## 5) Core Data Model (Firestore)

**Collections (illustrative):**
- `orgs/{orgId}`
- `sites/{siteId}` (maps hostnames to org + branding + feature flags)
- `users/{userId}` (profile + org memberships)
- `bounties/{bountyId}` (status, scope, reward, acceptance criteria)
- `claims/{claimId}` (who claimed what, timestamps, state)
- `submissions/{submissionId}` (PR links, evidence bundle, reviewer notes)
- `rewards/{rewardId}` (amount, type, payout status, invoice refs)
- `stats_snapshots/{snapshotId}` (precomputed aggregates for widgets)
- `audit_events/{eventId}` (security + compliance trail)

## 6) Backend Architecture (GCP-native, scalable)

### APIs
- Cloud Run service: `contribute-api`
  - CRUD for bounties, claims, submissions, rewards
  - Role-based access enforcement
  - Generates "Proof" feeds and widgets JSON

### Eventing / automation (GCP-native)
- Firestore → event triggers (or Eventarc) to enqueue work
- Cloud Tasks for durable background jobs:
  - recompute stats snapshots
  - send notifications
  - verify PR evidence links
  - generate "Proof Wall" artifacts

### Storage
- Firestore for transactional program data
- Cloud Storage for evidence bundles (images, pdfs, reports)
- Optional BigQuery for long-term analytics and trend reporting

## 7) "Polished Proof" System (what you asked for)

This is the part that makes it look finished and credible.

### Proof artifacts generated per completed bounty

On completion, generate a public-facing card:
- Title + short outcome statement
- Before/after metrics (if available)
- Evidence links (PR, release, screenshot, test report)
- Tags (stack, site, area: UI/infra/content/etc.)
- Timestamp + contributor attribution (optional)

### Curated rollups
- Weekly "Ship Log"
- Monthly "Impact Report"
- Milestones (10 shipped, 25 shipped, 100 shipped)
- "Top Wins" pinned list for each site

### Home page stats

Home pages should show cached aggregates:
- "Bounties shipped this month"
- "Total shipped"
- "Active contributors"
- "Avg time-to-ship"
- "Quality rate" (e.g., % merged with all checks passing)

## 8) CI/CD and Environments

### Environments
- dev (fast iteration)
- staging (prod-like, review)
- prod (live)

### Delivery pipeline
- GitHub Actions → deploy via Workload Identity Federation
- Firebase Hosting deploy for the web
- Cloud Run deploy for APIs/workers
- Required tests run before deploy (unit + integration + e2e)

## 9) Security & Reliability Baseline

- Principle of least privilege IAM (separate SAs per service)
- Secrets in Secret Manager
- Rate limiting on API endpoints
- Structured logging + Cloud Monitoring alerts
- Audit log for all admin actions
- Backups/retention for Firestore + Storage
- CSP + secure headers for portal pages

---

# Addendum A — Strict AI Agent Contribution Policy (Issue-First, Human-Gated PRs)

## A1) Non-Negotiable Rule

The AI agent must never create or submit a Pull Request that can be merged without explicit human approval.
Enforcement is both process (workflow gates) and platform (GitHub protections).

## A2) GitHub Enforcement Mechanisms (Hard Gates)

### 1) Branch protections / rulesets

Configure repo rules so merges are impossible unless requirements are met:
- Require pull request reviews before merge
- Require status checks to pass before merge
- Optional: require conversation resolution before merge
- Optional: require merge queue (serializes merges, prevents "green then red")

### 2) CODEOWNERS + required code owner review

Use CODEOWNERS and require code owner review so protected areas always need a human sign-off.

### 3) Draft PRs only (agent behavior constraint)

The agent may open draft PRs only, or open PRs that are automatically labeled:
- `needs-human-approval`
- `agent-generated`

...and cannot transition out of draft without a human.

## A3) Issue-First Workflow (Agent Operating Lifecycle)

### Step 0 — Read contributor guidelines first

Before doing anything repo-specific, the agent must:
- Read CONTRIBUTING.md
- Read README.md
- Read SECURITY.md (if present)
- Read .github/workflows/*
- Read PR template / issue template
- Summarize constraints back into the issue thread

If any of these are missing, the agent must open an issue: "Missing contributor guidelines / lifecycle docs" and stop.

### Step 1 — Agent opens an Issue (not a PR)

Issue contains:
- Problem statement
- Proposed approach
- Risks + rollback plan
- Test plan
- Acceptance criteria
- Evidence plan (what artifacts will prove success)

### Step 2 — Human "Approval Claim"

Human approves by applying one of:
- a label: `approved-to-implement`
- or a comment command: `/approve` (ChatOps)
- or checking an "Approval" box in the issue template

No approval = no implementation.

### Step 3 — Agent implementation (branch allowed, PR not mergeable)

Agent can:
- create a branch
- commit changes
- run tests
- post logs/artifacts back to issue

### Step 4 — Agent opens a draft PR (or PR with hard block)

PR must:
- link the issue (e.g., "Fixes #123" or "Refs #123")
- include checklist: tests, lint, e2e, security scan
- attach evidence links (CI run, screenshots, etc.)
- remain draft until human review starts

### Step 5 — CI/CD lifecycle must be documented and executed

Agent must ensure:
- All required checks are defined in workflows
- All required checks are enforced by rulesets/branch protection
- The PR includes a "How to validate" section
- The PR cannot merge unless checks pass

### Step 6 — Human review and merge

Only humans can:
- mark PR "ready for review"
- approve PR
- merge PR

## A4) Policy Automation (Optional but recommended)

Add a GitHub Action that fails PR checks if:
- PR is missing an issue link
- PR lacks "Test Plan" section
- PR lacks required labels
- PR was opened by the agent and is not draft

Result: even if the agent slips, the platform says "no."

## A5) Documentation Requirements (Must exist, or agent must create issues to add them)

- CONTRIBUTING.md (workflow rules)
- SECURITY.md
- PR template with checklists
- Issue template that includes Approval Claim
- Definition of Done (DoD) + CI requirements
- Release procedure (if applicable)

---

## Enhancement Notes Added (without changing prior intent)

- Multi-domain, same-domain portal routes (/portal, /proof) per site
- Cached "Proof Widgets" for homepage stats
- Proof Wall artifacts with evidence bundles
- GCP-native eventing (Cloud Tasks/Eventarc) to avoid external workflow dependencies
- Hard GitHub enforcement so "agent can't merge itself into prod," even on its best day
