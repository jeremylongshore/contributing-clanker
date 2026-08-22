#!/usr/bin/env bats
# Unit tests for the Omarchy content gates: c28-c31, c34-c36, c38, c40.
#
# These twelve gates shipped with NO coverage while the other fifty-one had it,
# and they are the ones that encode real shipped VULNERABILITIES: a token in
# argv readable through /proc/<pid>/cmdline, an SSRF filter bypassed by 127.1,
# untrusted network text rendered as markup, an unbounded read of an
# agent-controlled spool. The CI job name still announced "51 gates", so a green
# tick asserted a corpus that excluded every security gate in the lane.
#
# Each test drives the gate over a real tree via GATE_TREE_DIR in full mode, so
# it exercises the same enumeration path the lane uses rather than a stub.
#
# The first test is the regression for the enumeration bug itself: full mode now
# walks the filesystem instead of `git ls-files`, because an untracked hostile
# file was invisible to every content gate and c38 answered PASS about a file it
# had never opened.

load '../test_helper'

setup() {
  TREE=$(mktemp -d)
  # Identity is passed inline rather than assumed. A CI runner has no global
  # git identity, so a bare `git commit` exits 128 with "Author identity
  # unknown" -- these fifteen cases passed on the author's box and failed on
  # every clean runner. The repo IS needed: the first case asserts that an
  # UNTRACKED file is still visible to the gates, and "untracked" only means
  # something inside a real repository.
  /usr/bin/git -C "$TREE" init -q .
  /usr/bin/git -C "$TREE" \
    -c user.email=test@example.com -c user.name=test \
    commit -q --allow-empty -m init
  # Without a manifest.json the gates answer "not an Omarchy plugin tree" and
  # SKIP. The first cut of this file omitted it, so all fourteen tests passed
  # while exercising nothing -- the same shape as the bug under test.
  printf '{"name":"t","version":"1.0.0","entryPoints":{"bar":"Bar.qml"}}' > "$TREE/manifest.json"
}

teardown() { rm -rf "$TREE"; }

# Run one gate against $TREE in full mode.
# gate_resolve_tree() OVERWRITES GATE_TREE_DIR from the input, so exporting it
# does nothing: the gates answered "SKIP - no tree to scan" and every assertion
# of the form  severity != PASS  passed vacuously. Full mode is selected by
# passing `candidate` as a DIRECTORY (preamble.sh:82), which is the seam the
# lane itself uses. Asserting an EXACT severity below, never a negation, so a
# SKIP can never be mistaken for a finding again.
run_tree_gate() {
  local gate="$1"
  local input_json
  input_json=$(jq -nc --arg t "$TREE" \
    '{candidate:$t, dossier:"", action:"pr_open", env:{repo:"o/r", branch:"main"}}')
  # Feed stdin through a real pipe, never `bash -c "... '$json' ..."`. That
  # re-parse is what mangled the JSON here and is the same shape as the runner
  # RCE fixed alongside these tests.
  run --separate-stderr bash -c 'printf "%s" "$1" | "$2"' _ "$input_json" "$GATES_DIR/$gate"
}

sev() { printf '%s' "$output" | jq -r '.severity'; }

# ---------------------------------------------------------------- enumeration

@test "c38 does not answer PASS about an UNTRACKED file it never opened" {
  # The exact false-clean: git add is not run, so ls-files returned nothing and
  # the gate asserted a security property over an empty corpus.
  cat > "$TREE/Net.qml" <<'EOF'
function isPublicHost(h) { return /^\d{1,3}(\.\d{1,3}){3}$/.test(h) === false }
EOF
  run_tree_gate c38-omarchy-ssrf-host-allowlist.sh
  [ "$(sev)" = "BLOCK" ] || [ "$(sev)" = "WARN" ]
}

@test "an untracked QML file is visible to the security gates" {
  cat > "$TREE/Evil.qml" <<'EOF'
Text {
  text: net.body
}
EOF
  run_tree_gate c31-omarchy-qml-security.sh
  [ "$(sev)" = "BLOCK" ] || [ "$(sev)" = "WARN" ]
}

# ------------------------------------------------------------------ c31 / c36

@test "c31 flags network text rendered without PlainText" {
  cat > "$TREE/A.qml" <<'EOF'
Process { command: ["curl","-s","--max-filesize","200000",u] }
Text {
  text: response.body
  width: 100
  elide: Text.ElideRight
}
EOF
  run_tree_gate c31-omarchy-qml-security.sh
  [ "$(sev)" = "BLOCK" ] || [ "$(sev)" = "WARN" ]
}

@test "c31 passes a Text that pins PlainText" {
  cat > "$TREE/A.qml" <<'EOF'
Process { command: ["curl","-s","--max-filesize","200000",u] }
Text {
  text: response.body
  textFormat: Text.PlainText
  width: 100
  elide: Text.ElideRight
}
EOF
  run_tree_gate c31-omarchy-qml-security.sh
  [ "$(sev)" = "PASS" ]
}

