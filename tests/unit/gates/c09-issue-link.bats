#!/usr/bin/env bats
# Unit tests for gate C09: PR body must auto-close its issue via Closes/Fixes/Resolves #N
# Trap: a PR that doesn't auto-close the issue forces the maintainer to close it by hand.

load '../test_helper'

setup() {
  DOSSIER="$FIXTURES_DIR/dossiers/example-org__example-repo.md"
  GATE="$GATES_DIR/c09-issue-link.sh"
}

teardown() {
  rm -f "${CANDIDATE:-}"
}

@test "PASS when PR body says 'Closes #42'" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
issue_number: 42
pr_number: 7
status: submitted
---
## PR body

Adds the missing validation.

Closes #42
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "open-pr"
  assert_severity "PASS"
}

@test "PASS when PR body uses 'Fixes #42' (case-insensitive keyword variant)" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
issue_number: 42
pr_number: 7
status: submitted
---
## PR body

fixes #42 with a one-line guard.
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "open-pr"
  assert_severity "PASS"
}

@test "BLOCK when PR body mentions the issue but without an auto-close keyword" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
issue_number: 42
pr_number: 7
status: submitted
---
## PR body

Related to #42 but does not auto-close it.
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "open-pr"
  assert_severity "BLOCK"
}

@test "INFORM when no '## PR body' section drafted yet" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
issue_number: 42
status: working
---
## Scope

No PR body section yet.
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "open-pr"
  assert_severity "INFORM"
}

@test "SKIP when candidate has no issue_number" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
pr_number: 7
status: submitted
---
## PR body

Closes #42
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "open-pr"
  assert_severity "SKIP"
}
