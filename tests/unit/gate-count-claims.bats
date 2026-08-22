#!/usr/bin/env bats
# The repo's own claims about how many gates it has must match how many it has.
#
# CI announced "51 gates" for months while the lane carried 63, and the twelve
# it did not count were the Omarchy security gates -- the ones encoding a token
# in argv, an SSRF bypass, and unbounded reads. A green tick therefore asserted
# a corpus that excluded every security gate in the lane.
#
# This is the same defect as SKIP-counted-as-PASS, one layer up: a number that
# describes a scope nobody re-derived. Deriving it in a test means the claim
# fails loudly the next time someone adds a gate and forgets the prose.

load 'test_helper'

@test "no file claims a gate count other than the number of gates on disk" {
  # First cut just grepped for the right number and passed while README also
  # carried a stale one elsewhere in the same file -- an assertion satisfied by
  # a match anywhere is not an assertion about the document. This asserts the
  # ABSENCE of any wrong count, which is the claim actually being made.
  local root count bad
  root="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  count=$(ls "$root"/skills/contribute/scripts/gates/*.sh | wc -l | tr -d ' ')

  for f in "$root/.github/workflows/ci.yml" "$root/README.md"; do
    grep -q "${count} gate" "$f" || { echo "$f never claims ${count} gates"; return 1; }
    bad=$(grep -oE '[0-9]+[- ]gate' "$f" | grep -oE '^[0-9]+' | grep -v "^${count}$" || true)
    if [ -n "$bad" ]; then
      echo "$f claims a stale gate count: $bad (on disk: ${count})"
      return 1
    fi
  done
}
