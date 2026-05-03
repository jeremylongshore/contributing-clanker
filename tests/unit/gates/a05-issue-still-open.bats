#!/usr/bin/env bats
# Unit tests for gate A05: issue is still OPEN right now (not closed since
# the dossier was built). Trap: lingdojo/kana-dojo #15441 (closed minutes
# after shortlist).

load '../test_helper'

setup() {
  CANDIDATE="$FIXTURES_DIR/candidates/clean-open.md"
  DOSSIER="$FIXTURES_DIR/dossiers/example-org__example-repo.md"
  GATE="$GATES_DIR/a05-issue-still-open.sh"
}

teardown() {
  teardown_mock_gh
}

@test "BLOCK when issue state is CLOSED" {
  # Gate's gh call uses --jq '{state, stateReason, closedAt}' so the stub
  # returns the post-jq JSON object directly.
  setup_mock_gh '{"state":"CLOSED","stateReason":"NOT_PLANNED","closedAt":"2026-05-03T05:00:00Z"}'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER"
  assert_severity "BLOCK"
}

@test "PASS when issue state is OPEN" {
  setup_mock_gh '{"state":"OPEN","stateReason":"","closedAt":""}'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER"
  assert_severity "PASS"
}

@test "SKIP when candidate has no issue_number" {
  TMPCAND=$(mktemp); printf -- '---\nrepo: foo/bar\n---\nbody\n' > "$TMPCAND"
  setup_mock_gh ""
  run_gate "$GATE" "$TMPCAND" "$DOSSIER"
  assert_severity "SKIP"
  rm -f "$TMPCAND"
}
