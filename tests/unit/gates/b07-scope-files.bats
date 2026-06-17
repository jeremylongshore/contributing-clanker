#!/usr/bin/env bats
# Unit tests for gate B07: local diff touches files outside the candidate's
# declared scope.
#
# Clone harness (b01 pattern): a bare origin + a local clone at the gate's
# expected path. The gate reads the candidate's "## Scope" / "## Files to touch"
# section, diffs origin/<default_branch>..HEAD, and WARNs if any changed file is
# not listed (exact path match). The scope list uses repo-relative paths.

load '../test_helper'

setup() {
  REPO_NAME="b07-test-$$"
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
  echo 'other'    > "$SEED_DIR/extra.txt"
  /usr/bin/git -C "$SEED_DIR" add . && /usr/bin/git -C "$SEED_DIR" commit -qm 'init'
  /usr/bin/git -C "$SEED_DIR" remote add origin "$ORIGIN_DIR"
  /usr/bin/git -C "$SEED_DIR" push -q origin main

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

  GATE="$GATES_DIR/b07-scope-files.sh"
}

teardown() {
  rm -f "$DOSSIER" "$CANDIDATE" 2>/dev/null || true
  rm -rf "$TARGET_DIR" 2>/dev/null || true
  rm -rf "$TMP_ROOT" 2>/dev/null || true
}

# Candidate whose "## Scope" section lists the given files (one per line).
mk_candidate_scope() {
  CANDIDATE=$(mktemp)
  {
    printf -- '---\nrepo: example-org/%s\nissue_number: 1\nstatus: working\n---\n\n' "$REPO_NAME"
    printf '## Scope\n\n'
    for f in "$@"; do printf -- '- `%s`\n' "$f"; done
  } > "$CANDIDATE"
}

@test "PASS when every changed file is within declared scope" {
  mk_candidate_scope "README.md"
  cd "$TARGET_DIR" || exit 1
  /usr/bin/git checkout -qb feat/test
  echo 'work' >> README.md
  /usr/bin/git add . && /usr/bin/git commit -qm 'edit readme only'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "PASS"
}

@test "WARN when the diff touches a file outside declared scope" {
  mk_candidate_scope "README.md"
  cd "$TARGET_DIR" || exit 1
  /usr/bin/git checkout -qb feat/test
  echo 'work' >> README.md
  echo 'sneaky' >> extra.txt
  /usr/bin/git add . && /usr/bin/git commit -qm 'edit readme + extra'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "WARN"
}

@test "PASS when there are no changed files (HEAD == origin/main)" {
  mk_candidate_scope "README.md"
  cd "$TARGET_DIR" || exit 1
  # No new commits — HEAD is exactly origin/main.
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "PASS"
}

@test "SKIP when candidate has no Scope / Files-to-touch section" {
  CANDIDATE=$(mktemp)
  printf -- '---\nrepo: example-org/%s\nissue_number: 1\n---\n\nno scope section here\n' "$REPO_NAME" > "$CANDIDATE"
  cd "$TARGET_DIR" || exit 1
  /usr/bin/git checkout -qb feat/test
  echo 'work' >> README.md
  /usr/bin/git add . && /usr/bin/git commit -qm 'edit'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "SKIP"
}

@test "SKIP when scope section is present but empty" {
  CANDIDATE=$(mktemp)
  {
    printf -- '---\nrepo: example-org/%s\nissue_number: 1\n---\n\n' "$REPO_NAME"
    printf '## Scope\n\n'
    printf '## Files to touch\n'
  } > "$CANDIDATE"
  cd "$TARGET_DIR" || exit 1
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "SKIP"
}

@test "SKIP when no local clone exists" {
  mk_candidate_scope "README.md"
  rm -rf "$TARGET_DIR"
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "SKIP"
}
