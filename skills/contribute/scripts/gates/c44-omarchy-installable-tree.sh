#!/usr/bin/env bash
# Catalog: C44 - agent and session control payloads accidentally shipped inside
# an installable Omarchy plugin tree.
#
# Omarchy installs the repository as the plugin, so whatever is committed is what
# a user receives. Instructions, settings, hooks and skills written for a coding
# agent are operator tooling, not runtime assets.
#
# This gate first matched only AGENTS.md and CLAUDE.md. The marketplace reviewer's
# bar is wider than that, and a gate narrower than the reviewer reports green for
# a tree that gets blocked:
#   - AGENTS.md, CLAUDE.md, HANDOFF.md "and equivalent instructional artifacts"
#     omacom/omarchy-plugin-marketplace#4744
#   - 2026-09-20: a plugin was blocked for shipping .claude settings, hooks and
#     skills that executed shell actions. Directories an agent host loads
#     automatically count, not only Markdown with a special name.
#     omacom/omarchy-plugin-marketplace#7476
# Credit: the reviewer-comment survey in tcballard/build-omarchy-plugins (MIT),
# references/review-response.md, is what surfaced the widening.
#
# gate_tree_files already drops git-ignored paths, which is the right boundary
# here: a developer's ignored .claude/settings.local.json never ships, a committed
# .claude/ does. Ordinary user and developer documentation is not matched.
source "$(dirname "$0")/lib/preamble.sh"

gate_read_input
gate_resolve_tree

if [[ -z "$GATE_TREE_DIR" || ! -f "$GATE_TREE_DIR/manifest.json" ]]; then
  gate_skip "not an Omarchy plugin tree"
fi
if ! jq -e '.entryPoints' "$GATE_TREE_DIR/manifest.json" >/dev/null 2>&1; then
  gate_skip "manifest.json declares no entryPoints; not an Omarchy plugin"
fi

# Named instruction files, at any depth.
PAT_FILES='(^|/)(AGENTS|CLAUDE|GEMINI|CODEX|HANDOFF)\.[mM][dD]$|(^|/)\.cursorrules$|(^|/)\.mcp\.json$|^\.github/copilot-instructions\.md$'
# Directories an agent host discovers and loads on its own: settings, hooks,
# skills, commands, rules.
PAT_DIRS='(^|/)\.(claude|agents|codex|cursor|gemini)/'

HITS=$(gate_tree_files "$PAT_FILES|$PAT_DIRS" || true)
if [[ -n "$HITS" ]]; then
  COUNT=$(printf '%s\n' "$HITS" | /usr/bin/grep -c . || true)
  FILES=$(printf '%s\n' "$HITS" | LC_ALL=C sort | /usr/bin/head -8 | paste -sd ', ' -)
  [[ "$COUNT" -gt 8 ]] && FILES="$FILES, and $((COUNT - 8)) more"
  gate_block "agent or session control payload in installable plugin tree: $FILES" "keep agent instructions, settings, hooks and skills in the containing workspace or git-ignore them; the marketplace reviewer blocks AGENTS.md, CLAUDE.md, HANDOFF.md and auto-loaded agent directories such as .claude/ in a desktop plugin"
fi

gate_pass "installable plugin tree excludes agent instruction files and agent configuration directories"
