#!/usr/bin/env bash
# Catalog: C23 — MCP tool annotations that violate the 2025-06-18 spec
# Mitigates: "MCP Annotation Conflation" anti-pattern. Two common errors:
#   (a) idempotentHint set on readOnlyHint:true tools (spec says it is ignored)
#   (b) idempotentHint:false on destructive tools because they are destructive
#       (HTTP DELETE pattern: destructive AND idempotent are orthogonal)
# Caught at kobiton/automate#74 — Tu Nguyen's review required exactly these fixes.
# Ref: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
source "$(dirname "$0")/lib/preamble.sh"

gate_read_input

REPO_NAME="${GATE_REPO##*/}"
CLONE="$HOME/000-projects/contributing-clanker/$REPO_NAME"

if [[ ! -d "$CLONE/.git" ]]; then
  gate_skip "no local clone at $CLONE"
fi

DEFAULT_BRANCH=$(fm_field "$GATE_DOSSIER_PATH" "default_branch")
[[ -z "$DEFAULT_BRANCH" ]] && DEFAULT_BRANCH="main"

CHANGED_YAML=$(/usr/bin/git -C "$CLONE" diff "$DEFAULT_BRANCH..HEAD" --name-only --diff-filter=AM 2>/dev/null | /usr/bin/grep -E '(^|/)tools/.*\.ya?ml$' || /usr/bin/echo "")

if [[ -z "$CHANGED_YAML" ]]; then
  gate_pass "no modified tools/*.yaml files in diff"
fi

REDUNDANT=()   # idempotentHint on readOnlyHint:true tools
CONFLATED=()   # destructiveHint:true + idempotentHint:false

while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  [[ ! -f "$CLONE/$f" ]] && continue

  # Walk the annotations blocks. We rely on a simple stanza walker:
  # collect lines until the next top-level key (annotations:, inputSchema:, etc.).
  /usr/bin/awk -v file="$f" '
    BEGIN { in_ann = 0; tool = ""; ro = ""; dh = ""; ih = "" }
    /^[[:space:]]*-[[:space:]]*name:[[:space:]]*/ {
      # Emit pending stanza
      if (in_ann && tool != "") emit()
      sub(/^[[:space:]]*-[[:space:]]*name:[[:space:]]*/, "")
      tool = $0; ro = ""; dh = ""; ih = ""; in_ann = 0
      next
    }
    /^[[:space:]]+annotations:/ { in_ann = 1; next }
    in_ann && /^[[:space:]]+readOnlyHint:/    { ro = extract() }
    in_ann && /^[[:space:]]+destructiveHint:/ { dh = extract() }
    in_ann && /^[[:space:]]+idempotentHint:/  { ih = extract() }
    in_ann && /^[[:space:]]+(inputSchema|outputSchema|title|description):/ { emit(); in_ann = 0 }
    END { if (in_ann) emit() }
    function extract(   v) { v = $0; sub(/^[^:]+:[[:space:]]*/, "", v); gsub(/[[:space:]]/, "", v); return v }
    function emit() {
      if (ro == "true" && ih != "") print "REDUNDANT|" file "|" tool "|idempotentHint set on readOnlyHint:true"
      if (dh == "true" && ih == "false") print "CONFLATED|" file "|" tool "|destructiveHint:true with idempotentHint:false — destructive does not imply non-idempotent"
      ro = ""; dh = ""; ih = ""
    }
  ' "$CLONE/$f" > /tmp/c23-findings-$$.txt 2>/dev/null || true

  while IFS='|' read -r kind file tool reason; do
    [[ -z "$kind" ]] && continue
    case "$kind" in
      REDUNDANT) REDUNDANT+=("$file:$tool — $reason") ;;
      CONFLATED) CONFLATED+=("$file:$tool — $reason") ;;
    esac
  done < /tmp/c23-findings-$$.txt
  /usr/bin/rm -f /tmp/c23-findings-$$.txt
done <<< "$CHANGED_YAML"

if [[ ${#REDUNDANT[@]} -eq 0 && ${#CONFLATED[@]} -eq 0 ]]; then
  gate_pass "tool annotations conform to MCP 2025-06-18 spec"
fi

ALL=("${REDUNDANT[@]}" "${CONFLATED[@]}")
LIST=$(printf '%s; ' "${ALL[@]}")
LIST="${LIST%; }"
gate_warn "MCP tool annotation issues: $LIST" "drop idempotentHint on readOnlyHint:true tools (it is ignored per spec); for destructive-but-idempotent tools (e.g. terminate/delete) set idempotentHint:true"
