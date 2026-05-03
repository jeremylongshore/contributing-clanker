---
title: Lifecycle Workflow — /contribute SKILL.md and transition.sh
category: AT
type: SPEC
status: draft
last_updated: 2026-05-03
epic: contributing-clanker-15b
---

# Lifecycle Workflow — `/contribute` SKILL.md and `transition.sh`

Layer 3 of the architecture. The skill orchestrates; `transition.sh` is the chokepoint between LLM intent and external action.

## Lifecycle states

```
open → shortlist → claimed → working → submitted → merged
                                                ↘
                                                  dropped
```

Each candidate's `status:` field in its frontmatter (at `~/.contribute-system/candidates/<owner>__<repo>__issue<N>.md`) reflects exactly one of these states. Transitions are driven by the user's actions; gates run before each transition.

## SKILL.md flow (`~/.claude/skills/contribute/SKILL.md`)

### Step 0 — Refresh state (every invocation)

Run in parallel: `gh pr list --author=@me`, `gh issue list --author=@me`, scan local candidate frontmatter, tail `log.jsonl`. Summarize: in-flight PRs, claimed-but-not-submitted, top-N shortlisted candidates by `scout_score`, drift between `gh` and candidate `status:`, candidates with stale or missing dossiers.

### Step 0.5 — Ensure dossier exists for the target repo

Before any transition, check `~/.contribute-system/research/<owner>__<repo>.md`. If missing → invoke `@researcher build`. If present but `last_refreshed` >14d → invoke `@researcher refresh`. See `004-AT-SPEC-research-system-dossiers.md`.

### Steps 1–5 — Discover, Qualify, Claim, Work, Submit

| Step | Subagent / tool | Transition triggered |
|---|---|---|
| 1. Discover | `@scout` | (writes new candidates as `open`) |
| 2. Qualify | `agents/repo-analyzer.md` | open→shortlist |
| 3. Claim | claim draft → user approval → `gh issue comment` | shortlist→claimed → claimed→working |
| 4. Work | per-repo CLAUDE.md, `agents/test-runner.md` | (no transition; produces test evidence in `~/.contribute-system/check-runs/`) |
| 5. Submit | `agents/draft-writer.md` → user approval → `gh pr create --draft` | working→submitted |

Default to **Design Issue first, PR second**. Auto-opening PRs is the slop pattern this system exists to prevent. Mandatory: human approval before any external submission (see SKILL.md "Mandatory: human approval before external submission").

## `transition.sh` contract

```
transition.sh <action> <candidate-path> [options]
  --dossier <path>                 override dossier path
  --override-gate <id> "<reason>"  pre-record an override (repeatable)
  --dry-run                        run gates, print verdict, no mutation
  --max-gate-age <seconds>         TOCTOU mitigation (default 60)
```

Behavior:

1. Validates inputs; reads candidate frontmatter (`repo`, `branch`, `overrides`)
2. Resolves dossier path from `repo` if `--dossier` not supplied
3. Calls `gate-runner.sh <action> <candidate> <dossier>`
4. Aggregates verdicts; if any unmitigated BLOCK → exit 1
5. On success: atomic candidate update (write-temp + rename) bumps `status:` to the right-hand side of the action; appends overrides used to the `overrides:` list
6. Always appends a `transition_<action>` event to `log.jsonl`

Exit codes: 0 = transition allowed, 1 = blocked, 64 = bad usage, 65 = candidate not found.

## `gate-runner.sh` action→phase mapping

```
open→shortlist        → phase A
shortlist→claimed     → phases A, E
claimed→working       → phases A, B
working→submitted     → phases B, C, E, F, G
open-pr               → phases C, E
flip-to-ready         → phase C
post-comment          → phase D
open-issue            → phase D
unknown               → all phases (fail-closed default)
```

Within a phase, gates run alphabetically by filename. Each gate gets the JSON contract on stdin; verdicts aggregated into a single output JSON. Per-gate timeout: 10s. Aggregation: any BLOCK → BLOCK overall (unless overridden); else any WARN → WARN; else PASS.

## Atomic candidate updates

The candidate file IS the tracker. Mid-flight crash must never leave a half-written candidate. transition.sh writes to `<candidate>.tmp.<pid>`, then `mv` atomically replaces the original. POSIX rename semantics guarantee either the old file or the new file is visible — never a torn write.

## Override audit trail

Every `--override-gate` invocation:

1. Records `event: gate_override` in `log.jsonl` with timestamp, gate ID, reason, candidate path
2. Appends `<gate>:<reason-hash>` to the candidate's `overrides:` frontmatter list
3. Triggers `g06-override-rate-limit` to enforce the daily cap

The override survives in the candidate file forever (or until the candidate is `dropped` and archived). Reviewing past overrides = `jq 'select(.event == "gate_override")' log.jsonl`.

## Cross-references

- SKILL.md: `~/.claude/skills/contribute/SKILL.md`
- Architecture: `002-AT-ARCH-system-architecture.md`
- Gate inventory: `005-AT-SPEC-gate-inventory.md`
- Source plan: `~/.claude/plans/fizzy-sprouting-quokka.md`
