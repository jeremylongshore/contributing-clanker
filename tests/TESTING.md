# TESTING.md — contributing-clanker

**Owner**: engineer (Jeremy). AI may read; never modify policy sections.
**Last audit**: 2026-05-03 (`/audit-tests`)
**Audit-harness**: not installed (Phase 1; will install in Phase 2 distribution)

## Classification

| Field | Value |
|---|---|
| Repo type | hybrid: claude-skill + workspace + governance docs |
| Primary lang | bash (45 scripts: 4 orchestrators + 41 gates + 1 lib) |
| Test targets | `~/.claude/skills/contribute/scripts/**/*.sh` |
| Distribution | Phase 1 personal use; Phase 2 plugin in `~/000-projects/claude-code-plugins/plugins/` |

## Applicable layers

| Layer | Status | Tool |
|---|---|---|
| L1 hooks / CI | required (P0 gap) | pre-commit + GHA (later) |
| L2 static | required (P0 gap) | shellcheck |
| L3 unit | required (P1 gap) | bats |
| L4 integration | partial — present | `test-known-traps.sh` |
| L5 system | waived | N/A |
| L6 E2E | optional (P2) | Gherkin (later) |
| L7 acceptance | waived | single-user |

## Waived layers

- **L5 system**: no perf/chaos/a11y surface — bash gate orchestration has no real-time SLAs and no concurrent users
- **L7 UAT**: single-user system (Jeremy is the engineer + the user)
- **mutation testing**: no production-ready bash mutation tool
- **coverage %**: bash `kcov` is heavy for short scripts; integration regression suite is the coverage signal
- **CRAP score**: Python/Node only
- **architecture rules**: Python/Node only

## Thresholds

| Gate | Floor | Notes |
|---|---|---|
| L4 regression | all 4 known-trap tests must pass (4/4) | extends as new traps land |
| L2 shellcheck | 0 errors, 0 warnings | once installed |
| L3 bats | (TBD) | once installed; aim for 1 unit test per gate predicate over time |

## Frameworks

| Layer | Framework | Status |
|---|---|---|
| L4 | bash + custom assert helpers (`gate_fired_with_severity`) | in `~/.claude/skills/contribute/scripts/test-known-traps.sh` |

## Installed gates

(none yet — pre-commit hook + shellcheck pending)

## Traceability

- **RTM**: not yet built — will be scaffolded in `tests/RTM.md` from the 10 beads epics + the 62-failure-mode catalog
- **PERSONAS**: not yet built — `tests/PERSONAS.md` will surface the upstream-maintainer + downstream-contributor implicit personas from `000-docs/007-DR-CATG-failure-mode-catalog.md`
- **JOURNEYS**: not yet built — lifecycle workflow already documented in `000-docs/006-AT-SPEC-lifecycle-workflow.md`; will map per-transition to applicable gate layer

## Compliance overlay

(none — not regulated)

## Notes

- Phase 1 personal-use design — no GHA CI needed yet; pre-commit catches everything that matters
- Phase 2 plugin distribution will install `@intentsolutions/audit-harness` and migrate to the full hash-pinned wall system
- The `test-known-traps.sh` integration suite is the load-bearing test today: it validates the system catches the 4 real-world traps that motivated the gate architecture (PostHog 55412 already-shipped, opensre 1129 assigned, kana-dojo 15441 closed, synthetic clean candidate)
