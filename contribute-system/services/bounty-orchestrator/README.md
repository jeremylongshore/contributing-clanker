# Bounty Orchestrator

LangGraph-based workflow orchestrator for the Intentional Bounty system. This service manages the bounty hunting workflow and coordinates with Bob's Brain via A2A protocol.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    BOUNTY ORCHESTRATOR (LangGraph)                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Dashboard UI  ────►  FastAPI  ────►  LangGraph Workflow             │
│                         │                    │                       │
│                         │                    ▼                       │
│                         │            ┌──────────────┐               │
│                         │            │  PostgreSQL  │               │
│                         │            │  (pgvector)  │               │
│                         │            └──────────────┘               │
│                         │                    │                       │
│                         └────────────────────┼───────────────────────│
│                                              │                       │
└──────────────────────────────────────────────┼───────────────────────┘
                                               │ A2A Protocol
                                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      BOB'S BRAIN (Google ADK)                        │
│  General-purpose executor - handles any task via prompt              │
└─────────────────────────────────────────────────────────────────────┘
```

## Workflow Phases

The bounty workflow follows a 6-phase "Perfect PR Process":

| Phase | Name | Description | Gate |
|-------|------|-------------|------|
| A | Research | Sync repo knowledge (CONTRIBUTING.md, style) | Auto |
| B | Analysis | Analyze issue, check competition | Auto |
| C | Claim | Comment on issue (optional) | Human |
| D | Implementation | Write code via Bob's Brain | Auto |
| E | Submission | Create PR | Human |
| F | Post-Submit | Monitor, respond to feedback | Auto |

Human approval gates pause the workflow until dashboard confirmation.

## Quick Start

### 1. Prerequisites

- Python 3.11+
- PostgreSQL 15+ with pgvector extension
- Access to Bob's Brain A2A endpoint

### 2. Install Dependencies

```bash
cd services/bounty-orchestrator
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your values
```

Required environment variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `BOBS_BRAIN_A2A_URL` | Bob's Brain A2A gateway URL |
| `GOOGLE_CLOUD_PROJECT` | GCP project ID |

### 4. Initialize Database

```bash
# Verify connection and enable pgvector
python scripts/db/setup.py
```

### 5. Run Locally

```bash
python main.py
# Or with hot reload:
uvicorn main:app --reload
```

Server runs at http://localhost:8080

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/bounty/start` | POST | Start bounty workflow |
| `/api/bounty/{id}/status` | GET | Get workflow status |
| `/api/bounty/{id}/approve` | POST | Approve and resume workflow |
| `/api/repos` | GET | List tracked repositories |
| `/api/bounties` | GET | List all bounties |
| `/api/learnings` | GET | Search past learnings |

### Start a Bounty Workflow

```bash
curl -X POST http://localhost:8080/api/bounty/start \
  -H "Content-Type: application/json" \
  -d '{
    "bounty_id": "issue-123",
    "issue_url": "https://github.com/owner/repo/issues/123",
    "repo": "owner/repo"
  }'
```

### Check Status

```bash
curl http://localhost:8080/api/bounty/issue-123/status
```

### Approve Execution

```bash
curl -X POST http://localhost:8080/api/bounty/issue-123/approve
```

## Project Structure

```
bounty-orchestrator/
├── bounty_agent/           # Main Python package
│   ├── __init__.py
│   ├── agent.py            # LangGraph workflow (exports "graph")
│   ├── api.py              # FastAPI endpoints
│   ├── bobs_brain_client.py # A2A client
│   ├── state.py            # BountyState TypedDict
│   ├── nodes/              # Graph node implementations
│   │   ├── analyze.py
│   │   ├── competition.py
│   │   ├── plan.py
│   │   └── execute.py
│   ├── prompts/            # Prompt templates
│   │   ├── analyze.py
│   │   └── implement.py
│   └── knowledge/          # Long-term memory
│       ├── repo_sync.py
│       └── learn.py
├── scripts/
│   ├── ci/
│   │   └── check_nodrift.sh # Framework drift detection
│   └── db/
│       ├── init.sql        # Database schema
│       └── setup.py        # DB verification script
├── tests/                  # Pytest tests
├── .github/workflows/
│   └── deploy.yml          # CI/CD to Agent Engine
├── langgraph.json          # LangGraph deployment config
├── requirements.txt        # Pinned dependencies
├── pyproject.toml          # Python project config
├── main.py                 # FastAPI entry point
├── deploy.py               # Agent Engine deployment
└── .env.example            # Environment template
```

## Hard Rules (L1-L6)

This project enforces strict framework rules to prevent drift:

| Rule | Requirement | Enforcement |
|------|-------------|-------------|
| L1 | Use LangGraph for agents | CI drift check |
| L2 | Use langchain-google-vertexai | CI drift check |
| L3 | No direct provider API calls | CI drift check |
| L4 | CI-only deployments | GitHub Actions |
| L5 | PostgreSQL in production | CI drift check |
| L6 | Drift detection in CI | check_nodrift.sh |

## Testing

```bash
# Run all tests
pytest tests/ -v

# With coverage
pytest tests/ -v --cov=bounty_agent --cov-report=html

# Run specific test
pytest tests/test_api.py -v
```

## Deployment

### Local Development

```bash
python main.py
```

### Vertex AI Agent Engine

```bash
# Authenticate
gcloud auth application-default login
gcloud config set project intentional-bounty

# Deploy
python deploy.py
```

### CI/CD

Push to `main` branch triggers automatic deployment via GitHub Actions (requires Workload Identity Federation setup).

## Framework Choices

**Why LangGraph?**
- Production-stable (v1.0+)
- Native checkpointing for workflow state
- Built-in human-in-the-loop support
- Vendor-agnostic (can use any LLM)

**Why PostgreSQL + pgvector?**
- Native LangGraph Store support
- Semantic search for learnings
- Self-hosted for cost efficiency
- Single database for workflow + memory

**Why A2A Protocol?**
- Framework interoperability (LangGraph ↔ ADK)
- Separation of concerns
- Bob's Brain is general-purpose executor

## Related Documentation

- [Full Deployment Plan](../../.claude/plans/mossy-snacking-tulip.md)
- [LangGraph Documentation](https://python.langchain.com/docs/langgraph/)
- [Bob's Brain A2A](../../bobs-brain/docs/a2a-protocol.md)
