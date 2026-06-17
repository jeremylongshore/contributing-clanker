# Release Report: contributing-clanker v0.2.0

## Executive Summary

- **Version**: 0.1.2 → 0.2.0
- **Release Date**: 2026-06-16 (tag/commit `06fc617`; GitHub release published 2026-06-17 UTC)
- **Release Type**: minor (7 feat / 6 fix / 0 breaking)
- **Approved By**: jeremylongshore (SHA confirmation `39b9bd5`)
- **Ceremony**: `/release` v2.3, full 8-phase

## Pre-Release State

- **Open PRs**: 0
- **Branches**: `master` only (all feature branches merged + pruned earlier in session)
- **Working tree**: clean
- **Beads**: 0 open / 0 in-progress at ceremony start (93 closed)
- **Scaffolding**: 8/8 standard files present

## Version Anomaly Resolved

A stale `v0.2.0` git tag (2026-02-03, "schema consolidation") squatted the target version. It was a **pre-rebaseline relic** from the internal-monorepo era (collapsed 2026-04-30) — no GitHub release, no CHANGELOG entry, and it broke `git describe` (which reported `v0.1.2` as latest because the relic sat on an older commit). **Resolution** (operator-approved): deleted the relic tag (local + remote), then cut a clean `v0.2.0`. This is the first real 0.2.0.

## Changes Included (since v0.1.2, 43 days, 29 commits)

### Added
- Trust-ladder rule (gates A07 + B13)
- Content-fidelity gates C20–C23 + G03 hardening (kobiton round-trip)
- Gates C24 (engagement-frame) + C25 (maintainer-URL) leakage
- Rescued gates C26 (coverage-readiness) + C27 (sibling-issue-scan) into source control
- `/contribute <url>` / `owner/repo` two-branch onboarding (#38)
- `scout-discover.sh --repos=` surgical mode + fix-locality drop (#51)
- `researcher-build.sh` smart refresh (#30) + `.github/semantic.yml` detection → `pr_title_regex` activates gate C02 (#50)
- Runtime-mirror deploy (`install.sh` → `~/.contribute-system/bin/`) + `scripts/doctor.sh`; 4 scout scripts sourced into repo (#46)

### Fixed
- `ai_disclosure_required` false-positives; empty `policy_files` `set -u` unbound bug (#50)
- precheck-hook three-path lookup (#39); doctor.sh symlink resolve (#48); test/agent realignment with builder interface (#49)

### Security
- `npm audit fix` in `tools/` — ip-address (XSS) + ws (memory disclosure) (#44)

### Breaking Changes
- None

## Metrics

| Metric | Value |
|--------|-------|
| Commits | 29 |
| Files Changed | 45 |
| Lines Added | +5085 |
| Lines Removed | -131 |
| Days Since Last Release | 43 |

## Quality Gates

| Gate | Status |
|------|--------|
| Phase 0 pre-release sweep | ✓ clean |
| Phase 1 version consistency | ✓ (no VERSION/package.json; git-tag + CHANGELOG model) |
| Phase 2.6 CHANGELOG + SemVer conformance (deterministic) | ✓ SemVer valid · monotonic v0.1.2→0.2.0 · 4 KaC sections · 21 bullets |
| Phase 3 secrets scan | ✓ no secrets in tracked files |
| Phase 5 approval gate | ✓ SHA-confirmed |

## Known Issues / Deferred

| Item | Status | Tracking |
|------|--------|----------|
| 3 moderate `js-yaml` advisories in dev-only `tools/` (PDF utility) | Deferred — breaking `--force` fix needs PDF-tooling re-verification; not in released surface | bead `contributing-clanker-i4y.5` |
| Public one-pager / operator-audit gist | MISSING — not auto-created (outward-facing publish); offered as follow-up | — |

## External Artifacts

| Artifact | Status |
|----------|--------|
| Git tag `v0.2.0` | ✓ local + remote (`06fc617`) |
| GitHub release `v0.2.0` | ✓ published, marked Latest |
| Gist | MISSING (deferred — see above) |

## Rollback Procedure

```bash
git push origin --delete v0.2.0
git tag -d v0.2.0
gh release delete v0.2.0 --yes
git revert 06fc617 && git push origin master
```

(Note: rolling back does NOT restore the deleted pre-rebaseline relic tag, nor should it.)

## Post-Release Checklist

- [ ] (optional) Generate the public one-pager + operator-audit gist
- [ ] Address `js-yaml` advisories (`i4y.5`) when convenient
- [ ] Propagate skill to marketplace plugin if Phase 2 packaging resumes (epic 25c)
