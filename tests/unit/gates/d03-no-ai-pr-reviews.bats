#!/usr/bin/env bats
# Unit tests for gate D03: block AI-generated review comments on someone's PR
#
# D03 extracts the "## Review draft" section and counts AI-shaped phrases.
# Stricter than D02: ANY single hit BLOCKs (no WARN tier). 0 hits → PASS,
# missing/empty draft → SKIP.

load '../test_helper'

setup() {
  DOSSIER="$FIXTURES_DIR/dossiers/example-org__example-repo.md"
  GATE="$GATES_DIR/d03-no-ai-pr-reviews.sh"
}

teardown() {
  rm -f "${CANDIDATE:-}"
}

@test "SKIP when candidate has no review draft section" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
status: open
---
# no review draft here
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "post-comment"
  assert_severity "SKIP"
}

@test "SKIP when review draft section is present but empty" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
status: open
---
## Review draft

## Other section
content
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "post-comment"
  assert_severity "SKIP"
}

@test "PASS when review draft is in a human voice" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
status: open
---
## Review draft
This handles the null case but misses the empty-string case on line 42.
Suggest adding a guard before the slice.
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "post-comment"
  assert_severity "PASS"
}

@test "BLOCK when review draft contains a single AI-shaped phrase (strict)" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
status: open
---
## Review draft
I noticed the null case is handled but the empty-string case is not.
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "post-comment"
  assert_severity "BLOCK"
}

@test "BLOCK when review draft contains multiple AI-shaped phrases" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
status: open
---
## Review draft
After analyzing the diff, I've identified that the loop bound is off by one.
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "post-comment"
  assert_severity "BLOCK"
}

@test "BLOCK is case-insensitive" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
status: open
---
## Review draft
CLAUDE SUGGESTS refactoring the handler into smaller functions.
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "post-comment"
  assert_severity "BLOCK"
}
