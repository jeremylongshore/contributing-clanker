#!/usr/bin/env bats
# Unit tests for gate C19: PR body claims that don't match the diff
#
# C19 reads local_clone_path + branch from the candidate frontmatter, extracts
# the `## PR body` block, then diffs origin/<default_branch>..<branch> and checks
# each claim regex in the body against the changed-file paths. We build a temp
# clone with a real "origin" remote (so origin/main..<branch> resolves) and craft
# candidates that either back their claims with matching files (PASS) or claim
# work the diff never touches (BLOCK).

load '../test_helper'

setup() {
  GATE="$GATES_DIR/c19-body-claim-vs-diff.sh"

  # Bare "origin" with one commit on main
  ORIGIN_DIR="$(mktemp -d)/origin.git"
  /usr/bin/git init -q --bare --initial-branch=main "$ORIGIN_DIR"
  SEED_DIR="$(mktemp -d)"
  /usr/bin/git -C "$SEED_DIR" init -q --initial-branch=main
  /usr/bin/git -C "$SEED_DIR" config user.email "test@example.com"
  /usr/bin/git -C "$SEED_DIR" config user.name  "test"
  echo 'baseline' > "$SEED_DIR/README.md"
  /usr/bin/git -C "$SEED_DIR" add . && /usr/bin/git -C "$SEED_DIR" commit -qm 'init'
  /usr/bin/git -C "$SEED_DIR" remote add origin "$ORIGIN_DIR"
  /usr/bin/git -C "$SEED_DIR" push -q origin main
  rm -rf "$SEED_DIR"

  # Local clone on a feature branch
  CLONE_DIR="$(mktemp -d)/clone"
  /usr/bin/git clone -q "$ORIGIN_DIR" "$CLONE_DIR"
  /usr/bin/git -C "$CLONE_DIR" config user.email "test@example.com"
  /usr/bin/git -C "$CLONE_DIR" config user.name  "test"
  /usr/bin/git -C "$CLONE_DIR" checkout -qb feat/test

  # Dossier with default_branch: main
  DOSSIER=$(mktemp)
  cat > "$DOSSIER" <<'EOF'
---
repo: example-org/example-repo
default_branch: main
---
body
EOF
}

teardown() {
  rm -f "$DOSSIER" "${CANDIDATE:-}"
  rm -rf "${CLONE_DIR%/clone}" "$(dirname "$ORIGIN_DIR")"
}

# Helper: write a candidate file referencing the temp clone + feat/test branch.
_make_candidate() {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<EOF
---
repo: example-org/example-repo
issue_number: 1
status: working
local_clone_path: $CLONE_DIR
branch: feat/test
---

## PR body

$1
EOF
}

@test "BLOCK when body claims tests added but no test files in diff" {
  # Diff touches only src/, not tests/ — the 'added tests' claim is unbacked.
  echo 'fix: handle null' > "$CLONE_DIR/src.js"
  /usr/bin/git -C "$CLONE_DIR" add . && /usr/bin/git -C "$CLONE_DIR" commit -qm 'fix'
  _make_candidate "Fixed the bug and added tests for the fix."
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted"
  assert_severity "BLOCK"
}

@test "BLOCK when body claims CHANGELOG updated but diff doesn't touch CHANGELOG" {
  echo 'code change' > "$CLONE_DIR/feature.js"
  /usr/bin/git -C "$CLONE_DIR" add . && /usr/bin/git -C "$CLONE_DIR" commit -qm 'feat'
  _make_candidate "Implemented the feature and updated the CHANGELOG."
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted"
  assert_severity "BLOCK"
}

@test "PASS when body claims tests added and diff actually touches tests/" {
  mkdir -p "$CLONE_DIR/tests"
  echo 'test code' > "$CLONE_DIR/tests/fix.test.js"
  echo 'fix' > "$CLONE_DIR/src.js"
  /usr/bin/git -C "$CLONE_DIR" add . && /usr/bin/git -C "$CLONE_DIR" commit -qm 'fix+tests'
  _make_candidate "Fixed the bug and added tests in tests/fix.test.js."
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted"
  assert_severity "PASS"
}

@test "PASS when body makes no unbacked claims" {
  echo 'simple change' > "$CLONE_DIR/util.js"
  /usr/bin/git -C "$CLONE_DIR" add . && /usr/bin/git -C "$CLONE_DIR" commit -qm 'util'
  _make_candidate "Refactored the helper to be clearer. No behavior change."
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted"
  assert_severity "PASS"
}

@test "INFORM when candidate has no '## PR body' section" {
  echo 'change' > "$CLONE_DIR/x.js"
  /usr/bin/git -C "$CLONE_DIR" add . && /usr/bin/git -C "$CLONE_DIR" commit -qm 'x'
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<EOF
---
repo: example-org/example-repo
issue_number: 1
status: working
local_clone_path: $CLONE_DIR
branch: feat/test
---

# No PR body block here
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted"
  assert_severity "INFORM"
}

@test "SKIP when candidate has no local_clone_path" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
issue_number: 1
status: working
branch: feat/test
---

## PR body

Added tests for the fix.
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted"
  assert_severity "SKIP"
}
