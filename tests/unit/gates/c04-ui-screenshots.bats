#!/usr/bin/env bats
# Unit tests for gate C04: PR touches UI files but PR body has no screenshot /
# recording.
#
# The gate diffs <default_branch>..HEAD --name-only in the local clone at
# $HOME/000-projects/contributing-clanker/<repo>, filters for UI extensions
# (.tsx/.jsx/.vue/.svelte/.html/.css/.scss), then inspects the candidate's
# `## PR body` section. UI change + screenshot/recording reference => PASS;
# UI change + body present but no image => BLOCK; UI change + no PR body
# drafted => INFORM; no UI files touched => PASS; no clone => SKIP.

load '../test_helper'

setup() {
  REPO_NAME="c04-test-$$"
  TARGET_DIR="$HOME/000-projects/contributing-clanker/$REPO_NAME"

  /usr/bin/git init -q --initial-branch=main "$TARGET_DIR"
  /usr/bin/git -C "$TARGET_DIR" config user.email "test@example.com"
  /usr/bin/git -C "$TARGET_DIR" config user.name  "test"
  echo 'baseline' > "$TARGET_DIR/README.md"
  echo 'export const x = 1;' > "$TARGET_DIR/util.ts"
  /usr/bin/git -C "$TARGET_DIR" add . && /usr/bin/git -C "$TARGET_DIR" commit -qm 'init'

  DOSSIER=$(mktemp)
  cat > "$DOSSIER" <<'EOF'
---
repo: example-org/example-repo
default_branch: main
---
body
EOF
  GATE="$GATES_DIR/c04-ui-screenshots.sh"
}

teardown() {
  rm -f "$DOSSIER" "${CANDIDATE:-}"
  rm -rf "$TARGET_DIR"
}

@test "BLOCK when UI files change but PR body has no screenshot/recording" {
  cd "$TARGET_DIR" || exit 1
  /usr/bin/git checkout -qb feat/test
  echo '<template><div /></template>' > Widget.vue
  /usr/bin/git add . && /usr/bin/git commit -qm 'add widget'
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
issue_number: 1
status: submitted
---

## PR body

Adds a widget. Tested locally.
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "BLOCK"
}

@test "PASS when UI files change and PR body references a screenshot" {
  cd "$TARGET_DIR" || exit 1
  /usr/bin/git checkout -qb feat/test
  echo '.btn { color: red; }' > styles.css
  /usr/bin/git add . && /usr/bin/git commit -qm 'add styles'
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
issue_number: 1
status: submitted
---

## PR body

Adds button styling.

![before/after](https://example.com/shot.png)
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "PASS"
}

@test "PASS when no UI files are touched in the diff" {
  cd "$TARGET_DIR" || exit 1
  /usr/bin/git checkout -qb feat/test
  echo 'export const y = 2;' > more.ts
  /usr/bin/git add . && /usr/bin/git commit -qm 'non-ui change'
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
issue_number: 1
status: submitted
---

## PR body

Backend-only change, no UI.
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "PASS"
}

@test "INFORM when UI files change but no PR body drafted yet" {
  cd "$TARGET_DIR" || exit 1
  /usr/bin/git checkout -qb feat/test
  echo '<div></div>' > page.html
  /usr/bin/git add . && /usr/bin/git commit -qm 'add page'
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
issue_number: 1
status: working
---

## Scope
Just the scope, no PR body section yet.
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "INFORM"
}

@test "SKIP when no local clone exists" {
  rm -rf "$TARGET_DIR"
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
issue_number: 1
status: submitted
---

## PR body
anything
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "SKIP"
}
