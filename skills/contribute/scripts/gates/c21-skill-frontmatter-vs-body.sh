#!/usr/bin/env bash
# Catalog: C21 — SKILL.md allowed-tools that the skill body never actually uses
# Mitigates: "Frontmatter Bluff" anti-pattern. Maintainers reviewing skills cross-check
# the frontmatter against the body and ask why declared tools aren't called
# (kobiton/automate#64 comment 4: `Write` declared, body uses `Edit` exclusively).
source "$(dirname "$0")/lib/preamble.sh"

gate_read_input

REPO_NAME="${GATE_REPO##*/}"
CLONE="$HOME/000-projects/contributing-clanker/$REPO_NAME"

if [[ ! -d "$CLONE/.git" ]]; then
  gate_skip "no local clone at $CLONE"
fi

DEFAULT_BRANCH=$(fm_field "$GATE_DOSSIER_PATH" "default_branch")
[[ -z "$DEFAULT_BRANCH" ]] && DEFAULT_BRANCH="main"

CHANGED_SKILLS=$(/usr/bin/git -C "$CLONE" diff "$DEFAULT_BRANCH..HEAD" --name-only --diff-filter=AM 2>/dev/null | /usr/bin/grep -E '(^|/)SKILL\.md$' || /usr/bin/echo "")

if [[ -z "$CHANGED_SKILLS" ]]; then
  gate_pass "no modified SKILL.md files in diff"
fi

# Top-level tool names we expect to find verbatim in the body when declared.
# Bash sub-patterns (e.g. Bash(npm:*)) are excluded — too many false positives.
KNOWN_TOOLS=(Read Write Edit MultiEdit Glob Grep WebFetch WebSearch TodoWrite Task NotebookEdit)

UNUSED=()
while IFS= read -r skill; do
  [[ -z "$skill" ]] && continue
  [[ ! -f "$CLONE/$skill" ]] && continue

  # Extract the allowed-tools frontmatter block (handle YAML folded scalar form `>-`)
  declared=$(/usr/bin/awk '
    /^---$/ { fm = !fm ? 1 : 2; next }
    fm == 1 && /^allowed-tools:/ { in_at = 1; sub(/^allowed-tools:[[:space:]]*>?-?[[:space:]]*/, ""); print; next }
    fm == 1 && in_at && /^[[:space:]]+/ { print; next }
    fm == 1 && in_at && /^[^[:space:]]/ { in_at = 0 }
  ' "$CLONE/$skill" 2>/dev/null | /usr/bin/tr ',\n' '  ' || true)

  [[ -z "$declared" ]] && continue

  # Body = everything after the closing ---
  body=$(/usr/bin/awk '
    /^---$/ { fm++; next }
    fm >= 2 { print }
  ' "$CLONE/$skill" 2>/dev/null || true)

  for tool in "${KNOWN_TOOLS[@]}"; do
    if /usr/bin/grep -qE "(^|[[:space:],])${tool}([[:space:],]|$)" <<< "$declared"; then
      # Tool declared. Now check body for word-boundary occurrence.
      if ! /usr/bin/grep -qE "\\b${tool}\\b" <<< "$body"; then
        UNUSED+=("$skill: $tool")
      fi
    fi
  done
done <<< "$CHANGED_SKILLS"

if [[ ${#UNUSED[@]} -eq 0 ]]; then
  gate_pass "every declared allowed-tool appears in its SKILL body"
fi

LIST=$(printf '%s; ' "${UNUSED[@]}")
LIST="${LIST%; }"
gate_warn "SKILL.md frontmatter declares tools the body never uses: $LIST" "drop the unused tool(s) from allowed-tools, or add the missing body call — maintainers will ask"
