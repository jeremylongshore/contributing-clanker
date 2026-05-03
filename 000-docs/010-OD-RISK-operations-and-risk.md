---
title: Operations and Risk Register
category: OD
type: RISK
status: draft
last_updated: 2026-05-03
epic: contributing-clanker-i4y
---

# Operations and Risk Register

What can go wrong with `contributing-clanker` itself, what we do about it, and how to roll back if a piece misbehaves.

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Gate latency creep** — full `working→submitted` exceeds 60s, user starts skipping the system | Medium | High (defeats purpose) | Gates cap at 10s each (gate-runner enforces with `timeout 10`). Most gates read the dossier (cheap), not live `gh` (slow). Anything that *must* hit `gh` uses `gh_safe` retry wrapper with backoff. |
| **False-positive BLOCKs** — a gate fires on legitimate work, user develops override-habit | Medium | High | `--override-gate <ID> "reason"` escape hatch with audit trail. Per-repo `disabled_gates: [...]` opt-out. Quarterly review of override reasons → gate refinement or retirement. |
| **Dossier drift** — repo's CONTRIBUTING.md changes, dossier still reflects old rules | High | Medium | 14-day staleness threshold; SKILL.md Step 0.5 auto-refresh. Manual `@researcher refresh <repo>` always available. `last_refreshed:` field is canonical age. |
| **Scope creep** — adding gates that aren't justified by a real-world trap | Medium | Medium | Catalog rule (`007-DR-CATG-failure-mode-catalog.md`): every gate must trace to an enumerated failure mode with a real-world trigger. New gate without a real-world trigger → reject in review. |
| **Override abuse** — user routinely overrides BLOCKs without genuine justification | Low | High | `g06-override-rate-limit` caps overrides at 3/day across the system. Forces reflection: if you're overriding the same gate weekly, the gate is wrong or the dossier is wrong — fix that, don't override. |
| **Buggy gate fails open** — a gate has a `set -e` bug and exits non-zero, runner could mis-treat | Low | Critical | Preamble's ERR trap converts any non-zero exit into a fail-closed BLOCK with reason "gate crashed at line N". Verified by `008-TQ-TEST-testing-and-verification.md`. |
| **Stale candidates** — candidate `status:` says `submitted` but PR is merged/closed | Medium | Low | Reconciliation step in SKILL.md walks candidates with `pr_number:` set, queries `gh pr view`, updates `status:` to `merged` or `dropped` accordingly. Dropped → row added to dossier `## Failure log`. |
| **Cross-host portability** — user uses two boxes, candidate state diverges | Low | Medium | `~/.contribute-system/` is git-friendly (markdown + JSONL). Phase 2 plugin docs will recommend keeping it as a private git repo synced via standard git workflow. Not enforced by tooling. |

## Caching strategy (latency)

Gates that *can* read the dossier do, instead of calling `gh` live. The dossier is refreshed via `@researcher` on staleness, not on every transition. This is the dominant latency win: a `working→submitted` run with all 27 phase-B/C/E/F/G gates completes in single-digit seconds when the dossier is hot.

The few gates that *must* hit live `gh` (`a01-already-assigned`, `a02-already-shipped`, `c12-ci-green`, `c13-bots-passed`, `e02-ai-strike-track` for live AI-policy logs) use `gh_safe` from `lib/preamble.sh` — 3 retries, exponential backoff, 30s per-call timeout, graceful degradation to SKIP if all retries fail.

## Rollback strategy

The 3-layer architecture means each piece can be independently disabled without breaking the others.

| Symptom | Rollback action |
|---|---|
| One gate over-fires across all repos | `chmod -x ~/.contribute-system/gates/<gate>.sh` (runner skips it) |
| One gate over-fires on a specific repo only | Edit dossier: `disabled_gates: [<gate>]` |
| Dossier system mis-reads a repo | `rm` the dossier and `@researcher build` from scratch |
| Lifecycle workflow misbehaves | Remove the offending step from `~/.claude/skills/contribute/SKILL.md` (skill is markdown; surgical edit is safe) |
| Whole system is wrong | Skip the skill — `gh issue comment` / `gh pr create` directly. The system is opt-in via `/contribute`; nothing forces its use. |

## Operational runbook

| Scenario | Command |
|---|---|
| Daily start | `/contribute` (Step 0 auto-refreshes state) |
| Find new work | `/contribute` then "scout for X" |
| Build dossier | `@researcher build <owner>/<repo>` |
| Refresh stale dossier | `@researcher refresh <owner>/<repo>` |
| Inspect a transition decision | `~/.contribute-system/bin/transition.sh <action> <candidate> --dry-run` |
| Review recent gate activity | `tail -200 ~/.contribute-system/log.jsonl \| jq 'select(.event \| test("gate_"))'` |
| Review overrides | `jq 'select(.event == "gate_override")' ~/.contribute-system/log.jsonl` |
| Reconcile candidate state vs GitHub | `/contribute` then "reconcile candidates" |

## Things we explicitly *don't* protect against

- A maintainer changing `CONTRIBUTING.md` mid-PR. Dossier was correct at `last_refreshed`; user is responsible for re-reading post-refresh notice.
- A repo's review bots being temporarily down. `c13-bots-passed` will WARN-then-skip via `gh_safe` graceful degradation, not BLOCK.
- A repo with no CONTRIBUTING.md at all. Builder writes a minimal dossier flagging the absence; gates that need missing fields return SKIP.

## Cross-references

- Architecture: `002-AT-ARCH-system-architecture.md`
- Gate inventory: `005-AT-SPEC-gate-inventory.md`
- Lifecycle: `006-AT-SPEC-lifecycle-workflow.md`
- Verification strategy: `008-TQ-TEST-testing-and-verification.md`
- Phase 2 plan: `009-OD-PLAN-plugin-distribution-phase-2.md`
