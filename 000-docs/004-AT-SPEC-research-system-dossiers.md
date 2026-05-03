---
title: Research System — @researcher subagent and dossiers
category: AT
type: SPEC
status: draft
last_updated: 2026-05-03
epic: contributing-clanker-drq
---

# Research System — @researcher subagent and dossiers

The dossier is **Layer 1** of the architecture (`002-AT-ARCH-system-architecture.md`). One markdown file per upstream repo at `~/.contribute-system/research/<owner>__<repo>.md`. Every gate reads from it. The `@researcher` subagent (`~/.claude/agents/researcher.md`) builds and refreshes them via `~/.contribute-system/bin/researcher-build.sh`.

## Dossier frontmatter schema

Every field below is read by at least one gate. Adding a gate that needs new info → add the field to the schema, the builder script, and the dossier template in lockstep.

```yaml
---
repo: <owner>/<repo>
default_branch: main                    # b01-base-branch
last_refreshed: 2026-05-03               # staleness check (>14d → refresh)
language: typescript
star_tier: mainstream
archived: false                           # gh api repos/X .archived
accepts_paid_external: true              # a05-paid-feature
cla_required: false                       # b04 (planned)
dco_required: false                       # b05-dco-signoff
conventional_commits: true                # b06-commit-format
branch_convention: "^(feat|fix|chore|docs)/[a-z0-9-]+$"  # b02-branch-naming
draft_first: true                         # c01-draft-first
pr_title_regex: "^(feat|fix|chore|docs|refactor)(\\(.+\\))?: "  # c02-pr-title-format
pr_template_required_sections: [Problem, Changes, How tested]  # c03-pr-body-sections
ai_disclosure_mechanism: "Agent context section in PR body"     # c08
coauthor_claude_forbidden: true           # c07-coauthor-banned
auto_pinging_forbidden: true              # c10
review_bots: [greptile-apps, copilot]     # c13-bots-passed
local_check_command: "pnpm test && pnpm typecheck && pnpm lint"  # b14-local-checks
etiquette_comment_required: false         # a06-claim-etiquette-required
mention_forbidden_in_issues: false        # d08
questions_forum: github_issues            # d04
auto_changelog: false                     # g03-no-changelog-edits
auto_version: false                       # g04-no-version-bump
refactor_only_pr_banned: false            # b10
test_only_pr_banned: false                # b11
disabled_gates: []                        # per-repo opt-out (any gate ID)
---
```

## Dossier body sections

| Section | Auto / manual | Notes |
|---|---|---|
| **TL;DR** | Auto | One paragraph: how this repo treats external contributors. Regenerated on refresh. |
| **Description** | Auto | Repo metadata (stars, forks, language, license, push date). Regenerated. |
| **Policy file inventory** | Auto | Existence check for CONTRIBUTING.md, CODE_OF_CONDUCT.md, AI_POLICY.md, CLA.md, CODEOWNERS, PULL_REQUEST_TEMPLATE.md. Regenerated. |
| **CONTRIBUTING excerpts** | Auto | Sectioned excerpts (claim etiquette, branch naming, commit format, draft-first). Regenerated. |
| **Linked sources** | Auto | Depth-1 link follow from CONTRIBUTING.md (handbook page, AI policy page, review guide). Skips social URLs. Regenerated. |
| **Issue templates** | Auto | Listing of `.github/ISSUE_TEMPLATE/*.{md,yml}`. Regenerated. |
| **Bots** | Auto | Sampled from one recent merged PR's reviewers. Regenerated. |
| **Pet peeves** | **Manual** | Curated by user. Examples: "PostHog auto-closes any PR with `Co-Authored-By: Claude`." Survives refresh. |
| **Failure log** | **Manual** | Append-only. When a PR gets dropped, transition.sh adds a row with date + reason. Survives refresh. |
| **Notes** | **Manual** | Free-form. Survives refresh. |

## Build vs refresh

`@researcher build <owner>/<repo>` — first-time. Always safe; runs `researcher-build.sh` and writes the result.

`@researcher refresh <owner>/<repo>` — existing dossier exists. Auto-generated frontmatter and auto sections are replaced; manual sections (Pet peeves, Failure log, Notes) are preserved verbatim. Implemented by parsing the existing file, capturing the manual blocks, regenerating the auto blocks, and stitching them back together.

The `last_refreshed:` field is checked on every transition by `/contribute` SKILL.md Step 0.5; >14d triggers an automatic refresh before the transition runs.

## Cross-references

- Architecture: `002-AT-ARCH-system-architecture.md`
- Source plan: `~/.claude/plans/fizzy-sprouting-quokka.md` § "Repo audit questionnaire" — the 41 questions a complete dossier answers
- Lifecycle Step 0.5 dossier auto-build/refresh: `006-AT-SPEC-lifecycle-workflow.md`
