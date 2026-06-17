#!/usr/bin/env bats
# Unit tests for gate A06: repo requires a claim-etiquette comment before working.
#
# The gate makes TWO gh calls:
#   1. `gh api user --jq .login`           → resolves LOGIN
#   2. `gh issue view ... --jq "[...]|join"` → the user's own comment bodies
# The bats mock gh returns ONE fixed string for every invocation, so the stub
# value becomes BOTH the login AND the comment-body blob. We exploit that:
#   - stub = a claim-shaped phrase  → COMMENTS matches the claim regex → PASS
#   - stub = a plain login string   → COMMENTS has no claim phrase      → BLOCK
#   - stub = "" (empty)             → LOGIN empty → gate_inform (exits)  → INFORM

load '../test_helper'

setup() {
  GATE="$GATES_DIR/a06-claim-etiquette-required.sh"

  # Dossier with etiquette_comment_required: true
  TMP_DOSSIER=$(mktemp)
  cat > "$TMP_DOSSIER" <<'EOF'
---
repo: example-org/example-repo
default_branch: main
etiquette_comment_required: true
---
body
EOF
  DOSSIER="$TMP_DOSSIER"

  # Candidate with an issue_number
  TMP_CAND=$(mktemp)
  cat > "$TMP_CAND" <<'EOF'
---
repo: example-org/example-repo
issue_number: 42
status: claimed
---
body
EOF
  CANDIDATE="$TMP_CAND"
}

teardown() {
  teardown_mock_gh
  rm -f "$TMP_DOSSIER" "$TMP_CAND" 2>/dev/null || true
}

@test "PASS when the user's comment is claim-shaped" {
  # Stub doubles as LOGIN and as the comment body; the body contains a claim phrase.
  setup_mock_gh "i'd like to take this"
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "shortlist→claimed"
  assert_severity "PASS"
}

@test "BLOCK when the user's comment exists but is not claim-shaped" {
  # Stub is a plain login string; reused as the comment body → no claim phrase.
  setup_mock_gh "octocat"
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "shortlist→claimed"
  assert_severity "BLOCK"
}

@test "INFORM when gh user login cannot be resolved (empty)" {
  setup_mock_gh ""
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "shortlist→claimed"
  assert_severity "INFORM"
}

@test "SKIP when dossier does not require etiquette comment" {
  TMP_NOREQ=$(mktemp)
  cat > "$TMP_NOREQ" <<'EOF'
---
repo: example-org/example-repo
etiquette_comment_required: false
---
body
EOF
  setup_mock_gh "octocat"
  run_gate "$GATE" "$CANDIDATE" "$TMP_NOREQ" "shortlist→claimed"
  assert_severity "SKIP"
  rm -f "$TMP_NOREQ"
}

@test "SKIP when no dossier supplied" {
  setup_mock_gh "octocat"
  run_gate "$GATE" "$CANDIDATE" "" "shortlist→claimed"
  assert_severity "SKIP"
}

@test "SKIP when candidate has no issue_number" {
  TMPCAND=$(mktemp)
  printf -- '---\nrepo: example-org/example-repo\n---\nbody\n' > "$TMPCAND"
  setup_mock_gh "octocat"
  run_gate "$GATE" "$TMPCAND" "$DOSSIER" "shortlist→claimed"
  assert_severity "SKIP"
  rm -f "$TMPCAND"
}
