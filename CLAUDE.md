# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is an OSS contribution workspace at `https://github.com/jeremylongshore/contributing-clanker.git` — clones of upstream projects we contribute to, plus per-clone notes. The actual workflow lives in the **`/contribute` Claude Code skill** at `~/.claude/skills/contribute/`, not in this repo.

The contributing-clanker is a **tool for contributing to other people's open source projects**. It's not a tracker, a portfolio, or a bounty board. The system exists to make AI-assisted contributions land cleanly — caught by deterministic gates before they reach upstream maintainers as AI slop.

See `AGENTS.md` for **non-interactive shell rules** (always use `cp -f`, `rm -f`, `mv -f`, `apt-get -y`, etc. — interactive prompts hang the agent).

## Project structure: 10 epics → 10 docs → individual beads

This product is being built out as a **10-epic beads implementation** following the [intent-blueprint-docs](https://github.com/intent-solutions-io/intent-blueprint-docs) vibe-prd standard. Each epic has a corresponding spec doc in `000-docs/` and individual sub-beads tracking concrete work items, each annotated with description / notes / design context.

| # | Epic (bead ID) | Doc | What it covers |
|---|---|---|---|
| 1 | Vision & Roadmap (`9a3`) | [001-PP-VISN](000-docs/001-PP-VISN-product-vision-and-roadmap.md) | 3-phase escalation: filesystem-only → plugin → MCP service |
| 2 | System Architecture (`9dr`) | [002-AT-ARCH](000-docs/002-AT-ARCH-system-architecture.md) | The 3-layer model + invariants |
| 3 | Discovery (@scout) (`bzq`) | [003-AT-SPEC](000-docs/003-AT-SPEC-discovery-system-scout.md) | Star-tier scoring + candidate generation |
| 4 | Research (@researcher) (`drq`) | [004-AT-SPEC](000-docs/004-AT-SPEC-research-system-dossiers.md) | Per-repo dossier system |
| 5 | Gate Inventory (`lhg`) | [005-AT-SPEC](000-docs/005-AT-SPEC-gate-inventory.md) | 62 deterministic safety gates |
| 6 | Lifecycle Workflow (`15b`) | [006-AT-SPEC](000-docs/006-AT-SPEC-lifecycle-workflow.md) | `/contribute` SKILL.md + transition.sh |
| 7 | Failure-Mode Catalog (`p5q`) | [007-DR-CATG](000-docs/007-DR-CATG-failure-mode-catalog.md) | 62 enumerated AI-slop patterns |
| 8 | Testing & Verification (`ql2`) | [008-TQ-TEST](000-docs/008-TQ-TEST-testing-and-verification.md) | Regression suite + smoke tests |
| 9 | Plugin Distribution (`25c`) | [009-OD-PLAN](000-docs/009-OD-PLAN-plugin-distribution-phase-2.md) | Phase 2 packaging plan |
| 10 | Operations & Risk (`i4y`) | [010-OD-RISK](000-docs/010-OD-RISK-operations-and-risk.md) | Risk register + rollback strategy |

**Index**: [`000-docs/000-INDEX.md`](000-docs/000-INDEX.md). **Source plan**: `~/.claude/plans/fizzy-sprouting-quokka.md`.

## Task Tracking with Beads

Use `bd` for ALL task tracking. Bead IDs are the cross-reference to docs (each doc's frontmatter has an `epic:` field pointing at the matching bead).

```bash
bd ready                             # Available work
bd list --status=in_progress         # What was I working on?
bd dep tree contributing-clanker-9a3 # See an epic + its sub-beads
bd update <id> --status=in_progress  # Before starting
bd close <id> --reason "evidence"    # After completing — include test output / PR # / verification notes
bd dolt push && git push             # Persist beads + code at session end
```

When creating a new bead, link it to its epic:

```bash
bd create --type=task --priority=2 \
  --title="..." --description="..." \
  --notes="..." --design="..." \
  --parent=contributing-clanker-<epic-id>
```

## Project directory

Each clone is one upstream project we contribute to. The `Notes` column captures whatever's load-bearing for working in that clone — CLA requirements, build environment quirks, style conventions.

| Directory | Stack | Notes |
|-----------|-------|-------|
| `appsmith/` | Java + React/TS | Low-code platform |
| `cal-com/`, `calcom/` | TypeScript / Next.js | Two clones; prefer `calcom/` (newer) |
| `claude-cookbooks/` | Various | Has own CLAUDE.md |
| `cortex/` | Python 3.10+ | AI-native OS — CLA required (`cortex/CLA.md`) |
| `feishin/` | React + Electron + pnpm | Self-hosted music player |
| `filament/` | PHP / Laravel + Livewire | Has own CLAUDE.md |
| `posthog/` | Python / Django + React / TS | Uses flox; see PostHog section below |
| `projectdiscovery/` | YAML | CVE / nuclei templates |
| `screenpipe/` | Rust + Tauri + TS / Bun | Screen recording app; lowercase logging style |
| `shadcn-ui/` | TypeScript / React | Has own CLAUDE.md |
| `tldraw/` | TypeScript / React + yarn workspaces | Drawing library |
| `vertex-ai-samples/` | Python notebooks | Google Cloud — CLA required |
| `zio-blocks/`, `zio/` | Scala 3 + sbt | `zio-blocks/` is the active Schema library |

## Where the workflow lives

When you want to find an issue worth working on, draft a claim, run tests, or open a Design Issue: run **`/contribute`** in any Claude Code session. The skill auto-refreshes state on invoke (your open PRs, claimed issues, candidate dossiers) so you don't have to brief Claude on what's in flight.

| Layer | Location |
|---|---|
| `/contribute` skill | `~/.claude/skills/contribute/SKILL.md` |
| `@scout` subagent (discovery) | `~/.claude/agents/scout.md` |
| `@researcher` subagent (per-repo dossiers) | `~/.claude/agents/researcher.md` |
| Runtime state (gates, dossiers, candidates, log) | `~/.contribute-system/` |

None of those live in this repo — they live globally with your Claude Code config + a personal state directory. This repo is just the workspace where the upstream clones sit.

## System commands (direct invocation)

These bypass the `/contribute` skill and call the runtime scripts directly — useful for debugging gates, building dossiers, or running the regression suite.

```bash
# Scripts live at ${CLAUDE_SKILL_DIR}/scripts/ (per skill-creator spec — distributable)
# Direct path: ~/.claude/skills/contribute/scripts/
SKILL_SCRIPTS=~/.claude/skills/contribute/scripts

# Build or refresh a per-repo dossier
$SKILL_SCRIPTS/researcher-build.sh <owner>/<repo>             # full build with link follows
$SKILL_SCRIPTS/researcher-build.sh <owner>/<repo> --no-link-follow  # fast, no curl

# Run gate-checked transition on a candidate (dry-run shows verdicts without mutating)
$SKILL_SCRIPTS/transition.sh "shortlist→claimed" \
  ~/.contribute-system/candidates/<owner>__<repo>__issue<N>.md --dry-run

# Override a blocking gate (reason logged to log.jsonl)
$SKILL_SCRIPTS/transition.sh "shortlist→claimed" <candidate> \
  --override-gate A05 "issue re-opened by maintainer"

# Regression test — validates 4 known real-world traps
$SKILL_SCRIPTS/test-known-traps.sh
$SKILL_SCRIPTS/test-known-traps.sh --verbose    # show full gate output

# Query the event log
jq -c "select(.ts | startswith(\"$(date -u +%Y-%m-%d)\"))" ~/.contribute-system/log.jsonl
jq -c "select(.event == \"gate_run\" and .details.severity == \"BLOCK\")" ~/.contribute-system/log.jsonl

# List candidates by status
awk '/^status:/{print FILENAME, $2}' ~/.contribute-system/candidates/*.md | sort -k2

# Generate PDFs from markdown (tools/)
cd tools && npm install && npm run pdf
```

Gate phases run per action:

| Action | Phases run |
|---|---|
| `open→shortlist` | A |
| `shortlist→claimed` | A, E |
| `claimed→working` | A, B |
| `working→submitted` | B, C, E, F, G |
| `open-pr` | C, E |
| `flip-to-ready` | C |
| `post-comment` | D |

## Per-clone quick reference

### Screenpipe

```bash
cd screenpipe
cargo build                                                    # Rust core
cd screenpipe-app-tauri && bun install && bun run dev          # Tauri app
```

CLI + Tauri app that records screens / mics, extracts OCR + STT, saves to local SQLite, connects to AI. Plugins ("pipes") written in TS + Bun.

Style:
- Rust: anyhow errors, tokio async, prefer channels over mutex, easy to read for humans
- TS: NextJS + Tailwind + shadcn + lucide + magicui + framer-motion
- **Lowercase for ALL logging and UI text**
- No toast errors — use empty states, skeletons, inline errors, disabled states
- Keep `@ts-ignore` comments unless explicitly asked to remove
- Escape HTML properly in React (use `&apos;` etc. when inside quotes)

### Cortex

CLA required — sign before first PR (`cortex/CLA.md`).

```bash
cd cortex
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
pip install -e .                               # Development install
pytest tests/ -v                               # Run tests
pytest tests/ --cov=cortex --cov-report=html   # Coverage
black cortex/ --check                          # Check formatting
```

PR requirements:
- Demo video (before / after for bugs, feature demo for new work)
- AI disclosure in PR template
- Tests with >80% coverage
- No force push — use merge commits only

### PostHog

Environment uses flox — run commands with `flox activate -- bash -c "<command>"` (never interactive).

```bash
cd posthog
flox activate -- bash -c "pytest path/to/test.py::TestClass::test_method"   # Single test
flox activate -- bash -c "ruff check . --fix && ruff format ."              # Python lint
pnpm --filter=@posthog/frontend test                                        # Frontend tests
pnpm --filter=@posthog/frontend typescript:check                            # TypeScript check
```

Style:
- Python: type hints required, snake_case, no mypy (too slow)
- Frontend: TypeScript required, Tailwind over inline styles, avoid direct dayjs imports (use `lib/dayjs`)
- Sentence casing for product names (e.g., "Product analytics" not "Product Analytics")
- Conventional commits: `feat(scope):`, `fix(scope):`, `chore:` — lowercase, no period
- Comments: explain WHY not WHAT, no doc comments in Python tests
- Tests: prefer parameterized tests (use the `parameterized` library)

### CalCom / Tldraw

```bash
cd calcom    # or tldraw
yarn install && yarn dev && yarn test
```

### Vertex AI Samples (Google Cloud)

CLA required — sign at https://cla.developers.google.com/.

```bash
cd vertex-ai-samples
pip3 install --user -U nbqa black flake8 isort pyupgrade
docker run -v ${PWD}:/setup/app gcr.io/cloud-devrel-public-resources/notebook_linter:latest your_notebook.ipynb
```

Style: one notebook per PR, follow Google notebook standards.

### ZIO Blocks

```bash
cd zio-blocks
sbt compile && sbt test && sbt scalafmtCheckAll
```

Style: Scala 3, pure FP, uses sbt. See `.scalafmt.conf` for formatting rules.

### Feishin (music player)

```bash
cd feishin
pnpm install && pnpm run dev        # Electron dev
pnpm run lint && pnpm run lint:fix
```

Style: React + Electron, uses pnpm. ESLint + Stylelint for code / CSS.

### Filament, shadcn-ui, Claude Cookbooks

Each has its own `CLAUDE.md` — read it before contributing.

## Contribution philosophy: Design Issues first, not PRs

Auto-opening PRs is the WRONG default for OSS contributions.

PRs create whack-a-mole work for maintainers — they review each submission individually whether the approach is right or not. Instead:

1. **Open a Design Issue** with:
   - Problem statement
   - Proposed solution
   - Diff preview (code changes as markdown)
   - Test results attached
   - Screenshots / recordings if UI changes
2. **Let maintainers respond** — they can approve the approach before you submit a PR.
3. **Only open a PR after design approval** — or if a maintainer explicitly requests one.

This respects maintainer time and avoids wasted effort on rejected approaches.

When the upstream repo has its own issue templates at `.github/ISSUE_TEMPLATE/`, **use those** — fetch the matching one and fill it in. The repo's reviewers expect that shape. The dossier system surfaces them automatically; if `@researcher` has built a dossier for the repo, it lists every available template with a fetch command.

## Workflow steps

1. **Discover**: `/contribute` → skill surfaces open work + your in-flight PRs / issues
2. **Verify**: check GitHub for competing PRs on the target issue
3. **Build/refresh dossier**: `@researcher build <owner>/<repo>` if not already cached
4. **Claim**: comment on the issue (the gate-runner enforces any etiquette the dossier specifies)
5. **Track**: `bd update <id> --status in_progress`
6. **Develop**: follow per-clone guidelines above
7. **Test**: run the full project test suite — ALL must pass
8. **Human approval**: STOP and ask Jeremy before any external submission
9. **Design Issue first**: open issue with diff preview + tests (NOT a PR)
10. **PR only after approval**: convert to PR only when the maintainer approves the design
11. **Close**: `bd close <id> --reason "PR #xyz"`

## Mandatory pre-submission checklist

Before submitting ANYTHING to external repos, you MUST:

1. Run all tests locally — ALL must pass
2. Run project-specific linters — no lint errors
3. Run the gate-runner (auto-invoked by `/contribute` at every transition; manual: `~/.contribute-system/bin/transition.sh working→submitted <candidate>`)
4. **Ask Jeremy for approval** — do NOT submit without explicit human OK:
   - Show test results summary
   - Show what files changed
   - Show proposed issue / PR content
   - Wait for "yes" or "approved" before creating
5. **Default to Design Issue** — NOT a PR:
   - Include diff preview as markdown code blocks
   - Attach test output
   - Let the maintainer decide if they want a PR
6. **Use the upstream's own issue/PR template** if one exists — don't paste a generic shape over their structure

NEVER auto-submit PRs. NEVER bypass human approval. Design Issues > PRs.

## Tools

`tools/` contains utilities for the workspace:

```bash
cd tools
npm install
node generate-pdf.js              # Generate PDFs from markdown
```

## What was deprecated 2026-04-30

A previous version of this repo had an internal monorepo (Next.js dashboard, TS CLI, Cloud Functions, Vertex AI orchestrator) plus a SQLite tracker. Neither was used in practice. On 2026-04-30 they were deleted and the workflow collapsed into the `/contribute` skill. Historical planning docs are in `99-archived-system-docs/`. Code lives in git history.

The 2026-05-03 rename moved the repo from `intent-solutions-io/contributions` to `jeremylongshore/contributing-clanker` and dropped all bounty / payment framing. This is just a tool for contributing — no tracker, no payouts, nothing to monetize.


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
