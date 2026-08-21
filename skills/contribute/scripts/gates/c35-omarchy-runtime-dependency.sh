#!/usr/bin/env bash
# Catalog: C35 — an Omarchy plugin that depends on a runtime the target box
# does not have.
#
# Mitigates a defect class that shipped twice and would have reached real
# users: two entries were built with a Node.js poller CLI (bin/<name>-poll)
# spawned by the QML shell. They worked on the dev rig and passed every other
# gate, because that rig happens to carry a SYSTEM node at /usr/bin/node.
#
# A stock Omarchy install does not. Omarchy installs Node through **mise**,
# and mise's shims are exported only to an interactive shell, never to the
# graphical session that launches Quickshell (verified on a real Omarchy tree:
# no uwsm/env PATH export, no profile hook, no environment.d entry, and
# omarchy-launch-shell execs quickshell directly). Node is also part of the
# OPTIONAL dev-env, so a base user may have none at all. A plugin whose data
# layer runs under `#!/usr/bin/env node` therefore installs cleanly, enables
# cleanly, and then silently never populates.
#
# The marketplace-validated pattern (MLB Booth, Pit Wall) has no runtime at
# all: fetch with `curl` from a QML `Process`, parse in a plain-JS Model.js on
# Quickshell's own engine, persist with `FileView { atomicWrites: true }`.
#
# Rule: in an Omarchy plugin tree (one with a manifest.json declaring
# entryPoints), no shipped executable may be a node/python/ruby/deno/bun
# script, and no .qml may spawn one of those interpreters. bash/sh scripts are
# fine: every Omarchy box has a shell, and curl/jq ship with it.
#
# Whole-tree scan; only files in the change set for diff-mode candidates.
# Skips when the tree is not an Omarchy plugin.
source "$(dirname "$0")/lib/preamble.sh"

gate_read_input
gate_resolve_tree

if [[ -z "$GATE_TREE_DIR" ]]; then
  gate_skip "no tree to scan"
fi

# Only applies to an Omarchy plugin tree.
if [[ ! -f "$GATE_TREE_DIR/manifest.json" ]]; then
  gate_skip "no manifest.json; not an Omarchy plugin tree"
fi
if ! jq -e '.entryPoints' "$GATE_TREE_DIR/manifest.json" >/dev/null 2>&1; then
  gate_skip "manifest.json declares no entryPoints; not an Omarchy plugin"
fi

# Interpreters a stock Omarchy install does NOT guarantee on the session PATH.
BANNED_RE='^#!.*(node|deno|bun|python[0-9.]*|ruby|perl)([[:space:]]|$)'

VIOLATIONS=""

# --- Rule 1: no shipped script may run under an unavailable interpreter ---
ALL_FILES=$(gate_tree_files '.*')
while IFS= read -r REL; do
  [[ -n "$REL" ]] || continue
  # tests/ and docs/ are developer-only: a node unit suite is fine, it never
  # runs on the user's machine.
  case "$REL" in
    tests/*|test/*|docs/*|*.md|node_modules/*) continue ;;
  esac
  FILE="$GATE_TREE_DIR/$REL"
  [[ -f "$FILE" ]] || continue
  FIRST=$(/usr/bin/head -n1 "$FILE" 2>/dev/null || true)
  if [[ "$FIRST" =~ $BANNED_RE ]]; then
    INTERP=$(/usr/bin/printf '%s' "$FIRST" | /usr/bin/sed -E 's|^#!.*[/ ]([a-z0-9.]+)([[:space:]].*)?$|\1|')
    VIOLATIONS="${VIOLATIONS}${REL}: shipped script runs under '${INTERP}', which a stock Omarchy install does not put on the session PATH; "
  fi
done <<< "$ALL_FILES"

# --- Rule 2: no .qml may spawn one of those interpreters ---
QML_FILES=$(gate_tree_files '\.qml$')
while IFS= read -r REL; do
  [[ -n "$REL" ]] || continue
  FILE="$GATE_TREE_DIR/$REL"
  [[ -f "$FILE" ]] || continue
  # Look for an interpreter as the FIRST element of a command array, which is
  # how Quickshell's Process takes an argv. Comment lines are stripped so a
  # doc line naming node never trips the gate.
  HIT=$(/usr/bin/sed 's://.*::' "$FILE" \
    | /usr/bin/grep -nE '(command|Detached)[^"]*\[[[:space:]]*"(node|deno|bun|python[0-9.]*|ruby|perl)"' \
    | /usr/bin/head -3 || true)
  if [[ -n "$HIT" ]]; then
    LINES=$(/usr/bin/printf '%s' "$HIT" | /usr/bin/cut -d: -f1 | /usr/bin/tr '\n' ',')
    VIOLATIONS="${VIOLATIONS}${REL}: QML spawns an unavailable interpreter at line(s) ${LINES%,}; "
  fi
done <<< "$QML_FILES"

if [[ -z "$VIOLATIONS" ]]; then
  gate_pass "no shipped code depends on a runtime a stock Omarchy install lacks"
fi

gate_block "runtime dependency: ${VIOLATIONS% }" "Omarchy installs node via mise, whose shims are NOT on the graphical session PATH, so the plugin would install cleanly and then never populate. Move the logic into QML the way MLB Booth and Pit Wall do: curl from a QML Process, parse in a plain-JS Model.js, persist with FileView { atomicWrites: true }. A bash script is fine. Prove it by launching the shell with the interpreter shadowed by a stub that exits 127."
