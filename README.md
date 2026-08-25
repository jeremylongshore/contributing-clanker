# contributing-clanker v0.3.0

Make AI-assisted open-source contributions land cleanly — caught by deterministic gates before they reach maintainers as slop.

A local-only Claude Code skill plus workspace for contributing to open-source projects you don't own. It runs 51 deterministic safety gates over every claim comment, design issue, and pull request, so AI-generated work never reaches an upstream maintainer as low-quality "slop." State is plain markdown — greppable, git-trackable, no database, no cloud calls.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/jeremylongshore/contributing-clanker/blob/master/LICENSE)
[![Release](https://img.shields.io/badge/release-v0.3.0-green.svg)](https://github.com/jeremylongshore/contributing-clanker/releases/tag/v0.3.0)

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/U5S225PTME)

**Links:** [GitHub](https://github.com/jeremylongshore/contributing-clanker) · [Gist One-Pager](https://gist.github.com/jeremylongshore/ff44ab81d255fd183c2f14bdfbad2c14)

## What Is This?

`contributing-clanker` is a workspace repo plus a vendored Claude Code skill (`/contribute`). The skill orchestrates discovery, per-repo research, drafting, and testing for upstream OSS contributions; the workspace holds the skill's source, its spec, its tests, and the upstream clones you contribute to. Every externally-visible action (claim, design issue, PR) is routed through a gate-runner that blocks anything failing one of 51 deterministic checks — with the reason written to an append-only log.

The runtime is deliberately boring: Bash + `gh` + `jq`, with markdown and JSONL as the only persistence. No server, no database, no cloud — the whole system is inspectable by hand and recoverable from git.

### Capabilities

| Capability | Description |
|------------|-------------|
| Discovery | `@scout` finds + ranks upstream issues by star-tier; `--repos` for surgical targeting |
| Research | `@researcher` builds per-repo dossiers (CLA / DCO / AI-policy / commit format / templates) |
| Gating | 51 deterministic gates (phases A–G) block AI-slop before it ships; verdicts logged |
| Trust ladder | a contributor's (N+1)th PR scope is governed by N prior merges at that repo (gates A07 + B13) |
| Lifecycle | `transition.sh` walks each candidate `open → shortlist → claimed → working → submitted → merged` |
| Runtime mirror | `install.sh` deploys `scripts/` → `~/.contribute-system/bin/`; `doctor.sh` verifies no drift |

### Key Principles

- **Deterministic over vibes** — logged shell verdicts (`PASS`/`WARN`/`BLOCK`), not an LLM saying "looks fine"
- **Markdown-only state** — greppable, git-trackable, survives any tool; no DB, no daemon, no cloud
- **Enforcement travels with the code** — gates + per-repo dossiers live in the repo / runtime state, never hard-coded
- **Human approval before any external submission** — the skill stops and asks; it never auto-posts upstream

## Scope

| Supported | Not Yet |
|-----------|---------|
| Filesystem-only (Phase 1), single-user | MCP service (Phase 3) |
| 63 gates across phases A–G | the remaining planned catalog gates (62-mode catalog) |
| Local Claude Code skill | marketplace plugin packaging (Phase 2, epic 25c) |
| `gh`-driven live GitHub state | cross-machine / multi-user coordination |

## Quickstart

### Prerequisites
- Claude Code
- `gh` CLI, authenticated (`gh auth status`)
- `jq` on PATH

### Install
```bash
git clone https://github.com/jeremylongshore/contributing-clanker
cd contributing-clanker
bin/install.sh              # production install (copy)
bin/install.sh --symlink   # dev install (edits land live in the repo)
```
Both modes also deploy the runtime mirror to `~/.contribute-system/bin/`. After install, `/contribute` is available in Claude Code.

### Run
```text
/contribute            # in any Claude Code session — surfaces in-flight PRs/issues + candidates
/contribute <owner>/<repo>   # onboard a new upstream repo (builds dossier, briefs you)
```

### Run Tests
```bash
bats tests/unit/gates/            # unit tests (48 cases across the gates)
skills/contribute/scripts/test-known-traps.sh        # regression suite (5 total: test-*.sh)
skills/contribute/scripts/doctor.sh                  # verify the deployed runtime mirror matches the repo
skills/contribute/scripts/lint-bash.sh               # shellcheck the gate scripts
```

## Configuration

The skill is configured by markdown state, not env vars. The two env vars below exist only to retarget the deploy for tests.

| Variable / file | Default | Purpose |
|-----------------|---------|---------|
| `~/.contribute-system/profile.md` | (created on first run) | scout preferred languages / star tiers + own-org exclusions |
| `CONTRIBUTE_BIN_DIR` | `~/.contribute-system/bin` | runtime-mirror deploy target (overridable for tests) |
| `CONTRIBUTE_RESEARCH_DIR` | `~/.contribute-system/research` | per-repo dossier directory (overridable for tests) |

## Architecture

Three layers, gates in the middle:

```
/contribute (SKILL.md) ──spawns──→ subagents: scout · researcher · draft-writer · test-runner
        │
        │ every external action
        ▼
   transition.sh ──→ gate-runner.sh ──→ 63 gates (phases A–G)   ──BLOCK/WARN/PASS (logged)
        │
        ▼
   ~/.contribute-system/  (markdown state: candidates · research/dossiers · log.jsonl · profile.md)
        │  gh CLI (live, never cached)        only after gates PASS + human approval
        ▼
   upstream GitHub repo
```

- **Layer 1 — Per-repo dossiers** (`~/.contribute-system/research/<owner>__<repo>.md`): what a specific upstream expects (branch convention, CLA/DCO, AI policy, PR/issue templates, draft-first, review bots, etiquette). Built by `@researcher`; cached + refreshable (smart-refresh preserves engineer-curated sections).
- **Layer 2 — Deterministic gates** (`scripts/gates/`, deployed to `~/.contribute-system/bin/gates/`): one small script per failure mode → `PASS / WARN / BLOCK / INFORM` + a one-line reason. Pluggable: drop a script in, the runner discovers it.
- **Layer 3 — Lifecycle workflow** (`/contribute`): walks each candidate through the states above, running the right gate set per transition. BLOCK refuses the transition; WARN surfaces in the briefing.

## Project Structure

```
contributing-clanker/
├── skills/contribute/        # the skill — single source of truth
│   ├── SKILL.md              # /contribute orchestrator
│   ├── agents/               # 5 subagents
│   ├── scripts/              # 17 top-level + gates/ (51) + gates/lib/
│   ├── references/           # candidate / dossier / workflow specs
│   └── assets/               # 3 generic templates (claim / pr / evidence)
├── bin/install.sh            # deploys skill + runtime mirror (with doctor smoke-check)
├── 000-docs/                 # spec (10 epics) + release AARs
├── tests/                    # bats unit + L4 regression
├── features/                 # Gherkin BDD acceptance
├── <upstream-repo>/          # one subdirectory per upstream clone (own CLAUDE.md each)
├── AGENTS.md                 # non-interactive shell rules
└── CLAUDE.md                 # project conventions for Claude Code
~/.contribute-system/         # runtime state (candidates, dossiers, log) — NOT in this repo
```

Each upstream clone has its own `CLAUDE.md` with stack-specific commands — read it before working there.

## Documentation

- **Spec + index:** [`000-docs/000-INDEX.md`](000-docs/000-INDEX.md) — 10 epics → spec docs + release AARs
- **Changelog:** [`CHANGELOG.md`](CHANGELOG.md) (Keep a Changelog + SemVer)
- **One-pager + operator audit:** [the Gist](https://gist.github.com/jeremylongshore/ff44ab81d255fd183c2f14bdfbad2c14)
- **Shell rules:** [`AGENTS.md`](AGENTS.md) — always `cp -f` / `rm -f` / `mv -f` / `apt-get -y` (interactive prompts hang the agent)
- **History:** the pre-2026-04-30 SQLite-tracker + monorepo system was deprecated; planning docs in [`99-archived-system-docs/`](./99-archived-system-docs/), code in git history.

## License

MIT — see [LICENSE](LICENSE)
