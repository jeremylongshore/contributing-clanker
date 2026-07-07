#!/usr/bin/env bats
# Unit tests for gate E02: org-level AI policy strike tracking
#
# E02 reads ~/.contribute-system/log.jsonl for prior `candidate_dropped` events
# whose .details.reason matches an AI-policy regex at the configured scope.
# We mock the log by overriding HOME to a temp dir, where we plant a synthetic
# log.jsonl. Default scope is 'org' (uses owner prefix matching).
#
# Bug history: this gate previously used `jq --argfile _ <(echo '[]')` — the
# `--argfile` flag was removed in jq 1.7+, so STRIKE_COUNT always evaluated
# to 0, silently masking real AI-policy strikes with a PASS verdict. The
# bats agent caught this on 2026-05-03 by drafting BLOCK-case tests that
# inverted (gate said PASS when it should BLOCK). Fix shipped same day:
# replaced the dead `--argfile` invocation with `jq -c <filter> | wc -l` —
# direct line count, no argfile dependency. BLOCK cases below verify the
# fix.

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

# E02-specific helper: silences stderr so the --argfile bug's jq error chatter
# doesn't pollute $output and break the JSON severity parse downstream.
run_gate_e02() {
  local input_json
  input_json=$(jq -nc \
    --arg candidate "$CANDIDATE" \
    --arg dossier "$DOSSIER" \
    --arg action "shortlist→claimed" \
    --arg repo "example-org/example-repo" \
    '{candidate: $candidate, dossier: $dossier, action: $action, env: {repo: $repo, branch: ""}}')
  run bash -c "echo '$input_json' | '$GATE' 2>/dev/null"
}

@test "PASS when no log.jsonl exists yet" {
  export HOME="$TMPHOME"
  run_gate_e02
  assert_severity "PASS"
}

@test "PASS when log has no prior AI-policy strikes at org" {
  # Even with the --argfile bug, this case passes because the bug ALWAYS
  # produces STRIKE_COUNT=0, which matches the no-strikes branch.
  export HOME="$TMPHOME"
  cat > "$TMPHOME/.contribute-system/log.jsonl" <<'EOF'
{"ts":"2026-05-01T00:00:00Z","event":"candidate_dropped","details":{"repo":"other-org/x","reason":"ai_policy"}}
{"ts":"2026-05-01T00:00:00Z","event":"candidate_dropped","details":{"repo":"example-org/x","reason":"superseded"}}
EOF
  run_gate_e02
  assert_severity "PASS"
}

@test "BLOCK when 1 prior AI-policy strike at org" {
  export HOME="$TMPHOME"
  cat > "$TMPHOME/.contribute-system/log.jsonl" <<'EOF'
{"ts":"2026-05-01T00:00:00Z","event":"candidate_dropped","details":{"repo":"example-org/another","reason":"ai_policy violation"}}
EOF
  run_gate_e02
  assert_severity "BLOCK"
}

@test "BLOCK when 2+ prior AI-policy strikes at org (HARD STOP)" {
  export HOME="$TMPHOME"
  cat > "$TMPHOME/.contribute-system/log.jsonl" <<'EOF'
{"ts":"2026-05-01T00:00:00Z","event":"candidate_dropped","details":{"repo":"example-org/r1","reason":"ai-policy"}}
{"ts":"2026-05-02T00:00:00Z","event":"candidate_dropped","details":{"repo":"example-org/r2","reason":"ai_slop"}}
EOF
  run_gate_e02
  assert_severity "BLOCK"
}

# The live log carries historical torn hook_intercept entries (an old hook
# wrote unescaped heredoc newlines; the writer was since fixed). A strict jq
# pass aborts on them (exit 5), and under pipefail that tripped the ERR trap:
# the gate crashed fail-closed on EVERY shortlist→claimed on this box.
# Caught 2026-07-06 by the daily recap's block-event table on day one.

@test "PASS with torn log lines and no strikes (no fail-closed crash)" {
  export HOME="$TMPHOME"
  cat > "$TMPHOME/.contribute-system/log.jsonl" <<'EOF'
{"ts":"2026-05-03T00:00:00Z","event":"hook_intercept","details":{"cmd_preview":"gh pr create --body \"$(cat <<'HEREDOC'
torn fragment — this line is not valid JSON
{"ts":"2026-05-04T00:00:00Z","event":"candidate_dropped","details":{"repo":"example-org/x","reason":"superseded"}}
EOF
  run_gate_e02
  assert_severity "PASS"
  echo "$output" | jq -e '.reason | test("crashed") | not' >/dev/null
}

@test "strikes are still counted past torn log lines (BLOCK names the strike, not a crash)" {
  export HOME="$TMPHOME"
  cat > "$TMPHOME/.contribute-system/log.jsonl" <<'EOF'
torn fragment — this line is not valid JSON
{"ts":"2026-05-01T00:00:00Z","event":"candidate_dropped","details":{"repo":"example-org/another","reason":"ai_policy violation"}}
EOF
  run_gate_e02
  assert_severity "BLOCK"
  echo "$output" | jq -e '.reason | test("AI-policy closure")' >/dev/null
}
