#!/usr/bin/env bash
# release-plugin.sh — sync this repo's skill bundle into the marketplace plugin.
#
# Usage:
#   bin/release-plugin.sh <version>           release a new version (creates tag, commits to plugin repo)
#   bin/release-plugin.sh <version> --dry-run preview what would change without writing anything
#   bin/release-plugin.sh --help              show this header
#
# Example:
#   bin/release-plugin.sh 0.1.0
#
# What it does:
#   1. Validates: arg is semver, working tree clean, on master, tag v<version> doesn't exist
#   2. rsync --delete syncs skills/contribute/ → <plugin-dir>/skills/contribute/
#   3. Copies release/hooks/{install,uninstall}.sh → <plugin-dir>/hooks/
#   4. Updates <plugin-dir>/plugin.json#version to <version>
#   5. Creates an annotated tag v<version> on this repo
#   6. In the plugin repo: branch release/contributing-clanker-v<version>,
#      commits the synced state with a release message
#   7. Prints the gh pr create command to open the marketplace PR
#
# Idempotent on re-run for the same version: if the tag already exists, exits
# with a clear message. The plugin repo branch is reused if present (commits
# stack up on it cleanly thanks to rsync --delete).
#
# Source-of-truth: this repo's skills/contribute/. The plugin directory is a
# build artifact — manual edits there are reverted on the next sync.

set -euo pipefail

PLUGIN_REPO_DIR="${CONTRIB_PLUGIN_REPO_DIR:-$HOME/000-projects/claude-code-plugins}"
PLUGIN_SUBDIR="plugins/community/contributing-clanker"
PLUGIN_DIR="$PLUGIN_REPO_DIR/$PLUGIN_SUBDIR"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DRY_RUN=0
VERSION=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      /usr/bin/sed -n '2,32p' "$0"
      exit 0
      ;;
    --dry-run)
      DRY_RUN=1
      ;;
    *)
      if [[ -z "$VERSION" ]]; then
        VERSION="$1"
      else
        printf 'unknown arg: %s\n' "$1" >&2
        exit 2
      fi
      ;;
  esac
  shift
done

if [[ -z "$VERSION" ]]; then
  printf 'error: version arg required (e.g., 0.1.0)\n' >&2
  printf '       %s --help for usage\n' "$0" >&2
  exit 2
fi

# Semver validation (simple X.Y.Z[-pre])
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?$ ]]; then
  printf 'error: version "%s" is not semver (expected X.Y.Z or X.Y.Z-prerelease)\n' "$VERSION" >&2
  exit 2
fi

TAG="v$VERSION"
PLUGIN_BRANCH="release/contributing-clanker-$TAG"

prefix=""
if [[ "$DRY_RUN" -eq 1 ]]; then
  prefix="[dry-run] "
fi

printf '\n%sReleasing contributing-clanker plugin %s\n' "$prefix" "$TAG"
printf '%s  source: %s\n'       "$prefix" "$REPO_ROOT"
printf '%s  plugin: %s\n\n'     "$prefix" "$PLUGIN_DIR"

# 1. Validation
cd "$REPO_ROOT"

if ! /usr/bin/git diff --quiet || ! /usr/bin/git diff --cached --quiet; then
  printf 'error: working tree has uncommitted changes — commit or stash first\n' >&2
  exit 1
fi

CURRENT_BRANCH=$(/usr/bin/git branch --show-current)
if [[ "$CURRENT_BRANCH" != "master" && "$DRY_RUN" -eq 0 ]]; then
  printf 'error: not on master (currently on %s) — release from master only\n' "$CURRENT_BRANCH" >&2
  printf '       (use --dry-run to preview from a feature branch)\n' >&2
  exit 1
fi

if /usr/bin/git rev-parse "$TAG" >/dev/null 2>&1; then
  printf 'error: tag %s already exists in %s\n' "$TAG" "$REPO_ROOT" >&2
  printf '       bump the version arg or delete the tag (git tag -d %s) and retry\n' "$TAG" >&2
  exit 1
fi

if [[ ! -d "$PLUGIN_DIR" ]]; then
  printf 'error: plugin directory not found at %s\n' "$PLUGIN_DIR" >&2
  printf '       expected the marketplace repo to be cloned at %s\n' "$PLUGIN_REPO_DIR" >&2
  printf '       override with CONTRIB_PLUGIN_REPO_DIR=<path>\n' >&2
  exit 1
fi

if [[ ! -f "$PLUGIN_DIR/plugin.json" ]]; then
  printf 'error: %s/plugin.json missing — run yvb.1 (scaffold) first\n' "$PLUGIN_DIR" >&2
  exit 1
