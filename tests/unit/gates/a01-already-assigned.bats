#!/usr/bin/env bats
# Unit tests for gate A01: claim already-assigned issue
# Real-world trap: Tracer-Cloud opensre #1129 (assigned to unKnownNG)

load '../test_helper'

setup() {
  CANDIDATE="$FIXTURES_DIR/candidates/clean-open.md"
  DOSSIER="$FIXTURES_DIR/dossiers/example-org__example-repo.md"
  GATE="$GATES_DIR/a01-already-assigned.sh"
}

teardown() {
  teardown_mock_gh
}

@test "BLOCK when issue is assigned" {
  setup_mock_gh "alice"
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER"
  assert_severity "BLOCK"
}

@test "PASS when issue has no assignees" {
  setup_mock_gh ""
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER"
  assert_severity "PASS"
}

@test "SKIP when candidate has no issue_number frontmatter" {
  TMPCAND=$(mktemp); printf -- '---\nrepo: foo/bar\n---\nbody\n' > "$TMPCAND"
  setup_mock_gh ""
  run_gate "$GATE" "$TMPCAND" "$DOSSIER"
  assert_severity "SKIP"
  rm -f "$TMPCAND"
}
