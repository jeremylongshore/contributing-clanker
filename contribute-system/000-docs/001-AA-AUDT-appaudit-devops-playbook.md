# Contribute System: Operator-Grade System Analysis

*For: DevOps Engineer / New Team Member*
*Generated: 2026-01-29*
*Version: 0.1.0 (commit 5a9d1a2)*

---

## 1. Executive Summary

### Business Purpose

The Contribute System is an **autonomous OSS contribution engine** designed to track, execute, and prove work on open-source bounties. It serves contributors who participate in paid contributions to projects like PostHog, Screenpipe, Cal.com, and others.

**Core Capabilities:**
- **Bounty Tracking**: Full lifecycle management from discovery → claim → work → submission → payment
- **Proof-of-Work System**: Terminal recordings via asciinema, checkpoint tracking, git statistics
- **GitHub Integration**: Auto-create bounties from labeled issues, slash commands in comments
- **AI Orchestration**: LangGraph-based workflow engine for semi-autonomous bounty execution
- **Multi-Site Dashboard**: Web portal for tracking across multiple organizations/domains

**Current Status**: Production-ready CLI with recording system (Phases 1-3 complete). Dashboard and orchestrator in active development (Phases 4-8).

**Technology Foundation**: TypeScript monorepo (pnpm + Turborepo), Firebase/Firestore backend, Python LangGraph orchestrator, Terraform IaC.

**Key Risks**:
- No CI/CD pipeline configured yet
- Dashboard API routes lack authentication middleware
- Orchestrator deployment to Vertex AI Agent Engine not yet automated

### Operational Status Matrix

| Environment | Status | Uptime Target | Release Cadence |
|-------------|--------|---------------|-----------------|
| Production (CLI) | Active | N/A (local tool) | As needed |
| Production (Firebase) | Active | 99.9% | Continuous |
| Staging | Not configured | - | - |
| Orchestrator | Development | - | - |

### Technology Stack Overview

| Category | Technology | Version | Purpose |
|----------|------------|---------|---------|
| Frontend | Next.js | 15.1.0 | Dashboard web portal |
| Frontend | React | 18.2.0 | UI components |
| Frontend | Tailwind CSS | 3.4.1 | Styling |
| Backend | Firestore | - | Document database |
| Backend | Cloud Functions | Node 20 | GitHub webhooks |
| Backend | FastAPI | 0.115+ | Orchestrator API |
| CLI | Commander | 12.0.0 | Command framework |
| CLI | Chalk/Ora/Table | Latest | Terminal UX |
| AI/ML | LangGraph | 1.0.0 | Workflow orchestration |
| AI/ML | Vertex AI | - | LLM provider |
| Infrastructure | Terraform | 1.5+ | IaC |
| Infrastructure | GCS | - | Proof storage |
| Validation | Zod | 3.22.0 | Schema validation |
| Monorepo | pnpm | 9.0.0 | Package manager |
| Monorepo | Turborepo | 2.0.0 | Build orchestration |

---

## 2. System Architecture

### Technology Stack (Detailed)

