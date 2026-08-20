#!/usr/bin/env bash
# Catalog: C31 — QML security: untrusted text rendered as AutoText, unbounded curl
# Mitigates: two Pit Wall review-panel findings that a security agent caught
# only after submit:
#   1. A `Text` element binding an untrusted API string with no `textFormat`
#      defaults to AutoText — Qt sniffs the string for HTML, so a hostile API
#      payload can inject rich text / trigger outbound image requests.
#      Rule: every Text block whose `text:` is not a pure string literal (or
#      qsTr literal) must declare an explicit `textFormat`.
#   2. A curl Process with no --max-filesize can pull an unbounded body onto
#      the UI thread. Rule: any .qml file containing a "curl" argv literal
#      must also contain --max-filesize.
# Analyzes whole files (block structure is not visible in a diff hunk), but
# only files in the change set for diff-mode candidates. Skips when no .qml.
source "$(dirname "$0")/lib/preamble.sh"

gate_read_input
gate_resolve_tree

if [[ -z "$GATE_TREE_DIR" ]]; then
  gate_skip "no tree to scan"
fi

QML_FILES=$(gate_tree_files '\.qml$')
if [[ -z "$QML_FILES" ]]; then
  gate_skip "no .qml files in scope"
fi

VIOLATIONS=""
while IFS= read -r REL; do
  [[ -n "$REL" ]] || continue
  FILE="$GATE_TREE_DIR/$REL"
  [[ -f "$FILE" ]] || continue

  # --- Rule 1: Text blocks binding data with no explicit textFormat ---
  # Brace-tracking awk: on entering a `Text {` block, watch for a `text:`
  # whose value is not a pure "literal" / qsTr("literal"), and for any
  # textFormat declaration; report the block's start line if bound-but-unset.
  # Note: assumes the multi-line block style (text: on its own line); a
  # one-liner `Text { text: foo }` is not the template idiom.
  BAD_TEXT=$(/usr/bin/awk '
    {
      line=$0
      if (!inText && line ~ /(^|[^A-Za-z0-9_.])Text[[:space:]]*\{/) {
        inText=1; textDepth=depth; hasBind=0; hasFmt=0; startLine=NR
      }
      o=gsub(/\{/,"{",line); c=gsub(/\}/,"}",line)
      depth+=o-c
      if (inText) {
        if ($0 ~ /^[[:space:]]*text:[[:space:]]*/) {
          v=$0; sub(/^[[:space:]]*text:[[:space:]]*/,"",v); sub(/[[:space:]]*$/,"",v)
          if (v !~ /^"([^"\\]|\\.)*"$/ && v !~ /^qsTr\("([^"\\]|\\.)*"\)$/) hasBind=1
        }
        if ($0 ~ /textFormat[[:space:]]*:/) hasFmt=1
        if (depth <= textDepth) {
          if (hasBind && !hasFmt) printf "%d,", startLine
          inText=0
        }
      }
    }
  ' "$FILE")
  if [[ -n "$BAD_TEXT" ]]; then
    VIOLATIONS="${VIOLATIONS}${REL}: Text binds data without textFormat at line(s) ${BAD_TEXT%,} (AutoText sniffing risk); "
  fi

  # --- Rule 2: curl argv with no --max-filesize anywhere in the file ---
  if /usr/bin/grep -q '"curl"' "$FILE" && ! /usr/bin/grep -q -- '--max-filesize' "$FILE"; then
    VIOLATIONS="${VIOLATIONS}${REL}: \"curl\" argv with no --max-filesize (unbounded body on the UI thread); "
  fi
done <<< "$QML_FILES"

if [[ -z "$VIOLATIONS" ]]; then
  gate_pass "all Text data bindings declare textFormat; all curl argvs byte-bounded"
fi

gate_block "QML security: ${VIOLATIONS% ; }" "add 'textFormat: Text.PlainText' to every Text that renders API data; add '--max-filesize <bytes>' to every curl argv (see the Pit Wall template's shared curl() builder)"
