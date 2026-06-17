#!/usr/bin/env bats
# Unit tests for gate G02: diff touches protected infrastructure / CI paths
#
# G02 diffs $DEFAULT_BRANCH..HEAD --name-only and greps for maintainer-gated
# paths (.github/workflows/, infrastructure/, terraform/, helm/, k8s/,
# kubernetes/, .circleci/, charts/). Verdicts:
#   SKIP — no local clone
#   PASS — diff touches none of the protected paths
#   WARN — diff touches one or more protected paths (advise Design Issue first)
#
# Needs a real clone at $HOME/000-projects/contributing-clanker/<repo-name>.
# Default branch falls back to "main" when the dossier omits it.

load '../test_helper'

setup() {
  REPO_NAME="g02-test-$$"
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
  GATE="$GATES_DIR/g02-protected-paths.sh"
}

teardown() {
  rm -f "$CANDIDATE"
  rm -rf "$TARGET_DIR"
}

@test "WARN when diff edits a GitHub Actions workflow" {
  cd "$TARGET_DIR" || exit 1
  mkdir -p .github/workflows
  echo 'name: ci' > .github/workflows/ci.yml
  /usr/bin/git add . && /usr/bin/git commit -qm 'ci: tweak workflow'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "WARN"
  echo "$output" | jq -e '.reason | test(".github/workflows/ci.yml")' >/dev/null
}

@test "WARN when diff edits a terraform/ path" {
  cd "$TARGET_DIR" || exit 1
  mkdir -p terraform
  echo 'resource "null_resource" "x" {}' > terraform/main.tf
  /usr/bin/git add . && /usr/bin/git commit -qm 'infra: add tf'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "WARN"
}

@test "PASS when diff only touches application source" {
  cd "$TARGET_DIR" || exit 1
  mkdir -p src
  echo 'export const x = 1' > src/index.ts
  /usr/bin/git add . && /usr/bin/git commit -qm 'feat: add module'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "PASS"
}

@test "PASS when a path merely contains 'github' but is not .github/workflows/" {
  cd "$TARGET_DIR" || exit 1
  # A source dir named 'github' (an API client, say) must not trip the gate —
  # the pattern anchors on '.github/workflows/', not bare 'github'.
  mkdir -p src/github
  echo 'export const client = {}' > src/github/client.ts
  /usr/bin/git add . && /usr/bin/git commit -qm 'feat: add github client'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "PASS"
}

@test "SKIP when no local clone exists for the repo" {
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/does-not-exist-$$"
  assert_severity "SKIP"
}
