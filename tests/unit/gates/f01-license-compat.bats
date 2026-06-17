#!/usr/bin/env bats
# Unit tests for gate F01: license compatibility for newly added dependencies
#
# F01 diffs $DEFAULT_BRANCH..HEAD in the local clone, finds changed dependency
# manifests (package.json, Cargo.toml, requirements.txt, …), extracts package
# names from `+` lines, and emits INFORM listing them for manual license review.
# It is informational-only — never BLOCK/WARN. Verdicts:
#   SKIP   — no local clone, or no default_branch in dossier
#   PASS   — no manifest changed, or manifests changed but no new dep entries
#   INFORM — new dependency entries detected
#
# Like G01/G04 it needs a real git clone at the path the gate computes:
#   $HOME/000-projects/contributing-clanker/<repo-name>

load '../test_helper'

setup() {
  REPO_NAME="f01-test-$$"
  TARGET_DIR="$HOME/000-projects/contributing-clanker/$REPO_NAME"
  mkdir -p "$TARGET_DIR" && cd "$TARGET_DIR" || exit 1
  /usr/bin/git init -q --initial-branch=main
  /usr/bin/git config user.email "test@example.com"
  /usr/bin/git config user.name  "test"

  # Baseline package.json on main with one dependency.
  cat > package.json <<'EOF'
{
  "name": "fixture",
  "version": "1.0.0",
  "dependencies": {
    "left-pad": "1.0.0"
  }
}
EOF
  /usr/bin/git add . && /usr/bin/git commit -qm 'init'
  /usr/bin/git checkout -qb feat/test

  # Dossier with default_branch + a license to echo back.
  TMP_DOSSIER=$(mktemp)
  cat > "$TMP_DOSSIER" <<'EOF'
---
repo: example-org/example-repo
default_branch: main
license: MIT
---
body
EOF
  DOSSIER="$TMP_DOSSIER"

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
  GATE="$GATES_DIR/f01-license-compat.sh"
}

teardown() {
  rm -f "$CANDIDATE" "$DOSSIER"
  rm -rf "$TARGET_DIR"
}

@test "INFORM when diff adds a new package.json dependency" {
  cd "$TARGET_DIR" || exit 1
  cat > package.json <<'EOF'
{
  "name": "fixture",
  "version": "1.0.0",
  "dependencies": {
    "left-pad": "1.0.0",
    "lodash": "4.17.21"
  }
}
EOF
  /usr/bin/git add . && /usr/bin/git commit -qm 'add lodash'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "INFORM"
  # The newly added dep name must surface in the reason.
  echo "$output" | jq -e '.reason | test("lodash")' >/dev/null
}

@test "PASS when no dependency manifest changed (only source)" {
  cd "$TARGET_DIR" || exit 1
  echo 'console.log(1)' > index.js
  /usr/bin/git add . && /usr/bin/git commit -qm 'feat: add index'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "PASS"
}

@test "PASS when manifest changed but no new dependency entry added (dep removed)" {
  cd "$TARGET_DIR" || exit 1
  # Removing the only dependency touches package.json (manifest changed) but
  # produces only a `-` line — the extractor only mines `+` lines, so it finds
  # zero new dependency entries and falls through to gate_pass.
  cat > package.json <<'EOF'
{
  "name": "fixture",
  "version": "1.0.0",
  "dependencies": {
  }
}
EOF
  /usr/bin/git add . && /usr/bin/git commit -qm 'chore: drop left-pad'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "PASS"
}

@test "SKIP when dossier has no default_branch" {
  cd "$TARGET_DIR" || exit 1
  cat > package.json <<'EOF'
{
  "name": "fixture",
  "version": "1.0.0",
  "dependencies": { "left-pad": "1.0.0", "lodash": "4.17.21" }
}
EOF
  /usr/bin/git add . && /usr/bin/git commit -qm 'add lodash'
  TMP_NODB=$(mktemp)
  cat > "$TMP_NODB" <<'EOF'
---
repo: example-org/example-repo
license: MIT
---
EOF
  run_gate "$GATE" "$CANDIDATE" "$TMP_NODB" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "SKIP"
  rm -f "$TMP_NODB"
}

@test "SKIP when no local clone exists for the repo" {
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/does-not-exist-$$"
  assert_severity "SKIP"
}
