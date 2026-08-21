#!/usr/bin/env bash
# Catalog: C37 — an Omarchy plugin reaching submission without ever having run
# on a real Omarchy.
#
# Mitigates the hole that made C32 and C33 decorative. Both call gate_skip when
# omarchy-plugin-validate and qmllint are not resolvable, and those binaries
# live on the rig, not on a dev box. The runner counts SKIP as pass. So
# `gate-runner omarchy-submit` printed "verdict PASS, 0 BLOCK" for a plugin
# that had never touched a rig. The operator ran the rig by hand every time,
# which is exactly the "if someone remembers" failure the lane exists to end.
#
# A gate cannot ssh to the rig itself: the runner enforces a 10 second wall
# clock and a rig round trip is far longer. So the rig run records a receipt
# and this gate refuses a submission whose receipt is missing, stale, failing,
# or written against different code.
#
# Produce the receipt with scripts/rig-verify.sh in the plugin repo.
#
# Only blocks at submit time. During development a missing receipt is a SKIP,
# because gating every intermediate save on a rig round trip would just teach
# people to bypass the lane.
source "$(dirname "$0")/lib/preamble.sh"

gate_read_input
gate_resolve_tree

MAX_AGE_DAYS=14

if [[ -z "$GATE_TREE_DIR" || ! -f "$GATE_TREE_DIR/manifest.json" ]]; then
  gate_skip "not an Omarchy plugin tree"
fi

PROOF="$GATE_TREE_DIR/.rig-proof.json"

if [[ "$GATE_ACTION" != "omarchy-submit" ]]; then
  [[ -f "$PROOF" ]] || gate_skip "no rig receipt yet; only enforced at submit time"
fi

if [[ ! -f "$PROOF" ]]; then
  gate_block "no rig receipt: this plugin has never been proven to run on a real Omarchy" \
    "run scripts/rig-verify.sh in the plugin repo. it installs the tree into the omarchy rig container, runs omarchy-plugin-validate and qmllint, and writes .rig-proof.json. C32 and C33 skip silently off-rig, so without this receipt a PASS verdict means nothing."
fi

# Fingerprint exactly what the rig actually checks: the manifest and every QML
# file. If either changes, the receipt no longer describes the shipped code.
fingerprint() {
  ( cd "$GATE_TREE_DIR" && \
    /usr/bin/find . -maxdepth 2 \( -name '*.qml' -o -name 'manifest.json' \) \
      -not -path './.git/*' -not -path './tests/*' -print0 2>/dev/null \
    | LC_ALL=C /usr/bin/sort -z \
    | /usr/bin/xargs -0 /usr/bin/cat 2>/dev/null \
    | /usr/bin/sha256sum | /usr/bin/cut -d' ' -f1 )
}

NOW=$(/usr/bin/date +%s)
RECORDED_FP=$(/usr/bin/jq -r '.fingerprint // ""' "$PROOF" 2>/dev/null)
VALIDATE=$(/usr/bin/jq -r '.omarchyPluginValidate // 1' "$PROOF" 2>/dev/null)
QMLLINT=$(/usr/bin/jq -r '.qmllintErrors // 1' "$PROOF" 2>/dev/null)
AT=$(/usr/bin/jq -r '.validatedAtEpoch // 0' "$PROOF" 2>/dev/null)
RIG=$(/usr/bin/jq -r '.rig // "unknown"' "$PROOF" 2>/dev/null)

if [[ -z "$RECORDED_FP" ]]; then
  gate_block "rig receipt is malformed: no fingerprint" "delete .rig-proof.json and re-run scripts/rig-verify.sh"
fi

CURRENT_FP=$(fingerprint)
if [[ "$RECORDED_FP" != "$CURRENT_FP" ]]; then
  gate_block "rig receipt is for different code: the manifest or a .qml file changed since it was written" \
    "re-run scripts/rig-verify.sh. a receipt that does not match the shipped QML is worse than none, because it certifies code nobody ran."
fi

if [[ "$VALIDATE" != "0" ]]; then
  gate_block "rig receipt records omarchy-plugin-validate exit $VALIDATE" "fix the reported manifest or layout issues, then re-run scripts/rig-verify.sh"
fi

if [[ "$QMLLINT" != "0" ]]; then
  gate_block "rig receipt records $QMLLINT qmllint error(s)" "fix them, then re-run scripts/rig-verify.sh"
fi

if [[ "$AT" -le 0 ]]; then
  gate_block "rig receipt has no timestamp" "delete .rig-proof.json and re-run scripts/rig-verify.sh"
fi

AGE_DAYS=$(( (NOW - AT) / 86400 ))
if [[ "$AGE_DAYS" -gt "$MAX_AGE_DAYS" ]]; then
  gate_block "rig receipt is $AGE_DAYS days old (limit $MAX_AGE_DAYS)" \
    "the rig tracks upstream Omarchy, so an old receipt says the plugin worked against a shell that has since moved. re-run scripts/rig-verify.sh."
fi

gate_pass "rig receipt valid: validated on $RIG ${AGE_DAYS}d ago, matches the shipped QML"
