#!/usr/bin/env bash
# Catalog: C28 — em/en dashes in shipped prose or the outgoing issue/PR body
# Mitigates: the Pit Wall miss — em dashes all over the README, docs, and the
# banner SVG shipped to a public repo, then swept by hand. The operator's
# voice bans them; a maintainer reads them as AI slop.
# Scope: .md / .json / .svg / .txt content the contributor authored (full tree
# for dir candidates, added lines only for clone diffs), plus the STRING
# LITERALS of .qml / .js / .mjs files (a rendered tooltip shipped em dashes
# through the original md-only scope — MLB Booth panel review, 2026-08-20;
# code comments stay exempt, dashes are fine prose there), plus the outbound
# draft sections of the candidate file.
source "$(dirname "$0")/lib/preamble.sh"

gate_read_input
gate_resolve_tree

EM=$'—'
EN=$'–'

HITS=""
if [[ -n "$GATE_TREE_DIR" ]]; then
  while IFS= read -r REL; do
    [[ -n "$REL" ]] || continue
    if gate_file_content "$REL" | /usr/bin/grep -q -e "$EM" -e "$EN"; then
      HITS="${HITS}${REL},"
    fi
  done < <(gate_tree_files '\.(md|json|svg|txt)$')

  # Code files: only what a user can see — double-quoted string literals.
  while IFS= read -r REL; do
    [[ -n "$REL" ]] || continue
    if gate_file_content "$REL" | /usr/bin/grep -o '"[^"]*"' | /usr/bin/grep -q -e "$EM" -e "$EN"; then
      HITS="${HITS}${REL} (string literal),"
    fi
  done < <(gate_tree_files '\.(qml|js|mjs)$')
fi

if gate_candidate_outbound | /usr/bin/grep -q -e "$EM" -e "$EN"; then
  HITS="${HITS}candidate outbound draft,"
fi

if [[ -z "$HITS" ]]; then
  if [[ -z "$GATE_TREE_DIR" && ! -f "$GATE_CANDIDATE_PATH" ]]; then
    gate_skip "no tree and no candidate file to scan"
  fi
  gate_pass "no em/en dashes in shipped prose or outbound drafts"
fi

gate_block "em/en dash found in: ${HITS%,}" "replace every — and – with a period, comma, colon, or rewrite; the operator voice bans them and they read as AI-generated"
