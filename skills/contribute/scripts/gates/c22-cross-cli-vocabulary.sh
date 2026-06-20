#!/usr/bin/env bash
# Catalog: C22 — Claude-only vocabulary in a plugin that advertises multi-CLI support
# Mitigates: "CLI-Centric Skill in a Multi-CLI Plugin" anti-pattern. When a repo declares
# support for multiple AI CLIs (Cursor, Codex, Gemini, Copilot, Continue, Cline), skill
# docs assuming Claude-only invocation patterns get flagged on review
# (kobiton/automate#64 comment 5: Authentication section used `claude mcp` exclusively
# in a plugin documented as supporting 4+ CLIs in the README).
source "$(dirname "$0")/lib/preamble.sh"

gate_read_input

REPO_NAME="${GATE_REPO##*/}"
CLONE="$HOME/000-projects/contributing-clanker/$REPO_NAME"

if [[ ! -d "$CLONE/.git" ]]; then
  gate_skip "no local clone at $CLONE"
fi

DEFAULT_BRANCH=$(fm_field "$GATE_DOSSIER_PATH" "default_branch")
[[ -z "$DEFAULT_BRANCH" ]] && DEFAULT_BRANCH="main"

# Detect cross-CLI surface from canonical signals
MULTI_CLI_SIGNALS=0
[[ -f "$CLONE/AGENTS.md" ]] && MULTI_CLI_SIGNALS=$((MULTI_CLI_SIGNALS + 1))
[[ -f "$CLONE/.cursor/mcp.json" ]] && MULTI_CLI_SIGNALS=$((MULTI_CLI_SIGNALS + 1))
[[ -d "$CLONE/.codex" ]] && MULTI_CLI_SIGNALS=$((MULTI_CLI_SIGNALS + 1))
[[ -f "$CLONE/gemini-extension.json" ]] && MULTI_CLI_SIGNALS=$((MULTI_CLI_SIGNALS + 1))
# Look for README declaring multi-CLI support
if [[ -f "$CLONE/README.md" ]]; then
  # Count CLI *mentions* with grep -o | wc -l, not grep -c (which counts matching
  # LINES — a README naming 2+ CLIs on one line would miscount as 1 and miss the
  # signal). wc -l yields a single clean integer; `|| true` keeps a zero-match
  # grep from tripping set -e (the old `|| echo 0` produced "0\n0" → `[[ -ge ]]`
  # syntax error).
  hits=$(/usr/bin/grep -oiE "(Copilot CLI|Gemini CLI|Codex CLI|Cursor|Continue|Cline)" "$CLONE/README.md" 2>/dev/null | /usr/bin/wc -l || true)
  [[ "${hits:-0}" -ge 2 ]] && MULTI_CLI_SIGNALS=$((MULTI_CLI_SIGNALS + 1))
fi

if [[ "$MULTI_CLI_SIGNALS" -lt 1 ]]; then
  gate_skip "no multi-CLI signals detected — this repo is Claude-only or generic"
fi

CHANGED_SKILLS=$(/usr/bin/git -C "$CLONE" diff "$DEFAULT_BRANCH..HEAD" --name-only --diff-filter=AM 2>/dev/null | /usr/bin/grep -E '(^|/)SKILL\.md$' || /usr/bin/echo "")

if [[ -z "$CHANGED_SKILLS" ]]; then
  gate_pass "no modified SKILL.md files in diff"
fi

# Phrases that lock language to Claude-only when the plugin declares cross-CLI support.
# `Claude Code session`, `claude mcp add`, `claude mcp` in instructive context.
HITS=()
while IFS= read -r skill; do
  [[ -z "$skill" ]] && continue
  [[ ! -f "$CLONE/$skill" ]] && continue
  # Per-line scan so we can show the offending line for the fix hint
  while IFS= read -r match; do
    [[ -z "$match" ]] && continue
    HITS+=("$skill: $match")
  done < <(/usr/bin/grep -nE '(claude mcp(\s+(add|remove|list))?\b|Claude Code (session|user))' "$CLONE/$skill" 2>/dev/null | /usr/bin/head -5)
done <<< "$CHANGED_SKILLS"

if [[ ${#HITS[@]} -eq 0 ]]; then
  gate_pass "no Claude-only vocabulary detected in modified skills"
fi

LIST=$(printf '%s; ' "${HITS[@]}")
LIST="${LIST%; }"
gate_warn "modified skill uses Claude-only phrasing in a multi-CLI repo: $LIST" "generalize across the declared CLIs (e.g. 'AI-CLI session', '/mcp auth <server>') — point at the README for per-CLI invocation"
