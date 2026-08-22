#!/usr/bin/env bash
# Catalog: C36 — QML text that renders past the edge of its panel.
#
# Mitigates a defect class caught three times by eye and never by a test. A
# `Text` with no `width`, no `elide` and no `wrapMode` lays out on one line and
# is clipped by its container, so the last words simply vanish. It shipped in
# the Listening Post panel, and it is visible in the X Files preview.png that
# went to the marketplace: the footer reads "The spend meter is y" and the
# stats row ends "1 praise, 2".
#
# Why a static gate rather than a test: these plugins carry 240 offline tests
# between them and not one exercises a .qml file, because unit-testing
# Quickshell layout needs a running Qt scene. The render layer is only
# reachable statically, so that is where enforcement belongs.
#
# Two flagged shapes:
#   1. a data binding (concatenation or a property reference) with no bound —
#      the content length is not under the author's control at all;
#   2. a string literal long enough to overrun a bar panel (> 40 chars).
# A short static label is fine and is not flagged.
source "$(dirname "$0")/lib/preamble.sh"

gate_read_input
gate_resolve_tree

if [[ -z "$GATE_TREE_DIR" ]]; then
  gate_skip "no tree to scan"
fi
if [[ ! -f "$GATE_TREE_DIR/manifest.json" ]]; then
  gate_skip "not an Omarchy plugin tree"
fi

HITS=""
while IFS= read -r REL; do
  [[ -n "$REL" ]] || continue
  FINDINGS=$(GATE_FILE="$GATE_TREE_DIR/$REL" GATE_REL="$REL" /usr/bin/python3 <<'PY'
import os, re
path = os.environ["GATE_FILE"]
rel = os.environ["GATE_REL"]
try:
    src = open(path, encoding="utf-8", errors="replace").read()
except OSError:
    raise SystemExit(0)

lines = src.count("\n")
out = []

def _missing(has_width, has_rule):
    if not has_width and not has_rule:
        return "has neither a width constraint nor elide/wrapMode"
    if not has_width:
        return "declares elide/wrapMode but nothing constrains its width, so it is a no-op"
    return "constrains its width but declares no elide/wrapMode, so it paints past the boundary"
for m in re.finditer(r"\bText\s*\{", src):
    i = m.end(); depth = 1; j = i
    while j < len(src) and depth:
        if src[j] == "{": depth += 1
        elif src[j] == "}": depth -= 1
        j += 1
    block = src[i:j]
    tm = re.search(r"^\s*text\s*:\s*(.+)$", block, re.M)
    if not tm:
        continue
    # A bound needs BOTH halves, and this gate used to accept either one alone.
    #
    # That was wrong on QML semantics, and this file's own fix_hint already
    # said so ("elide ... WITH a width"): the check was looser than the advice
    # it printed. In QML,
    #   elide    with no width constraint is a NO-OP: elision is computed
    #            against the element width, and without one the element sizes
    #            to its content, so there is nothing to elide against.
    #   wrapMode with no width constraint is likewise a no-op: there is no
    #            boundary to wrap at.
    #   width    with no elide and no wrapMode does not clip. A Text paints at
    #            its implicitWidth regardless of the width property unless
    #            clip is set, so the overrun still happens.
    # Caught on crew-chief: four rows were repaired by adding width AND elide,
    # but adding a bare elide would have greened the gate and fixed nothing.
    #
    # So: bounded iff (something constrains the width) AND (elide or wrapMode
    # says what to do when the content exceeds it).
    def declared(prop):
        return re.search(r"(?:^|[;{])\s*" + prop + r"\s*:", block, re.M)

    # A width constraint is an explicit width, a fill, a Layout fill, or a
    # left+right anchor pair, which together determine width.
    has_width = bool(
        declared("width")
        or declared(r"anchors\.fill")
        or declared(r"Layout\.fillWidth")
        or declared(r"Layout\.preferredWidth")
        or declared(r"Layout\.maximumWidth")
        or (declared(r"anchors\.left") and declared(r"anchors\.right"))
    )
    has_overflow_rule = bool(declared("elide") or declared("wrapMode"))
    if has_width and has_overflow_rule:
        continue
    value = tm.group(1).strip()
    lineno = src[:i].count("\n") + 1
    # `text: {` opens a multi-line JavaScript block whose result is computed,
    # so the value captured on THIS line is just the brace. Stripping literals
    # from "{" leaves no identifier, so the computed-text test below scored it
    # as a bare literal and the whole block escaped the gate. That is not
    # hypothetical: the Docket hero subtitle used this exact form, passed C36,
    # and rendered clipped at the panel edge in the first live capture
    # ("... 101 newer not fetched . c"). A block is always computed.
    if value.startswith("{"):
        out.append(f"{rel}:{lineno} bound text {_missing(has_width, has_overflow_rule)}")
        continue
    # Shape 1: the text is computed, so its length is not authored.
    # Anything that is not purely quoted literal text is computed, and its
    # length is therefore not under the author's control. Strip the string
    # literals and see whether an identifier remains. Matching only dotted
    # paths missed the common `text: someProperty` form entirely.
    residue = re.sub(r'"[^"\\]*(?:\\.[^"\\]*)*"', "", value)
    residue = re.sub(r"'[^'\\]*(?:\\.[^'\\]*)*'", "", residue)
    bound = bool(re.search(r"[A-Za-z_]\w*", residue))
    if bound:
        out.append(f"{rel}:{lineno} bound text {_missing(has_width, has_overflow_rule)}")
        continue
    # Shape 2: a literal long enough to overrun a panel.
    lits = re.findall(r'"([^"\\]*(?:\\.[^"\\]*)*)"', value)
    if lits and sum(len(x) for x in lits) > 40:
        out.append(f"{rel}:{lineno} long literal ({sum(len(x) for x in lits)} chars) {_missing(has_width, has_overflow_rule)}")
print("\n".join(out))
PY
)
  [[ -n "$FINDINGS" ]] && HITS+="$FINDINGS"$'\n'
done < <(gate_tree_files '\.qml$')

HITS="$(printf '%s' "$HITS" | /usr/bin/sed '/^$/d')"
if [[ -n "$HITS" ]]; then
  COUNT=$(printf '%s\n' "$HITS" | /usr/bin/wc -l)
  SUMMARY=$(printf '%s\n' "$HITS" | /usr/bin/head -6 | /usr/bin/tr '\n' ';')
  gate_block "QML text overflow risk ($COUNT): $SUMMARY" \
    "a Text with no width, elide or wrapMode is clipped by its container and the last words disappear. Add 'wrapMode: Text.WordWrap' with a width for prose, or 'elide: Text.ElideRight' with a width for one-line rows. Verify by rendering the panel, not by reading the diff."
fi

gate_pass "no QML text can overflow its container unbounded"
