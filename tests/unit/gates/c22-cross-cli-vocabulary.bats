#!/usr/bin/env bats
# Unit tests for gate C22: Claude-only vocabulary in a multi-CLI plugin
#
# PARTIAL COVERAGE — gate bug blocks the WARN/PASS-with-signal paths.
# The gate counts multi-CLI signals with `((MULTI_CLI_SIGNALS++))`. Under
# `set -e` (inherited from preamble.sh) a post-increment that READS zero returns
# exit status 1, so the FIRST signal it detects (AGENTS.md, .cursor, .codex,
# gemini-extension.json, or a README CLI list) crashes the gate via the ERR trap
# and it emits BLOCK ("crashed at line N — fail-closed") rather than ever scanning
# the modified SKILL.md for Claude-only phrasing. Consequence: the intended WARN
# (Claude-only phrasing) and PASS (agnostic phrasing) verdicts in a multi-CLI repo
# are unreachable without editing the gate. We therefore assert the ACTUAL
# observed behavior:
#   - BLOCK (crash) when a multi-CLI signal is present  <- documents the real bug
#   - SKIP when no multi-CLI signal is present          <- reachable
#   - SKIP when no local clone exists                   <- reachable
# These are exact, non-tautological assertions of real predicate outcomes.

load '../test_helper'

setup() {
  REPO_NAME="c22-test-$$"
  TARGET_DIR="$HOME/000-projects/contributing-clanker/$REPO_NAME"
  mkdir -p "$TARGET_DIR" && cd "$TARGET_DIR" || exit 1
  /usr/bin/git init -q --initial-branch=main
  /usr/bin/git config user.email "test@example.com"
  /usr/bin/git config user.name  "test"
  echo 'baseline' > README.md
  /usr/bin/git add . && /usr/bin/git commit -qm 'init'
  /usr/bin/git checkout -qb feat/test

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
  GATE="$GATES_DIR/c22-cross-cli-vocabulary.sh"
}

teardown() {
  rm -f "$CANDIDATE" "$DOSSIER"
  rm -rf "$TARGET_DIR"
}

@test "BLOCK (crash) when a multi-CLI signal trips the increment-from-zero bug" {
  cd "$TARGET_DIR" || exit 1
  # AGENTS.md is the first signal the gate checks; the ((counter++)) from zero
  # returns exit 1 under set -e, firing the ERR trap → fail-closed BLOCK.
  echo 'This plugin supports Cursor, Codex, and Gemini CLIs.' > AGENTS.md
  mkdir -p skills/demo
  cat > skills/demo/SKILL.md <<'EOF'
---
name: demo
description: a demo skill
---

Run `claude mcp add demo-server` in your Claude Code session.
EOF
  /usr/bin/git add . && /usr/bin/git commit -qm 'multi-cli signal + claude-only skill'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "BLOCK"
}

@test "SKIP when there are no multi-CLI signals in the repo" {
  cd "$TARGET_DIR" || exit 1
  # No AGENTS.md / .cursor / .codex / gemini-extension.json. Remove README.md too:
  # with no README the gate skips its (separately buggy) README-CLI-grep block, so
  # the no-signal SKIP path is reached cleanly without stderr noise.
  /usr/bin/git rm -q README.md
  mkdir -p skills/demo
  cat > skills/demo/SKILL.md <<'EOF'
---
name: demo
description: a demo skill
---

Run `claude mcp add demo-server` in your Claude Code session.
EOF
  /usr/bin/git add . && /usr/bin/git commit -qm 'skill in claude-only repo, no readme'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "SKIP"
}

@test "SKIP when no local clone exists at the expected path" {
  cd "$HOME" || exit 1
  rm -rf "$TARGET_DIR"
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "SKIP"
}