| Layer | Technology | Version | Purpose | Owner |
|-------|------------|---------|---------|-------|
| **Frontend** | Next.js 15 | 15.1.0 | App Router, RSC | Dashboard |
| **Frontend** | React 18 | 18.2.0 | UI rendering | Dashboard |
| **Frontend** | Tailwind | 3.4.1 | Utility-first CSS | Dashboard |
| **Frontend** | Lucide React | 0.312 | Icons | Dashboard |
| **Frontend** | Recharts | 2.10 | Data visualization | Dashboard |
| **Backend** | Firebase Auth | 10.7.0 | Authentication | All |
| **Backend** | Firestore | 10.7.0 | Document DB | All |
| **Backend** | Cloud Functions | Node 20 | Serverless compute | Webhooks |
| **Backend** | FastAPI | 0.115+ | REST API | Orchestrator |
| **CLI** | Commander | 12.0.0 | CLI framework | CLI |
| **CLI** | @google-cloud/firestore | 7.0.0 | DB client | CLI |
| **CLI** | @google-cloud/storage | 7.0.0 | GCS client | CLI |
| **CLI** | @octokit/rest | 20.0.0 | GitHub API | CLI |
| **Orchestrator** | LangGraph | 1.0.0 | State machines | Orchestrator |
| **Orchestrator** | langchain-google-vertexai | 3.2.1+ | Vertex AI | Orchestrator |
| **Orchestrator** | PostgreSQL + pgvector | - | Checkpointing | Orchestrator |
| **IaC** | Terraform | 1.5+ | Infrastructure | DevOps |
| **IaC** | Google Provider | 5.0 | GCP resources | DevOps |

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER INTERFACES                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────┐     ┌─────────────────┐     ┌─────────────────────┐      │
│   │  CLI Tool   │     │  Web Dashboard  │     │  GitHub Interface   │      │
│   │  (bounty)   │     │  (Next.js 15)   │     │  (Slash Commands)   │      │
│   └──────┬──────┘     └────────┬────────┘     └──────────┬──────────┘      │
│          │                     │                         │                  │
└──────────┼─────────────────────┼─────────────────────────┼──────────────────┘
           │                     │                         │
           ▼                     ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API LAYER                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐      │
