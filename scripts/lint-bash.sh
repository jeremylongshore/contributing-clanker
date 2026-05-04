#!/usr/bin/env bash
# lint-bash.sh — run shellcheck against the contributing-clanker bash scripts.
#
# The skill is vendored at <repo>/skills/contribute/. SCRIPTS_DIR resolves
# relative to this script so it works on any clone, regardless of whether
# the user has installed the skill via bin/install.sh.
#
# Excluded checks (with rationale):
#   SC1091 — source paths resolved at runtime via $(dirname "$0") /
#            ${BASH_SOURCE[0]}; shellcheck can't follow them statically.
#            The preamble lib is at scripts/gates/lib/preamble.sh and is
#            sourced correctly at runtime; this is a known false positive.
#   SC2317 — gate_pass / gate_warn / gate_block / gate_skip / gate_inform
#            helpers all exit. Shellcheck doesn't know they exit, flags
#            trailing logic as unreachable. Intentional pattern.
#
# Exit code: shellcheck's. 0 = clean, non-zero = findings.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPTS_DIR="${CONTRIB_SCRIPTS_DIR:-$REPO_ROOT/skills/contribute/scripts}"

if [[ ! -d "$SCRIPTS_DIR" ]]; then
  echo "scripts dir not found: $SCRIPTS_DIR" >&2
  exit 1
fi

if ! command -v shellcheck >/dev/null 2>&1; then
  echo "shellcheck not installed. Install with: sudo apt-get install -y shellcheck" >&2
  exit 1
fi

shellcheck \
  --exclude=SC1091,SC2317 \
  --severity=warning \
  "$SCRIPTS_DIR"/*.sh \
  "$SCRIPTS_DIR"/gates/*.sh \
  "$SCRIPTS_DIR"/gates/lib/*.sh
