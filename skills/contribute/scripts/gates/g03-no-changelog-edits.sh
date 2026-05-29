#!/usr/bin/env bash
# Catalog: G3 — manual CHANGELOG edits in a repo that auto-generates the changelog
# Mitigates: clobbers release tooling, gets reverted on next release, looks careless.
source "$(dirname "$0")/lib/preamble.sh"

gate_read_input

if [[ -z "$GATE_DOSSIER_PATH" || ! -f "$GATE_DOSSIER_PATH" ]]; then
  gate_skip "no dossier — cannot determine auto_changelog policy"
fi

AUTO=$(fm_field "$GATE_DOSSIER_PATH" "auto_changelog")

REPO_NAME="${GATE_REPO##*/}"
CLONE="$HOME/000-projects/contributing-clanker/$REPO_NAME"

if [[ ! -d "$CLONE/.git" ]]; then
  gate_skip "no local clone at $CLONE"
fi

# Secondary trigger: even if dossier doesn't declare auto_changelog,
# many repos enforce CHANGELOG shape via a release script that fails
# CI on the wrong top-entry shape (e.g. kobiton/automate's
# scripts/sync-version.js --check requires `## X.Y.Z` at the top).
# Detect such scripts as a release-time CHANGELOG flow signal.
HAS_VERSION_SCRIPT=""
if [[ -d "$CLONE/scripts" ]]; then
  if /usr/bin/find "$CLONE/scripts" -maxdepth 2 -type f \( -name 'sync-version*' -o -name 'release*' -o -name 'changelog-check*' \) -print -quit 2>/dev/null | /usr/bin/grep -q .; then
    HAS_VERSION_SCRIPT="yes"
  fi
fi

if [[ "$AUTO" != "true" && -z "$HAS_VERSION_SCRIPT" ]]; then
  gate_skip "dossier auto_changelog is not true and no release-time CHANGELOG script detected"
fi

DEFAULT_BRANCH=$(fm_field "$GATE_DOSSIER_PATH" "default_branch")
[[ -z "$DEFAULT_BRANCH" ]] && DEFAULT_BRANCH="main"

CHANGED=$(/usr/bin/git -C "$CLONE" diff "$DEFAULT_BRANCH..HEAD" --name-only 2>/dev/null || /usr/bin/echo "")

# Match CHANGELOG.md at root or in any subdir (case-sensitive)
HITS=$(/usr/bin/printf '%s\n' "$CHANGED" | /usr/bin/grep -E '(^|/)CHANGELOG\.md$' || /usr/bin/echo "")

if [[ -z "$HITS" ]]; then
  gate_pass "no CHANGELOG.md edits in diff"
fi

LIST=$(/usr/bin/printf '%s' "$HITS" | /usr/bin/tr '\n' ',' | /usr/bin/sed 's/,$//')
if [[ -n "$HAS_VERSION_SCRIPT" && "$AUTO" != "true" ]]; then
  gate_warn "diff edits CHANGELOG.md ($LIST) and repo has a release-time CHANGELOG script (scripts/sync-version* or similar)" "this repo manages CHANGELOG at release cut via a sync script; manual entries (esp. ## Unreleased) typically fail the script's --check mode — let the maintainer collect entries at release time"
else
  gate_warn "diff edits CHANGELOG.md ($LIST) but repo auto-generates changelog" "this repo auto-generates CHANGELOG; let the release tooling write it"
fi