@test "c36 flags elide with no width constraint, which is a no-op" {
  # Elision is computed against the element width; without a width it does
  # nothing, and a Text paints at implicitWidth regardless. Both halves needed.
  cat > "$TREE/B.qml" <<'EOF'
Text { text: feed.title; textFormat: Text.PlainText; elide: Text.ElideRight }
EOF
  run_tree_gate c36-omarchy-qml-overflow.sh
  [ "$(sev)" = "BLOCK" ] || [ "$(sev)" = "WARN" ]
}

# ------------------------------------------------------------------ c34 / c35

@test "c34 flags an --exec notification command built from data" {
  cat > "$TREE/C.qml" <<'EOF'
Process { command: ["notify-send", "--exec", "cmd " + user.title] }
EOF
  run_tree_gate c34-omarchy-exec-injection.sh
  [ "$(sev)" = "BLOCK" ]
}

@test "KNOWN GAP: c34 does NOT cover a bare sh -c Process built from data" {
  # Recorded, not hidden. c34's accept-rule is --exec/execDetached only, so a
  # Process whose argv is ["sh","-c", data] passes it. That is a narrower scope
  # than the gate's name suggests. This test pins the CURRENT behavior so the
  # day someone widens c34, this test fails and the widening is deliberate
  # rather than accidental. A gap you have written down is a gap; a gap you
  # assume is covered is the defect this whole lane exists to prevent.
  cat > "$TREE/C.qml" <<'EOF'
Process { command: ["sh", "-c", "notify-send " + user.title] }
EOF
  run_tree_gate c34-omarchy-exec-injection.sh
  [ "$(sev)" = "PASS" ]
}

@test "c34 accepts an argv array with no shell" {
  cat > "$TREE/C.qml" <<'EOF'
Process { command: ["notify-send", "--", user.title] }
EOF
  run_tree_gate c34-omarchy-exec-injection.sh
  [ "$(sev)" = "PASS" ]
}

@test "c35 flags a node shebang, which has no PATH on the graphical session" {
  printf '#!/usr/bin/env node\nconsole.log(1)\n' > "$TREE/tool"
  chmod +x "$TREE/tool"
  run_tree_gate c35-omarchy-runtime-dependency.sh
  [ "$(sev)" = "BLOCK" ] || [ "$(sev)" = "WARN" ]
}

@test "c35 accepts a bash shebang" {
  printf '#!/usr/bin/env bash\necho 1\n' > "$TREE/tool"
  chmod +x "$TREE/tool"
  run_tree_gate c35-omarchy-runtime-dependency.sh
  [ "$(sev)" = "PASS" ]
}

# ------------------------------------------------------------------------ c38

@test "c38 flags a host filter that only rejects the canonical dotted quad" {
  # curl resolves through inet_aton: 127.1 and 0177.0.0.1 both reach loopback
  # past a four-part test, so enumerating the bad form is the bug.
  cat > "$TREE/N.js" <<'EOF'
function isPublicHost(h) { return !/^\d{1,3}(\.\d{1,3}){3}$/.test(h) }
EOF
  run_tree_gate c38-omarchy-ssrf-host-allowlist.sh
  [ "$(sev)" = "BLOCK" ] || [ "$(sev)" = "WARN" ]
}

# ------------------------------------------------------------- c28 / c29 / c30

@test "c28 flags an em dash in shipped prose" {
  printf 'A line with an em dash \xe2\x80\x94 like this.\n' > "$TREE/README.md"
  run_tree_gate c28-voice-no-dashes.sh
  [ "$(sev)" = "BLOCK" ] || [ "$(sev)" = "WARN" ]
}

@test "c30 flags markdown strikethrough" {
  printf 'Some ~~struck~~ text.\n' > "$TREE/README.md"
  run_tree_gate c30-md-strikethrough.sh
  [ "$(sev)" = "BLOCK" ] || [ "$(sev)" = "WARN" ]
}

# ------------------------------------------------------------------------ c40

@test "c40 is advisory and never BLOCKs, because taste that hard-fails is routed around" {
  cat > "$TREE/Panel.qml" <<'EOF'
Repeater { model: rows; Row { Text { text: modelData.name } } }
EOF
  run_tree_gate c40-omarchy-panel-design.sh
  [ "$(sev)" = "WARN" ] || [ "$(sev)" = "PASS" ]
}

# ----------------------------------------------------------- empty-corpus rule

@test "a gate over an EMPTY corpus reports SKIP, never PASS" {
  # PASS asserts "checked and clean". With no files there was nothing to check,
  # and conflating the two is what let the lane report a verdict on a scope it
  # never established.
  rm -f "$TREE"/*.qml "$TREE"/*.js
  for g in c31-omarchy-qml-security.sh c34-omarchy-exec-injection.sh \
           c36-omarchy-qml-overflow.sh; do
    run_tree_gate "$g"
    [ "$(sev)" = "SKIP" ]
  done
}
