#!/usr/bin/env bash
# Catalog: C26 — Coverage-tool blindspot detection (Go)
# Mitigates: tests gated behind `testing.Short()` or `//go:build cgo` are
# typically NOT run by the repo's coverage-collection job (Codecov runs the
# fast/pure-Go lane). New code covered ONLY by such tests will show 0% patch
# coverage, generating a red badge on the PR even when all tests pass.
#
# Incident reference: gastownhall/beads PR #4061 (2026-05-20) — Codecov
# initially reported 0% / 47 lines missing because every test for the new
# code was behind one or both gates.
#
# Lesson source: ~/.contribute-system/lessons/2026-05-20-codecov-cgo-short-tagged-tests.md
source "$(dirname "$0")/lib/preamble.sh"

gate_read_input

# Only relevant for Go projects. (Other languages have analogous patterns —
# pytest's `-m slow` markers, JS's "skip" describe blocks — but coverage
# blindspots manifest differently. Start narrow; broaden if we hit it again.)
LANG=$(fm_field "$GATE_DOSSIER_PATH" "language")
if [[ "$LANG" != "Go" ]]; then
  gate_skip "not a Go project (dossier language=$LANG)"
fi

# Need a local clone to inspect the actual patch.
LOCAL=$(fm_field "$GATE_DOSSIER_PATH" "local_clone")
LOCAL="${LOCAL/#\~/$HOME}"
if [[ -z "$LOCAL" || ! -d "$LOCAL/.git" ]]; then
  gate_skip "no local_clone in dossier (cannot inspect patch)"
fi

BRANCH=$(fm_field "$GATE_CANDIDATE_PATH" "branch")
if [[ -z "$BRANCH" ]]; then
  gate_skip "candidate has no branch field — set branch: <feature-branch> before open-pr"
fi

# Use a temp file for the diff so we don't try to read /dev/stdin in subshells.
DIFF_FILE=$(/usr/bin/mktemp -t c20-diff-XXXXXX)
trap 'rm -f "$DIFF_FILE"' EXIT

# Compare candidate's branch against the upstream's default branch.
UPSTREAM_DEFAULT=$(fm_field "$GATE_DOSSIER_PATH" "default_branch")
UPSTREAM_DEFAULT="${UPSTREAM_DEFAULT:-main}"

# Try `upstream/$default` first (typical), fall back to `origin/$default`.
( cd "$LOCAL" && /usr/bin/git diff "upstream/${UPSTREAM_DEFAULT}...${BRANCH}" -- 2>/dev/null > "$DIFF_FILE" ) \
  || ( cd "$LOCAL" && /usr/bin/git diff "origin/${UPSTREAM_DEFAULT}...${BRANCH}" -- 2>/dev/null > "$DIFF_FILE" ) \
  || true

if [[ ! -s "$DIFF_FILE" ]]; then
  gate_skip "could not compute branch diff against ${UPSTREAM_DEFAULT}"
fi

# Count new non-test functions added. `|| true`: under pipefail a zero-match
# grep fails the whole pipeline, which used to trip the ERR trap (BLOCK) and
# made the NEW_FUNCS==0 SKIP below unreachable. wc still prints 0 either way.
NEW_FUNCS=$(/usr/bin/grep -E '^\+func ' "$DIFF_FILE" | /usr/bin/grep -vE '_test\.go' | /usr/bin/wc -l || true)
if [[ "$NEW_FUNCS" -eq 0 ]]; then
  gate_skip "no new functions in patch — coverage blindspot N/A"
fi

# Count gated-test signals in newly-added test code.
CGO_TAGGED=$(/usr/bin/grep -cE '^\+\s*//go:build cgo' "$DIFF_FILE" || true)
SHORT_SKIPS=$(/usr/bin/grep -cE '^\+\s*if testing\.Short' "$DIFF_FILE" || true)

# Count NEW test functions in test files NOT behind a gate. This is the
# coverage-visible set.
UNGATED_TESTS=$(/usr/bin/awk '
  /^diff --git/ { file = $0; in_test = (file ~ /_test\.go/); has_cgo = 0; next }
  in_test && /^\+\/\/go:build cgo/ { has_cgo = 1 }
  in_test && !has_cgo && /^\+func Test/ { print }
' "$DIFF_FILE" | /usr/bin/wc -l)

if [[ "$CGO_TAGGED" -gt 0 || "$SHORT_SKIPS" -gt 0 ]]; then
  if [[ "$UNGATED_TESTS" -eq 0 ]]; then
    gate_block \
      "patch adds $NEW_FUNCS new func(s) but EVERY new test is gated behind testing.Short() or //go:build cgo — Codecov runs the fast/pure-Go lane and will report ~0% patch coverage" \
      "extract a pure helper from new code and unit-test it in a non-tagged, non-Short-gated test file. see ~/.contribute-system/lessons/2026-05-20-codecov-cgo-short-tagged-tests.md"
  fi
  gate_warn \
    "patch has $NEW_FUNCS new func(s), $UNGATED_TESTS ungated test func(s), AND $((CGO_TAGGED + SHORT_SKIPS)) gated signal(s). Confirm the ungated tests actually exercise the new code paths" \
    "see ~/.contribute-system/lessons/2026-05-20-codecov-cgo-short-tagged-tests.md for the design pattern"
fi

gate_pass "$NEW_FUNCS new func(s), $UNGATED_TESTS ungated test func(s), no CGO/Short gating signals in new test code"
