#!/usr/bin/env bats
# Unit tests for gate C03: PR body draft missing required sections

load '../test_helper'

setup() {
  # Custom dossier with pr_template_required_sections array
  TMP_DOSSIER=$(mktemp)
  cat > "$TMP_DOSSIER" <<'EOF'
---
repo: example-org/example-repo
default_branch: main
pr_template_required_sections: [Problem, Changes, "How tested"]
---
body
EOF
  DOSSIER="$TMP_DOSSIER"
  GATE="$GATES_DIR/c03-pr-body-sections.sh"
}

teardown() {
  rm -f "$DOSSIER" "${CANDIDATE:-}"
}

@test "PASS when candidate PR body contains all required sections" {
  # Required-section headers must live INSIDE the '## PR body' block as `###`
  # subsections — the gate's awk extraction stops at the next `## ` heading.
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
issue_number: 42
status: working
---

## PR body

### Problem
Describes the problem.

### Changes
- a
- b

### How tested
Ran the suite.
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "flip-to-ready"
  assert_severity "PASS"
}

@test "BLOCK when PR body is missing a required section" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
issue_number: 42
status: working
---

## PR body

### Problem
text

### Changes
text
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "flip-to-ready"
  assert_severity "BLOCK"
}

@test "SKIP when dossier has no pr_template_required_sections" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
issue_number: 42
---

## PR body
anything
EOF
  TMP_BLANK=$(mktemp)
  cat > "$TMP_BLANK" <<'EOF'
---
repo: example-org/example-repo
default_branch: main
---
EOF
  run_gate "$GATE" "$CANDIDATE" "$TMP_BLANK" "flip-to-ready"
  assert_severity "SKIP"
  rm -f "$TMP_BLANK"
}

@test "SKIP when candidate has no '## PR body' section" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
issue_number: 42
---

# Just a header

no PR body section
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "flip-to-ready"
  assert_severity "SKIP"
}
