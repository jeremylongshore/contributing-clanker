#!/usr/bin/env bats
# Unit tests for gate C24: engagement-frame leakage in customer-facing diff
#
# C24 reads local_clone_path + branch from the candidate frontmatter, diffs
# origin/<default_branch>..<branch>, pulls only the ADDED lines, and WARNs if any
# added line matches an engagement-internal token (finding IDs like F12, review
# phases like "R2 audit", "Intent Solutions pilot", op-rule citations, private
# 000-docs cross-refs, or a "- Jeremy Longshore" author footer). We build a temp
# clone with a real origin and add lines that either trip a token (WARN) or are
# clean (PASS).

load '../test_helper'

setup() {
  GATE="$GATES_DIR/c24-engagement-frame-leakage.sh"

  ORIGIN_DIR="$(mktemp -d)/origin.git"
  /usr/bin/git init -q --bare --initial-branch=main "$ORIGIN_DIR"
  SEED_DIR="$(mktemp -d)"
  /usr/bin/git -C "$SEED_DIR" init -q --initial-branch=main
  /usr/bin/git -C "$SEED_DIR" config user.email "test@example.com"
  /usr/bin/git -C "$SEED_DIR" config user.name  "test"
  echo 'baseline' > "$SEED_DIR/README.md"
  /usr/bin/git -C "$SEED_DIR" add . && /usr/bin/git -C "$SEED_DIR" commit -qm 'init'
  /usr/bin/git -C "$SEED_DIR" remote add origin "$ORIGIN_DIR"
  /usr/bin/git -C "$SEED_DIR" push -q origin main
  rm -rf "$SEED_DIR"

  CLONE_DIR="$(mktemp -d)/clone"
  /usr/bin/git clone -q "$ORIGIN_DIR" "$CLONE_DIR"
  /usr/bin/git -C "$CLONE_DIR" config user.email "test@example.com"
  /usr/bin/git -C "$CLONE_DIR" config user.name  "test"
  /usr/bin/git -C "$CLONE_DIR" checkout -qb feat/test

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
repo: example-org/example-repo
issue_number: 1
status: working
local_clone_path: $CLONE_DIR
branch: feat/test
---
body
EOF
}

teardown() {
  rm -f "$DOSSIER" "$CANDIDATE"
  rm -rf "${CLONE_DIR%/clone}" "$(dirname "$ORIGIN_DIR")"
}

@test "WARN when an added line cites an internal op-rule" {
  printf 'Handled per op-rule #7 from the runbook.\n' > "$CLONE_DIR/notes.md"
  /usr/bin/git -C "$CLONE_DIR" add . && /usr/bin/git -C "$CLONE_DIR" commit -qm 'notes'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted"
  assert_severity "WARN"
}

@test "WARN when an added line leaks the engagement userIntent partner tag" {
  printf 'userIntent: partner=intentsolutions delivery side.\n' > "$CLONE_DIR/doc.md"
  /usr/bin/git -C "$CLONE_DIR" add . && /usr/bin/git -C "$CLONE_DIR" commit -qm 'doc'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted"
  assert_severity "WARN"
}

@test "WARN when an added line cross-refs a private 000-docs path" {
  printf 'See 000-docs/021-AA-AACR for context.\n' > "$CLONE_DIR/ref.md"
  /usr/bin/git -C "$CLONE_DIR" add . && /usr/bin/git -C "$CLONE_DIR" commit -qm 'ref'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted"
  assert_severity "WARN"
}

@test "PASS when added lines contain no engagement-frame tokens" {
  printf 'Fix null-pointer in the date parser.\nAdd a guard clause for empty input.\n' > "$CLONE_DIR/fix.md"
  /usr/bin/git -C "$CLONE_DIR" add . && /usr/bin/git -C "$CLONE_DIR" commit -qm 'fix'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted"
  assert_severity "PASS"
}

@test "SKIP when candidate has no local_clone_path" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
issue_number: 1
status: working
branch: feat/test
---
body
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted"
  assert_severity "SKIP"
}

@test "SKIP when candidate has no branch" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<EOF
---
repo: example-org/example-repo
issue_number: 1
status: working
local_clone_path: $CLONE_DIR
---
body
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted"
  assert_severity "SKIP"
}
