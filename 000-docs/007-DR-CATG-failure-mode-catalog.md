---
title: Failure-Mode Catalog (62 enumerated modes)
category: DR
type: CATG
status: draft
last_updated: 2026-05-03
epic: contributing-clanker-p5q
---

# Failure-Mode Catalog (62 enumerated modes)

Every gate in `005-AT-SPEC-gate-inventory.md` exists because some specific maintainer pet peeve made it necessary. If a gate can't be traced back to a real-world failure mode, it doesn't belong. **This is a living document** — new modes get appended as we observe them; nothing is removed unless empirically useless.

Source plan: `~/.claude/plans/fizzy-sprouting-quokka.md` § "Failure-mode catalog".

## A. Discovery & Claim (12 modes)

| # | Failure | Real-world trigger | Gate |
|---|---|---|---|
| A1 | Claim already-assigned issue | Tracer-Cloud opensre #1129, 2026-05-02 | a01-already-assigned |
| A2 | Claim already-shipped work | PostHog #55412, 2026-05-02 | a02-already-shipped |
| A3 | Claim duplicate issue | "duplicate of #X" in body/comments | a03-duplicate-flagged |
| A4 | Claim stale/wontfix/blocked | labels: `stale`, `wontfix`, `blocked`, `needs-info` | a04-issue-age (issue age proxy; full label gate planned) |
| A5 | Claim paid-feature at refusing repo | PostHog: "we prefer not to accept external contributions for paid features" | (a05-paid-feature planned) |
| A6 | Skip required claim etiquette | Tracer-Cloud: "comment so maintainers know" | a06-claim-etiquette-required |
| A7 | Use claim etiquette where banned | PostHog: "we don't assign issues; just open a PR" | (a07 planned) |
| A8 | Wrong claim mechanism | Algora `/bounty` vs `/take` vs comment-only | (a08 planned) |
| A9 | Tag wrong people | @-mention maintainers when CODEOWNERS exists | a09-mention-routing |
| A10 | Claim above historical merge rate | <30% personal merge rate at this repo | (a10 planned) |
| A11 | Claim against 1st AI policy strike | PostHog: 2 = blocked | (a11 — see e02) |
| A12 | Claim from blocked account | `gh api user .suspended_at` non-null | (a12 — see e02) |

## B. Pre-PR Local Work (15 modes)

| # | Failure | Real-world trigger | Gate |
|---|---|---|---|
| B1 | Wrong base branch | `master` vs `main` mismatch | b01-base-branch |
| B2 | Wrong branch naming | `feat/x` when repo wants `feature/x` | b02-branch-naming |
| B3 | Stale local clone | PostHog clone 8888 commits behind, 2026-05-02 | b03-clone-fresh |
| B4 | Missing CLA signature | repo requires CLA, contributor not signed | (b04 planned) |
| B5 | Missing DCO sign-off | commits lack `Signed-off-by:` | b05-dco-signoff |
| B6 | Wrong commit format | Conventional Commits expected, freeform used | b06-commit-format |
| B7 | Scope creep | files outside issue's "files to touch" list | b07-scope-files |
| B8 | "While I'm here" cleanups | formatter passes, unrelated typos | (b08 planned) |
| B9 | Cross-CODEOWNERS spread | diff spans ≥2 team blocks | (b09 planned) |
| B10 | Refactor-only PR where banned | Tracer-Cloud: "Do not open one unless asked" | (b10 planned) |
| B11 | Test-only PR where banned | Same source | (b11 planned) |
| B12 | New deps without discussion | package.json/Cargo.toml new entries, no issue | b12-new-deps |
| B13 | Missing tests for change category | bug fix without regression test | (b13 planned) |
| B14 | Skipping local pre-PR commands | Tracer-Cloud: `make lint && make format-check && make typecheck && make test-cov` | b14-local-checks (+ b16-allowlist) |
| B15 | Unused AI-generated code | LLM helper left in for "completeness" | (b15 planned) |

## C. PR Submission (16 modes)

