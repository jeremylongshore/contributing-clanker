#!/usr/bin/env bats
# Unit tests for gate B05: commits missing Signed-off-by when DCO required

load '../test_helper'

setup() {
  REPO_NAME="b05-test-$$"
  TARGET_DIR="$HOME/000-projects/contributing-clanker/$REPO_NAME"
  ORIGIN_DIR="$(mktemp -d)/$REPO_NAME-origin.git"

  /usr/bin/git init -q --bare --initial-branch=main "$ORIGIN_DIR"
  SEED_DIR="$(mktemp -d)"
  /usr/bin/git -C "$SEED_DIR" init -q --initial-branch=main
  /usr/bin/git -C "$SEED_DIR" config user.email "test@example.com"
  /usr/bin/git -C "$SEED_DIR" config user.name  "test"
  echo 'baseline' > "$SEED_DIR/README.md"
  /usr/bin/git -C "$SEED_DIR" add . && /usr/bin/git -C "$SEED_DIR" commit -qm 'init'
  /usr/bin/git -C "$SEED_DIR" remote add origin "$ORIGIN_DIR"
  /usr/bin/git -C "$SEED_DIR" push -q origin main

  /usr/bin/git clone -q "$ORIGIN_DIR" "$TARGET_DIR"
  /usr/bin/git -C "$TARGET_DIR" config user.email "test@example.com"
  /usr/bin/git -C "$TARGET_DIR" config user.name  "test"

  rm -rf "$SEED_DIR"

  # Custom dossier with dco_required: true
  TMP_DOSSIER=$(mktemp)
  cat > "$TMP_DOSSIER" <<'EOF'
---
repo: example-org/example-repo
default_branch: main
dco_required: true
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
  GATE="$GATES_DIR/b05-dco-signoff.sh"
}

teardown() {
  rm -f "$CANDIDATE" "$DOSSIER"
  rm -rf "$TARGET_DIR"
  rm -rf "$(dirname "$ORIGIN_DIR")"
}

@test "PASS when all commits have Signed-off-by trailer" {
  cd "$TARGET_DIR" || exit 1
  /usr/bin/git checkout -qb feat/test
  echo 'work' >> README.md
  /usr/bin/git add .
  /usr/bin/git commit -qm 'feat: add thing

Signed-off-by: Test User <test@example.com>'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "PASS"
}

@test "BLOCK when a commit lacks Signed-off-by" {
  cd "$TARGET_DIR" || exit 1
  /usr/bin/git checkout -qb feat/test
  echo 'work' >> README.md
  /usr/bin/git add . && /usr/bin/git commit -qm 'feat: missing trailer'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "BLOCK"
}

@test "SKIP when dossier dco_required is not true" {
  cd "$TARGET_DIR" || exit 1
  /usr/bin/git checkout -qb feat/test
  echo 'work' >> README.md
  /usr/bin/git add . && /usr/bin/git commit -qm 'feat: x'
  TMP_NODCO=$(mktemp)
  cat > "$TMP_NODCO" <<'EOF'
---
repo: example-org/example-repo
default_branch: main
dco_required: false
---
EOF
  run_gate "$GATE" "$CANDIDATE" "$TMP_NODCO" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "SKIP"
  rm -f "$TMP_NODCO"
}
