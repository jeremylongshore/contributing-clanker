# Bob's Brain Overview

**System**: General-Purpose Enterprise Multi-Agent Orchestrator
**Location**: `/home/jeremy/000-projects/iams/bobs-brain/`
**Version**: 2.0.0 | Built on Google ADK + Vertex AI Agent Engine

---

## What It Is

Bob's Brain is a **production-grade multi-agent orchestrator** that coordinates specialist AI agents to accomplish any objective within safety constraints. Built on Google's ADK (Agent Development Kit) and Vertex AI Agent Engine.

**Key Differentiator**: Enforces "Hard Mode" architectural rules (R1-R8) that prevent the agent chaos typical in AI systems.

---

## Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                         BOB'S BRAIN                               │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Bob (Global Orchestrator)                                   │ │
│  │  • Routes requests to specialist departments                 │ │
│  │  • Slack interface for human interaction                     │ │
│  │  • Mission Spec v1 workflow-as-code                          │ │
│  └──────────────────────────┬──────────────────────────────────┘ │
│                             │                                     │
│         ┌───────────────────┼───────────────────┐                │
│         │                   │                   │                │
│         ▼                   ▼                   ▼                │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐         │
│  │ iam-* Dept   │   │ Future Dept  │   │ Future Dept  │         │
│  │ (ADK/Vertex  │   │ (Data        │   │ (Security    │         │
│  │  Compliance) │   │  Pipelines)  │   │  Team)       │         │
│  └──────────────┘   └──────────────┘   └──────────────┘         │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

### The iam-* Specialist Team (8 Agents)

```
┌─────────────────────────────────────────────────────────────────┐
│  iam-senior-adk-devops-lead (Foreman)                           │
│  Coordinates all ADK/Vertex compliance work                     │
└──────────┬──────────────────────────────────────────────────────┘
           │
           ├─→ iam-adk       (ADK/Vertex pattern expert)
           ├─→ iam-issue     (Violation detector)
           ├─→ iam-fix-plan  (Fix strategy planner)
           ├─→ iam-fix-impl  (Fix implementer)
           ├─→ iam-qa        (Compliance QA)
           ├─→ iam-docs      (Documentation writer)
           ├─→ iam-cleanup   (Codebase cleanup)
           └─→ iam-index     (Knowledge curator)
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Agents** | Google ADK (LlmAgent) | Core agent implementation |
| **Runtime** | Vertex AI Agent Engine | Managed agent hosting |
| **Memory** | Session + Memory Bank | Conversation continuity |
| **Protocol** | A2A (Agent-to-Agent) | Inter-agent communication |
| **Gateways** | Cloud Run | HTTP proxies (no Runner!) |
| **Storage** | GCS | Knowledge hub, evidence bundles |
| **CI/CD** | GitHub Actions + WIF | Automated deployments |
| **Identity** | SPIFFE | Immutable agent identification |

---

## Enterprise Controls

### Risk Tiers (R0-R4)

| Tier | Risk Level | Examples | Controls |
|------|------------|----------|----------|
| R0 | None | Read-only queries | None required |
| R1 | Low | Documentation updates | Audit log |
| R2 | Medium | Code modifications | Review gate |
| R3 | High | Deploys, PRs | Approval required |
| R4 | Critical | Production changes | Human-in-loop |

### Policy Gates

- **Tool Allowlists**: Agents can only use approved tools
- **Scope Limits**: Agents operate within defined boundaries
- **Evidence Requirements**: All actions produce audit trails

### Evidence Bundles

Every significant action produces:
```
evidence-bundle/
├── manifest.json      # What was done
├── inputs/            # What was received
├── outputs/           # What was produced
├── checksums.json     # SHA256 hashes
└── signature          # Agent SPIFFE ID
```

---

## Hard Mode Rules (R1-R8)

All rules enforced in CI via `scripts/ci/check_nodrift.sh`:

| Rule | Requirement | Why |
|------|-------------|-----|
| **R1** | Use `google-adk` LlmAgent only | No framework mixing |
| **R2** | Deploy to Agent Engine only | Let Google manage runtime |
| **R3** | Gateways are proxies only | Clean separation |
| **R4** | CI-only deployments | Reproducible, auditable |
| **R5** | Dual memory wiring | Real conversation continuity |
| **R6** | Single `000-docs/` folder | Predictable structure |
| **R7** | SPIFFE identity everywhere | Immutable tracing |
| **R8** | Drift detection in CI | Prevent architectural decay |

---

## Core Capabilities

### 1. ADK/Vertex Compliance Audits
- Scans repos for ADK import violations
- Detects drift from Google patterns
- Validates memory wiring
- Checks A2A protocol implementation

### 2. Automated ADK Fixes
- Constructs fix plans for violations
- Generates PRs aligned with Vertex AI patterns
- Runs QA checks against ADK standards

### 3. Portfolio-Wide Audits
- Audits multiple repos simultaneously
- Aggregates violations across org
- Tracks compliance scores over time

### 4. Workflow-as-Code (Mission Spec v1)

```yaml
# mission-spec.yaml
mission: audit-portfolio
objective: "Ensure all repos comply with ADK patterns"
risk_tier: R2
steps:
  - agent: iam-issue
    action: scan_violations
    inputs:
      repos: ["repo-a", "repo-b", "repo-c"]
  - agent: iam-fix-plan
    action: create_fixes
    depends_on: [scan_violations]
  - agent: iam-fix-impl
    action: apply_fixes
    approval_required: true
```

---

## A2A Protocol Communication

### AgentCard Discovery
```python
GET /.well-known/agent-card

{
  "name": "bobs-brain",
  "version": "2.0.0",
  "spiffe_id": "spiffe://intent.solutions/agent/bobs-brain/prod/us-central1/v2",
  "capabilities": ["audit", "fix", "document"],
  "tools": [...],
  "input_schema": {...},
  "output_schema": {...}
}
```

### Task Submission
```python
POST /v1/agents/bobs-brain/tasks:send

{
  "input": { "mission": "audit-portfolio", "repos": [...] },
  "session_id": "session-abc-123"
}

Response: { "task_id": "task-xyz-789", "status": "RUNNING" }
```

---

## How to Use Standalone

### Prerequisites
- Python 3.12+
- Google Cloud project with Vertex AI enabled
- `google-adk` and `google-cloud-aiplatform[agent_engines]` installed

### Setup
```bash
cd /home/jeremy/000-projects/iams/bobs-brain

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure GCP
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT=your-project-id

# Run locally
python3 scripts/run_local.py
```

### Portfolio Audit
```bash
# Run compliance audit across repos
python3 scripts/run_portfolio_swe.py \
  --repos repo-a,repo-b,repo-c \
  --output gs://your-bucket/audits/
```

---

## Integration Points

### Inputs
- **Slack Messages**: Human requests via Slack webhook
- **A2A Protocol**: Task submissions from other agents
- **Mission Specs**: YAML workflow definitions
- **GitHub Events**: Repo changes triggering audits

### Outputs
- **Evidence Bundles**: Verifiable audit artifacts
- **Fix PRs**: Pull requests for compliance issues
- **Documentation**: AARs and architecture docs
- **Metrics**: Compliance scores and trends

### Extension Points
- **New Departments**: Add specialist teams for other domains
- **Custom Tools**: Register new tools for agents
- **Arbitration Adapters**: Pluggable dispute resolution

---

## What's Next

- **New Departments**: Data pipeline team, security team, performance team
- **External Integration**: Route work from Bounty System
- **On-Chain Accountability**: Connect to IRSB for verifiable proofs
