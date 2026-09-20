#!/usr/bin/env bats

load '../test_helper'
bats_require_minimum_version 1.5.0

setup() {
  TREE=$(mktemp -d)
  /usr/bin/git -C "$TREE" init -q .
  /usr/bin/git -C "$TREE" -c user.email=test@example.com -c user.name=test \
    commit -q --allow-empty -m init
  printf '%s\n' '{"name":"t","version":"1.0.0","entryPoints":{"bar":"Bar.qml"}}' \
    > "$TREE/manifest.json"
}

teardown() { rm -rf "$TREE"; }

run_gate() {
  local input_json
  input_json=$(jq -nc --arg t "$TREE" \
    '{candidate:$t,dossier:"",action:"pr_open",env:{repo:"o/r",branch:"main"}}')
  run --separate-stderr bash -c 'printf "%s" "$1" | "$2"' _ "$input_json" \
    "$GATES_DIR/c44-omarchy-installable-tree.sh"
}

sev() { printf '%s' "$output" | jq -r '.severity'; }

@test "c44 passes a clean installable plugin tree" {
  run_gate
  [ "$status" -eq 0 ]
  [ "$(sev)" = "PASS" ]
}

@test "c44 blocks an untracked root AGENTS.md" {
  printf '%s\n' '# Local agent notes' > "$TREE/AGENTS.md"
  run_gate
  [ "$(sev)" = "BLOCK" ]
  [[ "$output" == *"AGENTS.md"* ]]
}

@test "c44 blocks a nested CLAUDE.md" {
  mkdir -p "$TREE/internal/agent"
  printf '%s\n' '# Local agent notes' > "$TREE/internal/agent/CLAUDE.md"
  run_gate
  [ "$(sev)" = "BLOCK" ]
  [[ "$output" == *"internal/agent/CLAUDE.md"* ]]
}


@test "c44 blocks a HANDOFF.md session artifact" {
  printf '%s\n' '# Where the last session stopped' > "$TREE/HANDOFF.md"
  run_gate
  [ "$(sev)" = "BLOCK" ]
  [[ "$output" == *"HANDOFF.md"* ]]
}

@test "c44 blocks committed .claude settings and hooks" {
  # omacom/omarchy-plugin-marketplace#7476: blocked for .claude settings, hooks
  # and skills. No specially named Markdown file is involved.
  mkdir -p "$TREE/.claude/skills/deploy"
  printf '%s\n' '{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"sh x.sh"}]}]}}' \
    > "$TREE/.claude/settings.json"
  printf '%s\n' '# deploy' > "$TREE/.claude/skills/deploy/SKILL.md"
  run_gate
  [ "$(sev)" = "BLOCK" ]
  [[ "$output" == *".claude/settings.json"* ]]
}

@test "c44 blocks other auto-loaded agent surfaces" {
  mkdir -p "$TREE/.cursor/rules" "$TREE/.github"
  printf '%s\n' 'rule' > "$TREE/.cursor/rules/style.mdc"
  printf '%s\n' '{"mcpServers":{}}' > "$TREE/.mcp.json"
  printf '%s\n' '# copilot' > "$TREE/.github/copilot-instructions.md"
  run_gate
  [ "$(sev)" = "BLOCK" ]
  [[ "$output" == *".mcp.json"* ]]
  [[ "$output" == *".cursor/rules/style.mdc"* ]]
  [[ "$output" == *".github/copilot-instructions.md"* ]]
}

@test "c44 ignores agent state that git ignores, because it never ships" {
  printf '%s\n' '.claude/settings.local.json' > "$TREE/.gitignore"
  mkdir -p "$TREE/.claude"
  printf '%s\n' '{"permissions":{}}' > "$TREE/.claude/settings.local.json"
  run_gate
  [ "$(sev)" = "PASS" ]
}

@test "c44 does not mistake ordinary docs or lookalike names for agent payloads" {
  mkdir -p "$TREE/docs" "$TREE/claude"
  printf '%s\n' '# Contributing' > "$TREE/CONTRIBUTING.md"
  printf '%s\n' '# Agents in this plugin' > "$TREE/docs/agents-overview.md"
  printf '%s\n' 'Item {}' > "$TREE/claude/Panel.qml"
  printf '%s\n' '# notes' > "$TREE/MY-CLAUDE.md.txt"
  run_gate
  [ "$(sev)" = "PASS" ]
}
