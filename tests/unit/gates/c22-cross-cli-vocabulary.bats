#!/usr/bin/env bats
# Unit tests for gate C22: Claude-only vocabulary in a multi-CLI plugin
#
# The gate counts multi-CLI signals (AGENTS.md, .cursor/mcp.json, .codex,
# gemini-extension.json, or a README naming 2+ CLIs), then scans the changed
# SKILL.md files for Claude-only invocation phrasing (`claude mcp …`,
# `Claude Code session/user`). Verdicts:
#   - WARN when a multi-CLI repo's changed skill carries Claude-only phrasing
#   - PASS when the changed skill is CLI-agnostic
#   - SKIP when no multi-CLI signal is present
#   - SKIP when no local clone exists
# (Previously the counter used `((MULTI_CLI_SIGNALS++))`, which returns exit 1
# when read at zero and fail-closed the gate under `set -e`; fixed to
# `MULTI_CLI_SIGNALS=$((MULTI_CLI_SIGNALS + 1))`. These tests assert the real
# predicate outcomes that fix unlocks.)

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

@test "WARN when a multi-CLI repo has Claude-only phrasing in a changed skill" {
  cd "$TARGET_DIR" || exit 1
  # AGENTS.md is a multi-CLI signal; the changed skill uses `claude mcp add` +
  # `Claude Code session` — Claude-only phrasing in a cross-CLI plugin → WARN.
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
  assert_severity "WARN"
}

@test "PASS when a multi-CLI repo's changed skill is CLI-agnostic" {
  cd "$TARGET_DIR" || exit 1
  # Same multi-CLI signal, but the skill avoids Claude-only invocation phrasing —
  # the verdict the increment-from-zero bug previously made unreachable.
  echo 'This plugin supports Cursor, Codex, and Gemini CLIs.' > AGENTS.md
  mkdir -p skills/demo
  cat > skills/demo/SKILL.md <<'EOF'
---
name: demo
description: a demo skill
---

Run `/mcp auth demo-server` in your AI-CLI session.
EOF
  /usr/bin/git add . && /usr/bin/git commit -qm 'multi-cli signal + agnostic skill'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "PASS"
}

@test "WARN when README alone names 2+ CLIs on one line (grep -o match count)" {
  cd "$TARGET_DIR" || exit 1
  # No AGENTS.md; the only signal is a README naming two CLIs on a single line.
  # `grep -c` would count 1 matching line (< 2) and miss it; `grep -o | wc -l`
  # counts 2 matches (>= 2) and detects the multi-CLI signal.
  echo 'Works with Cursor and the Gemini CLI.' > README.md
  mkdir -p skills/demo
  cat > skills/demo/SKILL.md <<'EOF'
---
name: demo
description: a demo skill
---

Run `claude mcp add demo-server` in your Claude Code session.
EOF
  /usr/bin/git add . && /usr/bin/git commit -qm 'readme multi-cli signal + claude-only skill'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "WARN"
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
