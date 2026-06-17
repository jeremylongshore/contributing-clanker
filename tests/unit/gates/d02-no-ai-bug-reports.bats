#!/usr/bin/env bats
# Unit tests for gate D02: block AI-shaped issue body when opening a new issue
#
# D02 extracts the "## Issue body draft" section from the candidate and counts
# AI-shaped phrases (case-insensitive). 0 hits → PASS, 1 hit → WARN, 2+ → BLOCK.
# Missing/empty draft → SKIP.

load '../test_helper'

setup() {
  DOSSIER="$FIXTURES_DIR/dossiers/example-org__example-repo.md"
  GATE="$GATES_DIR/d02-no-ai-bug-reports.sh"
}

teardown() {
  rm -f "${CANDIDATE:-}"
}

@test "SKIP when candidate has no issue body draft section" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
issue_number: 42
status: open
---
# some other content but no draft section
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "post-comment"
  assert_severity "SKIP"
}

@test "SKIP when issue body draft section is present but empty" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
status: open
---
## Issue body draft

## Next section
real content here
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "post-comment"
  assert_severity "SKIP"
}

@test "PASS when draft is in a human voice with no AI-shaped phrases" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
status: open
---
## Issue body draft
The export command drops the last record when the buffer is full.
Steps to reproduce: run export with 1000 rows, the 1000th is missing.
Expected: all 1000 rows export. Actual: 999.
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "post-comment"
  assert_severity "PASS"
}

@test "WARN when draft contains exactly one AI-shaped phrase" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
status: open
---
## Issue body draft
I noticed the export command drops the last record when the buffer is full.
Steps to reproduce: run export with 1000 rows.
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "post-comment"
  assert_severity "WARN"
}

@test "BLOCK when draft contains two or more AI-shaped phrases" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
status: open
---
## Issue body draft
I noticed the export command drops records. After analyzing the buffer
flush path, the issue stems from an off-by-one in the loop bound.
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "post-comment"
  assert_severity "BLOCK"
}

@test "BLOCK is case-insensitive (uppercased AI-shaped phrases still match)" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
status: open
---
## Issue body draft
IT APPEARS the cache is stale. BASED ON MY ANALYSIS the TTL is never refreshed.
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "post-comment"
  assert_severity "BLOCK"
}
