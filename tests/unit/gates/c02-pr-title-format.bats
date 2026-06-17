#!/usr/bin/env bats
# Unit tests for gate C02: PR title violates repo-required regex
#
# The gate reads `pr_title_regex` from the dossier and the candidate's
# `pr_title` (frontmatter first, then a `## PR title` body section), then
# greps the title against the regex.

load '../test_helper'

setup() {
  GATE="$GATES_DIR/c02-pr-title-format.sh"

  # Dossier requiring Conventional-Commits-style PR titles.
  DOSSIER=$(mktemp)
  cat > "$DOSSIER" <<'EOF'
---
repo: example-org/example-repo
default_branch: main
pr_title_regex: ^(feat|fix|chore|docs)(\([a-z-]+\))?: .+
---
body
EOF
}

teardown() {
  rm -f "$DOSSIER" "${CANDIDATE:-}"
}

@test "PASS when PR title (frontmatter) matches the required regex" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
issue_number: 42
status: submitted
pr_title: "fix(api): handle nil response"
---
body
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "open-pr"
  assert_severity "PASS"
}

@test "BLOCK when PR title (frontmatter) does not match the required regex" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
issue_number: 42
status: submitted
pr_title: "Added a new endpoint"
---
body
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "open-pr"
  assert_severity "BLOCK"
}

@test "PASS when PR title comes from the '## PR title' body section" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
issue_number: 42
status: submitted
---

## PR title

feat(core): add retry helper

## PR body
text
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "open-pr"
  assert_severity "PASS"
}

@test "BLOCK when '## PR title' body section title does not match" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
issue_number: 42
status: submitted
---

## PR title

random title with no conventional prefix

## PR body
text
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "open-pr"
  assert_severity "BLOCK"
}

@test "SKIP when no dossier supplied" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
pr_title: "fix: anything"
---
body
EOF
  run_gate "$GATE" "$CANDIDATE" "" "open-pr"
  assert_severity "SKIP"
}

@test "SKIP when dossier has no pr_title_regex" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
pr_title: "anything goes"
---
body
EOF
  TMP_NOREGEX=$(mktemp)
  cat > "$TMP_NOREGEX" <<'EOF'
---
repo: example-org/example-repo
default_branch: main
---
body
EOF
  run_gate "$GATE" "$CANDIDATE" "$TMP_NOREGEX" "open-pr"
  assert_severity "SKIP"
  rm -f "$TMP_NOREGEX"
}

@test "SKIP when candidate has no PR title (frontmatter or section)" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
issue_number: 42
status: working
---

## PR body
no title anywhere
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "open-pr"
  assert_severity "SKIP"
}
