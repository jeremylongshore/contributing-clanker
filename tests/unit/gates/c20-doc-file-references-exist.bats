#!/usr/bin/env bats
# Unit tests for gate C20: backtick file references in modified docs must resolve
#
# C20 looks at the hardcoded clone path
# ($HOME/000-projects/contributing-clanker/<repo>), finds markdown files modified
# in the diff (DEFAULT_BRANCH..HEAD), extracts backtick-wrapped tokens that look
# like file paths, and WARNs for any that don't resolve in the repo. We build a
# tiny temp repo at the expected path, commit a doc on a feature branch, and drive
# WARN (dangling ref) vs PASS (resolving ref) vs PASS (no md) vs SKIP (no clone).

load '../test_helper'

setup() {
  REPO_NAME="c20-test-$$"
  TARGET_DIR="$HOME/000-projects/contributing-clanker/$REPO_NAME"
  mkdir -p "$TARGET_DIR" && cd "$TARGET_DIR" || exit 1
  /usr/bin/git init -q --initial-branch=main
  /usr/bin/git config user.email "test@example.com"
  /usr/bin/git config user.name  "test"
  echo 'baseline' > README.md
  /usr/bin/git add . && /usr/bin/git commit -qm 'init'
  /usr/bin/git checkout -qb feat/test

  DOSSIER=$(mktemp)
  cat > "$DOSSIER" <<'EOF'
---
repo: example-org/example-repo
default_branch: main
---
body
EOF

  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<EOF
---
repo: example-org/$REPO_NAME
issue_number: 1
status: working
---
body
EOF
  GATE="$GATES_DIR/c20-doc-file-references-exist.sh"
}

teardown() {
  rm -f "$CANDIDATE" "$DOSSIER"
  rm -rf "$TARGET_DIR"
}

@test "WARN when a modified doc references a file that does not exist" {
  cd "$TARGET_DIR" || exit 1
  printf 'See the config at `config/missing.json` for details.\n' > GUIDE.md
  /usr/bin/git add . && /usr/bin/git commit -qm 'doc with dangling ref'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "WARN"
}

@test "PASS when every backtick file reference resolves in the repo" {
  cd "$TARGET_DIR" || exit 1
  mkdir -p config
  echo '{}' > config/present.json
  printf 'See the config at `config/present.json` for details.\n' > GUIDE.md
  /usr/bin/git add . && /usr/bin/git commit -qm 'doc with resolving ref'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "PASS"
}

@test "PASS when no markdown files were modified" {
  cd "$TARGET_DIR" || exit 1
  echo 'console.log(1)' > app.js
  /usr/bin/git add . && /usr/bin/git commit -qm 'only code'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "PASS"
}

@test "SKIP when no local clone exists at the expected path" {
  cd "$HOME" || exit 1
  rm -rf "$TARGET_DIR"
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "SKIP"
}
