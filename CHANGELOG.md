# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

(none)

## [0.1.1] - 2026-05-03

Patch release. Fixes a real misframing bug surfaced in conversation post-v0.1.0: Step 0 was reporting the user's own-repo PRs as if they were in `/contribute` scope.

### Fixed

- **`skills/contribute/SKILL.md` Step 0** — scope PR queries to upstream-only via OWN_ORGS prefix exclusion (`jeremylongshore/`, `intent-solutions-io/`). Replaces deprecated `gh pr list --json repository` with `gh search prs`. Adds explicit "Scope rule (non-negotiable)" paragraph documenting the rationale.

## [0.1.0] - 2026-05-03

First marketplace release. Plugin live at `jeremylongshore/claude-code-plugins-plus-skills/plugins/community/contributing-clanker/`. Install via `/plugin install contributing-clanker`.

### Added

#### Plugin distribution (Phase 2 — Epic 11/yvb)

- **Marketplace plugin** at `plugins/community/contributing-clanker/` in `claude-code-plugins-plus-skills` with `plugin.json` (manifest) + Pattern A landing README + operator audit
- **Release script** `bin/release-plugin.sh <version> [--dry-run]` — semver-validated, rsync-syncs `skills/contribute/` → plugin dir, updates `plugin.json#version`, tags source repo, branches plugin repo, prints next-step commands. Idempotent.
- **Install/uninstall hooks** at `release/hooks/{install,uninstall}.sh` — install creates 7 runtime subdirs + copies 41 gates + 10 scripts + lib + writes profile.md template; uninstall removes plugin-shipped scripts but preserves user data (candidates/, research/, log.jsonl, profile.md)
- **E2E integration test** `tests/integration/test-plugin-install.sh` — 26 assertions covering install + user-data + uninstall preservation (sha256-verified)
- **Audit-harness** `@intentsolutions/audit-harness@v0.1.0` vendored at `.audit-harness/` per Intent Solutions Testing SOP

#### Anti-slop safety architecture (Phase 1)

- 41 deterministic gates across phases A/B/C/D/E/F/G covering 62 enumerated AI-slop failure modes
- Per-repo dossier system at `~/.contribute-system/research/<owner>__<repo>.md` built by `@researcher` subagent
- Lifecycle workflow (`transition.sh`) walking each candidate through `open → shortlist → claimed → working → submitted → merged`
- Override audit trail (`audit-overrides.sh`) — per-gate override frequency from `log.jsonl`
- Catalog-to-gate coverage report (`catalog-coverage.sh`)
- Scout-refresh regression harness (`test-scout-refresh.sh`, 10 assertions)
- Community failure-mode submission template at `000-docs/011-DR-TMPL-community-failure-mode-submission.md`
- 5 subagents in skill bundle: `scout`, `researcher`, `draft-writer`, `test-runner`, `repo-analyzer`
- Issue-template detection in dossier (`.github/ISSUE_TEMPLATE/` + legacy single-template)
- Pet peeves & Failure log dossier sections (manually curated, survive refresh)

#### Documentation

- 11 design docs under `000-docs/` (vision, architecture, scout/researcher specs, gate inventory, lifecycle workflow, failure-mode catalog, testing/verification, plugin-distribution plan, risk register, community submission template)
- QMD trigger conditions in `010-OD-RISK` — deferred until concrete signals surface
- Initial governance set: README, CLAUDE.md, AGENTS.md, LICENSE (MIT)

### Changed

- **Subagents relocated to skill bundle** per skill-creator spec: moved from `~/.claude/agents/` to `~/.claude/skills/contribute/agents/` (canonical, packageable; no symlinks)
- 5 L4 regression suites green (32/32 assertions): known-traps + override-audit + plug-in + stale-dossier + scout-refresh
- Repo renamed from `intent-solutions-io/contributions` → `jeremylongshore/contributing-clanker`
- SKILL.md migrated from SQLite tracker to markdown-only data model
- Dropped all bounty / payment / Algora / Gumroad / Cortex framing — this is a contribution tool, not a tracker
- `.beads/issues.jsonl` git-tracked — beads state survives machine death

### Removed

- SQLite tracker at `~/.contribute-system/contribute.db` (was never used)
- Stale money-flavored docs: `001-BL-TRCK-payment-tracker.md`, `002-PM-BKLG-contribution-tracker.csv`, `surgical-contributions.md/pdf`
- `~/000-projects/contribute-md/` parallel directory (redundant snapshot of `~/.contribute-system/`)

[Unreleased]: https://github.com/jeremylongshore/contributing-clanker/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/jeremylongshore/contributing-clanker/releases/tag/v0.1.1
[0.1.0]: https://github.com/jeremylongshore/contributing-clanker/releases/tag/v0.1.0
