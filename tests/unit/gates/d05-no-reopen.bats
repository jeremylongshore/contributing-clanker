#!/usr/bin/env bats
# Unit tests for gate D05: don't reopen a maintainer-closed PR

load '../test_helper'

setup() {
  TMPCAND=$(mktemp)
  cat > "$TMPCAND" <<'EOF'
---
repo: example-org/example-repo
issue_number: 42
pr_number: 99
status: submitted
---
body
EOF
  CANDIDATE="$TMPCAND"
  DOSSIER="$FIXTURES_DIR/dossiers/example-org__example-repo.md"
  GATE="$GATES_DIR/d05-no-reopen.sh"
}

teardown() {
  rm -f "$CANDIDATE"
  teardown_mock_gh
}

@test "WARN when reopening a closed PR" {
  setup_mock_gh '{"state":"CLOSED","closedAt":"2026-04-01T00:00:00Z"}'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "reopen"
  assert_severity "WARN"
}

@test "SKIP when PR is open (not reopening)" {
  setup_mock_gh '{"state":"OPEN","closedAt":null}'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "reopen"
  assert_severity "SKIP"
}
