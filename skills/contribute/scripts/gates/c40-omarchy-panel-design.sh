#!/usr/bin/env bash
# Catalog: C40 — a panel that renders as undifferentiated grey text.
#
# Every other gate in this lane asks whether a plugin is CORRECT. This one asks
# whether anyone will want it, because on a marketplace the answer decides
# whether the correct thing is ever installed.
#
# The evidence is in the marketplace's own numbers. The listings that convert
# best are not the ones with the most features: they are the ones that give a
# reader something to look at. The top converter on the site pairs big hero
# figures with per-row magnitude bars. The best-performing browser puts its
# filters on screen as pills instead of behind keys. Meanwhile Pit Wall shipped
# a Formula 1 standings table rendered in one grey, asking readers to parse ten
# team names as text when every one of them has a livery they recognise faster.
#
# So this gate looks for the three shapes that separate a panel someone shows a
# friend from a panel that merely works:
#
#   1. NO COLOUR AT ALL. A panel whose every colour resolves to foreground or
#      muted has no visual hierarchy beyond bold. Using the theme's accent or
#      urgent, or deriving a hue, all count.
#   2. INVISIBLE AFFORDANCES. A panel that names single-letter keys in its
#      footer but renders no clickable control has hidden its whole interface
#      from anyone who has not read the README.
#   3. NO STRUCTURE. A list panel with no separator, no selection fill and no
#      alternating treatment is a wall of text.
#
# WARN, never BLOCK. Design is a judgement and a gate that hard-fails on taste
# would be a gate people route around. This one is a prompt to look at the
# render, which is the actual check.
source "$(dirname "$0")/lib/preamble.sh"

gate_read_input
gate_resolve_tree

if [[ -z "$GATE_TREE_DIR" ]]; then
  gate_skip "no tree to scan"
fi
if [[ ! -f "$GATE_TREE_DIR/manifest.json" ]]; then
  gate_skip "not an Omarchy plugin tree"
fi

FINDINGS=""
while IFS= read -r REL; do
  [[ -n "$REL" ]] || continue
  case "$REL" in *Panel.qml) ;; *) continue ;; esac
  OUT=$(GATE_FILE="$GATE_TREE_DIR/$REL" GATE_REL="$REL" /usr/bin/python3 <<'PY'
import os, re
path = os.environ["GATE_FILE"]
rel = os.environ["GATE_REL"]
try:
    src = open(path, encoding="utf-8", errors="replace").read()
except OSError:
    raise SystemExit(0)

# Only panels with enough surface to have a design worth judging.
if src.count("Text {") < 6:
    raise SystemExit(0)

out = []

# 1. Colour where it does work: INSIDE the repeated rows.
#
#    The first cut of this gate searched the whole file, and it passed the exact
#    panel it was written for. Pit Wall carried one urgent-coloured LIVE badge,
#    which satisfied a file-wide search while its ten-row championship table
#    stayed a single grey. A lone accent somewhere on the panel is decoration;
#    colour inside the list is hierarchy. So the search is scoped to the bodies
#    of the Repeaters, which is where a reader does the actual parsing.
def repeater_bodies(text):
    bodies = []
    for m in re.finditer(r"\bRepeater\s*\{", text):
        i = m.end(); depth = 1; j = i
        while j < len(text) and depth:
            if text[j] == "{": depth += 1
            elif text[j] == "}": depth -= 1
            j += 1
        bodies.append(text[i:j])
    return bodies

COLOUR = r"\b(urgent|accent|Qt\.hsla|Qt\.hsva|accentHue|teamHue|hueFor)\b"
#    And it is a MAJORITY test, not an any() test. The second cut of this gate
#    still passed Pit Wall: one of its four repeaters coloured a LIVE badge, so
#    any() went green while the three list tables that mattered stayed grey.
bodies = repeater_bodies(src)
if bodies:
    lit = sum(1 for b in bodies if re.search(COLOUR, b))
    if lit * 2 < len(bodies):
        out.append(f"{rel} has {len(bodies) - lit} of {len(bodies)} repeated lists rendering no colour, so they have no hierarchy past bold")
elif not re.search(COLOUR, src):
    out.append(f"{rel} renders no colour beyond foreground/muted, so it has no hierarchy past bold")

# 2. Affordances. A footer that advertises keys, with nothing clickable.
keys_hint = re.search(r'"[^"]*\b(press|enter|esc)\b[^"]*"', src, re.I)
clickable = re.search(r"\b(MouseArea|WidgetButton|Button|TapHandler)\b", src)
if keys_hint and not clickable:
    out.append(f"{rel} documents keyboard keys but renders nothing clickable")

# 3. Structure. A repeating list with no visual separation between rows.
has_list = "Repeater" in src
structure = re.search(r"\b(selectedFill|normalFill|hairline|separator|Rectangle\s*\{[^}]*opacity)\b", src)
if has_list and not structure:
    out.append(f"{rel} repeats rows with no separator, fill or selection treatment")

for f in out[:4]:
    print(f)
PY
)
  [[ -n "$OUT" ]] && FINDINGS+="$OUT"$'\n'
done < <(gate_tree_files '\.qml$')

FINDINGS="${FINDINGS%$'\n'}"

if [[ -n "$FINDINGS" ]]; then
  SUMMARY=$(/usr/bin/printf '%s' "$FINDINGS" | /usr/bin/tr '\n' ';' | /usr/bin/cut -c1-300)
  gate_warn "panel design: $SUMMARY" \
    "render the panel and look at it before submitting. The marketplace listings that convert best give a reader something to look at: colour that carries meaning, filters visible as controls rather than hidden behind letters, and rows with visible structure. Derive a hue from your own data (team, category, author) and keep saturation and lightness fixed so it inherits the user's theme instead of fighting it."
fi

gate_pass "panel carries colour, affordances and row structure"
