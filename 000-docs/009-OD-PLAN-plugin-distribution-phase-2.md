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

`claude-code-plugins-plus-skills/plugins/contributing-clanker/`. This is Jeremy's existing marketplace repo (2k+ stars, 300+ forks, 45k+ NPM downloads). Plugin layout:

```
plugins/contributing-clanker/
├── plugin.json            # manifest
├── README.md
├── skills/
│   └── contribute/
│       └── SKILL.md       # moved from ~/.claude/skills/contribute/
├── agents/
│   ├── scout.md           # moved from ~/.claude/agents/scout.md
│   └── researcher.md      # moved from ~/.claude/agents/researcher.md
├── bin/                   # gate scripts and transition tooling
│   ├── transition.sh
│   ├── gate-runner.sh
│   └── researcher-build.sh
├── gates/                 # all installed gate scripts
│   └── lib/preamble.sh
└── hooks/
    ├── install.sh         # creates ~/.contribute-system/, copies bin+gates
    └── uninstall.sh       # removes the plugin's bin+gates from runtime dir
```

The runtime dir (`~/.contribute-system/`) stays per-user — plugin install creates it, plugin uninstall leaves it (user's data is theirs). Only `bin/`, `gates/`, the agents, and the skill are installed/removed.

## Plugin manifest (`plugin.json`)

Standard claude-code-plugins manifest:

```json
{
  "name": "contributing-clanker",
  "version": "0.1.0",
  "description": "Local-only OSS contribution command center with 41 deterministic gates against AI-slop failure modes",
  "author": "Jeremy Longshore <jeremy@intentsolutions.io>",
  "license": "MIT",
  "compatibility": "Claude Code 1.x; requires gh CLI and jq on PATH",
  "tags": ["oss", "contributions", "github", "ai-slop-prevention"],
  "skills": ["skills/contribute/SKILL.md"],
  "agents": ["agents/scout.md", "agents/researcher.md"],
  "hooks": {
    "post_install": "hooks/install.sh",
    "pre_uninstall": "hooks/uninstall.sh"
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
