# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is an OSS contributions workspace (`https://github.com/jeremylongshore/contributing-clanker.git`) — clones of upstream projects with paid-contribution programs **plus** a tracker. The workflow lives in the **`/contribute` Claude Code skill** at `~/.claude/skills/contribute/`, not in this repo.

Algora calls them "bounties" externally; we treat them as `Contribution` records internally. When inside an Algora-related code path, retain "bounty" terminology (matches their API contract). Everywhere else: contribution.

See `AGENTS.md` for **non-interactive shell rules** (always use `cp -f`, `rm -f`, `mv -f`, `apt-get -y`, etc. — interactive prompts hang the agent).

## Task Tracking with Beads

```bash
bd ready                          # Available contributions
bd list --status in_progress      # What was I working on?
bd update <id> --status in_progress  # Before starting work
bd close <id> --reason "PR #123"     # After completing
bd dolt push && git push          # Persist beads + code at session end
```

## Project Directory

| Directory | Stack | Reward range | Notes |
|-----------|-------|--------------|-------|
| `cortex/` | Python 3.10+ | $50-200 | AI-native OS - CLA required |
| `screenpipe/` | Rust + Tauri + TS/Bun | $25-500 | AI/screen recording via Algora |
| `posthog/` | Python/Django + React/TS | Varies | Analytics - uses flox environment |
| `calcom/` | TypeScript/Next.js | $20-500 | Scheduling platform |
| `tldraw/` | TypeScript/React | Varies | Drawing library - yarn workspaces |
| `appsmith/` | Java + React/TS | Varies | Low-code platform |
| `vertex-ai-samples/` | Python notebooks | Contrib | Google Cloud - CLA required |
| `zio-blocks/` | Scala 3 + sbt | $2-4K | ZIO Schema library |
| `feishin/` | React + Electron + pnpm | Contrib | Self-hosted music player |
| `filament/` | PHP/Laravel + Livewire | Varies | Has own CLAUDE.md |
| `shadcn-ui/` | TypeScript/React | Varies | Has own CLAUDE.md |
| `claude-cookbooks/` | Various | Contrib | Has own CLAUDE.md |
| `cal-com/`, `calcom/` | TypeScript/Next.js | $20-500 | Two clones; prefer `calcom/` (newer) |
| `zio/`, `zio-blocks/` | Scala 3 + sbt | $2-4K | `zio-blocks/` is the active Schema library |
| `projectdiscovery/` | YAML | $100 | CVE/nuclei templates |

## Tracking

- `000-docs/002-PM-BKLG-contribution-tracker.csv` — Master spreadsheet with status (canonical, lives in git)
- `000-docs/001-BL-TRCK-payment-tracker.md` — Payment tracking
- `surgical-contributions.md` — Curated list of <100 LOC template-based opportunities
- `~/.contribute-system/contribute.db` — Local SQLite mirror (auto-populated from CSV + `gh` state by the `/contribute` skill)
- **CRITICAL**: Always check GitHub for competing PRs before starting work — many opportunities get superseded
- Use `gh pr list --repo <owner>/<repo> --search "<issue#>"` to find competing PRs

## The `/contribute` Skill

When you want to discover, qualify, claim, or submit a contribution: run `/contribute` in any Claude Code session. The skill auto-refreshes state on invoke (your open PRs, claimed issues, the local tracker) so you don't have to brief Claude on what's in flight.

Skill location: `~/.claude/skills/contribute/SKILL.md` (not in this repo — lives globally with your Claude Code config).

## Project-Specific Quick Reference

### Screenpipe ($25-500 contributions via Algora)

```bash
cd screenpipe
cargo build                        # Rust core
cd screenpipe-app-tauri && bun install && bun run dev  # Tauri app
```

**Architecture**: CLI + Tauri app that records screens/mics 24/7, extracts OCR/STT, saves to SQLite at `$HOME/.screenpipe/db.sqlite`, connects to AI. Plugins ("pipes") written in TS + Bun.

**Style**:
- Rust: anyhow errors, tokio async, prefer channels over mutex, easy to read for humans
- TS: NextJS + Tailwind + shadcn + lucide + magicui + framer-motion
- **Lowercase for ALL logging and UI text**
- No toast errors — use empty states, skeletons, inline errors, disabled states
- Keep `@ts-ignore` comments unless explicitly asked to remove
- Escape HTML properly in React (use `&apos;` etc. when inside quotes)

### Cortex ($50-200 contributions)

**CLA Required**: Must sign before first PR — see [CLA.md](cortex/CLA.md)

```bash
cd cortex
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
pip install -e .                   # Development install
pytest tests/ -v                   # Run tests
pytest tests/ --cov=cortex --cov-report=html  # Coverage
black cortex/ --check              # Check formatting
```

**PR Requirements**:
- Demo video (before/after for bugs, feature demo for new work)
- AI disclosure in PR template
- Tests with >80% coverage
- No force push — use merge commits only

### PostHog

**Environment**: Uses flox — run commands with `flox activate -- bash -c "<command>"` (never interactive)

```bash
cd posthog
flox activate -- bash -c "pytest path/to/test.py::TestClass::test_method"  # Single test
flox activate -- bash -c "ruff check . --fix && ruff format ."  # Python lint
pnpm --filter=@posthog/frontend test              # Frontend tests
pnpm --filter=@posthog/frontend typescript:check  # TypeScript check
```

