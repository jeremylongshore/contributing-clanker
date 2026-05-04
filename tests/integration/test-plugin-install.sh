#!/usr/bin/env bash
# test-plugin-install.sh — end-to-end integration test of the plugin install flow.
#
# Simulates the post-release install path:
#   1. Synthesize a "fake plugin directory" by rsync'ing skills/contribute/ and
#      copying release/hooks/{install,uninstall}.sh — the same operations the
#      release script would perform on tag.
#   2. Run install.sh against a tmp HOME, asserting:
#      - runtime tree exists at all expected subdirs
#      - 41 gate scripts copied + executable
#      - 10 orchestrator/reporter scripts copied + executable
#      - lib/preamble.sh copied
#      - profile.md template written
#   3. Run uninstall.sh, asserting:
#      - all 51 plugin-shipped scripts removed
#      - user data preserved (profile.md, candidates/, research/)
#   4. Cleanup
#
# Exit 0 on full pass, exit non-zero with the failed assertion on first failure.
#
# This test does NOT need Docker — it uses a tmp HOME via CONTRIBUTE_SYSTEM_DIR.
# A future iteration can add a Docker variant for fully isolated environments.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_BASE=$(/usr/bin/mktemp -d -t contributing-clanker-plugin-test.XXXXXX)
FAKE_PLUGIN_DIR="$TMP_BASE/plugin"
FAKE_RUNTIME_DIR="$TMP_BASE/runtime"

PASS=0
FAIL=0

cleanup() {
  /usr/bin/rm -rf "$TMP_BASE"
}
trap cleanup EXIT

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    printf '  ✓ %s (%s)\n' "$label" "$actual"
    PASS=$((PASS + 1))
  else
    printf '  ✗ %s — expected %s, got %s\n' "$label" "$expected" "$actual" >&2
    FAIL=$((FAIL + 1))
  fi
}

assert_file_exists() {
  local label="$1" path="$2"
  if [[ -f "$path" ]]; then
    printf '  ✓ %s\n' "$label"
    PASS=$((PASS + 1))
  else
    printf '  ✗ %s — %s missing\n' "$label" "$path" >&2
    FAIL=$((FAIL + 1))
  fi
}

assert_executable() {
  local label="$1" path="$2"
  if [[ -x "$path" ]]; then
    printf '  ✓ %s\n' "$label"
    PASS=$((PASS + 1))
  else
    printf '  ✗ %s — %s not executable\n' "$label" "$path" >&2
    FAIL=$((FAIL + 1))
  fi
}

printf '\n=== test-plugin-install.sh ===\n'
printf 'tmp:    %s\n' "$TMP_BASE"
printf 'plugin: %s\n' "$FAKE_PLUGIN_DIR"
printf 'runtime: %s\n\n' "$FAKE_RUNTIME_DIR"

# Step 1: synthesize fake plugin dir
printf '[1/4] Synthesizing fake plugin directory\n'
/usr/bin/mkdir -p "$FAKE_PLUGIN_DIR/skills/contribute" "$FAKE_PLUGIN_DIR/hooks"
/usr/bin/rsync -a --exclude='.DS_Store' "$REPO_ROOT/skills/contribute/" "$FAKE_PLUGIN_DIR/skills/contribute/"
/usr/bin/cp "$REPO_ROOT/release/hooks/install.sh" "$FAKE_PLUGIN_DIR/hooks/install.sh"
/usr/bin/cp "$REPO_ROOT/release/hooks/uninstall.sh" "$FAKE_PLUGIN_DIR/hooks/uninstall.sh"
/usr/bin/chmod +x "$FAKE_PLUGIN_DIR/hooks/install.sh" "$FAKE_PLUGIN_DIR/hooks/uninstall.sh"

PLUGIN_GATE_COUNT=$(/usr/bin/find "$FAKE_PLUGIN_DIR/skills/contribute/scripts/gates" -maxdepth 1 -name '*.sh' -type f | /usr/bin/wc -l)
PLUGIN_SCRIPT_COUNT=$(/usr/bin/find "$FAKE_PLUGIN_DIR/skills/contribute/scripts" -maxdepth 1 -name '*.sh' -type f | /usr/bin/wc -l)
assert_eq "fake plugin: gate count" 41 "$PLUGIN_GATE_COUNT"
assert_eq "fake plugin: script count" 10 "$PLUGIN_SCRIPT_COUNT"
assert_file_exists "fake plugin: lib/preamble.sh" "$FAKE_PLUGIN_DIR/skills/contribute/scripts/gates/lib/preamble.sh"
assert_executable "fake plugin: hooks/install.sh executable" "$FAKE_PLUGIN_DIR/hooks/install.sh"

# Step 2: run install.sh against the fake plugin
printf '\n[2/4] Running install.sh\n'
CLAUDE_PLUGIN_ROOT="$FAKE_PLUGIN_DIR" \
  CONTRIBUTE_SYSTEM_DIR="$FAKE_RUNTIME_DIR" \
  bash "$FAKE_PLUGIN_DIR/hooks/install.sh" >/dev/null