| # | Failure | Real-world trigger | Gate |
|---|---|---|---|
| C1 | Non-draft when draft preferred | PostHog: "Open a draft PR" | c01-draft-first |
| C2 | Wrong PR title format | Conventional Commits expected | c02-pr-title-format |
| C3 | Missing required body sections | PostHog template: Problem/Changes/How tested/Agent context | c03-pr-body-sections |
| C4 | Missing UI screenshots | PostHog: "screenshot, screen recording, or GIF" | c04-ui-screenshots |
| C5 | Missing test evidence | AI_POLICY closes on sight | c05-test-evidence |
| C6 | False manual-testing claim | PostHog: "Agents: do NOT claim manual testing" | (c06 planned) |
| C7 | Banned `Co-Authored-By: Claude` | PostHog explicit | c07-coauthor-banned |
| C8 | AI-disclosure boilerplate slop | not in repo's specified format | (c08 planned) |
| C9 | Wrong/missing issue link | `Closes #N` missing or wrong | c09-issue-link |
| C10 | Auto-pinging reviewers | CODEOWNERS handles routing | (c10 planned) |
| C11 | Force-push to shared branch | `git push --force` on non-personal branch | c11-no-force-push |
| C12 | Submitting with red CI | `gh pr checks` failed/pending | c12-ci-green |
| C13 | Submitting before bots finish | Greptile/Copilot still pending | c13-bots-passed |
| C14 | Bumping reviewers | Comment <14d after own previous comment | (c14 planned) |
| C15 | Resolved-without-fix threads | trust loss with maintainer | (c15 planned) |
| C16 | Self-merge / self-approve | `gh pr merge` by author | c16-no-self-merge |
| C19 | Body claim disagrees with diff | "fixes login" but diff only touches docs | c19-body-claim-vs-diff |

## D. Communication & Tone (8 modes)

| # | Failure | Real-world trigger | Gate |
|---|---|---|---|
| D1 | Argumentative replies | LLM judgment | (d01 planned) |
| D2 | AI-generated bug reports | PostHog AI_POLICY: "closed without response" | d02-no-ai-bug-reports |
| D3 | AI-generated PR reviews on others' PRs | PostHog AI_POLICY: "generally never helpful" | d03-no-ai-pr-reviews |
| D4 | Wrong forum for questions | Tracer-Cloud: questions go to Discord | (d04 planned) |
| D5 | Reopening closed PR | disrespects close decision | d05-no-reopen |
| D6 | Duplicate issue when tracker exists | fuzzy-match on existing open issues | (d06 planned) |
| D7 | Tone mismatch | LLM yes/no vs 5 recent merged PRs | (d07 planned) |
| D8 | @-mention etiquette violation | some repos forbid @-mentioning maintainers | (d08 planned) |

## E. Identity & Account (4 modes)

| # | Failure | Real-world trigger | Gate |
|---|---|---|---|
| E1 | Submitting from blocked account | account-level disciplined | (e01 — see e02 trap below) |
| E2 | After 1 prior AI-policy closure | PostHog: 2 = blocked | e02-ai-strike-track |
| E3 | Misattributing authorship | LLM self-attestation | (e03 planned) |
| E4 | Wrong fork target | typo in remote URL pushes to wrong fork | e04-fork-target |

## F. Legal & Licensing (3 modes)

| # | Failure | Real-world trigger | Gate |
|---|---|---|---|
| F1 | License incompatibility | GPL into permissively-licensed | f01-license-compat |
| F2 | AI-memorized provenance | LLM regurgitating copyrighted code | (f02 planned) |
| F3 | Copyrighted fixtures | sample data with hidden IP | f03-fixtures-clean |
| F4 | Override without disclosure | gate overridden but PR body doesn't say so | f04-override-disclosure |

## G. Infrastructure & Process (4 modes)

| # | Failure | Real-world trigger | Gate |
|---|---|---|---|
| G1 | Editing vendored/generated files | should regenerate from source | g01-no-vendored-edits |
| G2 | Touching protected paths | `.github/workflows/`, `terraform/`, `helm/` | g02-protected-paths |
| G3 | Modifying auto-generated CHANGELOG | changesets-bot territory | g03-no-changelog-edits |
| G4 | Bumping auto-managed version | semantic-release territory | g04-no-version-bump |
| G6 | Override rate-limit breach | >3 overrides/day across the system | g06-override-rate-limit |

## Append protocol

When a new failure mode is observed in the wild:

1. Add the row here (next number in its phase)
2. Add a `disabled_gates`-able gate at `~/.contribute-system/gates/<phase><id>-<short>.sh`
3. Add the dossier field that gate reads (if needed) to `004-AT-SPEC-research-system-dossiers.md`
4. Update `005-AT-SPEC-gate-inventory.md` with the new row
