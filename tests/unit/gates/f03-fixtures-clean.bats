#!/usr/bin/env bats
# Unit tests for gate F03: newly-added fixture / sample files (provenance check)
#
# F03 diffs $DEFAULT_BRANCH..HEAD with --diff-filter=A (added files only) and
# greps the added paths for fixture/sample directory markers (tests/fixtures/,
# fixtures/, testdata/, samples/, …). It is informational-only. Verdicts:
#   SKIP   — no local clone
#   PASS   — no new fixture/sample files among added paths
#   INFORM — one or more new fixture/sample files added (verify provenance)
#
# Needs a real clone at $HOME/000-projects/contributing-clanker/<repo-name>.
# Default branch falls back to "main" when the dossier omits it.

load '../test_helper'

setup() {
  REPO_NAME="f03-test-$$"
  TARGET_DIR="$HOME/000-projects/contributing-clanker/$REPO_NAME"
  mkdir -p "$TARGET_DIR" && cd "$TARGET_DIR" || exit 1
  /usr/bin/git init -q --initial-branch=main
  /usr/bin/git config user.email "test@example.com"
  /usr/bin/git config user.name  "test"
  echo 'baseline' > README.md
  /usr/bin/git add . && /usr/bin/git commit -qm 'init'
  /usr/bin/git checkout -qb feat/test

  DOSSIER="$FIXTURES_DIR/dossiers/example-org__example-repo.md"

  TMPCAND=$(mktemp)
  cat > "$TMPCAND" <<EOF
---
repo: example-org/$REPO_NAME
issue_number: 1
status: working
---
body
EOF
  CANDIDATE="$TMPCAND"
  GATE="$GATES_DIR/f03-fixtures-clean.sh"
}

teardown() {
  rm -f "$CANDIDATE"
  rm -rf "$TARGET_DIR"
}

@test "INFORM when a new file under tests/fixtures/ is added" {
  cd "$TARGET_DIR" || exit 1
  mkdir -p tests/fixtures
  echo 'sample payload' > tests/fixtures/response.json
  /usr/bin/git add . && /usr/bin/git commit -qm 'test: add response fixture'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "INFORM"
  echo "$output" | jq -e '.reason | test("tests/fixtures/response.json")' >/dev/null
}

@test "INFORM when a new file under testdata/ is added" {
  cd "$TARGET_DIR" || exit 1
  mkdir -p pkg/testdata
  echo 'golden' > pkg/testdata/golden.txt
  /usr/bin/git add . && /usr/bin/git commit -qm 'test: add golden file'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "INFORM"
}

@test "PASS when added files are not in any fixture/sample dir" {
  cd "$TARGET_DIR" || exit 1
  mkdir -p src
  echo 'export const x = 1' > src/index.ts
  /usr/bin/git add . && /usr/bin/git commit -qm 'feat: add module'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "PASS"
}

@test "PASS when an EXISTING fixture is modified but no fixture is ADDED" {
  cd "$TARGET_DIR" || exit 1
  # Seed a fixture on main first, then modify it on the branch. --diff-filter=A
  # only catches additions, so a modification must not trip the gate.
  /usr/bin/git checkout -q main
  mkdir -p tests/fixtures
  echo 'v1' > tests/fixtures/existing.json
  /usr/bin/git add . && /usr/bin/git commit -qm 'seed fixture on main'
  /usr/bin/git checkout -q feat/test
  /usr/bin/git merge -q main
  echo 'v2' > tests/fixtures/existing.json
  /usr/bin/git add . && /usr/bin/git commit -qm 'test: tweak existing fixture'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "PASS"
}

@test "SKIP when no local clone exists for the repo" {
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/does-not-exist-$$"
  assert_severity "SKIP"
}
