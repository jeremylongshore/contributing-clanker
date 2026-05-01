# Git With Intent Overview

**System**: AI-Powered PR Automation Platform
**Location**: `/home/jeremy/000-projects/git-with-intent/`
**Version**: 0.3.0 | CLI: `gwi` | Active Development

---

## What It Is

Git With Intent (GWI) is a **CLI tool that automates PR workflows** using AI agents. It resolves merge conflicts semantically (not just textually), creates PRs from GitHub issues, and runs in full autopilot mode with mandatory approval gating.

**Key Differentiator**: AI can't push without explicit user consent. Every destructive operation requires hash-bound approval.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        GIT WITH INTENT                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  gwi CLI                                                          │  │
│  │  triage | resolve | review | issue-to-code | autopilot            │  │
│  └────────────────────────────────┬─────────────────────────────────┘  │
│                                   │                                     │
│                    ┌──────────────▼──────────────┐                     │
│                    │     Workflow Engine         │                     │
│                    │  Orchestrator + Approval    │                     │
│                    └──────────────┬──────────────┘                     │
│                                   │                                     │
│         ┌─────────────────────────┼─────────────────────────┐          │
│         │                         │                         │          │
│         ▼                         ▼                         ▼          │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐   │
│  │   Triage     │         │   Resolver   │         │   Reviewer   │   │
│  │ Gemini Flash │         │ Claude Opus  │         │ Claude Sonnet│   │
│  │  (Scoring)   │         │ (Conflicts)  │         │  (Analysis)  │   │
│  └──────────────┘         └──────────────┘         └──────────────┘   │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Storage: Firestore (prod) | SQLite (dev) | GitHub API           │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **CLI** | TypeScript + Commander | User interface |
| **API** | Cloud Run | REST endpoints |
| **Agents** | Claude (Anthropic), Gemini (Google) | AI reasoning |
| **Storage** | Firestore (prod), SQLite (dev) | Run state |
| **Source** | GitHub API | Repo integration |
| **Build** | Turborepo + pnpm | Monorepo |
| **Infra** | OpenTofu (IaC) | GCP deployment |

---

## Core Capabilities

### 1. Semantic Merge Conflict Resolution

Not just textual diff resolution - understands code intent:

```bash
gwi resolve https://github.com/owner/repo/pull/123

# GWI:
# 1. Fetches PR and conflict files
# 2. Analyzes what each side intended
# 3. Generates semantic resolution
# 4. Presents diff for approval
# 5. Only commits after explicit approval
```

### 2. Issue-to-Code Generation

Turn GitHub issues into working PRs:

```bash
gwi issue-to-code https://github.com/owner/repo/issues/456

# GWI:
# 1. Fetches issue details
# 2. Scores complexity (1-10)
# 3. Routes to appropriate model
# 4. Generates code changes
# 5. Creates PR after approval
```

### 3. PR Complexity Scoring

Deterministic 1-10 scale:

```bash
gwi triage https://github.com/owner/repo/pull/789

# Output:
# Complexity: 6/10
# Factors:
#   - Files changed: 12
#   - Languages: 3
#   - Test coverage: Medium
#   - Breaking changes: Yes
```

### 4. Full Autopilot Mode

Complete pipeline with human checkpoints:

```bash
gwi autopilot https://github.com/owner/repo/pull/123

# Pipeline:
# 1. Triage → Complexity score
# 2. Resolve → Handle conflicts
# 3. Review → Generate summary
# 4. AWAIT APPROVAL (hash: abc123)
# 5. Commit → Only after approval
```

---

## Agent Routing

Smart model selection based on task complexity:

| Complexity | Model | Cost | Use Case |
|------------|-------|------|----------|
| 1-3 | Gemini Flash | $ | Simple fixes, typos |
| 4-6 | Claude Sonnet | $$ | Standard PRs, features |
| 7-10 | Claude Opus | $$$ | Complex refactors, architecture |

---

## Approval Gating (Critical Safety Feature)

**All destructive operations require explicit approval:**

```
Run State Machine:
┌─────────┐
│ Pending │
└────┬────┘
     │ start
     ▼
┌─────────┐
│ Running │
└────┬────┘
     │ patch ready
     ▼
┌─────────────────┐
│ AwaitingApproval│ ← User must approve
└────┬────────────┘
     │ gwi run approve <hash>
     ▼
┌──────────┐
│ Approved │
└────┬─────┘
     │ push
     ▼
┌───────────┐
│ Committed │
└───────────┘
```

Approval is **hash-bound**: the exact patch content is cryptographically tied to the approval. Any modification invalidates the approval.

---

## Monorepo Structure

```
git-with-intent/
├── apps/
│   ├── cli/              # CLI tool (gwi command)
│   ├── api/              # REST API (Cloud Run)
│   ├── gateway/          # A2A agent coordination
│   ├── github-webhook/   # Webhook handler
│   ├── worker/           # Background jobs
│   └── web/              # Dashboard (React)
├── packages/
│   ├── core/             # Storage, billing, security (68 modules)
│   ├── agents/           # AI agent implementations
│   ├── engine/           # Workflow orchestration
│   ├── integrations/     # GitHub/GitLab connectors
│   └── sdk/              # TypeScript SDK
└── infra/                # OpenTofu (GCP infrastructure)
```

---

## CLI Commands

```bash
# Core workflows
gwi triage <pr-url>              # Score PR complexity
gwi resolve <pr-url>             # Resolve merge conflicts
gwi review <pr-url>              # Generate PR review
gwi issue-to-code <issue-url>    # Create PR from issue
gwi autopilot <pr-url>           # Full automated pipeline

# Run management
gwi run status <run-id>          # Check run status
gwi run approve <run-id>         # Approve pending changes
gwi run reject <run-id>          # Reject and cancel

# Configuration
gwi config set github.token <token>
gwi config set ai.provider anthropic
```

---

## How to Use Standalone

### Prerequisites
- Node.js 20+
- pnpm 9+
- GitHub token with repo access
- Anthropic API key or Google AI API key

### Setup
```bash
cd /home/jeremy/000-projects/git-with-intent

# Install dependencies
pnpm install

# Build CLI
pnpm build --filter=cli

# Configure
gwi config set github.token <your-token>
gwi config set ai.provider anthropic
gwi config set ai.anthropic.key <your-key>
```

### Usage
```bash
# Resolve conflicts on a PR
gwi resolve https://github.com/owner/repo/pull/123

# Review proposed changes
gwi run status <run-id>

# Approve and commit
gwi run approve <run-id>
```

---

## Integration Points

### Inputs
- **GitHub PRs**: Merge conflict resolution
- **GitHub Issues**: Code generation targets
- **A2A Protocol**: Task submissions from orchestrators
- **Webhooks**: Automated triggers on PR events

### Outputs
- **Resolved PRs**: Clean merges with audit trails
- **Generated PRs**: Code from issues
- **Review Reports**: Complexity analysis
- **Audit Logs**: Every decision logged

### Extension Points
- **New Providers**: GitLab, Bitbucket (planned)
- **Custom Agents**: Add specialized resolvers
- **Workflow Hooks**: Pre/post processing

---

## What's Next

- **Predictive Analytics**: TimeGPT-powered sprint forecasts
- **GitLab Support**: Extend beyond GitHub
- **Web Dashboard**: Visual workflow management
- **External Orchestration**: Accept work from Bounty System