│   │ Next.js API     │     │ Cloud Functions │     │ FastAPI         │      │
│   │ Routes          │     │ (Webhooks)      │     │ (Orchestrator)  │      │
│   │ /api/contribution/*   │     │ github-webhook  │     │ /api/contribution/*   │      │
│   └────────┬────────┘     └────────┬────────┘     └────────┬────────┘      │
│            │                       │                       │                │
└────────────┼───────────────────────┼───────────────────────┼────────────────┘
             │                       │                       │
             ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATA LAYER                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐      │
│   │    Firestore    │     │  Cloud Storage  │     │   PostgreSQL    │      │
│   │   (Documents)   │     │   (Recordings)  │     │  (Checkpoints)  │      │
│   │                 │     │                 │     │                 │      │
│   │ - bounties      │     │ - proofs/       │     │ - langgraph     │      │
│   │ - proofs        │     │ - sessions/     │     │   checkpoints   │      │
│   │ - sessions      │     │ - public/       │     │ - pgvector      │      │
│   │ - admins        │     │                 │     │                 │      │
│   └─────────────────┘     └─────────────────┘     └─────────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EXTERNAL SERVICES                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐      │
│   │   GitHub API    │     │   Vertex AI     │     │   Bob's Brain   │      │
│   │  (Issues, PRs)  │     │  (Gemini LLM)   │     │  (A2A Agent)    │      │
│   └─────────────────┘     └─────────────────┘     └─────────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Failure Domains

| Domain | Components | Impact if Down | Recovery |
|--------|------------|----------------|----------|
| Firebase | Auth, Firestore | All operations fail | Wait for GCP recovery |
| GCS | Proof uploads | Recordings not saved | Retry upload |
| GitHub API | Webhooks, sync | Auto-bounty creation stops | Manual creation |
| Orchestrator | AI workflows | Manual bounty execution only | Restart service |
| PostgreSQL | LangGraph state | Orchestrator workflows fail | Restart from checkpoint |

---

## 3. Directory Analysis

### Project Structure

```
contribute-system/
├── apps/
│   └── dashboard/              # Next.js 15 web portal
│       ├── src/
│       │   ├── app/            # App Router pages & API routes
│       │   │   ├── api/        # Backend API endpoints
│       │   │   │   ├── automation/
│       │   │   │   ├── bounty/
│       │   │   │   ├── discover/
│       │   │   │   ├── import/
│       │   │   │   ├── notifications/
│       │   │   │   ├── orchestrator/
│       │   │   │   └── proofs/
│       │   │   ├── dashboard/  # Protected dashboard pages
│       │   │   └── proof-wall/ # Public proof showcase
│       │   ├── components/     # React components
│       │   └── lib/            # Utilities, hooks, context
│       └── public/             # Static assets
│
├── packages/
│   ├── cli/                    # Command-line interface
│   │   └── src/
│   │       ├── commands/       # CLI command implementations
│   │       │   ├── claim.ts    # Claim/unclaim bounties
│   │       │   ├── config.ts   # Configuration management
│   │       │   ├── create.ts   # Create new bounties
│   │       │   ├── github.ts   # GitHub integration (9.4k lines)
│   │       │   ├── list.ts     # List bounties
│   │       │   ├── score.ts    # Pre-work evaluation (14k lines)
│   │       │   ├── show.ts     # Show bounty details
│   │       │   ├── submit.ts   # Submit for review (5.9k lines)
│   │       │   ├── vet.ts      # Vetting pipeline (10k lines)
│   │       │   └── work.ts     # Work sessions (13k lines)
│   │       └── lib/            # Shared utilities
│   │
│   ├── core/                   # Shared schemas (Zod)
│   │   └── src/
│   │       ├── index.ts        # Collections config, ID generation
│   │       └── schemas/        # Type definitions
│   │           ├── bounty.ts   # Bounty schema
│   │           ├── proof.ts    # Proof + vetting schemas
│   │           ├── domain.ts   # Multi-site config
│   │           └── ledger.ts   # Financial tracking
│   │
│   ├── ui/                     # Reusable UI components
│   │   └── src/                # Shared React components
│   │
│   └── vetting/                # Automated vetting pipeline
│       └── src/                # Build, lint, test automation
│
├── services/
│   ├── bounty-orchestrator/    # LangGraph workflow engine (Python)
│   │   ├── bounty_agent/
│   │   │   ├── api.py          # FastAPI endpoints
│   │   │   ├── agent.py        # LangGraph workflow
│   │   │   ├── nodes/          # Graph node implementations
│   │   │   └── knowledge/      # Learning memory
│   │   ├── deploy.py           # Vertex AI deployment
│   │   ├── main.py             # Entry point
│   │   └── requirements.txt    # Python dependencies
│   │
│   └── functions/              # Cloud Functions
│       └── src/
│           └── index.ts        # GitHub webhook handler
│
├── firestore/
│   ├── firestore.rules         # Security rules (RBAC)
│   └── firestore.indexes.json  # Database indexes
│
├── infra/
│   └── terraform/
│       └── main.tf             # GCS buckets, IAM, secrets
│
├── scripts/
│   ├── deploy-sites.sh         # Multi-site deployment
│   └── migrate-csv.ts          # CSV bounty import
│
└── config files
    ├── package.json            # Root workspace config
    ├── pnpm-workspace.yaml     # pnpm workspaces
    ├── turbo.json              # Turborepo config
    ├── firebase.json           # Firebase project config
    ├── storage.rules           # Cloud Storage rules
    └── Dockerfile              # Container build
```

### Key Directories

**apps/dashboard/src/app/api/**
- REST API endpoints for dashboard
- `/bounty/*` - Competition detection, guidelines, maintainer profiles
- `/automation/*` - Automation rules management
- `/notifications/*` - Alert preferences
- `/orchestrator/*` - Proxy to Python orchestrator
- **Gap**: No authentication middleware implemented

**packages/cli/src/commands/**
- Full bounty lifecycle management
- `work.ts` (13k lines) - Most complex, handles recording sessions
- `github.ts` (9.4k lines) - Webhook setup, sync, slash commands
- `score.ts` (14k lines) - Pre-work difficulty/risk evaluation
- `vet.ts` (10k lines) - Automated vetting pipeline

**packages/core/src/schemas/**
- Zod schemas shared across all packages
- `BountyStatus`: open → claimed → in_progress → submitted → vetting → completed → paid
- `BountySource`: github, algora, gitcoin, replit, internal, rss, webhook

**services/contribute-orchestrator/**
- Python LangGraph workflow engine
- A2A communication with Bob's Brain (Vertex AI agent)
- PostgreSQL for checkpointing (NOT in-memory MemorySaver)
- Human-in-the-loop gates for claim/submission

---

## 4. Operational Reference

### Deployment Workflows

#### Local Development

**Prerequisites:**
- Node.js >= 20.0.0
- pnpm 9.0.0
- Python >= 3.11 (for orchestrator)
- asciinema (for recordings): `pip install asciinema`
- GCP credentials: `GOOGLE_APPLICATION_CREDENTIALS`

**Setup:**
```bash
# Clone and install
git clone <repo>
cd contribute-system
pnpm install

# Build all packages
pnpm build

# Configure CLI
node packages/cli/dist/index.js config set projectId <your-gcp-project>
node packages/cli/dist/index.js config set proofBucket gs://<your-bucket>

# Run dashboard (development)
cd apps/dashboard
pnpm dev
# → http://localhost:3000

# Run orchestrator (development)
cd services/contribute-orchestrator
pip install -r requirements.txt
uvicorn main:app --reload --port 8080
```

**Verification:**
```bash
# Test CLI
node packages/cli/dist/index.js list

# Test dashboard
curl http://localhost:3000/api/contribution/competition?repo=posthog/posthog&issue=123

# Test orchestrator
curl http://localhost:8080/health
```

#### Production Deployment

**Firebase Hosting (Dashboard):**
```bash
# Build production
cd apps/dashboard
pnpm build

# Deploy
firebase deploy --only hosting
```

**Cloud Functions (Webhooks):**
```bash
cd services/functions
npm install
npm run deploy  # Uses firebase deploy --only functions
```

**Terraform (Infrastructure):**
```bash
cd infra/terraform
terraform init
terraform plan -var="project_id=contribute-system-prod"
terraform apply
```

**Orchestrator (Vertex AI Agent Engine):**
```bash
cd services/contribute-orchestrator
python deploy.py  # Deploys to Vertex AI
```

**Rollback Protocol:**
1. Firebase Hosting: `firebase hosting:channel:deploy rollback --expires 1h`
2. Cloud Functions: Redeploy previous version from Git tag
3. Terraform: `terraform apply` with previous state

### Monitoring & Alerting

**Current State:**
- Cloud Logging enabled for Cloud Functions
- No dedicated dashboards configured
- No alerting policies set up

**Recommended Setup:**
- Create Cloud Monitoring workspace
- Set up uptime checks for dashboard URL
- Alert on Cloud Function errors

**Log Locations:**
- Cloud Functions: `gcloud functions logs read github-webhook`
- Dashboard: Vercel/Firebase Hosting logs
- Orchestrator: Cloud Run logs (when deployed)

### Incident Response

| Severity | Definition | Response Time | Playbook |
|----------|------------|---------------|----------|
| P0 | Dashboard down, data loss | Immediate | Check Firebase status, redeploy |
| P1 | Webhooks not processing | 15 min | Check function logs, webhook secret |
| P2 | Recording upload failures | 1 hour | Check GCS permissions, retry |
| P3 | CLI minor issues | 4 hours | Debug locally, patch release |

---

## 5. Security & Access

### IAM Roles

| Role | Purpose | Permissions | MFA |
|------|---------|-------------|-----|
| Owner | Full admin | All | Required |
| bounty-cli | CLI service account | Firestore read/write, GCS admin | N/A (SA) |
| bounty-webhook | Function service account | Firestore write, Secret Manager read | N/A (SA) |

### Firestore Security Rules

```
bounties    → Read: authenticated, Write: admin only
proofs      → Read: authenticated, Create: authenticated, Update/Delete: admin
sessions    → Read: authenticated, Create: authenticated, Update: owner or admin
activity    → Read: admin, Create: authenticated (immutable)
ledger      → Read/Write: admin only
config      → Read: authenticated, Write: admin only
admins      → Read: authenticated, Write: admin only
```

### Secrets Management

**Storage:**
- GitHub webhook secret: Secret Manager (`github-webhook-secret`)
- GitHub token: Local CLI config (`~/.config/bounty/config.json`)
- Firebase service account: `GOOGLE_APPLICATION_CREDENTIALS`

**Rotation Policy:**
- GitHub token: 90 days (manual)
- Webhook secret: On compromise

**Break-Glass Procedure:**
1. Rotate compromised secret in Secret Manager
2. Update webhook configuration in GitHub
3. Redeploy Cloud Function

---

## 6. Cost & Performance

### Monthly Costs (Estimated)

| Service | Usage | Cost |
|---------|-------|------|
| Firestore | ~100k reads/writes | ~$5 |
| Cloud Storage | ~10GB recordings | ~$0.50 |
| Cloud Functions | ~10k invocations | ~$0 (free tier) |
| Firebase Hosting | Bandwidth | ~$0 (free tier) |
| **Total** | | **~$6/month** |

Note: Orchestrator deployment to Vertex AI will add cost (~$50-100/month depending on usage).

### Performance Baseline

**CLI Operations:**
- `contribute list`: < 2s
- `contribute claim`: < 1s
- `contribute work start`: < 500ms
- Recording upload: Depends on file size

**Dashboard:**
- Page load: Target < 2s
- API response: Target < 500ms

**Orchestrator:**
- Workflow step: Target < 30s
- Full workflow: 5-30 minutes (depends on complexity)

---

## 7. Current State Assessment

### What's Working

✅ **CLI Core** - Full bounty lifecycle management (list, claim, work, submit)

✅ **Recording System** - asciinema integration with GCS upload

✅ **GitHub Integration** - Webhooks, auto-bounty creation, slash commands

✅ **Firestore Rules** - RBAC implemented and deployed

✅ **Terraform IaC** - GCS buckets, service accounts, Secret Manager

✅ **Schema Validation** - Zod schemas shared across packages

✅ **Monorepo Structure** - pnpm workspaces + Turborepo working

### Areas Needing Attention

⚠️ **No CI/CD Pipeline** - Manual deployments only

⚠️ **Dashboard API Security** - Routes lack authentication middleware

⚠️ **No Test Coverage** - Minimal automated tests

⚠️ **Orchestrator Not Deployed** - LangGraph agent still in development

⚠️ **No Monitoring/Alerting** - Cloud Monitoring not configured

⚠️ **Documentation Gaps** - No API documentation, limited inline comments

### Immediate Priorities

| Priority | Issue | Impact | Owner |
|----------|-------|--------|-------|
| **High** | Add API authentication | Security vulnerability | DevOps |
| **High** | Set up CI/CD | Deployment reliability | DevOps |
| **Medium** | Deploy orchestrator | Enable AI workflows | ML/DevOps |
| **Medium** | Add monitoring | Visibility into production | DevOps |
| **Low** | Increase test coverage | Code quality | Dev team |

---

## 8. Quick Reference

### Command Map

| Capability | Command | Notes |
|------------|---------|-------|
| List bounties | `contribute list [-s status]` | Filter by status |
| Show bounty | `contribute show <id>` | Full details |
| Create bounty | `contribute create -t "Title" -v 100` | Manual creation |
| Claim bounty | `contribute claim <id>` | Mark as yours |
| Start work | `contribute work start <id>` | Begins recording |
| Add checkpoint | `contribute work checkpoint "msg"` | Progress marker |
| Stop work | `contribute work stop` | Ends recording, uploads |
| Submit | `contribute submit <id> --pr <url>` | For review |
| Run vetting | `contribute vet run <id>` | Automated tests |
| Configure | `contribute config set <key> <val>` | Set options |
| GitHub setup | `contribute github setup owner/repo` | Webhook config |
| GitHub sync | `contribute github sync owner/repo` | Import issues |

### Configuration Keys

| Key | Purpose | Example |
|-----|---------|---------|
| `projectId` | GCP project | `contribute-system-prod` |
| `proofBucket` | GCS bucket | `gs://bounty-proofs` |
| `githubToken` | GitHub API token | `ghp_xxxxx` |

### Critical URLs

| Service | URL |
|---------|-----|
| Production Dashboard | (Not yet deployed) |
| Firebase Console | https://console.firebase.google.com/project/intentional-bounty |
| GCP Console | https://console.cloud.google.com/home/dashboard?project=intentional-bounty |
| GitHub Repo | https://github.com/intent-solutions-io/contributions |

### First-Week Checklist

- [ ] GCP project access granted
- [ ] GitHub repo access granted
- [ ] Service account key downloaded
- [ ] Local environment running (`pnpm install && pnpm build`)
- [ ] CLI configured and tested (`contribute list`)
- [ ] Dashboard running locally (`pnpm dev`)
- [ ] Reviewed Firestore rules
- [ ] Understand bounty status flow
- [ ] Tested recording system (`contribute work start/stop`)

---

## 9. Recommendations Roadmap

### Week 1 - Stabilization

**Goals:**
1. Add authentication middleware to dashboard API routes
2. Set up GitHub Actions for CI (lint, typecheck, build)
3. Configure Cloud Monitoring basic dashboards

**Measurable Outcomes:**
- All API routes require authentication
- PR checks pass before merge
- Dashboard uptime visible in Cloud Monitoring

### Month 1 - Foundation

**Goals:**
1. Deploy orchestrator to Vertex AI Agent Engine
2. Add comprehensive test suite (target: 60% coverage)
3. Implement rate limiting on API routes
4. Set up staging environment

**Measurable Outcomes:**
- Orchestrator accessible via `/api/orchestrator/*`
- Test coverage reports in CI
- Staging URL available for testing

### Quarter 1 - Strategic

**Goals:**
1. Complete Phase 5-8 (Dashboard, Multi-site, Proof Wall, Notifications)
2. Add Slack integration for alerts
3. Implement approval workflow for supervised users
4. Build TUI for enhanced CLI experience

**Measurable Outcomes:**
- Public proof wall live
- Slack notifications working
- Approval queue functional

---

## Appendices

### A. Glossary

| Term | Definition |
|------|------------|
| **Bounty** | Paid task for contributing to open-source project |
| **Proof** | Evidence bundle (recordings, git stats, screenshots) |
| **Session** | Work period with start/stop and checkpoints |
| **Vetting** | Automated validation (build, lint, test) |
| **Orchestrator** | AI workflow engine for semi-autonomous bounty execution |
| **A2A** | Agent-to-Agent protocol for AI communication |
| **LangGraph** | State machine framework for LLM workflows |

### B. Bounty Status Flow

```
open → claimed → in_progress → submitted → vetting → completed → paid
                                   ↓
                               revision (if issues found)
```

### C. Reference Links

- [pnpm Documentation](https://pnpm.io/motivation)
- [Turborepo Guide](https://turbo.build/repo/docs)
- [Firebase Firestore](https://firebase.google.com/docs/firestore)
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [Vertex AI Agent Engine](https://cloud.google.com/vertex-ai/docs/generative-ai/agent-engine)

### D. Troubleshooting Playbooks

**CLI: "Permission denied" on Firestore**
1. Check `GOOGLE_APPLICATION_CREDENTIALS` is set
2. Verify service account has `roles/datastore.user`
3. Test with: `gcloud auth application-default print-access-token`

**Webhook: Not creating bounties**
1. Check Cloud Function logs: `gcloud functions logs read github-webhook`
2. Verify webhook secret matches Secret Manager
3. Confirm issue has "bounty" label

**Recording: Upload failed**
1. Check GCS bucket permissions
2. Verify `proofBucket` config is set
3. Check network connectivity
4. Retry with: `contribute work upload <session-id>`

### E. Open Questions

1. Should orchestrator use Cloud Run or Vertex AI Agent Engine?
2. What's the SLA commitment for production dashboard?
3. Who manages GitHub webhook secret rotation?
4. What's the backup strategy for Firestore data?

---

*Document generated by /appaudit skill*
*Last updated: 2026-01-29*
