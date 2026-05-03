# features/ — Gherkin acceptance specifications

Engineer-owned BDD specs describing what the contributing-clanker system must do at each lifecycle transition.

These are **wall 1 (acceptance)** per the 7-layer testing taxonomy. They're authored manually (not auto-generated) and the engineer is responsible for keeping them aligned with reality.

## Files

| File | Coverage | Maps to phase |
|---|---|---|
| `discovery-and-claim.feature` | A01 / A02 / A05 / A06 | phase A (12 gates total) |
| `pre-pr-discipline.feature` | B02 / B03 / B05 / B06 / B14 | phase B (15 gates total) |
| `pr-submission.feature` | C01 / C03 / C04 / C05 / C12 / C13 / C16 | phase C (16 gates total) |
| `communication-and-tone.feature` | D02 / D03 / D05 | phase D (8 gates total) |
| `infrastructure-protection.feature` | G01 / G02 / G03 / G04 | phase G (4 gates total) |

These cover the load-bearing scenarios from the 62-failure-mode catalog (`000-docs/007-DR-CATG-failure-mode-catalog.md`). They are NOT exhaustive — every gate in `005-AT-SPEC-gate-inventory.md` should eventually have at least one feature scenario.

## Running

These `.feature` files are currently **acceptance specifications without an executable runner**. They serve as:

1. **Source of truth** for what the system promises (read by engineer + future contributors)
2. **Test scope ground truth** — bats unit tests in `tests/unit/gates/` should cover the same scenarios
3. **Future-ready** — when Phase 2 plugin distribution adds a Cucumber/bash-bdd runner (see bead `contributing-clanker-25c.x`), these files will become directly executable

The L4 integration regression suite (`~/.claude/skills/contribute/scripts/test-known-traps.sh`) currently exercises the most critical scenarios from `discovery-and-claim.feature` (A01 assigned, A02 already-shipped, A05 closed) directly in bash.

## Engineer ownership

Per the 7-layer testing taxonomy, `features/*.feature` files are **hash-pinned wall 1** — the AI does not edit them. When new failure modes surface or gate behavior changes, the engineer updates the feature file manually, then re-pins via `audit-harness init` (Phase 2 — once installed).

For Phase 1 (now), engineer ownership is enforced via convention only.

## Adding a new scenario

1. Identify which `.feature` file the scenario belongs to (by phase letter).
2. Add a `Scenario:` block with `Given / When / Then` steps.
3. Reference the gate ID and severity in the assertion.
4. Add a corresponding bats unit test under `tests/unit/gates/<gate>.bats` exercising the same behavior.
5. Add a candidate fixture under `tests/fixtures/candidates/` if the scenario needs a new shape.

## Reference

- Gate inventory + contracts: `000-docs/005-AT-SPEC-gate-inventory.md`
- Failure-mode catalog: `000-docs/007-DR-CATG-failure-mode-catalog.md`
- Lifecycle workflow: `000-docs/006-AT-SPEC-lifecycle-workflow.md`
