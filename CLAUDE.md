# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is an OSS contribution workspace at `https://github.com/jeremylongshore/contributing-clanker.git` — clones of upstream projects we contribute to, plus per-clone notes. The actual workflow lives in the **`/contribute` Claude Code skill** at `~/.claude/skills/contribute/`, not in this repo.

**The repo and the skill are paired but distinct.** Repo = spec + tests + workspace + the vendored skill itself. Layout:

| Path | What |
|---|---|
| `skills/contribute/` | The skill (SKILL.md + 5 agents + 67 scripts [16 top-level + 51 gates] + 3 templates + 4 references). **Single source of truth.** |
| `bin/install.sh` | Installs the skill into `~/.claude/skills/contribute/` (symlink for devs, copy for users) |
| `bin/release-plugin.sh` + `release/hooks/` | Phase 2 machinery: rsyncs `skills/contribute/` into the marketplace plugin repo on a semver release (`--dry-run` supported); `release/hooks/` = the plugin's install/uninstall hooks |
| `000-docs/` | Spec — what the skill must do (epics 1–10) |
| `tests/` | Validates the skill (bats unit + L4 regression + `tests/integration/test-plugin-install.sh`) — references `skills/contribute/scripts/` |
| `features/` | Gherkin BDD acceptance criteria |
| upstream clones (posthog/, calcom/, …) | Where contributions land |
| `~/.contribute-system/` (NOT in repo) | Per-user runtime state — candidates, dossiers, log.jsonl |

**Personal-dev install** (this machine): `~/.claude/skills/contribute/` is a SYMLINK to `<repo>/skills/contribute/` so edits at either path land in the same physical file. No drift, no sync ritual. Phase 2 packaging copies `skills/contribute/` into `claude-code-plugins/plugins/contributing-clanker/skills/contribute/` for marketplace distribution.

**Why `assets/` doesn't bloat as we add repos**: per-repo specifics (tone, AI policy, draft-first, PR template overlays) live in dossiers at `~/.contribute-system/research/<owner>__<repo>.md` — not in the skill. `assets/` holds 3 generic templates forever (claim / evidence / PR); dossiers grow linearly with repos.

The contributing-clanker is a **tool for contributing to other people's open source projects**. It's not a tracker, a portfolio, or a bounty board. The system exists to make AI-assisted contributions land cleanly — caught by deterministic gates before they reach upstream maintainers as AI slop.

See `AGENTS.md` for **non-interactive shell rules** (always use `cp -f`, `rm -f`, `mv -f`, `apt-get -y`, etc. — interactive prompts hang the agent).

## Project structure: 10 epics → 11 docs → individual beads

