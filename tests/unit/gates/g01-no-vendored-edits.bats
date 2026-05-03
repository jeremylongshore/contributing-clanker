#!/usr/bin/env bats
# Unit tests for gate G01: no hand-edits to vendored / generated paths

load '../test_helper'

# G01 needs a real git clone to call git diff against. We construct a tiny temp
# repo with one commit on master, branch off, modify a vendored path, then run
# the gate. The clone path must match what the gate expects:
#   $HOME/000-projects/contributing-clanker/<repo-name>

setup() {
  REPO_NAME="g01-test-$$"
  TARGET_DIR="$HOME/000-projects/contributing-clanker/$REPO_NAME"
  mkdir -p "$TARGET_DIR" && cd "$TARGET_DIR" || exit 1
  git init -q --initial-branch=main
  git config user.email "test@example.com"
  git config user.name  "test"
  echo 'baseline' > README.md
  git add . && git commit -qm 'init'
  git checkout -qb feat/test
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
  DOSSIER="$FIXTURES_DIR/dossiers/example-org__example-repo.md"
  GATE="$GATES_DIR/g01-no-vendored-edits.sh"
}

teardown() {
  rm -f "$CANDIDATE"
  rm -rf "$TARGET_DIR"
}

@test "BLOCK when diff modifies vendor/" {
  cd "$TARGET_DIR" || exit 1
  mkdir -p vendor && echo 'hand-edit' > vendor/lib.js
  git add . && git commit -qm 'edit vendor'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "BLOCK"
}

@test "WARN when diff only modifies a lockfile" {
  cd "$TARGET_DIR" || exit 1
  echo '{"name":"foo"}' > package-lock.json
  git add . && git commit -qm 'bump lockfile'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "WARN"
}

@test "PASS when only README changed" {
  cd "$TARGET_DIR" || exit 1
  echo 'updated' >> README.md
  git add . && git commit -qm 'docs'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "PASS"
}