fi

printf '%s  ✓ working tree clean\n' "$prefix"
if [[ "$CURRENT_BRANCH" == "master" ]]; then
  printf '%s  ✓ on master\n' "$prefix"
else
  printf '%s  ⚠ on %s (master enforced only on real release; dry-run bypassed)\n' "$prefix" "$CURRENT_BRANCH"
fi
printf '%s  ✓ tag %s does not exist\n'      "$prefix" "$TAG"
printf '%s  ✓ plugin dir reachable\n\n'     "$prefix"

# 2. rsync skill bundle
SRC="$REPO_ROOT/skills/contribute/"
DEST="$PLUGIN_DIR/skills/contribute/"

printf '%s  syncing skill bundle:\n'        "$prefix"
printf '%s    %s → %s\n'                    "$prefix" "$SRC" "$DEST"

RSYNC_OPTS=(-a --delete --exclude='.DS_Store')
if [[ "$DRY_RUN" -eq 1 ]]; then
  RSYNC_OPTS+=(--dry-run --itemize-changes)
fi

/usr/bin/mkdir -p "$DEST" 2>/dev/null || true
/usr/bin/rsync "${RSYNC_OPTS[@]}" "$SRC" "$DEST"

# 3. Copy release hooks
HOOKS_DEST="$PLUGIN_DIR/hooks"
printf '\n%s  copying release hooks → %s\n' "$prefix" "$HOOKS_DEST"
if [[ "$DRY_RUN" -eq 0 ]]; then
  /usr/bin/mkdir -p "$HOOKS_DEST"
  /usr/bin/cp -f "$REPO_ROOT/release/hooks/install.sh" "$HOOKS_DEST/install.sh"
  /usr/bin/cp -f "$REPO_ROOT/release/hooks/uninstall.sh" "$HOOKS_DEST/uninstall.sh"
  /usr/bin/chmod +x "$HOOKS_DEST/install.sh" "$HOOKS_DEST/uninstall.sh"
fi

# 4. Update plugin.json version
printf '\n%s  updating plugin.json#version → %s\n' "$prefix" "$VERSION"
if [[ "$DRY_RUN" -eq 0 ]]; then
  /usr/bin/python3 - "$PLUGIN_DIR/plugin.json" "$VERSION" <<'PYEOF'
import json
import sys

path, version = sys.argv[1], sys.argv[2]
with open(path) as f:
    data = json.load(f)
data["version"] = version
with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PYEOF
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  printf '\n[dry-run] No tags created, no commits made. Re-run without --dry-run to release.\n\n'
  exit 0
fi

# 5. Tag this repo
printf '\n  tagging %s in %s\n' "$TAG" "$REPO_ROOT"
/usr/bin/git tag -a "$TAG" -m "contributing-clanker $TAG"

# 6. Commit on a release branch in the plugin repo
printf '\n  committing to plugin repo on branch %s\n' "$PLUGIN_BRANCH"
cd "$PLUGIN_REPO_DIR"

if /usr/bin/git rev-parse --verify "$PLUGIN_BRANCH" >/dev/null 2>&1; then
  /usr/bin/git checkout "$PLUGIN_BRANCH"
else
  /usr/bin/git checkout -b "$PLUGIN_BRANCH"
fi

/usr/bin/git add "$PLUGIN_SUBDIR"

if /usr/bin/git diff --cached --quiet; then
  printf '  (no changes to commit in plugin repo — already up to date)\n'
else
  /usr/bin/git commit -m "$(/usr/bin/printf 'release(community/contributing-clanker): %s\n\nSync from contributing-clanker %s\nSource: https://github.com/jeremylongshore/contributing-clanker/releases/tag/%s\n\njeremy made me do it\n-claude\n' "$TAG" "$TAG" "$TAG")"
fi

printf '\n  Done.\n\n'
printf '  Next steps:\n'
printf '    1. Push the source repo tag:\n'
printf '         cd %s && git push origin master --tags\n\n' "$REPO_ROOT"
printf '    2. Push the plugin repo branch + open the marketplace PR:\n'
printf '         cd %s && git push -u origin %s\n' "$PLUGIN_REPO_DIR" "$PLUGIN_BRANCH"
printf "         gh pr create --repo jeremylongshore/claude-code-plugins \\\\\n"
printf "           --title 'release(community/contributing-clanker): %s' \\\\\n" "$TAG"
printf "           --body 'Sync of contributing-clanker %s.'\n\n" "$TAG"
