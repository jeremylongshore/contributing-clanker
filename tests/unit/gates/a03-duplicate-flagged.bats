#!/usr/bin/env bats
# Unit tests for gate A03: issue body or comments mention being a duplicate

load '../test_helper'

setup() {
  CANDIDATE="$FIXTURES_DIR/candidates/clean-open.md"
  DOSSIER="$FIXTURES_DIR/dossiers/example-org__example-repo.md"
  GATE="$GATES_DIR/a03-duplicate-flagged.sh"
}

teardown() {
  teardown_mock_gh
}

@test "WARN when issue body mentions 'duplicate of #123'" {
  # Gate's gh call uses --jq to concat body + comments into a single string.
  # The mock returns that post-jq string directly.
  setup_mock_gh "this looks like a duplicate of #123 sorry"
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER"
  assert_severity "WARN"
}

@test "PASS when no duplicate references found" {
  setup_mock_gh "this is a genuine bug report with no overlap"
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
