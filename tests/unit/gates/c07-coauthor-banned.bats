#!/usr/bin/env bats
# Unit tests for gate C07: 'Co-Authored-By: Claude' trailer banned by the repo's AI policy
# Trap: leaving the Claude co-author trailer in commits to a repo whose policy forbids it
# brands the contribution as AI-authored slop the moment a maintainer reads `git log`.
#
# The gate inspects a real clone at $HOME/000-projects/contributing-clanker/<repo>,
# diffing default_branch..HEAD for the trailer. Each test builds a throwaway git repo
# at that exact path (unique repo name) and removes it in teardown.

load '../test_helper'

# Root the gate scans for clones.
CLONE_ROOT="${HOME}/000-projects/contributing-clanker"

setup() {
  GATE="$GATES_DIR/c07-coauthor-banned.sh"
  # Dossier that forbids the trailer; default branch main.
  FORBID_DOSSIER=$(mktemp)
  cat > "$FORBID_DOSSIER" <<'EOF'
---
repo: example-org/example-repo
default_branch: main
coauthor_claude_forbidden: true
---
body
EOF
  # Candidate frontmatter is irrelevant to this gate; reuse the shared fixture.
  CANDIDATE="$FIXTURES_DIR/candidates/clean-open.md"
  # Unique throwaway clone dir under the scanned root.
  REPO_NAME="__bats_c07_${BATS_SUITE_TEST_NUMBER}_$$"
  CLONE="$CLONE_ROOT/$REPO_NAME"
  rm -rf "$CLONE"
}

teardown() {
  rm -f "${FORBID_DOSSIER:-}"
  [[ -n "${CLONE:-}" ]] && rm -rf "$CLONE"
}

# Build a git clone on a feature branch off main with the given last-commit message body.
_make_clone_feature() {
  local commit_body="$1"
  mkdir -p "$CLONE"
  git -C "$CLONE" init -q -b main
  git -C "$CLONE" config user.email t@t.io
  git -C "$CLONE" config user.name t
  echo base > "$CLONE/f"
  git -C "$CLONE" add f
  git -C "$CLONE" commit -qm "base commit"
  git -C "$CLONE" checkout -q -b feature/work
  echo more > "$CLONE/g"
  git -C "$CLONE" add g
  git -C "$CLONE" commit -qF - <<EOF
$commit_body
EOF
}

@test "BLOCK when a feature commit carries the Co-Authored-By: Claude trailer" {
  _make_clone_feature $'feat: add thing\n\nCo-Authored-By: Claude <noreply@anthropic.com>'
  run_gate "$GATE" "$CANDIDATE" "$FORBID_DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "BLOCK"
}

@test "PASS when feature commits carry no banned trailer" {
  _make_clone_feature $'feat: add thing\n\nclean commit message, human authored'
  run_gate "$GATE" "$CANDIDATE" "$FORBID_DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "PASS"
}

@test "SKIP when dossier does not forbid the trailer" {
  _make_clone_feature $'feat: add thing\n\nCo-Authored-By: Claude <noreply@anthropic.com>'
  ALLOW_DOSSIER=$(mktemp)
  cat > "$ALLOW_DOSSIER" <<'EOF'
---
repo: example-org/example-repo
default_branch: main
coauthor_claude_forbidden: false
---
body
EOF
  run_gate "$GATE" "$CANDIDATE" "$ALLOW_DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "SKIP"
  rm -f "$ALLOW_DOSSIER"
}

@test "SKIP when no clone exists at the expected path" {
  # Do NOT create $CLONE -> gate cannot find a .git dir.
  run_gate "$GATE" "$CANDIDATE" "$FORBID_DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "SKIP"
}
