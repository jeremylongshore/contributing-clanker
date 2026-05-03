# tests/

Test infrastructure for the contributing-clanker bash gate system.

## Layout

```
tests/
├── README.md                  ← this file
├── TESTING.md                 ← engineer policy doc (don't move; audit-tests reads it)
├── unit/
│   ├── test_helper.bash       ← shared setup: run_gate, mock_gh, assert_severity
│   └── gates/
│       ├── a01-already-assigned.bats   ← phase A sample
│       ├── b02-branch-naming.bats      ← phase B sample
│       ├── c12-ci-green.bats           ← phase C sample
│       ├── d05-no-reopen.bats          ← phase D sample
│       └── g01-no-vendored-edits.bats  ← phase G sample
└── fixtures/
    ├── candidates/
    │   └── clean-open.md       ← baseline open-status candidate
    └── dossiers/
        └── example-org__example-repo.md  ← baseline permissive dossier
```

The 5 sample tests cover phases A/B/C/D/G — one per phase as a pattern. The remaining ~36 gates can be unit-tested incrementally by copying these patterns.

## Running

```bash
# All unit tests
bats tests/unit/gates/

# Single gate
bats tests/unit/gates/a01-already-assigned.bats

# Verbose
bats --verbose-run tests/unit/gates/

# The L4 integration regression suites (4 scripts, separate from bats)
~/.claude/skills/contribute/scripts/test-known-traps.sh           # 4 known-trap cases
~/.claude/skills/contribute/scripts/test-override-audit.sh        # override audit trail
~/.claude/skills/contribute/scripts/test-plug-in.sh               # gate plug-in discovery
~/.claude/skills/contribute/scripts/test-stale-dossier-refresh.sh # dossier freshness

# Static analysis on all bash scripts
scripts/lint-bash.sh

# Pre-commit hook framework — manual run (see "pre-commit + beads" below)
pre-commit run --all-files
```

## Pre-commit + beads coexistence

`pre-commit install` refuses to overwrite `core.hooksPath`, which beads uses for its own hooks (`.beads/hooks/`). Until a coexistence wrapper lands, the pre-commit hooks **do not auto-fire on `git commit`** in this repo. Run them manually before committing:

```bash
pre-commit run --all-files
```

The `.pre-commit-config.yaml` is still useful for anyone forking the repo who isn't using beads — they can `pre-commit install` normally.

## Pattern for new gate tests

1. **Copy a similar phase's `.bats` file** as a template — pick by similarity:
   - Pure live-`gh`-call gate (A01, A02, C12, C16, D05) → copy `a01-already-assigned.bats`
   - Local-clone-needing gate (B01-B07, B14, C04, C05, C07, F01, G01-G04) → copy `g01-no-vendored-edits.bats`
   - Dossier-flag gate with branch logic → copy `b02-branch-naming.bats`

2. **Construct the candidate frontmatter** the gate reads. Minimal fields per gate:
   - All gates need `repo:` + `issue_number:`
   - C-phase gates need `pr_number:`
   - Pre-PR (B-phase) gates need an existing local clone — set up via `git init` in setup()

3. **Stub `gh`** with `setup_mock_gh "fake stdout" [exit_code]`. The gate's `gh_safe` calls will use the stub.

4. **Assert via `assert_severity PASS|WARN|BLOCK|INFORM|SKIP`**. The helper parses the gate's stdout JSON.

5. **Clean up** in `teardown()` — remove temp files, run `teardown_mock_gh`, `rm -rf` any test clone dirs.

## Coverage targets (Phase 1)

| Phase | Gates | Unit tests | Goal end of Phase 1 |
|---|---|---|---|
| A (discovery) | 8 installed | 1 sample | 8/8 |
| B (pre-PR) | 7 installed | 1 sample | 7/7 |
| C (submission) | 8 installed | 1 sample | 8/8 |
| D (communication) | 3 installed | 1 sample | 3/3 |
| E (identity) | 2 installed | 0 | 2/2 |
| F (legal) | 2 installed | 0 | 2/2 |
| G (infra) | 2 installed | 1 sample | 2/2 |
| **Total** | **41 gates** | **5 samples** | **~120 tests** |

Each gate gets at least 1 PASS-case + 1 FAIL-case. Edge-case coverage grows as new traps surface in the wild.

## Mocking strategy

`gh` is the primary external dependency. We stub it via PATH override (cheaper than module-level mocks; works across bash + jq pipelines). The stub returns a fixed string; per-test you can construct different stubs by calling `setup_mock_gh` multiple times in different tests.

`git` is real — the local-clone-needing gates create a tiny throwaway git repo in setup(). This is slower (~50ms per test) but more honest than mocking git's full interface.

## Reference

- Audit findings: `TEST_AUDIT.md` at repo root
- Engineer policy: `tests/TESTING.md`
- Real-world traps (L4 integration regression): `~/.claude/skills/contribute/scripts/test-known-traps.sh`
- Gate library: `~/.claude/skills/contribute/scripts/gates/lib/preamble.sh`
