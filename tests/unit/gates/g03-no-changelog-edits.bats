#!/usr/bin/env bats
# Unit tests for gate G03: manual CHANGELOG.md edits in an auto-changelog repo
#
# G03 triggers when EITHER the dossier declares `auto_changelog: true` OR the
# clone has a release-time version script (scripts/sync-version*, release*,
# changelog-check*). When triggered, it WARNs if the diff touches any
# CHANGELOG.md. Verdicts:
#   SKIP — no dossier; no clone; or auto_changelog!=true AND no version script
#   PASS — gate active but diff has no CHANGELOG.md edits
#   WARN — diff edits CHANGELOG.md (two reason variants: auto vs. script-detected)
#
# Needs a real clone at $HOME/000-projects/contributing-clanker/<repo-name>.

load '../test_helper'

setup() {
  REPO_NAME="g03-test-$$"
  TARGET_DIR="$HOME/000-projects/contributing-clanker/$REPO_NAME"
  mkdir -p "$TARGET_DIR" && cd "$TARGET_DIR" || exit 1
  /usr/bin/git init -q --initial-branch=main
  /usr/bin/git config user.email "test@example.com"
  /usr/bin/git config user.name  "test"
  echo 'baseline' > README.md
  printf '# Changelog\n\n## 1.0.0\n- initial\n' > CHANGELOG.md
  /usr/bin/git add . && /usr/bin/git commit -qm 'init'
  /usr/bin/git checkout -qb feat/test

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
  GATE="$GATES_DIR/g03-no-changelog-edits.sh"
}

teardown() {
  rm -f "$CANDIDATE" "${TMP_DOSSIER:-}"
  rm -rf "$TARGET_DIR"
}

# Build a dossier with a given auto_changelog value.
mk_dossier() {
  local auto="$1"
  TMP_DOSSIER=$(mktemp)
  cat > "$TMP_DOSSIER" <<EOF
---
repo: example-org/$REPO_NAME
default_branch: main
auto_changelog: $auto
---
body
EOF
  echo "$TMP_DOSSIER"
}

@test "WARN when auto_changelog:true and diff edits CHANGELOG.md" {
  cd "$TARGET_DIR" || exit 1
  printf '# Changelog\n\n## Unreleased\n- my change\n\n## 1.0.0\n- initial\n' > CHANGELOG.md
  /usr/bin/git add . && /usr/bin/git commit -qm 'docs: add changelog entry'
  DOSSIER=$(mk_dossier true)
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "WARN"
  echo "$output" | jq -e '.reason | test("auto-generates changelog")' >/dev/null
}

@test "WARN when auto_changelog:false but a release-time version script exists" {
  cd "$TARGET_DIR" || exit 1
  mkdir -p scripts
  echo '#!/usr/bin/env node' > scripts/sync-version.js
  printf '# Changelog\n\n## Unreleased\n- my change\n\n## 1.0.0\n- initial\n' > CHANGELOG.md
  /usr/bin/git add . && /usr/bin/git commit -qm 'docs: changelog + version script'
  DOSSIER=$(mk_dossier false)
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "WARN"
  echo "$output" | jq -e '.reason | test("release-time CHANGELOG script")' >/dev/null
}

@test "PASS when gate active (auto_changelog:true) but diff leaves CHANGELOG.md alone" {
  cd "$TARGET_DIR" || exit 1
  echo 'export const x = 1' > index.ts
  /usr/bin/git add . && /usr/bin/git commit -qm 'feat: add module'
  DOSSIER=$(mk_dossier true)
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "PASS"
}

@test "SKIP when auto_changelog:false and no release-time version script" {
  cd "$TARGET_DIR" || exit 1
  printf '# Changelog\n\n## Unreleased\n- my change\n' > CHANGELOG.md
  /usr/bin/git add . && /usr/bin/git commit -qm 'docs: edit changelog'
  DOSSIER=$(mk_dossier false)
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "SKIP"
}

@test "SKIP when no dossier is provided" {
  cd "$TARGET_DIR" || exit 1
  printf '# Changelog\n\n## Unreleased\n- my change\n' > CHANGELOG.md
  /usr/bin/git add . && /usr/bin/git commit -qm 'docs: edit changelog'
  run_gate "$GATE" "$CANDIDATE" "" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "SKIP"
}

@test "SKIP when no local clone exists for the repo" {
  DOSSIER=$(mk_dossier true)
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/does-not-exist-$$"
  assert_severity "SKIP"
}
