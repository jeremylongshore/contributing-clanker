#!/usr/bin/env bats
# Unit tests for gate C12: CI checks green on PR
# Trap: PR opened with red CI wastes maintainer review time

load '../test_helper'

setup() {
  TMPCAND=$(mktemp)
  cat > "$TMPCAND" <<'EOF'
---
repo: example-org/example-repo
issue_number: 42
pr_number: 123
status: submitted
---
body
EOF
  CANDIDATE="$TMPCAND"
  DOSSIER="$FIXTURES_DIR/dossiers/example-org__example-repo.md"
  GATE="$GATES_DIR/c12-ci-green.sh"
}

teardown() {
  rm -f "$CANDIDATE"
  teardown_mock_gh
}

@test "PASS when all PR checks are green" {
  setup_mock_gh '[{"name":"build","bucket":"pass"},{"name":"test","bucket":"pass"}]'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "flip-to-ready"
  assert_severity "PASS"
}

@test "BLOCK when a check is failing" {
  setup_mock_gh '[{"name":"build","bucket":"pass"},{"name":"test","bucket":"fail"}]'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "flip-to-ready"
  assert_severity "BLOCK"
}

@test "SKIP when no pr_number on candidate" {
  TMPCAND2=$(mktemp); printf -- '---\nrepo: foo/bar\nissue_number: 1\n---\nbody\n' > "$TMPCAND2"
  setup_mock_gh '[]'
  run_gate "$GATE" "$TMPCAND2" "$DOSSIER" "flip-to-ready"
  assert_severity "SKIP"
  rm -f "$TMPCAND2"
}
