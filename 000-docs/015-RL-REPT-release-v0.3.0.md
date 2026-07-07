# Release Report: contributing-clanker v0.3.0

## Executive Summary

- **Version**: v0.3.0 (from v0.2.0)
- **Release Date**: 2026-07-06 (approved; tag pushed 2026-07-07 UTC)
- **Release Type**: MINOR — 3 feat / 6 fix / 0 breaking
- **Approved By**: Jeremy Longshore (SHA-gated at `5ad1b22`)
- **Release Commit**: `1a7416c` · **Tag**: `v0.3.0` · **GH Release**: https://github.com/jeremylongshore/contributing-clanker/releases/tag/v0.3.0
- **Active ceremony time**: ~30 min (approval gate sat open overnight between plan and execution)

## Pre-Release State

- **PRs**: 0 open at release time. The 4-PR stack (#63 → #64 → #65 → #66) was merged the same session via `/repo-sweep` prep — each rung rebased onto the advancing master, CI re-run per rung, Gemini review threads addressed (2 adopted per PR average, 3 declined with in-thread rationale, 1 false positive disproven empirically).
- **Branches**: remote had only `master`; 3 squash-merged local branches deleted during the sweep.
- **Working tree**: clean; only CHANGELOG/README release edits in the release commit.
- **Stack-merge lesson**: GitHub *closes* (not retargets) a stacked PR when its base branch is deleted. Recovery: restore the base branch pointer, reopen, retarget, delete again. Prevention for later rungs: retarget the next PR **before** deleting the merged base branch.

## Changes Included (20 commits, 72 files, +5951/−219)

### Features
- Wasteland federation (`wl claim → PR → wl done`, board→repo map, A-phase gate adaptations) (#62)
- ASCII status dashboard printed first by `/contribute` Step 0 (#60)
- Deterministic daily recap email — house HTML template, positive read-proof heartbeat, fixed 2-day window, zero LLM; live on cron `45 6 * * *` (#66)

### Fixes (all red-tests-first)
- **c24 engagement-frame-leakage was fail-OPEN** — `|`-split truncated 3 regex tokens; author-footer anchor dead. Parallel arrays + loud-on-unevaluable BLOCK (#64)
- c22 fail-closed under `set -e` (#59, #61) · c26 unreachable SKIP · c11 `0\n0` stderr noise · f04 dead disclosure-verify paths + lowercase-ID crash (#65)
- e02 crashed fail-closed on torn log lines on every `shortlist→claimed` — found by the daily recap's block-event table on its first live day (#66)
- `log.jsonl` appends fail loud, never silent; the unguarded `gate_override` append could torn-abort a committed transition (#65)
- scout `--refresh` closed-issue drop (#58); integration test asserted stale hardcoded counts — now derives from source (#66)

### Breaking Changes
None.

## Documentation Updates
- CHANGELOG `[Unreleased]` → `[0.3.0] - 2026-07-06` + fresh stub; README title + release badge → v0.3.0
- CLAUDE.md fully drift-corrected against the tree earlier in the same session (#63)

## Metrics

| Metric | Value |
|--------|-------|
| Commits | 20 |
| Files changed | 72 (+5951/−219) |
| Test suite | 276 bats cases (262 gate + 14 reporter) + 5 L4 regression suites |
| Gate count | 51 (A=8 B=10 C=20 D=3 E=2 F=3 G=5) — unchanged; 6 gates repaired |
| Days since v0.2.0 | 20 |

## External Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| GitHub Gist | UPDATED → v0.3.0 | https://gist.github.com/ff44ab81d255fd183c2f14bdfbad2c14 — version refs, stale "no CI" / "48 cases" / "17 top-level" facts corrected, condensed 0.3.0 changelog block added |
| GitHub Release | CREATED | notes generated from the changelog section |

## Quality Gates

| Gate | Status |
|------|--------|
| CI on release HEAD (`ci` + `codeql`) | ✓ green (5ad1b22) |
| SemVer 2.0.0 + monotonic bump | ✓ (0.2.0 → 0.3.0) |
| Keep-a-Changelog conformance (2.6.3–2.6.5) | ✓ |
| Secrets scan | ✓ clean |
| Scaffolding (7 standard files) | ✓ |
| Beads in-progress | ✓ none |

## Known Residuals (accepted, non-blocking)

- **12 open Dependabot alerts, all in `tools/package-lock.json`** (1 critical, 8 high, 3 medium) — the dev-only PDF utility, NOT the shipped contribution-safety surface. js-yaml/gray-matter residual documented at #52 / bead `i4y.5`. Revisit if `tools/` ever ships.
- Vendored audit-harness pinned at v1.1.5 vs npm 1.2.2 — chore bead filed (`/sync-testing-harness`).
- Gate inventory 51/62 vs spec — re-triage bead filed (build on empirical signal only).
- Daily recap composes from local state; pre-compose GitHub reconcile bead filed after the first live email listed 3 upstream-closed PRs as awaiting response.

## Rollback Procedure

```bash
git push origin --delete v0.3.0 && git tag -d v0.3.0
gh release delete v0.3.0 --yes
git revert 1a7416c && git push origin master
# gist: re-run the v0.2.0 patch in reverse or restore from gist revision history
```

## Post-Release Checklist

- [ ] Confirm tomorrow's 6:45am recap email fires from cron (first unattended run)
- [ ] Watch for Greptile App swap reaching this repo → remove `.coderabbit.yaml`
- [ ] Phase-2 plugin packaging (`bin/release-plugin.sh 0.3.0`) remains deferred pending prioritization
