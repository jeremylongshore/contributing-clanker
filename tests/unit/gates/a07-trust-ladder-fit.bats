#!/usr/bin/env bats
# Unit tests for gate A07: trust-ladder fit (intent vs. user's prior-merges rung)
# Real-world trap: oven-sh/bun#30903 (rung-0 contributor, 983-file umbrella audit).
#
# This gate is pure frontmatter logic — no gh, no git clone. The rung comes from
# the dossier (merged_prs_by_user) and the intent from the candidate (scope_intent
# + issue_number). All cases are crafted inline.

load '../test_helper'

setup() {
  GATE="$GATES_DIR/a07-trust-ladder-fit.sh"
}

# Build a dossier with a given merged_prs_by_user value (plus optional extra lines).
mk_dossier() {
  local merged="$1" extra="${2:-}"
  TMP_DOSSIER=$(mktemp)
  {
    printf -- '---\n'
    printf 'repo: example-org/example-repo\n'
    [[ "$merged" != "__omit__" ]] && printf 'merged_prs_by_user: %s\n' "$merged"
    [[ -n "$extra" ]] && printf '%s\n' "$extra"
    printf -- '---\nbody\n'
  } > "$TMP_DOSSIER"
  echo "$TMP_DOSSIER"
}

# Build a candidate with a given scope_intent (+ optional issue_number).
mk_candidate() {
  local intent="$1" issue="${2:-}"
  TMP_CAND=$(mktemp)
  {
    printf -- '---\n'
    printf 'repo: example-org/example-repo\n'
    [[ -n "$intent" ]] && printf 'scope_intent: %s\n' "$intent"
    [[ -n "$issue" ]] && printf 'issue_number: %s\n' "$issue"
    printf -- '---\nbody\n'
  } > "$TMP_CAND"
  echo "$TMP_CAND"
}

teardown() {
  rm -f "$TMP_DOSSIER" "$TMP_CAND" 2>/dev/null || true
}

@test "BLOCK: rung-0 contributor opening umbrella scope" {
  TMP_DOSSIER=$(mk_dossier 0)
  TMP_CAND=$(mk_candidate umbrella)
  run_gate "$GATE" "$TMP_CAND" "$TMP_DOSSIER" "shortlist→claimed"
  assert_severity "BLOCK"
}

@test "BLOCK: rung-0 contributor, single-issue intent but no issue_number" {
  TMP_DOSSIER=$(mk_dossier 0)
  TMP_CAND=$(mk_candidate single-issue)
  run_gate "$GATE" "$TMP_CAND" "$TMP_DOSSIER" "shortlist→claimed"
  assert_severity "BLOCK"
}

@test "INFORM: rung-0 contributor with an attached issue_number (single-issue)" {
  # Rung 0 + issue attached: gate_inform fires and exits (does NOT fall through to gate_pass).
  TMP_DOSSIER=$(mk_dossier 0)
  TMP_CAND=$(mk_candidate single-issue 42)
  run_gate "$GATE" "$TMP_CAND" "$TMP_DOSSIER" "shortlist→claimed"
  assert_severity "INFORM"
}

@test "PASS: rung 2 contributor with single-issue intent (above threshold, no umbrella)" {
  # merged=2 >= threshold(1) so no BLOCK and no rung-0 inform → gate_pass.
  TMP_DOSSIER=$(mk_dossier 2)
  TMP_CAND=$(mk_candidate single-issue 42)
  run_gate "$GATE" "$TMP_CAND" "$TMP_DOSSIER" "shortlist→claimed"
  assert_severity "PASS"
}

@test "PASS: 4+ merges earns umbrella trust" {
  TMP_DOSSIER=$(mk_dossier 5)
  TMP_CAND=$(mk_candidate umbrella)
  run_gate "$GATE" "$TMP_CAND" "$TMP_DOSSIER" "shortlist→claimed"
  assert_severity "PASS"
}

@test "WARN: rung 1-3 contributor opening umbrella scope" {
  # merged=2 is >= threshold(1) so no BLOCK, but < 4 so gate_warn fires and exits.
  TMP_DOSSIER=$(mk_dossier 2)
  TMP_CAND=$(mk_candidate umbrella)
  run_gate "$GATE" "$TMP_CAND" "$TMP_DOSSIER" "shortlist→claimed"
  assert_severity "WARN"
}

@test "PASS: design-discussion intent bypasses the ladder regardless of rung" {
  TMP_DOSSIER=$(mk_dossier 0)
  TMP_CAND=$(mk_candidate design-discussion)
  run_gate "$GATE" "$TMP_CAND" "$TMP_DOSSIER" "shortlist→claimed"
  assert_severity "PASS"
}

@test "WARN: unrecognized scope_intent value" {
  TMP_DOSSIER=$(mk_dossier 5)
  TMP_CAND=$(mk_candidate bogus-intent)
  run_gate "$GATE" "$TMP_CAND" "$TMP_DOSSIER" "shortlist→claimed"
  assert_severity "WARN"
}

@test "SKIP: trust_ladder_disabled: true in dossier" {
  TMP_DOSSIER=$(mk_dossier 0 'trust_ladder_disabled: true')
  TMP_CAND=$(mk_candidate umbrella)
  run_gate "$GATE" "$TMP_CAND" "$TMP_DOSSIER" "shortlist→claimed"
  assert_severity "SKIP"
}

@test "SKIP: no merged_prs_by_user field in dossier" {
  TMP_DOSSIER=$(mk_dossier __omit__)
  TMP_CAND=$(mk_candidate umbrella)
  run_gate "$GATE" "$TMP_CAND" "$TMP_DOSSIER" "shortlist→claimed"
  assert_severity "SKIP"
}

@test "PASS: trust_ladder_threshold lifts rung-0 umbrella block" {
  # threshold: 0 means MERGED_COUNT(0) is NOT < threshold(0), so no BLOCK.
  # MERGED_COUNT(0) < 4 so gate_warn fires (warn, not pass) — assert WARN.
  TMP_DOSSIER=$(mk_dossier 0 'trust_ladder_threshold: 0')
  TMP_CAND=$(mk_candidate umbrella)
  run_gate "$GATE" "$TMP_CAND" "$TMP_DOSSIER" "shortlist→claimed"
  assert_severity "WARN"
}
