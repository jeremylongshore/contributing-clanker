# The Contributing Clanker

A personal OSS-contribution workspace + the runtime state that the `/contribute` Claude Code skill operates against.

**What "clanker" means here**: an AI-assisted contribution system that fights AI slop in OSS by running deterministic gates before any external action. The workflow itself is in the skill, not in this repo.

## Where things live

| Concern | Location |
|---|---|
| Workflow / lifecycle orchestration | `skills/contribute/SKILL.md` (vendored in this repo) |
| Subagents | `skills/contribute/agents/{scout,researcher,draft-writer,test-runner,repo-analyzer}.md` |
| Gates + orchestrators + reporters | `skills/contribute/scripts/` (45 bash scripts: 4 orchestrators + 41 gates + reporters) |
| Templates | `skills/contribute/assets/{claim,pr,evidence}-template.md` (generic, repo-agnostic) |
| Per-repo overrides (CLA, tone, AI policy) | `~/.contribute-system/research/<owner>__<repo>.md` — built by `@researcher` |
| Runtime state (candidates, log, briefing) | `~/.contribute-system/` |
| Spec + tests + governance | `000-docs/`, `tests/`, `features/` |
| Upstream clones | `<repo-name>/` at the root of this repo |

## Install

```bash
git clone https://github.com/jeremylongshore/contributing-clanker
cd contributing-clanker
bin/install.sh                # production install (copy)
bin/install.sh --symlink      # dev install (live edits land in repo)
```

After install, `/contribute` becomes available in Claude Code.

## Repo layout

```
contributing-clanker/
├── 000-docs/                    Doc filing (per Doc-Filing v4.3)
├── 99-archived-system-docs/     Legacy planning from the deprecated monorepo
├── <upstream-repo>/             One subdirectory per upstream clone
├── scripts/, tools/             Utility scripts
├── AGENTS.md                    Non-interactive shell rules
├── CLAUDE.md                    Project conventions for Claude Code
└── README.md                    You are here
```

Each upstream clone has its own `CLAUDE.md` with stack-specific commands and conventions. Read it before working in that clone.

## The architecture (3 layers)

**Layer 1 — Per-repo dossiers** (`~/.contribute-system/research/<owner>__<repo>.md`).
What this specific repo expects of contributors: branch convention, CLA/DCO, AI policy, PR template requirements, draft-first preference, review bots, etiquette comment requirements, etc. Built by `@researcher` from CONTRIBUTING.md + linked policy docs + bot detection + merge-velocity metrics. Cached, refreshable.

**Layer 2 — Deterministic gates** (`~/.contribute-system/gates/`).
One small script per failure mode. Each gate takes (candidate, dossier, intended action) and returns `PASS / WARN / BLOCK / INFORM` + a one-line reason. The orchestrator runs the right subset per lifecycle transition. Gates are read-only and pluggable — drop a script in the directory, the runner discovers it.

**Layer 3 — Lifecycle workflow** (the `/contribute` skill).
Walks each candidate through `open → shortlist → claimed → working → submitted → merged`. At each transition runs the appropriate gate set. BLOCK gates refuse the transition; WARN gates surface in the briefing.

## Status

| Date | Slice | What landed |
|---|---|---|
| 2026-04-30 | Reset | Deprecated previous SQLite + monorepo system; pivoted to skill-only architecture |
| 2026-05-02 | Slice 1 | `@scout` subagent + memory bank shipped; 7 strategic candidates shortlisted |
| 2026-05-03 | Slice 2 | Researcher subagent + dossier system + 62-gate inventory in flight |

Future: Phase 2 packages this as a Claude Code plugin under `claude-code-plugins-plus-skills/plugins/contributing-clanker/` for distribution.

## Working on this

This is a public repo but the system is single-user. The workflow assumes you have the `/contribute` skill installed, your own GitHub auth via `gh`, and your own upstream clones. There's nothing to deploy and no service to run.

To use the system: `/contribute` in any Claude Code session.
To change the system: edit anything under `skills/contribute/` (SKILL.md, agents/, scripts/). The dev install (`bin/install.sh --symlink`) makes those edits live immediately at `~/.claude/skills/contribute/`.

## Conventions

- Branch naming: `feat/<short>` or `fix/<short>`
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`)
- See `CLAUDE.md` for project-specific rules and per-clone test commands
- See `AGENTS.md` for non-interactive shell rules (always `cp -f`, `rm -f`, `mv -f`, `apt-get -y` — interactive prompts hang the agent)

## What was deprecated 2026-04-30

A previous version of this repo had an internal `contribute-system/` monorepo (Next.js dashboard, TS CLI, Cloud Functions, Vertex AI orchestrator) plus a SQLite tracker at `~/.contribute-system/contribute.db`. Both were never used in practice. They were ripped out; the workflow collapsed into the `/contribute` skill. Historical planning docs are in [`99-archived-system-docs/`](./99-archived-system-docs/). Code lives in git history.
