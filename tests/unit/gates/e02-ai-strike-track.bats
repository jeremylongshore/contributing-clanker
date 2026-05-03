#!/usr/bin/env bats
# Unit tests for gate E02: org-level AI policy strike tracking
#
# E02 reads ~/.contribute-system/log.jsonl for prior `candidate_dropped` events
# whose .details.reason matches an AI-policy regex at the configured scope.
# We mock the log by overriding HOME to a temp dir, where we plant a synthetic
# log.jsonl. Default scope is 'org' (uses owner prefix matching).

load '../test_helper'

setup() {
  CANDIDATE="$FIXTURES_DIR/candidates/clean-open.md"
  DOSSIER="$FIXTURES_DIR/dossiers/example-org__example-repo.md"
  GATE="$GATES_DIR/e02-ai-strike-track.sh"

  REAL_HOME="$HOME"
  TMPHOME=$(mktemp -d)
  mkdir -p "$TMPHOME/.contribute-system"
}

teardown() {
  export HOME="$REAL_HOME"
  rm -rf "$TMPHOME"
}

@test "PASS when no log.jsonl exists yet" {
  export HOME="$TMPHOME"
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER"
  assert_severity "PASS"
}

@test "PASS when log has no prior AI-policy strikes at org" {
  export HOME="$TMPHOME"
  cat > "$TMPHOME/.contribute-system/log.jsonl" <<'EOF'
{"ts":"2026-05-01T00:00:00Z","event":"candidate_dropped","details":{"repo":"other-org/x","reason":"ai_policy"}}
{"ts":"2026-05-01T00:00:00Z","event":"candidate_dropped","details":{"repo":"example-org/x","reason":"superseded"}}
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER"
  assert_severity "PASS"
}

@test "BLOCK when 1 prior AI-policy strike at org" {
  export HOME="$TMPHOME"
  cat > "$TMPHOME/.contribute-system/log.jsonl" <<'EOF'
{"ts":"2026-05-01T00:00:00Z","event":"candidate_dropped","details":{"repo":"example-org/another","reason":"ai_policy violation"}}
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER"
  assert_severity "BLOCK"
}

@test "BLOCK when 2+ prior AI-policy strikes at org (HARD STOP)" {
  export HOME="$TMPHOME"
  cat > "$TMPHOME/.contribute-system/log.jsonl" <<'EOF'
{"ts":"2026-05-01T00:00:00Z","event":"candidate_dropped","details":{"repo":"example-org/r1","reason":"ai-policy"}}
{"ts":"2026-05-02T00:00:00Z","event":"candidate_dropped","details":{"repo":"example-org/r2","reason":"ai_slop"}}
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER"
  assert_severity "BLOCK"
}
