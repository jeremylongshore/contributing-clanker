---
title: Product Vision and Roadmap
category: PP
type: VISN
status: draft
last_updated: 2026-05-03
epic: contributing-clanker-9a3
---

# Product Vision and Roadmap

## Problem statement

Maintainers of high-traffic OSS repos (PostHog, Sentry, Tracer-Cloud, etc.) are getting buried in AI-generated slop — auto-opened PRs without test evidence, claims on already-assigned or already-shipped issues, generic "made with Claude" disclosures, formatter-only "while I'm here" diffs. The result is repo-level AI policies (PostHog: 2 closures = block) and reflexive `closed without response` actions on anything that pattern-matches as agent-authored.

`contributing-clanker` is the inverse: a tool for AI-assisted upstream OSS contributions that is *mechanically* incapable of the failure modes maintainers are reacting to. Every external action passes through deterministic gates that read a per-repo dossier of what THAT specific repo expects. AI does the writing; the gates are the seatbelt.

## Vision

The standard tool for craftsmanship-grade AI-assisted OSS contribution. A contribution that travels through this system arrives at the upstream repo in the format that repo expects, with the disclosures that repo requires, on a branch named the way that repo names branches, with test evidence the way that repo wants test evidence — because the dossier said so and the gates enforced it.

## 3-phase roadmap

| Phase | Scope | Distribution | Trigger to advance |
|---|---|---|---|
| **1. Filesystem-only (now)** | Single user (Jeremy). Skill at `~/.claude/skills/contribute/`, runtime at `~/.contribute-system/`. Markdown-only state. No daemon. | None — personal use | 30 days of validated daily personal-use without rework |
| **2. Plugin distribution (~30d post-Phase-1)** | Repackage as `claude-code-plugins-plus-skills/plugins/contributing-clanker/`. Marketplace listing on tonsofskills.com. Multi-user, per-user filesystem state. | `/plugin install contributing-clanker` | Multi-user demand surfaces (>1 inbound install request from non-Jeremy users) |
| **3. Containerized service (only if demand)** | Containerized MCP service on the Intent Solutions VPS. PostgreSQL control plane, FastAPI HTTP, GitHub webhook receiver for live PR/issue state. | Hosted endpoint + MCP config | Phase 2 hits >10 active users with consistent feature asks beyond filesystem |

## In-scope per phase

- **Phase 1**: 41 gates installed (of 62 enumerated), researcher + scout subagents, lifecycle workflow with `transition.sh`, dossier auto-build/refresh, append-only event log
- **Phase 2**: plugin manifest, install/uninstall hooks, version bumps, marketplace SEO, optional gate packs (e.g., a `python-extras` gate bundle)
- **Phase 3**: webhook ingestion (live PR/issue state instead of `gh pr view` polling), shared dossier cache across users, opt-in telemetry for failure-mode discovery

## Out-of-scope per phase

- **Phase 1**: anything multi-user; SQLite/Postgres; HTTP service; cloud calls beyond `gh` API
- **Phase 2**: hosted state (each plugin install keeps its own `~/.contribute-system/`)
- **Phase 3**: enforcement against unwilling repos, paid-bounty boards (Algora/Gumroad), non-GitHub forges (GitLab/Codeberg/Forgejo)

## Success criteria

- **Phase 1**: zero AI-policy strikes accumulated against Jeremy's GitHub account during 30-day soak; zero false-positive BLOCKs that the user couldn't justify after-the-fact
- **Phase 2**: ≥3 non-Jeremy users with at least one merged contribution gated by the system
- **Phase 3**: ≥10 active users; webhook-driven state replaces polling for in-flight PRs

## Source of truth

The original 3-layer design is `~/.claude/plans/fizzy-sprouting-quokka.md` ("Slice 2 — Anti-slop Safety Architecture"). See `002-AT-ARCH-system-architecture.md` for the architecture, `005-AT-SPEC-gate-inventory.md` for the gate set, `007-DR-CATG-failure-mode-catalog.md` for the 62 enumerated failure modes that justify each gate.
