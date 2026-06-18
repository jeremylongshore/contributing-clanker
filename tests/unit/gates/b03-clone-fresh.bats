#!/usr/bin/env bats
# Unit tests for gate B03: local clone is stale vs origin/<default_branch>.
#
# Mirrors the b01 clone-harness pattern: a bare "origin" + a local clone at the
# gate's expected path ($HOME/000-projects/contributing-clanker/<repo>). The gate
# runs `git fetch origin <branch>` then `git rev-list --count HEAD..origin/<branch>`
# and WARNs only when the clone is >100 commits behind.

load '../test_helper'

setup() {
  REPO_NAME="b03-test-$$"
  TARGET_DIR="$HOME/000-projects/contributing-clanker/$REPO_NAME"
  TMP_ROOT="$(mktemp -d)"
  ORIGIN_DIR="$TMP_ROOT/$REPO_NAME-origin.git"

  /usr/bin/git init -q --bare --initial-branch=main "$ORIGIN_DIR"
  SEED_DIR="$TMP_ROOT/seed"
  /usr/bin/mkdir -p "$SEED_DIR"
  /usr/bin/git -C "$SEED_DIR" init -q --initial-branch=main
  /usr/bin/git -C "$SEED_DIR" config user.email "test@example.com"
  /usr/bin/git -C "$SEED_DIR" config user.name  "test"
  echo 'baseline' > "$SEED_DIR/README.md"
  /usr/bin/git -C "$SEED_DIR" add . && /usr/bin/git -C "$SEED_DIR" commit -qm 'init'
  /usr/bin/git -C "$SEED_DIR" remote add origin "$ORIGIN_DIR"
  /usr/bin/git -C "$SEED_DIR" push -q origin main

  # Local clone at the path the gate expects (currently 0 behind).
  /usr/bin/git clone -q "$ORIGIN_DIR" "$TARGET_DIR"
  /usr/bin/git -C "$TARGET_DIR" config user.email "test@example.com"
  /usr/bin/git -C "$TARGET_DIR" config user.name  "test"

  TMP_DOSSIER=$(mktemp)
  cat > "$TMP_DOSSIER" <<'EOF'
---
repo: example-org/example-repo
default_branch: main
---
body
EOF
  DOSSIER="$TMP_DOSSIER"

  TMP_CAND=$(mktemp)
  cat > "$TMP_CAND" <<EOF
---
repo: example-org/$REPO_NAME
issue_number: 1
status: working
---
body
EOF
  CANDIDATE="$TMP_CAND"
  GATE="$GATES_DIR/b03-clone-fresh.sh"
}

teardown() {
  rm -f "$DOSSIER" "$CANDIDATE" 2>/dev/null || true
  rm -rf "$TARGET_DIR" 2>/dev/null || true
  rm -rf "$TMP_ROOT" 2>/dev/null || true
}

@test "PASS when clone is current with origin" {
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "claimed→working" "example-org/$REPO_NAME"
  assert_severity "PASS"
}

@test "WARN when clone is more than 100 commits behind origin" {
  # Push 101 new commits to origin (via the seed) so the target clone, after
  # the gate's own fetch, is 101 behind origin/main.
  for i in $(seq 1 101); do
    echo "line $i" >> "$SEED_DIR/README.md"
    /usr/bin/git -C "$SEED_DIR" add . && /usr/bin/git -C "$SEED_DIR" commit -qm "commit $i"
  done
  # Retry the 101-commit pack push: local-bare pushes occasionally hit a
  # transient "eof before pack header / unpacker error" under CI runner I/O load.
  pushed=0
  for attempt in 1 2 3; do
    if /usr/bin/git -C "$SEED_DIR" push -q origin main; then pushed=1; break; fi
    sleep 1
  done
  [ "$pushed" -eq 1 ] || { echo "push to bare origin failed after 3 attempts"; return 1; }
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "claimed→working" "example-org/$REPO_NAME"
  assert_severity "WARN"
}

@test "SKIP when no dossier supplied" {
  run_gate "$GATE" "$CANDIDATE" "" "claimed→working" "example-org/$REPO_NAME"
  assert_severity "SKIP"
}

@test "SKIP when dossier has no default_branch" {
  TMP_NODB=$(mktemp)
  printf -- '---\nrepo: example-org/example-repo\n---\nbody\n' > "$TMP_NODB"
  run_gate "$GATE" "$CANDIDATE" "$TMP_NODB" "claimed→working" "example-org/$REPO_NAME"
  assert_severity "SKIP"
  rm -f "$TMP_NODB"
}

@test "SKIP when no local clone exists" {
  rm -rf "$TARGET_DIR"
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "claimed→working" "example-org/$REPO_NAME"
  assert_severity "SKIP"
}
