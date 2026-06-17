#!/usr/bin/env bats
# Unit tests for gate B13: trust-ladder size cap (local diff vs the user's
# prior-merges rung).
#
# The gate reads `merged_prs_by_user` from the dossier to pick a rung, then
# measures the diff size (origin/<default_branch>..HEAD) in the local clone at
# $HOME/000-projects/contributing-clanker/<repo>:
#   rung 0  (0 merges)   : <= 200 LOC, <= 10 files, no new top-level dirs
#   rung 1-3 (1-3 merges): <= 500 LOC, <= 20 files, no new top-level dirs
#   rung 4+              : PASS unconditionally
#
# We build a bare "origin" so origin/main resolves as a real base ref, then
# branch and shape the diff per test.

load '../test_helper'

setup() {
  REPO_NAME="b13-test-$$"
  TARGET_DIR="$HOME/000-projects/contributing-clanker/$REPO_NAME"
  ORIGIN_DIR="$(mktemp -d)/$REPO_NAME-origin.git"

  /usr/bin/git init -q --bare --initial-branch=main "$ORIGIN_DIR"
  SEED_DIR="$(mktemp -d)"
  /usr/bin/git -C "$SEED_DIR" init -q --initial-branch=main
  /usr/bin/git -C "$SEED_DIR" config user.email "test@example.com"
  /usr/bin/git -C "$SEED_DIR" config user.name  "test"
  echo 'baseline' > "$SEED_DIR/README.md"
  /usr/bin/git -C "$SEED_DIR" add . && /usr/bin/git -C "$SEED_DIR" commit -qm 'init'
  /usr/bin/git -C "$SEED_DIR" remote add origin "$ORIGIN_DIR"
  /usr/bin/git -C "$SEED_DIR" push -q origin main

  /usr/bin/git clone -q "$ORIGIN_DIR" "$TARGET_DIR"
  /usr/bin/git -C "$TARGET_DIR" config user.email "test@example.com"
  /usr/bin/git -C "$TARGET_DIR" config user.name  "test"

  rm -rf "$SEED_DIR"

  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<EOF
---
repo: example-org/$REPO_NAME
issue_number: 1
status: working
---
body
EOF
  GATE="$GATES_DIR/b13-trust-ladder-size.sh"
}

teardown() {
  rm -f "$CANDIDATE" "${DOSSIER:-}"
  rm -rf "$TARGET_DIR"
  rm -rf "$(dirname "$ORIGIN_DIR")"
}

# Helper: write a dossier with a given merged_prs_by_user value (+ optional
# trailing frontmatter lines passed as $2).
_dossier() {
  DOSSIER=$(mktemp)
  cat > "$DOSSIER" <<EOF
---
repo: example-org/example-repo
default_branch: main
merged_prs_by_user: $1
${2:-}
---
body
EOF
}

@test "PASS at rung 0 when diff is well under the LOC/file caps" {
  _dossier 0
  cd "$TARGET_DIR" || exit 1
  /usr/bin/git checkout -qb feat/test
  printf 'a\nb\nc\n' > small.txt
  /usr/bin/git add . && /usr/bin/git commit -qm 'small change'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "PASS"
}

@test "BLOCK at rung 0 when diff exceeds the 200-LOC cap" {
  _dossier 0
  cd "$TARGET_DIR" || exit 1
  /usr/bin/git checkout -qb feat/test
  /usr/bin/seq 1 250 > big.txt
  /usr/bin/git add . && /usr/bin/git commit -qm 'big change'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "BLOCK"
}

@test "BLOCK at rung 0 when the diff introduces a new top-level directory" {
  _dossier 0
  cd "$TARGET_DIR" || exit 1
  /usr/bin/git checkout -qb feat/test
  mkdir -p vendor
  printf 'one\ntwo\n' > vendor/lib.txt
  /usr/bin/git add . && /usr/bin/git commit -qm 'add vendor dir'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "BLOCK"
}

@test "PASS at rung 1-3 for a diff that would BLOCK at rung 0" {
  _dossier 2
  cd "$TARGET_DIR" || exit 1
  /usr/bin/git checkout -qb feat/test
  /usr/bin/seq 1 250 > mid.txt
  /usr/bin/git add . && /usr/bin/git commit -qm 'mid change'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "PASS"
}

@test "PASS unconditionally at rung 4+ even with a huge diff" {
  _dossier 7
  cd "$TARGET_DIR" || exit 1
  /usr/bin/git checkout -qb feat/test
  /usr/bin/seq 1 5000 > huge.txt
  /usr/bin/git add . && /usr/bin/git commit -qm 'huge change'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "PASS"
}

@test "SKIP when trust_ladder_disabled: true in dossier" {
  _dossier 0 "trust_ladder_disabled: true"
  cd "$TARGET_DIR" || exit 1
  /usr/bin/git checkout -qb feat/test
  /usr/bin/seq 1 250 > big.txt
  /usr/bin/git add . && /usr/bin/git commit -qm 'big but disabled'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "SKIP"
}

@test "SKIP when dossier has no merged_prs_by_user field" {
  DOSSIER=$(mktemp)
  cat > "$DOSSIER" <<'EOF'
---
repo: example-org/example-repo
default_branch: main
---
body
EOF
  cd "$TARGET_DIR" || exit 1
  /usr/bin/git checkout -qb feat/test
  echo 'x' > f.txt
  /usr/bin/git add . && /usr/bin/git commit -qm 'work'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "SKIP"
}

@test "SKIP when no local clone exists (rung 0, cannot measure)" {
  _dossier 0
  rm -rf "$TARGET_DIR"
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "SKIP"
}
