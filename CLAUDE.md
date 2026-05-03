# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is an OSS contribution workspace at `https://github.com/jeremylongshore/contributing-clanker.git` — clones of upstream projects we contribute to, plus per-clone notes. The actual workflow lives in the **`/contribute` Claude Code skill** at `~/.claude/skills/contribute/`, not in this repo.

The contributing-clanker is a **tool for contributing to other people's open source projects**. It's not a tracker, a portfolio, or a bounty board. The system exists to make AI-assisted contributions land cleanly — caught by deterministic gates before they reach upstream maintainers as AI slop.

See `AGENTS.md` for **non-interactive shell rules** (always use `cp -f`, `rm -f`, `mv -f`, `apt-get -y`, etc. — interactive prompts hang the agent).

## Task Tracking with Beads

```bash
bd ready                             # Available work
bd list --status in_progress         # What was I working on?
bd update <id> --status in_progress  # Before starting
bd close <id> --reason "PR #123"     # After completing
bd dolt push && git push             # Persist beads + code at session end
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
