#!/usr/bin/env bash
# Catalog: C29 — private project / client names leaking into shipped content
# Mitigates: the Crew Chief miss — real private names (internal repos, client
# names) baked into a demo seed, preview.png filename context, banner, and
# test fixtures, shipped to a public repo, then scrubbed with a history
# rewrite. Denylist lives OUTSIDE the public skill repo at
# ~/.contribute-system/private-names.txt (one token per line, # comments).
# Checks file CONTENTS and FILENAMES, case-insensitive, fixed-string match.
source "$(dirname "$0")/lib/preamble.sh"

gate_read_input
gate_resolve_tree

# PRIVATE_NAMES_FILE overrides the default location (used by the test suite).
DENYLIST="${PRIVATE_NAMES_FILE:-$HOME/.contribute-system/private-names.txt}"

if [[ ! -f "$DENYLIST" ]]; then
  gate_warn "denylist missing at $DENYLIST — private-name scan cannot run" "create it: one private token per line (internal repo names, client names); lines starting with # are comments"
fi

# Strip comments/blanks into a temp pattern file for grep -F -f.
PATTERNS=$(/usr/bin/grep -v -e '^#' -e '^[[:space:]]*$' "$DENYLIST" 2>/dev/null || true)
if [[ -z "$PATTERNS" ]]; then
  gate_warn "denylist at $DENYLIST has no entries" "add the private tokens that must never ship (internal repo names, client names)"
fi
PATFILE=$(/usr/bin/mktemp)
trap '/usr/bin/rm -f "$PATFILE"' EXIT
/usr/bin/printf '%s\n' "$PATTERNS" > "$PATFILE"

HITS=""
if [[ -n "$GATE_TREE_DIR" ]]; then
  while IFS= read -r REL; do
    [[ -n "$REL" ]] || continue
    # Filename check
    if /usr/bin/printf '%s' "$REL" | /usr/bin/grep -qiF -f "$PATFILE"; then
      HITS="${HITS}${REL} (filename),"
      continue
    fi
    # Content check — text files only (grep -I refuses binaries, but we feed
    # content through gate_file_content, so probe the blob type cheaply).
    case "$REL" in
      *.png|*.jpg|*.jpeg|*.gif|*.webp|*.ico|*.woff|*.woff2|*.ttf|*.zip) continue ;;
    esac
    if gate_file_content "$REL" | /usr/bin/grep -qiF -f "$PATFILE"; then
      HITS="${HITS}${REL},"
    fi
  done < <(gate_tree_files '.')
fi

if gate_candidate_outbound | /usr/bin/grep -qiF -f "$PATFILE"; then
  HITS="${HITS}candidate outbound draft,"
fi

if [[ -z "$HITS" ]]; then
  if [[ -z "$GATE_TREE_DIR" && ! -f "$GATE_CANDIDATE_PATH" ]]; then
    gate_skip "no tree and no candidate file to scan"
  fi
  gate_pass "no denylisted private names in shipped content or filenames"
fi

gate_block "private name from denylist found in: ${HITS%,}" "replace with a neutral fake name (demo seeds, fixtures, banners must never carry internal repo or client names); once pushed publicly this takes a history rewrite to remove"
