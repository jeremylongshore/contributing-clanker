#!/usr/bin/env bash
# Catalog: C32 — omarchy-plugin-validate must pass before an Omarchy submission
# Mitigates: manifest/layout defects only surfacing after the marketplace bot
# runs its validation on the submission issue. Run the first-party validator
# locally and block on failure. Self-skips when the tree has no manifest.json
# or the validator binary is not resolvable on this box (it lives on the
# omarchy rig; set OMARCHY_PLUGIN_VALIDATE to point at a local copy).
source "$(dirname "$0")/lib/preamble.sh"

gate_read_input
gate_resolve_tree

if [[ -z "$GATE_TREE_DIR" || ! -f "$GATE_TREE_DIR/manifest.json" ]]; then
  gate_skip "no manifest.json in tree — not an Omarchy plugin"
fi

VALIDATOR="${OMARCHY_PLUGIN_VALIDATE:-}"
if [[ -z "$VALIDATOR" ]]; then
  VALIDATOR=$(command -v omarchy-plugin-validate 2>/dev/null || true)
fi
if [[ -z "$VALIDATOR" || ! -x "$VALIDATOR" ]]; then
  gate_skip "omarchy-plugin-validate not resolvable on this box — run it on the omarchy rig before submitting"
fi

# Gate-runner enforces a 10s wall clock; leave headroom.
if OUT=$(cd "$GATE_TREE_DIR" && /usr/bin/timeout 8 "$VALIDATOR" . 2>&1); then
  gate_pass "omarchy-plugin-validate passed"
fi

SNIPPET=$(/usr/bin/printf '%s' "$OUT" | /usr/bin/head -c 300 | /usr/bin/tr '\n' ' ')
gate_block "omarchy-plugin-validate failed: $SNIPPET" "fix the reported manifest/layout issues, then re-run gate-runner omarchy-submit"
