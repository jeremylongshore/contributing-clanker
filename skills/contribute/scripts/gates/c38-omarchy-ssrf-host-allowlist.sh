#!/usr/bin/env bash
# Catalog: C38 — an SSRF host filter that only knows the canonical dotted quad.
#
# Mitigates a defect class that escaped review TWICE on one submission. The
# Listening Post feed importer guarded its curl call with a public-host test
# whose IPv4 rejection was /^\d{1,3}(\.\d{1,3}){3}$/ — four parts, decimal
# digits only. That is not what resolves the request. curl resolves through
# inet_aton, which takes one to four parts and reads a leading 0 as octal and
# 0x as hex, so all of these read as public NAMES and dialled loopback:
#
#   https://127.1/feed         two parts
#   https://0177.0.0.1/feed    octal
#   https://0x7f.1/feed        hex
#
# The marketplace maintainer found the first two after an earlier fix for a
# userinfo bypass in the same function; the third turned up while fixing those.
#
# The lesson is not "add three more patterns". Enumerating bad forms is what
# failed both times. A host allowlist has to be built the other way round: a
# public host is a NAME, so if every dot-separated label is numeric in some
# base it is an address literal whatever its shape, and it is out.
#
# So this gate flags the narrow-quad regex itself, in any file that also
# reaches the network. It is a shape check, not a proof of exploitability —
# a plugin with no host filter at all is a different finding and not this one.
source "$(dirname "$0")/lib/preamble.sh"

gate_read_input
gate_resolve_tree

if [[ -z "$GATE_TREE_DIR" ]]; then
  gate_skip "no tree to scan"
fi
if [[ ! -f "$GATE_TREE_DIR/manifest.json" ]]; then
  gate_skip "not an Omarchy plugin tree"
fi

HITS=""
while IFS= read -r REL; do
  [[ -n "$REL" ]] || continue
  FINDINGS=$(GATE_FILE="$GATE_TREE_DIR/$REL" GATE_REL="$REL" /usr/bin/python3 <<'PY'
import os, re
path = os.environ["GATE_FILE"]
rel = os.environ["GATE_REL"]
try:
    src = open(path, encoding="utf-8", errors="replace").read()
except OSError:
    raise SystemExit(0)

# Only files that actually reach the network can have this bug. A test file
# that PINS the bad forms as regressions is the fix, not the defect.
# ...or a file that VALIDATES a host without fetching itself. The recommended
# architecture (see fix_hint) puts isPublicHost in a pure module and the fetch
# in the Service, so keying only on network tokens would skip the validator on
# exactly the plugins that separated their concerns properly. Caught when the
# gate's own unit test could not make it fire on a standalone host check.
NETWORK = r"\bcurl\b|XMLHttpRequest|\bfetch\s*\(|Process\s*\{"
VALIDATOR = r"isPublicHost|allowedHost|hostAllow|\bhostname\b|\bhost\s*\)"
if not (re.search(NETWORK, src) or re.search(VALIDATOR, src)):
    raise SystemExit(0)

out = []
for i, line in enumerate(src.split("\n"), 1):
    if line.lstrip().startswith(("//", "#", "*")):
        continue
    # The narrow quad: 1-3 digits, repeated exactly 3 more times. Written as
    # \d or [0-9], with or without anchors.
    if re.search(r"(\\d|\[0-9\])\{1,3\}.{0,12}\{3\}", line):
        out.append(f"{rel}:{i} IPv4 test matches only the canonical dotted quad")

for f in out[:6]:
    print(f)
PY
)
  [[ -n "$FINDINGS" ]] && HITS+="$FINDINGS"$'\n'
done < <(gate_tree_files '\.(qml|js|mjs|ts|py|sh)$')

HITS="${HITS%$'\n'}"

if [[ -n "$HITS" ]]; then
  COUNT=$(/usr/bin/printf '%s\n' "$HITS" | /usr/bin/grep -c . || true)
  SUMMARY=$(/usr/bin/printf '%s' "$HITS" | /usr/bin/tr '\n' ';' | /usr/bin/cut -c1-320)
  gate_block "SSRF host filter recognises only the canonical dotted quad ($COUNT): $SUMMARY" \
    "curl resolves via inet_aton, which accepts 1-4 parts plus octal (0177) and hex (0x7f) — so 127.1, 0177.0.0.1 and 0x7f.1 all pass a /\\d{1,3}(\\.\\d{1,3}){3}/ test and reach loopback. Do not add more patterns; invert the rule. Split the host on '.', reject any empty label, and reject the host if EVERY label matches ^(0[xX][0-9a-fA-F]+|[0-9]+)$ — that is an address literal in any base. Keep the single-label rejection so bare 'localhost' still fails. Reference fix: omarchy-listening-post-entry Model.js isPublicHost."
fi

gate_pass "no narrow-dotted-quad host filter found"
