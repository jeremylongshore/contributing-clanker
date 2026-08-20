#!/usr/bin/env bash
# Catalog: C33 — qmllint errors in shipped QML
# Mitigates: dead code / lint issues in Pit Wall caught late by the review
# panel instead of a linter. Runs qmllint over every .qml in scope; BLOCK on
# errors, warnings are surfaced but do not block (matching the first-party
# Omarchy profile, which does not gate on warnings). Self-skips when qmllint
# is not installed (it lives on the omarchy rig; set QMLLINT to a local copy).
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

QMLLINT="${QMLLINT:-}"
[[ -z "$QMLLINT" ]] && QMLLINT=$(command -v qmllint 2>/dev/null || true)
if [[ -z "$QMLLINT" || ! -x "$QMLLINT" ]]; then
  gate_skip "qmllint not resolvable on this box — run it on the omarchy rig before submitting"
fi

ERRORS=""
WARN_COUNT=0
while IFS= read -r REL; do
  [[ -n "$REL" ]] || continue
  FILE="$GATE_TREE_DIR/$REL"
  [[ -f "$FILE" ]] || continue
  OUT=$(/usr/bin/timeout 6 "$QMLLINT" "$FILE" 2>&1 || true)
  ERRS=$(/usr/bin/printf '%s\n' "$OUT" | /usr/bin/grep -c '^Error' || true)
  WARNS=$(/usr/bin/printf '%s\n' "$OUT" | /usr/bin/grep -c '^Warning' || true)
  WARN_COUNT=$(( WARN_COUNT + WARNS ))
  if [[ "$ERRS" -gt 0 ]]; then
    FIRST=$(/usr/bin/printf '%s\n' "$OUT" | /usr/bin/grep '^Error' | /usr/bin/head -1 | /usr/bin/head -c 150)
    ERRORS="${ERRORS}${REL}: ${ERRS} error(s), first: ${FIRST}; "
  fi
done <<< "$QML_FILES"

if [[ -n "$ERRORS" ]]; then
  gate_block "qmllint errors: ${ERRORS% ; }" "fix every qmllint Error before submitting; warnings are advisory"
fi

if [[ "$WARN_COUNT" -gt 0 ]]; then
  gate_inform "qmllint clean of errors ($WARN_COUNT warning(s) — advisory, not gated)"
fi

gate_pass "qmllint clean on all .qml files in scope"
