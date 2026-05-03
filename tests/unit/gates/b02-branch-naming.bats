#!/usr/bin/env bats
# Unit tests for gate B02: branch name matches dossier convention

load '../test_helper'

setup() {
  REPO_NAME="b02-test-$$"
  TARGET_DIR="$HOME/000-projects/contributing-clanker/$REPO_NAME"
  mkdir -p "$TARGET_DIR" && cd "$TARGET_DIR" || exit 1
  git init -q --initial-branch=main
  git config user.email "test@example.com"
  git config user.name  "test"
  echo 'x' > a && git add . && git commit -qm 'init'

  # Build a custom dossier with branch_convention regex
  TMP_DOSSIER=$(mktemp)
  cat > "$TMP_DOSSIER" <<'EOF'
---
repo: example-org/example-repo
default_branch: main
branch_convention: "^(feat|fix|chore)/[a-z0-9-]+$"
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
  GATE="$GATES_DIR/b02-branch-naming.sh"
}

teardown() {
  rm -f "$CANDIDATE" "$DOSSIER"
  rm -rf "$TARGET_DIR"
}

@test "PASS when branch matches convention" {
  cd "$TARGET_DIR" || exit 1
  git checkout -qb feat/add-thing
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "PASS"
}

@test "BLOCK when branch violates convention" {
  cd "$TARGET_DIR" || exit 1
  git checkout -qb random-branch-name
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "BLOCK"
}

@test "SKIP when dossier has no branch_convention field" {
  cd "$TARGET_DIR" || exit 1
  git checkout -qb anything
  TMP_BAREBONES=$(mktemp); printf -- '---\nrepo: x/y\n---\n' > "$TMP_BAREBONES"
  run_gate "$GATE" "$CANDIDATE" "$TMP_BAREBONES" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "SKIP"
  rm -f "$TMP_BAREBONES"
}
