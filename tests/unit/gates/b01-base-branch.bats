#!/usr/bin/env bats
# Unit tests for gate B01: HEAD descends from origin/<default_branch>
#
# We construct a temp git repo at the gate's expected clone path
# ($HOME/000-projects/contributing-clanker/<repo>), set up an "origin" remote
# that points at a parallel bare repo so origin/<default_branch> is a real
# resolvable ref, then drive PASS/BLOCK by branching from main vs orphan.

load '../test_helper'

setup() {
  REPO_NAME="b01-test-$$"
  TARGET_DIR="$HOME/000-projects/contributing-clanker/$REPO_NAME"
  ORIGIN_DIR="$(mktemp -d)/$REPO_NAME-origin.git"

  # Bare "origin" with one commit on main
  /usr/bin/git init -q --bare --initial-branch=main "$ORIGIN_DIR"
  SEED_DIR="$(mktemp -d)"
  /usr/bin/git -C "$SEED_DIR" init -q --initial-branch=main
  /usr/bin/git -C "$SEED_DIR" config user.email "test@example.com"
  /usr/bin/git -C "$SEED_DIR" config user.name  "test"
  echo 'baseline' > "$SEED_DIR/README.md"
  /usr/bin/git -C "$SEED_DIR" add . && /usr/bin/git -C "$SEED_DIR" commit -qm 'init'
  /usr/bin/git -C "$SEED_DIR" remote add origin "$ORIGIN_DIR"
  /usr/bin/git -C "$SEED_DIR" push -q origin main

  # Local clone at the path the gate expects
  /usr/bin/git clone -q "$ORIGIN_DIR" "$TARGET_DIR"
  /usr/bin/git -C "$TARGET_DIR" config user.email "test@example.com"
  /usr/bin/git -C "$TARGET_DIR" config user.name  "test"

  rm -rf "$SEED_DIR"

  # Build a custom dossier with default_branch: main
  TMP_DOSSIER=$(mktemp)
  cat > "$TMP_DOSSIER" <<'EOF'
---
repo: example-org/example-repo
default_branch: main
---
body
EOF
  DOSSIER="$TMP_DOSSIER"

  TMPCAND=$(mktemp)
  cat > "$TMPCAND" <<EOF
---
repo: example-org/$REPO_NAME
issue_number: 1
status: working
---
body
EOF
  CANDIDATE="$TMPCAND"
  GATE="$GATES_DIR/b01-base-branch.sh"
}

teardown() {
  rm -f "$CANDIDATE" "$DOSSIER"
  rm -rf "$TARGET_DIR"
  rm -rf "$(dirname "$ORIGIN_DIR")"
}

@test "PASS when HEAD descends from origin/main" {
  cd "$TARGET_DIR" || exit 1
  /usr/bin/git checkout -qb feat/test
  echo 'work' >> README.md
  /usr/bin/git add . && /usr/bin/git commit -qm 'work'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "PASS"
}

@test "BLOCK when HEAD is an orphan branch (not based on origin/main)" {
  cd "$TARGET_DIR" || exit 1
  /usr/bin/git checkout -q --orphan rogue
  /usr/bin/git rm -qrf . 2>/dev/null || true
  echo 'orphan' > rogue.txt
  /usr/bin/git add . && /usr/bin/git commit -qm 'orphan'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "BLOCK"
}

@test "SKIP when no dossier supplied" {
  cd "$TARGET_DIR" || exit 1
  run_gate "$GATE" "$CANDIDATE" "" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "SKIP"
}

@test "SKIP when no local clone exists" {
  rm -rf "$TARGET_DIR"
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "SKIP"
}