The product follows a **10-epic beads implementation** per the [intent-blueprint-docs](https://github.com/intent-solutions-io/intent-blueprint-docs) vibe-prd standard. Each epic has a corresponding spec doc in `000-docs/` and individual sub-beads tracking concrete work items, each annotated with description / notes / design context.

**Phase 1 status**: all 9 epics + Slice 2 umbrella closed 2026-05-04 (59/59 beads at that point); the 30-day soak window has since elapsed and the system stayed in active dogfood — gate count grew from 41 → 51 (trust-ladder A07/B13, content-fidelity C20-C25, rescued C26/C27) and the bead backlog grew past the original 59 as empirical signal arrived. Phase 2 (plugin packaging, epic 25c) is still deferred until packaging is prioritized. Live counts: `bd stats` (beads) and `ls ~/.claude/skills/contribute/scripts/gates/*.sh | wc -l` (gates).

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
git push                             # `.beads/issues.jsonl` rides on git; bd's prepare-commit-msg hook auto-exports
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
| `agent-brain/` | — | Clone of `jeremylongshore/agent-brain` (own repo, not upstream-contrib) |
| `appsmith/` | Java + React/TS | Low-code platform |
| `centaur/` | — | Clone of `jeremylongshore/centaur` (own repo; see ISEDC Centaur decision AT-DECR 013) |
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
| `xireactor-brilliant/` | — | Clone of `thejeremyhodge/xireactor-brilliant` |
| `zio-blocks/`, `zio/` | Scala 3 + sbt | `zio-blocks/` is the active Schema library |

## Where the workflow lives

When you want to find an issue worth working on, draft a claim, run tests, or open a Design Issue: run **`/contribute`** in any Claude Code session. The skill auto-refreshes state on invoke (your open PRs, claimed issues, candidate dossiers) so you don't have to brief Claude on what's in flight.

| Layer | Location |
|---|---|
| `/contribute` skill | `~/.claude/skills/contribute/SKILL.md` |
| `@scout` subagent (discovery) | `~/.claude/skills/contribute/agents/scout.md` |
| `@researcher` subagent (per-repo dossiers) | `~/.claude/skills/contribute/agents/researcher.md` |
| support subagents (repo-analyzer, draft-writer, test-runner) | `~/.claude/skills/contribute/agents/` |
| Wasteland federation reference (wl claim → PR → wl done) | `~/.claude/skills/contribute/references/wasteland-federation.md` |
| Runtime state (gates, dossiers, candidates, log) | `~/.contribute-system/` |

None of those live in this repo — they live globally with your Claude Code config + a personal state directory. This repo is just the workspace where the upstream clones sit.

## System commands (direct invocation)

These bypass the `/contribute` skill and call the runtime scripts directly — useful for debugging gates, building dossiers, or running the regression suite.

```bash
# Scripts live at ${CLAUDE_SKILL_DIR}/scripts/ (per skill-creator spec — distributable)
# Direct path: ~/.claude/skills/contribute/scripts/
SKILL_SCRIPTS=~/.claude/skills/contribute/scripts

# Runtime deployment model: the PreToolUse hook, transition.sh, the scout pipeline,
# researcher-build.sh, and gate-runner.sh execute from ~/.contribute-system/bin/ —
# a DEPLOYED MIRROR of skills/contribute/scripts/. bin/install.sh maintains it:
bin/install.sh --symlink          # dev: symlink bin/ → repo scripts/ (zero drift)
bin/install.sh --force            # prod: re-copy skill + re-sync the runtime mirror
$SKILL_SCRIPTS/doctor.sh          # verify bin/ matches the repo (exit 1 on drift/missing)
# Override targets for tests: CONTRIBUTE_SKILL_DIR, CONTRIBUTE_BIN_DIR.

# Build or refresh a per-repo dossier
$SKILL_SCRIPTS/researcher-build.sh <owner>/<repo>             # full build with link follows
$SKILL_SCRIPTS/researcher-build.sh <owner>/<repo> --no-link-follow  # fast, no curl

# Run gate-checked transition on a candidate (dry-run shows verdicts without mutating)
$SKILL_SCRIPTS/transition.sh "shortlist→claimed" \
  ~/.contribute-system/candidates/<owner>__<repo>__issue<N>.md --dry-run

# Override a blocking gate (reason logged to log.jsonl)
$SKILL_SCRIPTS/transition.sh "shortlist→claimed" <candidate> \
  --override-gate A05 "issue re-opened by maintainer"

# Regression suites (5 total; each exits 0 on success)
$SKILL_SCRIPTS/test-known-traps.sh           # 4 known real-world traps (PostHog #55412 etc.)
$SKILL_SCRIPTS/test-override-audit.sh        # --override-gate audit trail (6 assertions)
$SKILL_SCRIPTS/test-plug-in.sh               # gate auto-discovery (4 assertions)
$SKILL_SCRIPTS/test-stale-dossier-refresh.sh # 14d staleness auto-refresh (8 assertions)
$SKILL_SCRIPTS/test-scout-refresh.sh         # scout-refresh body preservation (10 assertions)

# Reporters (read-only, surface signal from local state)
$SKILL_SCRIPTS/dashboard.sh                          # ASCII status dashboard (pipeline/shipped/next/timeline) — printed first by /contribute Step 0
$SKILL_SCRIPTS/dashboard.sh --no-box                 # same, frame stripped (for piping/grepping)
$SKILL_SCRIPTS/audit-overrides.sh                    # per-gate override frequency
$SKILL_SCRIPTS/audit-overrides.sh --since=30 --json  # filter + machine-readable
$SKILL_SCRIPTS/contribute-daily-recap.sh --dry-run   # daily recap email, printed not sent (house HTML template: tiles + Action-needed + pipeline + 2d events + override trend)
$SKILL_SCRIPTS/contribute-daily-recap.sh             # compose + email (cron: 45 6 * * *; recipient CONTRIBUTE_RECAP_TO)
$SKILL_SCRIPTS/catalog-coverage.sh                   # 000-docs/007 catalog → gate coverage

# Query the event log
jq -c "select(.ts | startswith(\"$(date -u +%Y-%m-%d)\"))" ~/.contribute-system/log.jsonl
jq -c "select(.event == \"gate_run\" and .details.severity == \"BLOCK\")" ~/.contribute-system/log.jsonl

# List candidates by status
awk '/^status:/{print FILENAME, $2}' ~/.contribute-system/candidates/*.md | sort -k2

# Generate PDFs from markdown (tools/)
cd tools && npm install && npm run pdf
```

## Repo-side test infrastructure

The 51 gate scripts + lib/preamble.sh live at `~/.claude/skills/contribute/scripts/gates/` (Phase 1 filesystem-only) but their tests live in **this** repo at `tests/` so they survive clones and ride CI. Phase distribution: A=8, B=10, C=20, D=3, E=2, F=3, G=5.

CI (runs on every PR to `master` + pushes to `master`):

| Workflow | Jobs | What it gates |
|---|---|---|
| `.github/workflows/ci.yml` | `shellcheck`, `bats` | static analysis of the gate scripts + the 276-case bats suite (51 gates + reporters) |
| `.github/workflows/codeql.yml` | CodeQL | security scanning |

PR review is **CodeRabbit** (`.coderabbit.yaml`) — switched off Gemini Code Assist in PR #56. Estate-wide policy (2026-06-23) moved AI PR review to **Greptile**; `.coderabbit.yaml` gets removed when the GitHub App swap reaches this repo. Until then CodeRabbit still reviews PRs here. The deterministic gate is the two CI workflows above, unchanged by the bot transition.

```bash
# Unit tests (bats — 276 cases = 262 gate cases [51 files, one per gate, phases A–G] + 14 reporter cases [dashboard, daily recap])
bats tests/unit/gates/                       # all gate cases (262)
bats tests/unit/*.bats                       # reporter suites (dashboard.bats lives OUTSIDE gates/)
bats tests/unit/gates/a01-already-assigned.bats  # one file
bats --verbose-run tests/unit/gates/         # show JSON of every gate verdict

# Static analysis (shellcheck against ~/.claude/skills/contribute/scripts/)
scripts/lint-bash.sh

# Pre-commit hooks (runs shellcheck + test-known-traps.sh on staged .sh files)
# Note: pre-commit refuses to install over beads' core.hooksPath — run manually:
pre-commit run --all-files
```

Engineer policy + audit findings:

| File | Purpose |
|---|---|
| `tests/TESTING.md` | engineer-owned test policy (coverage floors, mutation kill rate, etc.) |
| `tests/README.md` | layout + pattern-for-new-tests guide |
| `TEST_AUDIT.md` | most recent `/audit-tests` findings (regenerated on demand) |
| `.shellcheckrc` | documented false-positive disables (SC1091, SC2317) |
| `.pre-commit-config.yaml` | hook framework config (manual run during beads coexistence) |

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

## Required-sections-by-stage matrix lives in 3 places — keep them in lock-step

The candidate body sections that must exist for each `status` value (per the spec at `skills/contribute/references/candidate-file-format.md` § "Required sections by lifecycle stage") are encoded in **three** places that all must agree. If you change the matrix in one, change it in all three in the **same commit**:

| Place | Mechanism | Shape |
|---|---|---|
| `skills/contribute/references/candidate-file-format.md` | docs (the spec — source of truth for humans) | required-sections-by-stage matrix table |
| `skills/contribute/scripts/transition.sh` | runtime advisory WARN before gate-runner | bash `case` statement in `REQUIRED_SECTIONS` block |
| `skills/contribute/scripts/lint-candidate.sh` | sweep audit, exit 1 if any candidate has missing sections | bash `required_for()` function |

The matrix today (2026-05-04):

```
shortlist  → ## Scope, ## Files to touch
claimed    → ## Scope, ## Files to touch, ## Claim comment draft
working    → same as claimed
submitted  → ## PR title, ## PR body, ## Test results
merged     → same as submitted
open       → no body requirements
dropped    → no body requirements
```

If you add or rename a section requirement, update **all three** files and call it out explicitly in the commit message so future greppers find it. The spec is canonical; the two scripts are enforcement reflections.

History: matrix introduced in PR #18 (spec) + #21 (transition.sh WARN) + #22 (lint-candidate.sh reporter), all 2026-05-04.

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
3. Run the gate-runner (auto-invoked by `/contribute` at every transition; manual: `~/.claude/skills/contribute/scripts/transition.sh working→submitted <candidate>`)
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

## History

- **2026-04-30** — collapsed an unused internal monorepo (Next.js dashboard, TS CLI, Cloud Functions, Vertex AI orchestrator) + SQLite tracker into the `/contribute` skill. Historical planning docs in `99-archived-system-docs/`; code in git history.
- **2026-05-03** — repo renamed from `intent-solutions-io/contributions` → `jeremylongshore/contributing-clanker`; all bounty / payment framing dropped. This is a contribution tool, not a tracker or marketplace.
- **2026-05-04** — Phase 1 build complete (all 9 epics + Slice 2 closed, 59/59 beads). 41 of 62 gates installed, 80 test assertions green, 11/11 governance files in place. Entered 30-day soak validation. Phase 2 (plugin packaging) gated on clean soak.
- **2026-05-28 → 2026-06-07** — post-soak dogfood: trust-ladder rule landed (gates A07 + B13, PR #40), then content-fidelity gates C20-C25 (#41) hardened from the kobiton/automate PR-review round-trip; vendored audit-harness bumped to v1.1.5. Bead backlog grew past the original 59 (`bd stats` for live count).
- **2026-06-16 → 2026-06-20** — gates C26 (coverage-readiness) + C27 (sibling-issue-scan) rescued; gate count now **51** (A=8, B=10, C=20, D=3, E=2, F=3, G=5). Test hardening: full bats coverage for all 51 gates — 250 cases, one `.bats` per gate (PR #54). CI rebuilt: CodeQL + deterministic gate workflow (#55), PR-review workhorse switched Gemini → CodeRabbit (#56), apt dropped from CI (#57). Scout `--refresh` now drops closed issues (#58).
- **2026-06-21 → 2026-07-05** — added `scripts/dashboard.sh` (#60), a local-only ASCII status dashboard (pipeline funnel / in-flight / shipped / suggested-next / timeline) printed first by `/contribute` Step 0; +8 bats cases with an alignment invariant guarding multibyte-title border drift. Gate c22 no longer fail-closes under `set -e` (two increment bugs; +2 gate cases → 260 total, #61). Wasteland federation support landed (#62): the `wl claim → PR → wl done` flow, board→repo mapping, A-phase gate adaptations for federated claims, the `[wendy:github-mirror]` staleness trap, and the collaboration-surface inversion — all specified in `skills/contribute/references/wasteland-federation.md`.
- **2026-07-06** — /init drift audit + observability round, shipped as a 4-PR stack (#63→#64→#65→#66). CLAUDE.md re-verified against the tree (#63). The 5 gate-logic bugs from the 2026-06-17 bats pass all closed out red-tests-first: c24 engagement-frame-leakage was **fail-OPEN** — its `|`-split truncated 3 regex tokens into unparseable patterns and the author-footer anchor was dead — fixed with parallel token arrays + a loud-on-unevaluable BLOCK (#64); c26's unreachable no-new-funcs SKIP, c11's `0\n0` stderr noise, and f04's dead disclosure-verify paths + lowercase-ID crash fixed in #65, which also made every load-bearing `log.jsonl` append fail loud (visible stderr WARN) instead of silently swallowing. New `scripts/contribute-daily-recap.sh` (#66): deterministic personal daily recap email — house HTML template (stat tiles, Action-needed card, pipeline funnel + in-flight tables, event badges, override-trend table), heartbeat only on positive log-read proof, fixed 2-day window with no watermark, zero LLM — live on the dev-box crontab at `45 6 * * *` after Jeremy approved the shape. Observability epic mirrored at GH #67 (weekly team mode + notify-tail consumer deferred with recorded triggers). Suite now 274 bats cases (260 gate + 14 reporter).


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

### Off-machine recovery

`.beads/issues.jsonl` is git-tracked (whitelisted through `.gitignore`) so beads state survives machine death. The embedded Dolt DB (`.beads/embeddeddolt/`) is NOT tracked — it's a local cache.

On a fresh clone:

```bash
bd init                          # creates new embedded Dolt DB
bd import .beads/issues.jsonl    # restores all beads from the JSONL snapshot
```

bd auto-exports to JSONL every 15 min, so committing `.beads/issues.jsonl` is part of normal flow. If you forget, `bd export` flushes on demand.

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   git push                       # `.beads/issues.jsonl` is git-tracked; bd's prepare-commit-msg hook auto-exports
   git status                     # MUST show "up to date with origin"
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