# Assert runtime tree
for sub in candidates research gates gates/lib bin check-runs test-logs; do
  if [[ -d "$FAKE_RUNTIME_DIR/$sub" ]]; then
    PASS=$((PASS + 1))
    printf '  ✓ runtime: %s/ exists\n' "$sub"
  else
    FAIL=$((FAIL + 1))
    printf '  ✗ runtime: %s/ missing\n' "$sub" >&2
  fi
done

# Assert script counts copied to runtime
RUNTIME_GATE_COUNT=$(/usr/bin/find "$FAKE_RUNTIME_DIR/gates" -maxdepth 1 -name '*.sh' -type f | /usr/bin/wc -l)
RUNTIME_SCRIPT_COUNT=$(/usr/bin/find "$FAKE_RUNTIME_DIR/bin" -maxdepth 1 -name '*.sh' -type f | /usr/bin/wc -l)
assert_eq "runtime: gate count" 41 "$RUNTIME_GATE_COUNT"
assert_eq "runtime: script count" 10 "$RUNTIME_SCRIPT_COUNT"
assert_file_exists "runtime: lib/preamble.sh" "$FAKE_RUNTIME_DIR/gates/lib/preamble.sh"
assert_file_exists "runtime: profile.md template" "$FAKE_RUNTIME_DIR/profile.md"

# Assert a few representative gates are executable
for gate in a01-already-assigned.sh c12-ci-green.sh g01-no-vendored-edits.sh; do
  assert_executable "runtime: gates/$gate executable" "$FAKE_RUNTIME_DIR/gates/$gate"
done

# Step 3: simulate user data added between install and uninstall
printf '\n[3/4] Simulating user data\n'
USER_PROFILE="$FAKE_RUNTIME_DIR/profile.md"
/usr/bin/cp "$REPO_ROOT/tests/fixtures/candidates/clean-open.md" "$FAKE_RUNTIME_DIR/candidates/example-org__example-repo__issue42.md"
echo '{"event":"test_marker","ts":"2026-01-01T00:00:00Z"}' > "$FAKE_RUNTIME_DIR/log.jsonl"
/usr/bin/cat > "$FAKE_RUNTIME_DIR/research/example-org__example-repo.md" <<'EOF'
---
repo: example-org/example-repo
last_refreshed: 2026-05-03
---
# example dossier
EOF

# Modify profile.md so we can verify it's preserved
echo "# user-edited" >> "$USER_PROFILE"
EXPECTED_PROFILE_HASH=$(/usr/bin/sha256sum "$USER_PROFILE" | /usr/bin/cut -d' ' -f1)

# Step 4: run uninstall.sh, verify data preserved
printf '\n[4/4] Running uninstall.sh + verifying preservation\n'
CONTRIBUTE_SYSTEM_DIR="$FAKE_RUNTIME_DIR" \
  bash "$FAKE_PLUGIN_DIR/hooks/uninstall.sh" >/dev/null

POST_GATE_COUNT=$(/usr/bin/find "$FAKE_RUNTIME_DIR/gates" -maxdepth 1 -name '*.sh' -type f 2>/dev/null | /usr/bin/wc -l)
POST_SCRIPT_COUNT=$(/usr/bin/find "$FAKE_RUNTIME_DIR/bin" -maxdepth 1 -name '*.sh' -type f 2>/dev/null | /usr/bin/wc -l)
assert_eq "post-uninstall: gates removed" 0 "$POST_GATE_COUNT"
assert_eq "post-uninstall: scripts removed" 0 "$POST_SCRIPT_COUNT"

# Verify lib/preamble.sh removed
if [[ -f "$FAKE_RUNTIME_DIR/gates/lib/preamble.sh" ]]; then
  FAIL=$((FAIL + 1))
  printf '  ✗ post-uninstall: lib/preamble.sh should be removed\n' >&2
else
  PASS=$((PASS + 1))
  printf '  ✓ post-uninstall: lib/preamble.sh removed\n'
fi

# User data should be intact
assert_file_exists "post-uninstall: profile.md preserved" "$USER_PROFILE"
ACTUAL_PROFILE_HASH=$(/usr/bin/sha256sum "$USER_PROFILE" | /usr/bin/cut -d' ' -f1)
assert_eq "post-uninstall: profile.md unchanged" "$EXPECTED_PROFILE_HASH" "$ACTUAL_PROFILE_HASH"
assert_file_exists "post-uninstall: candidate preserved" "$FAKE_RUNTIME_DIR/candidates/example-org__example-repo__issue42.md"
assert_file_exists "post-uninstall: dossier preserved" "$FAKE_RUNTIME_DIR/research/example-org__example-repo.md"
assert_file_exists "post-uninstall: log.jsonl preserved" "$FAKE_RUNTIME_DIR/log.jsonl"

# Summary
printf '\n=== summary ===\n'
printf 'PASS: %d\n' "$PASS"
printf 'FAIL: %d\n' "$FAIL"

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
