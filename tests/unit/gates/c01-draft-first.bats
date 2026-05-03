#!/usr/bin/env bats
# Unit tests for gate C01: repo prefers draft PRs first

load '../test_helper'

setup() {
  # Custom dossier with draft_first: true
  TMP_DOSSIER=$(mktemp)
  cat > "$TMP_DOSSIER" <<'EOF'
---
repo: example-org/example-repo
default_branch: main
draft_first: true
---
body
EOF
  DOSSIER="$TMP_DOSSIER"
  GATE="$GATES_DIR/c01-draft-first.sh"
}

teardown() {
  rm -f "$DOSSIER" "${CANDIDATE:-}"
}

@test "PASS when candidate has draft: true" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
issue_number: 42
draft: true
status: working
---
body
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "flip-to-ready"
  assert_severity "PASS"
}

@test "BLOCK when candidate has draft: false but dossier requires draft-first" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
issue_number: 42
draft: false
status: working
---
body
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "flip-to-ready"
  assert_severity "BLOCK"
}

@test "SKIP when candidate has no draft field" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
issue_number: 42
status: working
---
body
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "flip-to-ready"
  assert_severity "SKIP"
}

@test "SKIP when dossier draft_first is not true" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
issue_number: 42
draft: false
status: working
---
body
EOF
  TMP_NODR=$(mktemp)
  cat > "$TMP_NODR" <<'EOF'
---
repo: example-org/example-repo
default_branch: main
draft_first: false
---
EOF
  run_gate "$GATE" "$CANDIDATE" "$TMP_NODR" "flip-to-ready"
  assert_severity "SKIP"
  rm -f "$TMP_NODR"
}
