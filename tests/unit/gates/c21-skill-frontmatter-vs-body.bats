#!/usr/bin/env bats
# Unit tests for gate C21: SKILL.md allowed-tools must be used in the body
#
# C21 looks at the hardcoded clone path, finds modified SKILL.md files in the diff
# (DEFAULT_BRANCH..HEAD), parses the allowed-tools frontmatter list, and WARNs when
# a declared top-level tool (Read/Write/Edit/...) never appears as a word in the
# body. We build a temp repo at the expected path and drive WARN (declared-unused),
# PASS (declared-and-used), PASS (no SKILL.md), and SKIP (no clone).

load '../test_helper'

setup() {
  REPO_NAME="c21-test-$$"
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
  GATE="$GATES_DIR/c21-skill-frontmatter-vs-body.sh"
}

teardown() {
  rm -f "$CANDIDATE" "$DOSSIER"
  rm -rf "$TARGET_DIR"
}

@test "WARN when SKILL.md declares a tool the body never uses" {
  cd "$TARGET_DIR" || exit 1
  mkdir -p skills/demo
  cat > skills/demo/SKILL.md <<'EOF'
---
name: demo
description: a demo skill
allowed-tools: Read, Write
---

The body only reads files. It calls Read on the manifest and reports.
EOF
  /usr/bin/git add . && /usr/bin/git commit -qm 'add skill with unused Write'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "WARN"
}

@test "PASS when every declared allowed-tool appears in the body" {
  cd "$TARGET_DIR" || exit 1
  mkdir -p skills/demo
  cat > skills/demo/SKILL.md <<'EOF'
---
name: demo
description: a demo skill
allowed-tools: Read, Edit
---

The body uses Read to load the file, then Edit to apply the change.
EOF
  /usr/bin/git add . && /usr/bin/git commit -qm 'add skill with used tools'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "PASS"
}

@test "PASS when no SKILL.md files were modified" {
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
