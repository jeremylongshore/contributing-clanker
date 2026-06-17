#!/usr/bin/env bats
# Unit tests for gate E04: origin remote points at the user's fork
#
# E04 derives the clone path from GATE_REPO basename:
#   $HOME/000-projects/contributing-clanker/<repo>
# then resolves the gh user login (`gh api user`) and the clone's origin owner
# (`git remote get-url origin`). Verdicts:
#   - no .git at clone path        → SKIP
#   - gh login unresolvable        → SKIP
#   - no origin remote             → BLOCK
#   - origin owner == upstream     → INFORM (pushing direct to upstream)
#   - origin owner != gh login     → BLOCK
#   - origin owner == gh login     → PASS
#
# We build a real temp git repo at the gate's expected clone path and set its
# origin remote URL to drive the owner comparison, plus mock `gh api user`.

load '../test_helper'

setup() {
  GATE="$GATES_DIR/e04-fork-target.sh"
  DOSSIER="$FIXTURES_DIR/dossiers/example-org__example-repo.md"

  REPO_NAME="e04-test-$$"
  REPO_SLUG="upstreamowner/$REPO_NAME"
  CLONE="$HOME/000-projects/contributing-clanker/$REPO_NAME"

  /usr/bin/git init -q --initial-branch=main "$CLONE"
  /usr/bin/git -C "$CLONE" config user.email "test@example.com"
  /usr/bin/git -C "$CLONE" config user.name  "test"
}

teardown() {
  rm -rf "$CLONE"
  teardown_mock_gh
}

@test "SKIP when no local clone exists at the derived path" {
  rm -rf "$CLONE"
  setup_mock_gh 'someuser'
  run_gate "$GATE" "$FIXTURES_DIR/candidates/clean-open.md" "$DOSSIER" "open-pr" "$REPO_SLUG"
  assert_severity "SKIP"
}

@test "SKIP when gh user login cannot be resolved" {
  setup_mock_gh '' 1
  /usr/bin/git -C "$CLONE" remote add origin "https://github.com/someuser/$REPO_NAME.git"
  run_gate "$GATE" "$FIXTURES_DIR/candidates/clean-open.md" "$DOSSIER" "open-pr" "$REPO_SLUG"
  assert_severity "SKIP"
}

@test "BLOCK when the clone has no origin remote" {
  setup_mock_gh 'someuser'
  run_gate "$GATE" "$FIXTURES_DIR/candidates/clean-open.md" "$DOSSIER" "open-pr" "$REPO_SLUG"
  assert_severity "BLOCK"
}

@test "PASS when origin owner matches the gh login (HTTPS remote)" {
  setup_mock_gh 'forkowner'
  /usr/bin/git -C "$CLONE" remote add origin "https://github.com/forkowner/$REPO_NAME.git"
  run_gate "$GATE" "$FIXTURES_DIR/candidates/clean-open.md" "$DOSSIER" "open-pr" "$REPO_SLUG"
  assert_severity "PASS"
}

@test "PASS when origin owner matches the gh login (SSH remote)" {
  setup_mock_gh 'forkowner'
  /usr/bin/git -C "$CLONE" remote add origin "git@github.com:forkowner/$REPO_NAME.git"
  run_gate "$GATE" "$FIXTURES_DIR/candidates/clean-open.md" "$DOSSIER" "open-pr" "$REPO_SLUG"
  assert_severity "PASS"
}

@test "BLOCK when origin owner is neither the gh login nor the upstream" {
  setup_mock_gh 'forkowner'
  /usr/bin/git -C "$CLONE" remote add origin "https://github.com/somebodyelse/$REPO_NAME.git"
  run_gate "$GATE" "$FIXTURES_DIR/candidates/clean-open.md" "$DOSSIER" "open-pr" "$REPO_SLUG"
  assert_severity "BLOCK"
}

@test "INFORM when origin points at the upstream owner" {
  setup_mock_gh 'forkowner'
  /usr/bin/git -C "$CLONE" remote add origin "https://github.com/upstreamowner/$REPO_NAME.git"
  run_gate "$GATE" "$FIXTURES_DIR/candidates/clean-open.md" "$DOSSIER" "open-pr" "$REPO_SLUG"
  assert_severity "INFORM"
}
