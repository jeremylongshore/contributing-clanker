#!/usr/bin/env bash
# Catalog: C20 — backtick file references in modified docs that don't resolve in the repo
# Mitigates: documentation drift — references to files that were removed/renamed upstream,
# caught by maintainers on review (kobiton/automate#64 comment 3: SKILL.md referenced
# .mcp.dev-local.json after that file was deleted from the repo).
source "$(dirname "$0")/lib/preamble.sh"

gate_read_input

REPO_NAME="${GATE_REPO##*/}"
CLONE="$HOME/000-projects/contributing-clanker/$REPO_NAME"

if [[ ! -d "$CLONE/.git" ]]; then
  gate_skip "no local clone at $CLONE"
fi

DEFAULT_BRANCH=$(fm_field "$GATE_DOSSIER_PATH" "default_branch")
[[ -z "$DEFAULT_BRANCH" ]] && DEFAULT_BRANCH="main"

# Modified or added markdown files in this candidate's diff
CHANGED_MD=$(/usr/bin/git -C "$CLONE" diff "$DEFAULT_BRANCH..HEAD" --name-only --diff-filter=AM 2>/dev/null | /usr/bin/grep -E '\.md$' || /usr/bin/echo "")

if [[ -z "$CHANGED_MD" ]]; then
  gate_pass "no modified markdown files in diff"
fi

MISSING=()
while IFS= read -r md; do
  [[ -z "$md" ]] && continue
  [[ ! -f "$CLONE/$md" ]] && continue
  # Pull backtick-wrapped tokens that look like paths (contain / or end in known extensions)
  # Skip URLs, command flags, and shell snippets.
  refs=$(/usr/bin/grep -oE '`[^`]*`' "$CLONE/$md" 2>/dev/null \
    | /usr/bin/sed 's/^`//; s/`$//' \
    | /usr/bin/grep -E '(/|\.(json|yaml|yml|js|ts|py|md|sh|txt|toml|cfg|ini))$' \
    | /usr/bin/grep -vE '^(https?://|/[^/]+/|--|\$)' \
    | /usr/bin/sort -u || true)
  while IFS= read -r ref; do
    [[ -z "$ref" ]] && continue
    # Strip leading ./
    rel="${ref#./}"
    # Allow common patterns that legitimately don't exist in tree (e.g. user-paths,
    # ~/, /etc/, /usr/, /tmp/, absolute build paths, or angle-bracket placeholders)
    case "$rel" in
      ~*|/etc/*|/usr/*|/var/*|/tmp/*|/home/*|/root/*|*\<*\>*|*\{*\}*) continue ;;
    esac
    if [[ ! -e "$CLONE/$rel" ]]; then
      MISSING+=("$md → \`$ref\`")
    fi
  done <<< "$refs"
done <<< "$CHANGED_MD"

if [[ ${#MISSING[@]} -eq 0 ]]; then
  gate_pass "all backtick file references in modified docs resolve"
fi

LIST=$(printf '%s; ' "${MISSING[@]}")
LIST="${LIST%; }"
gate_warn "modified docs reference files not in repo: $LIST" "verify each backtick path resolves; remove or update stale refs before the maintainer asks"
