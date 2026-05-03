#!/usr/bin/env bats
# Unit tests for gate A02: claim work already merged in another PR
# Trap: PostHog #55412 — issue open but PR #57145 had already merged the fix.

load '../test_helper'

setup() {
  CANDIDATE="$FIXTURES_DIR/candidates/clean-open.md"
  DOSSIER="$FIXTURES_DIR/dossiers/example-org__example-repo.md"
  GATE="$GATES_DIR/a02-already-shipped.sh"
}

teardown() {
  teardown_mock_gh
}

@test "BLOCK when a merged PR already closes the issue" {
  # Gate runs `gh search prs ... --jq '.[0].url // empty'` so the stub returns
  # the post-jq result: a URL string when there's a hit, empty when not.
  setup_mock_gh "https://github.com/example-org/example-repo/pull/57145"
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER"
  assert_severity "BLOCK"
}

@test "PASS when no merged PR claims to close the issue" {
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
