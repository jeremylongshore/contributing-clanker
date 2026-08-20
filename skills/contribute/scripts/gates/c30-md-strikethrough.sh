#!/usr/bin/env bash
# Catalog: C30 — accidental GitHub strikethrough from stray tilde pairs
# Mitigates: the Pit Wall miss — a stray tilde pair in prose rendered a whole
# phrase struck-through on GitHub. GFM renders both ~~text~~ and single-tilde
# ~text~ (when the opening ~ touches non-space on the right and the closing ~
# touches non-space on the left) as strikethrough.
# WARN not BLOCK: tildes have legitimate uses (approx values, paths); the
# fenced-code filter removes most noise but a human still decides.
source "$(dirname "$0")/lib/preamble.sh"

gate_read_input
gate_resolve_tree

# Strip fenced code blocks (``` ... ```) then look for renderable
# strikethrough: ~~..~~ pairs, or single-tilde pairs satisfying GFM's
# flanking rule (open ~ followed by non-space, close ~ preceded by non-space).
scan_stream() {
  /usr/bin/awk '/^[[:space:]]*(```|~~~)/ {fence=!fence; next} !fence {print}' \
    | /usr/bin/grep -nE '~~[^~]+~~|~[^~[:space:]]([^~]*[^~[:space:]])?~' \
    || true
}

HITS=""
if [[ -n "$GATE_TREE_DIR" ]]; then
  while IFS= read -r REL; do
    [[ -n "$REL" ]] || continue
    if [[ -n "$(gate_file_content "$REL" | scan_stream)" ]]; then
      HITS="${HITS}${REL},"
    fi
  done < <(gate_tree_files '\.md$')
fi

if [[ -n "$(gate_candidate_outbound | scan_stream)" ]]; then
  HITS="${HITS}candidate outbound draft,"
fi

if [[ -z "$HITS" ]]; then
  if [[ -z "$GATE_TREE_DIR" && ! -f "$GATE_CANDIDATE_PATH" ]]; then
    gate_skip "no tree and no candidate file to scan"
  fi
  gate_pass "no strikethrough-rendering tilde pairs in markdown"
fi

gate_warn "tilde pair that GitHub will render as strikethrough in: ${HITS%,}" "escape the tildes (\\~) or rewrite; preview the file on GitHub to confirm nothing renders struck-through"
