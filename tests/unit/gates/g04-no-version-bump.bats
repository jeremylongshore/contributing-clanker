#!/usr/bin/env bats
# Unit tests for gate G04: manual version bump in a repo using semantic-release

load '../test_helper'

setup() {
  REPO_NAME="g04-test-$$"
  TARGET_DIR="$HOME/000-projects/contributing-clanker/$REPO_NAME"
  mkdir -p "$TARGET_DIR" && cd "$TARGET_DIR" || exit 1
  /usr/bin/git init -q --initial-branch=main
  /usr/bin/git config user.email "test@example.com"
  /usr/bin/git config user.name  "test"

  # Seed a baseline package.json on main
  cat > package.json <<'EOF'
{
  "name": "fixture",
  "version": "1.0.0",
  "description": "test"
}
EOF
  /usr/bin/git add . && /usr/bin/git commit -qm 'init'

  # Branch off — gate diffs main..HEAD
  /usr/bin/git checkout -qb feat/test

  # Custom dossier with auto_version: true
  TMP_DOSSIER=$(mktemp)
  cat > "$TMP_DOSSIER" <<'EOF'
---
repo: example-org/example-repo
default_branch: main
auto_version: true
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
  GATE="$GATES_DIR/g04-no-version-bump.sh"
}

teardown() {
  rm -f "$CANDIDATE" "$DOSSIER"
  rm -rf "$TARGET_DIR"
}

@test "WARN when diff bumps package.json version field" {
  cd "$TARGET_DIR" || exit 1
  /usr/bin/sed -i 's/"version": "1.0.0"/"version": "1.0.1"/' package.json
  /usr/bin/git add . && /usr/bin/git commit -qm 'chore: bump'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "WARN"
}

@test "PASS when diff doesn't touch the version field" {
  cd "$TARGET_DIR" || exit 1
  echo 'docs' > NOTES.md
  /usr/bin/git add . && /usr/bin/git commit -qm 'docs: add notes'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "PASS"
}

@test "SKIP when dossier auto_version is not true" {
  cd "$TARGET_DIR" || exit 1
  /usr/bin/sed -i 's/"version": "1.0.0"/"version": "1.0.1"/' package.json
  /usr/bin/git add . && /usr/bin/git commit -qm 'chore: bump'
  TMP_NOAV=$(mktemp)
  cat > "$TMP_NOAV" <<'EOF'
---
repo: example-org/example-repo
default_branch: main
auto_version: false
---
EOF
  run_gate "$GATE" "$CANDIDATE" "$TMP_NOAV" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "SKIP"
  rm -f "$TMP_NOAV"
}
