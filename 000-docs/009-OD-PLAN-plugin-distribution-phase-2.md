---
title: Phase 2 — Plugin Distribution Plan
category: OD
type: PLAN
status: draft
last_updated: 2026-05-03
epic: contributing-clanker-25c
---

# Phase 2 — Plugin Distribution Plan

Phase 2 of the roadmap (`001-PP-VISN-product-vision-and-roadmap.md`). Repackages the system as a Claude Code plugin so non-Jeremy users can install it.

## Hard prerequisite

**30 days of validated daily personal-use after Phase 1 ships.** No Phase-2 work begins until:

- Zero AI-policy strikes accumulated against Jeremy's account during the soak
- Zero false-positive BLOCKs that the user can't justify post-hoc
- The 21 unimplemented gates from the catalog have been triaged: ship in Phase 1 if a real-world trap demands them, defer otherwise

If the soak surfaces structural issues (gate latency, dossier drift, override abuse), Phase 1 gets fixed first. Phase 2 does not move forward on a shaky base.

## Target location

Local directory: `~/000-projects/claude-code-plugins/plugins/community/contributing-clanker/`.

GitHub repo: `jeremylongshore/claude-code-plugins-plus-skills` (the local clone dir is named `claude-code-plugins/` for brevity but tracks the `-plus-skills` repo). This is Jeremy's existing marketplace repo (2k+ stars, 300+ forks, 45k+ NPM downloads). Plugins live under category subdirectories — `community/` is the right slot for an OSS-contribution tool.

Plugin layout:

```
plugins/community/contributing-clanker/
├── plugin.json            # manifest (synced version field on each release)
├── README.md
├── skills/
│   └── contribute/
│       ├── SKILL.md       # synced from contributing-clanker/skills/contribute/
│       ├── agents/        # synced — scout, researcher, draft-writer, test-runner, repo-analyzer
│       ├── scripts/       # synced — 41 gates + 4 orchestrators + lib + reporters
│       └── assets/        # synced — claim/pr/evidence templates
└── hooks/
    ├── install.sh         # creates ~/.contribute-system/{bin,gates,...}, copies runtime scripts
    └── uninstall.sh       # removes the plugin's runtime scripts; leaves user data
```

**Source of truth**: this repo's `skills/contribute/`. Plugin directory is a **build artifact** synced by `bin/release-plugin.sh` on tagged releases — NOT a parallel-maintained copy. The release script is the single mechanism to move bits across the boundary, eliminating drift by construction. Manual edits to the plugin directory are reverted on next sync; the plugin repo's PR template will say so.

The runtime dir (`~/.contribute-system/`) stays per-user — plugin install creates it, plugin uninstall leaves it (user's data is theirs). Only the skill bundle and the runtime scripts under `bin/` + `gates/` are installed/removed.

## Plugin manifest (`plugin.json`)

Schema matches existing `claude-code-plugins` plugins (see `~/000-projects/claude-code-plugins/plugins/devops/sugar/plugin.json` and `plugins/ai-ml/jeremy-google-adk/plugin.json` for reference):

```json
{
  "name": "contributing-clanker",
  "version": "0.1.0",
  "description": "Local-only OSS contribution command center with 41 deterministic gates against AI-slop failure modes",
  "author": {
    "name": "Jeremy Longshore",
    "email": "jeremy@intentsolutions.io",
    "url": "https://github.com/jeremylongshore"
  },
  "homepage": "https://github.com/jeremylongshore/contributing-clanker",
  "repository": "https://github.com/jeremylongshore/contributing-clanker",
  "license": "MIT",
  "keywords": [
    "oss",
    "contributions",
    "github",
    "ai-slop-prevention",
    "code-review",
    "open-source"
  ],
  "requires": {
    "claude-code": ">=1.0.0"
  },
  "capabilities": {
    "skills": true,
    "agents": true,
    "hooks": true
  },
  "installation": {
    "prerequisites": [
      "gh CLI authenticated (gh auth status)",
      "jq on PATH"
    ],
    "verification": [
      "gh auth status",
      "command -v jq"
    ]
  }
}
```

## Install / uninstall hooks

`hooks/install.sh`:

1. Creates `~/.contribute-system/{bin,gates,gates/lib,candidates,research,check-runs}` if missing
2. Copies plugin's `bin/*.sh` → `~/.contribute-system/bin/` (chmod +x)
3. Copies plugin's `gates/*.sh` → `~/.contribute-system/gates/` (chmod +x), and `lib/preamble.sh`
4. If `~/.contribute-system/profile.md` is missing, writes a starter template
5. Prints next-steps: "Edit `~/.contribute-system/profile.md` with your preferred langs and target tiers, then run `/contribute`"

`hooks/uninstall.sh`:

1. Removes plugin-shipped scripts from `~/.contribute-system/bin/` and `~/.contribute-system/gates/`
2. **Leaves** `candidates/`, `research/`, `log.jsonl`, `profile.md` — user's data is theirs
3. Prints: "Plugin removed. Your contribution state is preserved at `~/.contribute-system/`. To purge entirely: `rm -rf ~/.contribute-system/`."

## Release / sync mechanism (`bin/release-plugin.sh`)

The plugin directory is rebuilt by a release script that lives in this repo. The script:

1. Reads `version` from `bin/release-plugin.sh` argv (e.g., `bin/release-plugin.sh 0.1.0`)
2. Validates: working tree clean, on `master`, tag `v<version>` does not yet exist
3. Updates `plugin.json#version` in the plugin directory
4. `rsync --delete` syncs `skills/contribute/` → `<plugin-dir>/skills/contribute/`
5. Re-copies `hooks/install.sh` + `hooks/uninstall.sh` from a `release/hooks/` source dir in this repo
6. Tags the contributing-clanker repo as `v<version>` and commits to the plugin repo on a `release/contributing-clanker-v<version>` branch
7. Prints next-step: open a PR in `jeremylongshore/claude-code-plugins-plus-skills`

Why a script instead of a CI job: this keeps the release flow inspectable and reversible by Jeremy alone. CI can come later. The release script is checked into git, so any contributor can read exactly how plugin bits get assembled.

## Version bumps

Use semver. Patch = gate bug fix. Minor = new gate (preserves existing dossier schema). Major = dossier frontmatter schema change (requires user to refresh dossiers).

## Distribution

`/plugin install contributing-clanker` (the standard claude-code-plugins flow). Marketplace listing on `tonsofskills.com` with the project landing pattern from the gist publishing standard:

- Title, tagline, description
- Badges (version, license, gate count)
- One-Pager: The Problem (AI slop in OSS) / The Solution (3-layer + 62-mode catalog) / W5 + Stack tables / Differentiators
- Operator-Grade System Analysis (run `/appaudit`)

## Phase 2 → Phase 3 trigger

Phase 3 (containerized service) only happens if Phase 2 surfaces multi-user demand: >10 active installs with consistent feature asks beyond filesystem (e.g., live PR webhooks, shared dossier cache). Until then, the filesystem-only model is canonical.

## Cross-references

- Roadmap: `001-PP-VISN-product-vision-and-roadmap.md`
- Operations / risk: `010-OD-RISK-operations-and-risk.md`
- Marketplace repo: https://github.com/jeremylongshore/claude-code-plugins-plus-skills