**Style**:
- Python: Type hints required, snake_case, no mypy (too slow)
- Frontend: TypeScript required, Tailwind over inline styles, avoid direct dayjs imports (use lib/dayjs)
- Sentence casing for product names (e.g., "Product analytics" not "Product Analytics")
- Conventional commits: `feat(scope):`, `fix(scope):`, `chore:` — lowercase, no period
- Comments: explain WHY not WHAT, no doc comments in Python tests
- Tests: prefer parameterized tests (use `parameterized` library in Python)

### CalCom / Tldraw

```bash
cd calcom    # or tldraw
yarn install && yarn dev && yarn test
```

### Vertex AI Samples (Google Cloud)

**CLA Required**: Sign at https://cla.developers.google.com/

```bash
cd vertex-ai-samples
pip3 install --user -U nbqa black flake8 isort pyupgrade
docker run -v ${PWD}:/setup/app gcr.io/cloud-devrel-public-resources/notebook_linter:latest your_notebook.ipynb
```

**Style**: One notebook per PR, follow Google notebook standards.

### ZIO Blocks ($2-4K contributions)

```bash
cd zio-blocks
sbt compile && sbt test && sbt scalafmtCheckAll
```

**Style**: Scala 3, pure FP, uses sbt. See `.scalafmt.conf` for formatting rules.

### Feishin (Music Player)

```bash
cd feishin
pnpm install && pnpm run dev        # Electron dev
pnpm run lint && pnpm run lint:fix
```

**Style**: React + Electron, uses pnpm. ESLint + Stylelint for code/CSS.

### Filament & shadcn-ui & Claude Cookbooks

Each has its own `CLAUDE.md`. Read it before contributing.

## Cloud Dev Environment

The `bounty-dev` GCE VM is still around for running heavy tests outside this machine.

```bash
gcloud compute ssh bounty-dev --zone=us-central1-a --command="cd <repo> && <test-command>"
```

VM Details: name `bounty-dev`, zone `us-central1-a`, type `e2-standard-4`. (Name kept as-is — VM rename not worth the migration cost.)

## Contribution Workflow

### Philosophy: Design Issues First, Not PRs

**Auto-opening PRs is the WRONG default for OSS contributions.**

PRs create "whack-a-mole slopfests" where maintainers must review each submission individually. Instead:

1. **Open a Design Issue** with:
   - Problem statement
   - Proposed solution
   - Diff preview (code changes as markdown)
   - Test results attached
   - Screenshots/recordings if UI changes

2. **Let maintainers batch review** — they can approve the approach before you submit a PR
3. **Only open PR after design approval** — or if maintainer explicitly requests it

This respects maintainer time and avoids wasted effort on rejected approaches.

### Workflow Steps

1. **Discover**: `/contribute` → skill surfaces open work + your in-flight PRs/issues
2. **Verify**: Check GitHub for competing PRs on the target issue
3. **Claim**: Comment on issue or use `/bounty` on Algora (Algora's command — separate from our `/contribute` skill)
4. **Track**: `bd update <id> --status in_progress`
5. **Develop**: Follow project-specific guidelines above
6. **Test**: Run full test suite — ALL TESTS MUST PASS
7. **Human Approval**: STOP and ask Jeremy for approval before ANY external submission
8. **Design Issue First**: Open issue with diff preview + tests (NOT a PR)
9. **PR Only After Approval**: Convert to PR only when maintainer approves design
10. **Close**: `bd close <id> --reason "PR #xyz"`

## MANDATORY: Pre-Submission Checklist

**Before submitting ANYTHING to external repos, you MUST:**

1. Run all tests — locally or on `bounty-dev` VM
2. Verify test results — ALL tests must pass, report coverage %
3. Run project-specific linters — no lint errors allowed
4. **ASK JEREMY FOR APPROVAL** — Do NOT submit anything without explicit human approval
   - Show test results summary
   - Show what files changed
   - Show proposed issue/PR content
   - Wait for "yes" or "approved" before creating
5. **Default to Design Issue** — NOT a PR
   - Include diff preview as markdown code blocks
   - Attach test output
   - Let maintainer decide if they want a PR

**NEVER auto-submit PRs. NEVER bypass human approval. Design issues > PRs.**

## Tools

`tools/` contains utilities for contribution management:

```bash
cd tools
npm install
node generate-pdf.js              # Generate PDFs from markdown
```

(Airtable sync was removed in the local-first migration — privacy.)

## Payment

- **Algora**: Platform handles payment automatically
- **Cortex**: Bitcoin (preferred), USDC, or PayPal within 48 hours
- **Gumroad**: Email `bounties@antiwork.com` with PR link + payment email; Stripe payout

## What was deprecated 2026-04-30

A previous version of this repo had an internal `contribute-system/` monorepo (Next.js dashboard, TS CLI, Cloud Functions, Vertex AI orchestrator). It was never used in practice. On 2026-04-30 it was deleted; the GCP project `intentional-bounty` was scheduled for deletion; the workflow collapsed into the `/contribute` skill. Historical planning docs are in `99-archived-system-docs/`. Code lives in git history.
