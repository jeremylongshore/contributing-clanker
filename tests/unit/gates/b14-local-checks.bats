#!/usr/bin/env bats
# Unit tests for gate B14: no recent green local check-run for current branch.
#
# The gate reads `local_check_command` from the dossier and `branch` from the
# candidate frontmatter, then looks for an evidence JSON at
# ~/.contribute-system/check-runs/<owner>__<repo>__<branch>.json. PASS requires
# .passed == true and a fresh-enough .ts; missing evidence or .passed != true
# is a BLOCK; a stale/unparseable timestamp downgrades to WARN.
#
# We write the evidence file to the real check-runs dir under a unique
# per-process branch name and remove it in teardown so we never clobber real
# evidence.

load '../test_helper'

setup() {
  GATE="$GATES_DIR/b14-local-checks.sh"
  REPO="example-org/example-repo"
  REPO_SLUG="example-org__example-repo"
  BRANCH="b14-test-$$"

  EVIDENCE_DIR="$HOME/.contribute-system/check-runs"
  mkdir -p "$EVIDENCE_DIR"
  EVIDENCE="$EVIDENCE_DIR/${REPO_SLUG}__${BRANCH}.json"

  # Dossier with a real local_check_command (the shared fixture has
  # "(not detected)" which would SKIP).
  DOSSIER=$(mktemp)
  cat > "$DOSSIER" <<'EOF'
---
repo: example-org/example-repo
default_branch: main
local_check_command: "pnpm test"
---
body
EOF

  # Candidate carrying the branch frontmatter the gate keys on.
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<EOF
---
repo: example-org/example-repo
issue_number: 42
status: working
branch: $BRANCH
---
body
EOF
}

teardown() {
  rm -f "$DOSSIER" "$CANDIDATE" "${EVIDENCE:-}"
}

@test "PASS when fresh green evidence exists for the branch" {
  printf '{"passed":true,"ts":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$EVIDENCE"
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "$REPO"
  assert_severity "PASS"
}

@test "BLOCK when no evidence file exists for the branch" {
  # Ensure no evidence present.
  rm -f "$EVIDENCE"
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "$REPO"
  assert_severity "BLOCK"
}

@test "BLOCK when evidence shows the check did not pass" {
  printf '{"passed":false,"ts":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$EVIDENCE"
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "$REPO"
  assert_severity "BLOCK"
}

@test "WARN when green evidence is older than 1h" {
  printf '{"passed":true,"ts":"%s"}\n' "$(date -u -d '2 hours ago' +%Y-%m-%dT%H:%M:%SZ)" > "$EVIDENCE"
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "$REPO"
  assert_severity "WARN"
}

@test "SKIP when no dossier supplied" {
  run_gate "$GATE" "$CANDIDATE" "" "working→submitted" "$REPO"
  assert_severity "SKIP"
}

@test "SKIP when dossier local_check_command is (not detected)" {
  TMP_ND=$(mktemp)
  cat > "$TMP_ND" <<'EOF'
---
repo: example-org/example-repo
default_branch: main
local_check_command: "(not detected)"
---
body
EOF
  run_gate "$GATE" "$CANDIDATE" "$TMP_ND" "working→submitted" "$REPO"
  assert_severity "SKIP"
  rm -f "$TMP_ND"
}

@test "SKIP when candidate has no branch frontmatter" {
  TMP_NOBR=$(mktemp)
  cat > "$TMP_NOBR" <<'EOF'
---
repo: example-org/example-repo
issue_number: 42
status: working
---
body
EOF
  run_gate "$GATE" "$TMP_NOBR" "$DOSSIER" "working→submitted" "$REPO"
  assert_severity "SKIP"
  rm -f "$TMP_NOBR"
}
