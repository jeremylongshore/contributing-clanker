# Test Audit — contributing-clanker

**Date**: 2026-06-17 (`/audit-tests`)
**Branch**: master · working tree clean
**Supersedes**: the 2026-05-03 audit (pre-v0.2.0; its "install bats" P1 is now done)

## Grade

**B− (77/100)** — strong test infrastructure (bats passing, 5 regression suites green, Gherkin present), pulled down by thin gate-level unit coverage (29%), lint debt in test scripts, and absent requirements-traceability.

## Classification

hybrid: **claude-skill + bash gate-harness + workspace/governance** (per `tests/TESTING.md`). Primary language bash. Test targets: `skills/contribute/scripts/**/*.sh`. Single-user, filesystem-only (Phase 1).

## Freshness

- ⚠ **audit-harness drift**: vendored **v1.1.5** → npm latest **1.2.2**. The vendored v1.1.5 CLI lacks the newer `classify` / `audit` / `scan` / `conform` brain this skill assumes (only `verify`/`init`/`list`/`escape-scan`/`arch`/`bias`/`gherkin-lint`/`crap`), so classification + layer-mapping were done manually. Run `/sync-testing-harness` to upgrade. (Advisory — not blocking.)
- ○ **No hash manifest** (`.harness-hash` absent) → exit-3 "fresh / never-initialized". Not a halt. Harness not yet wired into pre-commit/CI (Phase-2 deferral per policy).

## Per-layer presence / config / enforcement

| Layer | Applicable | Status | Evidence |
|---|---|---|---|
| L1 hooks / CI | yes | **partial** | `.pre-commit-config.yaml` present (manual-run during beads coexistence); **no CI** (`.github/workflows` empty — Phase-1 deferral per policy) |
| L2 static | yes | **present, not clean** | `scripts/lint-bash.sh` (shellcheck) + `.shellcheckrc`; **12 findings** (SC2034/SC2064/SC2164) — all in `test-*.sh`, none in gates. Violates TESTING.md "0/0" floor |
| L3 unit | yes | **present, partial coverage** | bats **48/48 pass** across 15 files — but only **15 of 51 gates** have a `.bats` test (29%). All recent gates (a07, b13, c19–c27, …) untested at unit level |
| L4 integration / regression | yes | **present, green** | 5 regression suites all pass; `test-plugin-install.sh` (26 assertions) unmeasured here (needs plugin env) |
| L5 system | waived | — | no perf/chaos/a11y surface (policy) |
| L6 E2E / BDD | optional | **present** | 5 `features/*.feature`; gherkin-lint: 3 warnings, 0 errors (advisory) |
| L7 acceptance | waived | — | single-user (policy) |

## P0 gaps (block)

**None.** No coverage-floor breach (coverage% waived for bash per policy), no uncovered MUST (no RTM defined yet), no CRAP/arch violations (N/A for bash), escape-scan clean (no pending diff).

## P1 gaps (within 1–2 slices)

1. **L3 — 36 of 51 gates have no unit test.** The bats suite is sample-based; every gate added since the last audit (a07/b13 trust-ladder, c19–c27 content-fidelity, plus a04/a06/a09/b03/b07/b12/b14/b16/c02/c04/c05/c07/c09/c11/c13/c16/d02/d03/e04/f01/f03/f04/g02/g03/g06) lacks a `.bats` predicate test. They're partially exercised by regression suites, but not unit-isolated.
2. **L2 — shellcheck not clean (12 findings)** in `test-*.sh` (SC2034 unused vars used inside `eval` strings, SC2064 quoting, SC2164 `cd` without `|| exit`). Violates the TESTING.md "0 errors, 0 warnings" floor. Mostly false-positive-ish (eval-string vars) but should be silenced with directives or fixed.
3. **Traceability absent** — `tests/RTM.md`, `tests/PERSONAS.md`, `tests/JOURNEYS.md` all missing. The 62-failure-mode catalog (`000-docs/007`) + lifecycle spec (`000-docs/006`) are the natural sources; no requirement→gate→test mapping exists.
4. **test-bias counter flagged** (exit 1, advisory) — review for tautological/weak assertions in the bats + regression suites.

## P2 gaps (logged)

- Harness drift v1.1.5 → 1.2.2 (`/sync-testing-harness`).
- No `.harness-hash` manifest — harness not pinned; walls not enforced (Phase-2 deferral per policy).
- No GitHub Actions CI (Phase-1 deferral per policy; pre-commit is the current gate).
- `tests/TESTING.md` is stale: dated 2026-05-03, cites v0.1.0 / "45 scripts / 41 gates", and marks L2/L3 as open gaps that are now done. Observational sections refreshed this run; **policy sections need an engineer pass** (re-state Applicable-layers status, counts, thresholds for bats).

## RTM / Personas / Journeys

Not built (P1 #3). Recommended sources: RTM ← `000-docs/007` (62 modes) mapped to the 51 gates; PERSONAS ← upstream-maintainer + downstream-contributor; JOURNEYS ← `000-docs/006` lifecycle (open→…→merged) per-transition gate phases.

## Escape-scan

Clean — no pending diff to scan (working tree clean).

## Handoff

P1 gaps present, no P0. On `master` (protected) → handoff to `implement-tests` requires confirmation.
