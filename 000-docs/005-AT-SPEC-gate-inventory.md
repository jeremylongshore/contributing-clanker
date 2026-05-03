---
title: Gate Inventory and Contract
category: AT
type: SPEC
status: draft
last_updated: 2026-05-03
epic: contributing-clanker-lhg
---

# Gate Inventory and Contract

Layer 2 of the architecture. Gates are the deterministic chokepoint between LLM reasoning and external action. **62 failure modes enumerated** (see `007-DR-CATG-failure-mode-catalog.md`); **41 gates installed today** (the rest are tracked in beads as future work).

## Gate contract

Every gate at `~/.contribute-system/gates/<phase><id>-<short>.sh`:

- **Stdin**: one JSON object — `{candidate: <path>, dossier: <path>, action: <transition>, env: {repo, branch}}`. Read via `gate_read_input` from `lib/preamble.sh`.
- **Stdout**: one JSON verdict — `{severity, gate, reason, fix_hint?}`.
- **Exit code**: ALWAYS 0. Non-zero means the gate itself crashed; the preamble's ERR trap converts that to a fail-closed BLOCK so a buggy gate can't silently let work through.
- **Time budget**: <10s. `gate-runner.sh` enforces with `timeout 10`.
- **Read-only**: gates never mutate state outside `~/.contribute-system/log.jsonl` (one append for observability via `gate_log_run`).

## Severity levels

| Severity | Effect | Example |
|---|---|---|
| **PASS** | Transition proceeds. | Issue has no assignees → `a01-already-assigned` PASS |
| **WARN** | Transition proceeds, warning surfaced in briefing. User can acknowledge inline. | Diff touches files spanning ≥2 CODEOWNERS teams → `b09` WARN |
| **BLOCK** | Transition refused. User must fix or `--override-gate <ID> "reason"`. | Issue is closed → `a05-issue-still-open` BLOCK |
| **INFORM** | Silent log entry; trend analysis. | LLM self-attest "agent-assisted vs agent-authored" → `e03` INFORM |
| **SKIP** | Gate didn't run (not applicable / data unavailable). | Dossier missing required field → graceful degradation |

## Phases (A–G)

Gates are grouped by lifecycle phase, encoded as the first letter of the filename. `gate-runner.sh` selects the phase set per action:

| Action | Phases run |
|---|---|
| `open→shortlist` | A |
| `shortlist→claimed` | A, E |
| `claimed→working` | A, B |
| `working→submitted` | B, C, E, F, G |
| `open-pr` | C, E |
| `flip-to-ready` | C |
| `post-comment` | D |
| `open-issue` | D |

## Plug-in / stackable design

Adding a gate = drop a new `<phase><id>-<name>.sh` into `~/.contribute-system/gates/`, `chmod +x`, source `lib/preamble.sh` first. No registration. `gate-runner.sh` discovers by glob.

Removing a gate without deleting it = `chmod -x` on the file. The runner's `[[ -f && -x ]]` filter skips it.

## Per-repo opt-out

Set `disabled_gates: [b10, c14]` in the dossier frontmatter. `gate-runner.sh` reads this and skips matching gates for that repo only. Useful for repos where a generic gate over-fires.

## Override mechanism

`transition.sh --override-gate <ID> "reason"` records an override against a specific gate ID before running gates. If the named gate returns BLOCK, the override absorbs it (transition proceeds). Override + reason are appended to `log.jsonl` and to the candidate's `overrides:` frontmatter list. Audit trail survives indefinitely.

`g06-override-rate-limit` caps overrides at 3/day across the whole system to prevent override-abuse from becoming a habit.

## Currently installed (41 of 62)

| Gate ID | Phase | Severity | Trigger transition(s) |
|---|---|---|---|
| a01-already-assigned | A | BLOCK | open→shortlist, shortlist→claimed |
| a02-already-shipped | A | BLOCK | open→shortlist, shortlist→claimed |
| a03-duplicate-flagged | A | WARN | shortlist→claimed |
| a04-issue-age | A | WARN | shortlist→claimed |
| a05-issue-still-open | A | BLOCK | shortlist→claimed |
| a06-claim-etiquette-required | A | BLOCK | claimed→working |
| a09-mention-routing | A | WARN | claim |
| b01-base-branch | B | BLOCK | working→submitted |
| b02-branch-naming | B | BLOCK | working→submitted |
| b03-clone-fresh | B | WARN | claimed→working |
| b05-dco-signoff | B | BLOCK | working→submitted |
| b06-commit-format | B | BLOCK | working→submitted |
| b07-scope-files | B | WARN | working→submitted |
| b12-new-deps | B | WARN | working→submitted |
| b14-local-checks | B | BLOCK | working→submitted |
| b16-local-check-allowlist | B | INFORM | working→submitted |
| c01-draft-first | C | BLOCK | open-pr |
| c02-pr-title-format | C | BLOCK | open-pr |
| c03-pr-body-sections | C | BLOCK | open-pr |
| c04-ui-screenshots | C | BLOCK | open-pr |
| c05-test-evidence | C | BLOCK | open-pr |
| c07-coauthor-banned | C | BLOCK | working→submitted |
| c09-issue-link | C | BLOCK | open-pr |
| c11-no-force-push | C | BLOCK | push |
| c12-ci-green | C | BLOCK | flip-to-ready |
| c13-bots-passed | C | BLOCK | flip-to-ready |
| c16-no-self-merge | C | BLOCK | merge |
| c19-body-claim-vs-diff | C | WARN | open-pr |
| d02-no-ai-bug-reports | D | BLOCK | open-issue |
| d03-no-ai-pr-reviews | D | BLOCK | review submit |
| d05-no-reopen | D | WARN | reopen |
| e02-ai-strike-track | E | BLOCK | any external action |
| e04-fork-target | E | BLOCK | push |
| f01-license-compat | F | WARN | working→submitted |
| f03-fixtures-clean | F | WARN | working→submitted |
| f04-override-disclosure | F | INFORM | open-pr |
| g01-no-vendored-edits | G | BLOCK | working→submitted |
| g02-protected-paths | G | WARN | working→submitted |
| g03-no-changelog-edits | G | WARN | working→submitted |
| g04-no-version-bump | G | WARN | working→submitted |
| g06-override-rate-limit | G | BLOCK | any with override |

## Cross-references

- Failure modes 1:1 mapped to gates: `007-DR-CATG-failure-mode-catalog.md`
- Lifecycle integration: `006-AT-SPEC-lifecycle-workflow.md`
- Shared library helpers: `~/.contribute-system/gates/lib/preamble.sh`
