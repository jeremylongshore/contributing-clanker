#!/usr/bin/env bats
# Unit tests for gate B06: commit subjects violate Conventional Commits

load '../test_helper'

setup() {
  REPO_NAME="b06-test-$$"
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

  # Dossier with conventional_commits: true (matches example baseline)
  TMP_DOSSIER=$(mktemp)
  cat > "$TMP_DOSSIER" <<'EOF'
---
repo: example-org/example-repo
default_branch: main
conventional_commits: true
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
  GATE="$GATES_DIR/b06-commit-format.sh"
}

teardown() {
  rm -f "$CANDIDATE" "$DOSSIER"
  rm -rf "$TARGET_DIR"
  rm -rf "$(dirname "$ORIGIN_DIR")"
}

@test "PASS when all subjects match Conventional Commits" {
  cd "$TARGET_DIR" || exit 1
  /usr/bin/git checkout -qb feat/test
  echo 'work' >> README.md
  /usr/bin/git add . && /usr/bin/git commit -qm 'feat(api): add endpoint'
  echo 'more' >> README.md
  /usr/bin/git add . && /usr/bin/git commit -qm 'fix: handle nil case'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "PASS"
}

@test "BLOCK when a subject violates Conventional Commits" {
  cd "$TARGET_DIR" || exit 1
  /usr/bin/git checkout -qb feat/test
  echo 'work' >> README.md
  /usr/bin/git add . && /usr/bin/git commit -qm 'random commit message'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "BLOCK"
}

@test "SKIP when dossier conventional_commits is not true" {
  cd "$TARGET_DIR" || exit 1
  /usr/bin/git checkout -qb feat/test
  echo 'work' >> README.md
  /usr/bin/git add . && /usr/bin/git commit -qm 'random commit message'
  TMP_NOCC=$(mktemp)
  cat > "$TMP_NOCC" <<'EOF'
---
repo: example-org/example-repo
default_branch: main
conventional_commits: false
---
EOF
  run_gate "$GATE" "$CANDIDATE" "$TMP_NOCC" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "SKIP"
  rm -f "$TMP_NOCC"
}
