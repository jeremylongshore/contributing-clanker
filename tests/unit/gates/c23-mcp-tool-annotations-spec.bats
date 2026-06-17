#!/usr/bin/env bats
# Unit tests for gate C23: MCP tool annotations vs the 2025-06-18 spec
#
# C23 scans tools/*.yaml files modified in the diff (DEFAULT_BRANCH..HEAD) with an
# awk stanza walker and WARNs on two annotation errors:
#   REDUNDANT: idempotentHint set on a readOnlyHint:true tool (spec ignores it)
#   CONFLATED: destructiveHint:true paired with idempotentHint:false
# It PASSes on conformant annotations or when no tools/*.yaml changed, and SKIPs
# with no clone. We build a temp repo at the hardcoded clone path and craft YAML
# matching the walker's stanza shape (name → annotations → inputSchema).

load '../test_helper'

setup() {
  REPO_NAME="c23-test-$$"
  TARGET_DIR="$HOME/000-projects/contributing-clanker/$REPO_NAME"
  mkdir -p "$TARGET_DIR/tools" && cd "$TARGET_DIR" || exit 1
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
  GATE="$GATES_DIR/c23-mcp-tool-annotations-spec.sh"
}

teardown() {
  rm -f "$CANDIDATE" "$DOSSIER"
  rm -rf "$TARGET_DIR"
}

@test "WARN when a destructive tool is marked idempotentHint:false (conflation)" {
  cd "$TARGET_DIR" || exit 1
  cat > tools/delete.yaml <<'EOF'
tools:
  - name: deleteThing
    annotations:
      destructiveHint: true
      idempotentHint: false
    inputSchema:
      type: object
EOF
  /usr/bin/git add . && /usr/bin/git commit -qm 'conflated annotation'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "WARN"
}

@test "WARN when idempotentHint is set on a readOnlyHint:true tool (redundant)" {
  cd "$TARGET_DIR" || exit 1
  cat > tools/list.yaml <<'EOF'
tools:
  - name: listThings
    annotations:
      readOnlyHint: true
      idempotentHint: true
    inputSchema:
      type: object
EOF
  /usr/bin/git add . && /usr/bin/git commit -qm 'redundant annotation'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "WARN"
}

@test "PASS when annotations conform to the spec" {
  cd "$TARGET_DIR" || exit 1
  cat > tools/ok.yaml <<'EOF'
tools:
  - name: createThing
    annotations:
      destructiveHint: false
      idempotentHint: false
    inputSchema:
      type: object
  - name: terminateThing
    annotations:
      destructiveHint: true
      idempotentHint: true
    inputSchema:
      type: object
EOF
  /usr/bin/git add . && /usr/bin/git commit -qm 'conformant annotations'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "PASS"
}

@test "PASS when no tools/*.yaml files were modified" {
  cd "$TARGET_DIR" || exit 1
  # Branch from a clean main so the diff contains only the README change.
  /usr/bin/git checkout -q main
  /usr/bin/git checkout -qb feat/doconly
  echo 'updated' >> README.md
  /usr/bin/git add . && /usr/bin/git commit -qm 'docs only'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "PASS"
}

@test "SKIP when no local clone exists at the expected path" {
  cd "$HOME" || exit 1
  rm -rf "$TARGET_DIR"
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "SKIP"
}
