#!/usr/bin/env bash
# Regression writers must never share the operator's log or gate directory.
# The caller owns its mktemp directory and EXIT cleanup; HOME is unchanged.
contribute_regression_state() {
  local scratch="$1" scripts="$2"
  SYS="$scratch/state"
  export CONTRIBUTE_STATE_DIR="$SYS"
  mkdir -p "$SYS/gates/lib" "$SYS/research"
  : > "$SYS/log.jsonl"
  ln -s "$scripts" "$SYS/bin"
  ln -s "$scripts/gates/lib/preamble.sh" "$SYS/gates/lib/preamble.sh"
}
