#!/usr/bin/env bats
# Unit tests for gate B12: diff introduces new dependencies without prior
# issue conversation.
#
# The gate diffs the manifest files (package.json, Cargo.toml, pyproject.toml,
# requirements.txt, go.mod) between <default_branch>..HEAD in the local clone
# at $HOME/000-projects/contributing-clanker/<repo>. Added dependency lines
# trigger a WARN; no manifest change (or no added deps) is a PASS; no clone is
# a SKIP.

load '../test_helper'

setup() {
  REPO_NAME="b12-test-$$"
  TARGET_DIR="$HOME/000-projects/contributing-clanker/$REPO_NAME"

  /usr/bin/git init -q --initial-branch=main "$TARGET_DIR"
  /usr/bin/git -C "$TARGET_DIR" config user.email "test@example.com"
  /usr/bin/git -C "$TARGET_DIR" config user.name  "test"
  cat > "$TARGET_DIR/package.json" <<'EOF'
{
  "name": "demo",
  "version": "1.0.0",
  "dependencies": {
    "left-pad": "^1.0.0"
  }
}
EOF
  echo 'baseline' > "$TARGET_DIR/README.md"
  /usr/bin/git -C "$TARGET_DIR" add . && /usr/bin/git -C "$TARGET_DIR" commit -qm 'init'

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
repo: example-org/$REPO_NAME
issue_number: 1
status: working
---
body
EOF
  GATE="$GATES_DIR/b12-new-deps.sh"
}

teardown() {
  rm -f "$CANDIDATE" "$DOSSIER"
  rm -rf "$TARGET_DIR"
}

@test "WARN when the diff adds a new dependency to package.json" {
  cd "$TARGET_DIR" || exit 1
  /usr/bin/git checkout -qb feat/test
  cat > package.json <<'EOF'
{
  "name": "demo",
  "version": "1.0.0",
  "dependencies": {
    "left-pad": "^1.0.0",
    "lodash": "^4.17.21"
  }
}
EOF
  /usr/bin/git add . && /usr/bin/git commit -qm 'add lodash'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "WARN"
}

@test "PASS when no manifest files changed" {
  cd "$TARGET_DIR" || exit 1
  /usr/bin/git checkout -qb feat/test
  echo 'extra' >> README.md
  /usr/bin/git add . && /usr/bin/git commit -qm 'docs only'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "PASS"
}

@test "PASS when manifest change only bumps the package's own version field" {
  cd "$TARGET_DIR" || exit 1
  /usr/bin/git checkout -qb feat/test
  # The only added line is the "version" field, which the gate explicitly
  # excludes from the new-dependency heuristic.
  cat > package.json <<'EOF'
{
  "name": "demo",
  "version": "1.1.0",
  "dependencies": {
    "left-pad": "^1.0.0"
  }
}
EOF
  /usr/bin/git add . && /usr/bin/git commit -qm 'bump version'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "PASS"
}

@test "SKIP when no local clone exists" {
  rm -rf "$TARGET_DIR"
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "SKIP"
}
