# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Slice 2 anti-slop safety architecture: `@researcher` subagent, gate-runner orchestrator, `transition.sh` lifecycle wrapper
- 21 new deterministic gates across phases A/B/C/D/E/F/G (31 total installed)
- Per-repo dossier system at `~/.contribute-system/research/<owner>__<repo>.md`
- Issue-template detection in dossier (`.github/ISSUE_TEMPLATE/` + legacy single-template)
- Pet peeves & Failure log dossier sections (manually curated, survive refresh)

### Changed
- Repo renamed from `intent-solutions-io/contributions` → `jeremylongshore/contributing-clanker`
- SKILL.md migrated from SQLite tracker to markdown-only data model
- Dropped all bounty / payment / Algora / Gumroad / Cortex framing — this is a contribution tool, not a tracker
- README rewritten to reflect 3-layer architecture
- CLAUDE.md rewritten to remove dollar amounts and money-flavored language

### Removed
- SQLite tracker at `~/.contribute-system/contribute.db` (was never used)
- Stale money-flavored docs: `001-BL-TRCK-payment-tracker.md`, `002-PM-BKLG-contribution-tracker.csv`, `surgical-contributions.md/pdf`
- `~/000-projects/contribute-md/` parallel directory (redundant snapshot of `~/.contribute-system/`)

## [0.1.0] - 2026-05-03

### Added
- Initial governance set: README, CLAUDE.md, AGENTS.md, LICENSE (MIT)
- `/contribute` Claude Code skill at `~/.claude/skills/contribute/`
- `@scout` discovery subagent at `~/.claude/agents/scout.md`
- 10 initial gates installed at `~/.contribute-system/gates/`

[Unreleased]: https://github.com/jeremylongshore/contributing-clanker/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/jeremylongshore/contributing-clanker/releases/tag/v0.1.0
