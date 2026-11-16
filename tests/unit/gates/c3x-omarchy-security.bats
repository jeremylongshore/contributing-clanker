#!/usr/bin/env bats
# Unit tests for the Omarchy content gates: c28-c31, c34-c36, c38, c40-c42.
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
bats_require_minimum_version 1.5.0

setup() {
  TREE=$(mktemp -d)
  # Identity is passed inline rather than assumed. A CI runner has no global
  # git identity, so a bare `git commit` exits 128 with "Author identity
  # unknown" -- these cases passed on the author's box and failed on
  # every clean runner. The repo IS needed: the first case asserts that an
  # UNTRACKED file is still visible to the gates, and "untracked" only means
  # something inside a real repository.
  /usr/bin/git -C "$TREE" init -q .
  /usr/bin/git -C "$TREE" \
    -c user.email=test@example.com -c user.name=test \
    commit -q --allow-empty -m init
  # Without a manifest.json the gates answer "not an Omarchy plugin tree" and
  # SKIP. The first cut of this file omitted it, so all tests passed
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

@test "ignored dependency prose is not treated as candidate content" {
  # The gate must still inspect untracked source, but node_modules is an
  # ignored dependency cache. Before the git-ignore boundary, c28 blocked any
  # plugin immediately after npm install because third-party READMEs contain
  # em dashes. This test is intentionally a real ignored file, not a mocked
  # path filter, so the predicate matches normal developer state.
  printf 'node_modules/\n' > "$TREE/.gitignore"
  mkdir -p "$TREE/node_modules/example"
  printf 'third-party prose — not authored plugin content\n' > "$TREE/node_modules/example/README.md"
  run_tree_gate c28-voice-no-dashes.sh
  [ "$(sev)" = "PASS" ]
}

@test "unignored generated evidence trees are not treated as plugin source" {
  # A missing .gitignore entry must not make a mutation sandbox or generated
  # report part of the source corpus. This reproduced a run that walked roughly
  # 600 Stryker copies and buried the one actionable finding in synthetic noise.
  for dir in .stryker-tmp/mutant coverage/html reports/mutation .nyc_output; do
    mkdir -p "$TREE/$dir"
    printf 'generated prose — detector fixture, not plugin source\n' > "$TREE/$dir/generated.md"
  done
  run_tree_gate c28-voice-no-dashes.sh
  [ "$(sev)" = "PASS" ]
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

@test "c35 accepts the stock absolute Perl runtime used by descriptor helpers" {
  printf '#!/usr/bin/perl\nprint qq(ok\\n);\n' > "$TREE/tool"
  chmod +x "$TREE/tool"
  run_tree_gate c35-omarchy-runtime-dependency.sh
  [ "$(sev)" = "PASS" ]
}

@test "c35 ignores a developer-only script but still scans shipped bin code" {
  mkdir -p "$TREE/scripts" "$TREE/bin"
  printf '#!/usr/bin/env python3\nprint(1)\n' > "$TREE/scripts/release-helper"
  printf '#!/usr/bin/env node\nconsole.log(1)\n' > "$TREE/bin/shipped-tool"
  run_tree_gate c35-omarchy-runtime-dependency.sh
  [ "$(sev)" = "BLOCK" ] || [ "$(sev)" = "WARN" ]
  rm "$TREE/bin/shipped-tool"
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

# ------------------------------------------------------------------------ c41

@test "c41 blocks a state helper that trusts mutable pathnames after mktemp" {
  mkdir -p "$TREE/bin"
  cat > "$TREE/bin/stateful" <<'EOF'
#!/usr/bin/env bash
root="${XDG_STATE_HOME:-$HOME/.local/state}/sample"
mkdir -p "$root"
tmp="$(mktemp "$root/.state.XXXXXX")"
printf '%s\n' '{"ok":true}' > "$tmp"
mv -f "$tmp" "$root/state.json"
EOF
  chmod +x "$TREE/bin/stateful"
  run_tree_gate c41-omarchy-state-file-hygiene.sh
  [ "$(sev)" = "BLOCK" ]
  [[ "$output" == *"descriptor-bound lifecycle"* ]]
}

@test "c41 passes when no shipped runtime helper persists local state" {
  mkdir -p "$TREE/bin"
  printf '#!/usr/bin/env bash\nprintf hello\\n\n' > "$TREE/bin/stateless"
  chmod +x "$TREE/bin/stateless"
  run_tree_gate c41-omarchy-state-file-hygiene.sh
  [ "$(sev)" = "PASS" ]
}

@test "c41 does not mistake a Perl fat comma for shell redirection" {
  mkdir -p "$TREE/bin" "$TREE/tests"
  cat > "$TREE/bin/descriptor-reader" <<'EOF'
#!/usr/bin/perl
use Fcntl qw(O_NOFOLLOW O_NONBLOCK O_RDONLY);
my $root = $ENV{XDG_CONFIG_HOME};
sysopen(my $fh, "$root/state", O_RDONLY | O_NONBLOCK | O_NOFOLLOW);
my %payload = (
  directory => $root,
  truncated => 0,
);
my @captures = (1, 2);
my $over_limit = @captures > $payload{truncated};
EOF
  chmod +x "$TREE/bin/descriptor-reader"
  cat > "$TREE/tests/state.test.js" <<'EOF'
// Hostile lifecycle evidence: final, temp, parent, FIFO, oversized.
EOF
  run_tree_gate c41-omarchy-state-file-hygiene.sh
  [ "$(sev)" = "PASS" ]
}

@test "c41 large early-match evidence stays deterministic under pipefail" {
  mkdir -p "$TREE/bin" "$TREE/tests"
  cat > "$TREE/bin/descriptor-reader" <<'EOF'
#!/usr/bin/perl
use Fcntl qw(O_NOFOLLOW O_NONBLOCK O_RDONLY);
my $root = $ENV{XDG_STATE_HOME};
sysopen(my $fh, "$root/state", O_RDONLY | O_NONBLOCK | O_NOFOLLOW);
EOF
  cat > "$TREE/tests/state.test.js" <<'EOF'
// Hostile lifecycle evidence: final, temp, parent, FIFO, oversized.
EOF
  # Exceed a pipe buffer while staying below Linux's per-argument size limit,
  # so the historical external printf reaches SIGPIPE rather than E2BIG.
  # The old printf | grep -q shape intermittently treated grep's successful
  # early exit plus printf's SIGPIPE as a missing-token failure.
  for _ in $(seq 1 2000); do
    printf '%s\n' '// deterministic inert test padding 0123456789' >> "$TREE/tests/state.test.js"
  done
  chmod +x "$TREE/bin/descriptor-reader"

  # Exercise the evidence scan first, then the runtime scan too. Otherwise a
  # false "no stateful helper" PASS can mask broken evidence-token searches.
  for corpus in evidence runtime; do
    if [[ "$corpus" = runtime ]]; then
      for _ in $(seq 1 2000); do
        printf '%s\n' '// deterministic inert evidence padding 0123456789' >> "$TREE/bin/descriptor-reader"
      done
    fi
    for _ in $(seq 1 20); do
      run_tree_gate c41-omarchy-state-file-hygiene.sh
      [ "$(sev)" = "PASS" ]
      [[ "$output" == *"mutable local state uses descriptor lifecycle primitives"* ]]
    done
  done
}

assert_missing_state_evidence_blocks() {
  local missing="$1" tokens="$2"
  mkdir -p "$TREE/bin" "$TREE/tests"
  cat > "$TREE/bin/descriptor-reader" <<'EOF'
#!/usr/bin/perl
use Fcntl qw(O_NOFOLLOW O_NONBLOCK O_RDONLY);
my $root = $ENV{XDG_STATE_HOME};
sysopen(my $fh, "$root/state", O_RDONLY | O_NONBLOCK | O_NOFOLLOW);
EOF
  chmod +x "$TREE/bin/descriptor-reader"
  printf '// Hostile lifecycle evidence: %s.\n' "$tokens" > "$TREE/tests/state.test.js"
  run_tree_gate c41-omarchy-state-file-hygiene.sh
  [ "$(sev)" = "BLOCK" ]
  [[ "$output" == *"missing hostile $missing replacement coverage"* ]]
}

@test "c41 blocks missing final-entry evidence" {
  assert_missing_state_evidence_blocks final 'temp, parent, FIFO, oversized'
}

@test "c41 blocks missing temporary-entry evidence" {
  assert_missing_state_evidence_blocks temp 'final, parent, FIFO, oversized'
}

@test "c41 blocks missing parent-directory evidence" {
  assert_missing_state_evidence_blocks parent 'final, temp, FIFO, oversized'
}

@test "c41 blocks missing FIFO evidence" {
  assert_missing_state_evidence_blocks FIFO 'final, temp, parent, oversized'
}

@test "c41 blocks missing oversized-read evidence" {
  assert_missing_state_evidence_blocks oversize 'final, temp, parent, FIFO'
}

@test "c41 evidence matching remains case-insensitive" {
  mkdir -p "$TREE/bin" "$TREE/tests"
  cat > "$TREE/bin/stateful" <<'EOF'
#!/usr/bin/env bash
root="${XDG_STATE_HOME:-$HOME/.local/state}/sample"
exec secure-state read "$root"
EOF
  chmod +x "$TREE/bin/stateful"
  printf '// FINAL TeMp PARENT fifo OvErSiZeD\n' > "$TREE/tests/state.test.js"
  run_tree_gate c41-omarchy-state-file-hygiene.sh
  [ "$(sev)" = "PASS" ]
}

@test "c41 excludes isolated e2e fixture hooks from shipped runtime" {
  mkdir -p "$TREE/e2e"
  cat > "$TREE/e2e/rig-before-shell.sh" <<'EOF'
#!/usr/bin/env bash
root="${XDG_STATE_HOME:-$HOME/.local/state}/sample"
mkdir -p "$root"
printf '%s\n' '{"fixture":true}' > "$root/state.json"
EOF
  chmod +x "$TREE/e2e/rig-before-shell.sh"
  run_tree_gate c41-omarchy-state-file-hygiene.sh
  [ "$(sev)" = "PASS" ]
}

# ------------------------------------------------------------------------ c42
#
# C42 used to select shell files only. capture-conveyor's scanner is Perl, so
# the gate never opened it and answered PASS over a corpus of one git hook.
# Every case asserts an exact severity AND the file or line it is about, so a
# vacuous PASS or an empty-corpus SKIP cannot satisfy a WARN case, and a PASS
# has to name what it actually read.

@test "c42 excludes isolated e2e fixture hooks from shipped runtime" {
  mkdir -p "$TREE/e2e"
  cat > "$TREE/e2e/rig-before-shell.sh" <<'EOF'
#!/usr/bin/env bash
find "$HOME" -type f | sort | head -10
EOF
  chmod +x "$TREE/e2e/rig-before-shell.sh"
  run_tree_gate c42-omarchy-local-resource-budget.sh
  # The hook would WARN if it were selected. With it excluded nothing is left
  # to scan, and an empty corpus is a SKIP, never a PASS.
  [ "$(sev)" = "SKIP" ]
  [[ "$output" == *"no shipped shell or Perl runtime file to scan"* ]]
}

@test "c42 still warns on a shell find piped to sort before any head" {
  mkdir -p "$TREE/bin"
  cat > "$TREE/bin/loose-scan" <<'EOF'
#!/usr/bin/env bash
find "$HOME" -name .git -print0 | sort -zu | head -z -n 25
EOF
  chmod +x "$TREE/bin/loose-scan"
  run_tree_gate c42-omarchy-local-resource-budget.sh
  [ "$(sev)" = "WARN" ]
  [[ "$output" == *"bin/loose-scan:2"* ]]
}

@test "c42 still warns on a shell hyprctl capture with no timeout" {
  mkdir -p "$TREE/bin"
  cat > "$TREE/bin/board-scan" <<'EOF'
#!/usr/bin/env bash
clients="$(hyprctl clients -j)"
printf '%s\n' "${#clients}"
EOF
  chmod +x "$TREE/bin/board-scan"
  run_tree_gate c42-omarchy-local-resource-budget.sh
  [ "$(sev)" = "WARN" ]
  [[ "$output" == *"bin/board-scan:2 captures hyprctl output"* ]]
}

@test "c42 passes a shell scanner that budgets find and times hyprctl, and names it" {
  mkdir -p "$TREE/bin"
  cat > "$TREE/bin/board-scan" <<'EOF'
#!/usr/bin/env bash
find "$HOME/Pictures" -maxdepth 1 -print0 | head -z -n 512 | sort -z | head -z -n 25
clients="$(timeout 2 hyprctl clients -j | head -c 65536)"
printf '%s\n' "${#clients}"
EOF
  chmod +x "$TREE/bin/board-scan"
  run_tree_gate c42-omarchy-local-resource-budget.sh
  [ "$(sev)" = "PASS" ]
  [[ "$output" == *"scanned 1 shipped runtime file(s) (shell: bin/board-scan)"* ]]
}

@test "c42 warns on a Perl readdir loop sorted with no entry budget" {
  # Selected by its .pl name alone: there is no shebang line.
  mkdir -p "$TREE/bin"
  cat > "$TREE/bin/inventory.pl" <<'EOF'
use strict;
use warnings;
opendir(my $dh, "$ENV{HOME}/Pictures") or exit 0;
my @captures;
while (defined(my $name = readdir($dh))) {
    next unless $name =~ /\.png\z/;
    push @captures, $name;
}
closedir($dh);
@captures = sort @captures;
splice(@captures, 24) if @captures > 24;
print "$_\n" for @captures;
EOF
  run_tree_gate c42-omarchy-local-resource-budget.sh
  [ "$(sev)" = "WARN" ]
  [[ "$output" == *"bin/inventory.pl:10"* ]]
  [[ "$output" == *"@captures, filled at line 5 with no entry budget"* ]]
}

@test "c42 passes budgeted Perl scanners and names each one it scanned" {
  # The capture-conveyor shape: a counter checked inside the readdir loop,
  # in block form, and the crew-chief shape: an array-size cap in modifier
  # form, sorted later through a reference.
  mkdir -p "$TREE/bin"
  cat > "$TREE/bin/capture-scan" <<'EOF'
#!/usr/bin/perl
use strict;
use warnings;
my $SCAN_BUDGET = 512;
opendir(my $dh, "$ENV{HOME}/Pictures") or exit 0;
my @captures;
my $seen = 0;
while (defined(my $name = readdir($dh))) {
    next if $name eq '.' || $name eq '..';
    if (++$seen > $SCAN_BUDGET) {
        last;
    }
    next unless $name =~ /^screenshot-.*\.png$/;
    push @captures, { path => $name, modified => (stat "$ENV{HOME}/Pictures/$name")[9] };
}
@captures = sort { $b->{modified} <=> $a->{modified} } @captures;
splice(@captures, 24) if @captures > 24;
EOF
  cat > "$TREE/bin/spool-scan" <<'EOF'
#!/usr/bin/perl
use strict;
sub candidates {
    my ($cap) = @_;
    opendir(my $dh, '.') or die "cannot enumerate spool\n";
    my @rows;
    while (defined(my $name = readdir($dh))) {
        push @rows, $name;
        last if @rows >= $cap;
    }
    return \@rows;
}
my $rows = candidates(256);
my @newest = sort { $b cmp $a } @$rows;
EOF
  chmod +x "$TREE/bin/capture-scan" "$TREE/bin/spool-scan"
  run_tree_gate c42-omarchy-local-resource-budget.sh
  [ "$(sev)" = "PASS" ]
  [[ "$output" == *"scanned 2 shipped runtime file(s) (Perl: bin/capture-scan, bin/spool-scan)"* ]]
}

@test "c42 selects Perl by shebang without an extension and flags a direct readdir sort" {
  mkdir -p "$TREE/bin"
  cat > "$TREE/bin/recent" <<'EOF'
#!/usr/bin/env perl
use strict;
opendir(my $dh, $ENV{HOME}) or exit 0;
my @names = sort grep { !/^\./ } readdir($dh);
print "$_\n" for @names[0 .. 9];
EOF
  chmod +x "$TREE/bin/recent"
  run_tree_gate c42-omarchy-local-resource-budget.sh
  [ "$(sev)" = "WARN" ]
  [[ "$output" == *"bin/recent:4"* ]]
  [[ "$output" == *"consumes"*"readdir"*"output directly"* ]]
}

@test "c42 does not accept a last inside a glob or foreach-readdir loop as a budget" {
  # glob and list-context readdir build the whole list before the loop's
  # first iteration, so the counter caps nothing upstream of the buffer.
  mkdir -p "$TREE/bin"
  cat > "$TREE/bin/shots" <<'EOF'
#!/usr/bin/perl
my @shots;
my $n = 0;
for my $f (glob("$ENV{HOME}/Pictures/*.png")) {
    last if ++$n > 50;
    push @shots, $f;
}
print for sort @shots;
EOF
  cat > "$TREE/bin/names" <<'EOF'
#!/usr/bin/perl
opendir(my $dh, $ENV{HOME}) or exit 0;
my (@names, $n);
foreach my $e (readdir $dh) {
    last if ++$n > 50;
    push @names, $e;
}
print for sort @names;
EOF
  chmod +x "$TREE/bin/shots" "$TREE/bin/names"
  run_tree_gate c42-omarchy-local-resource-budget.sh
  [ "$(sev)" = "WARN" ]
  [[ "$output" == *"(2 in 2 scanned runtime file(s))"* ]]
  [[ "$output" == *"bin/names:8"* ]]
  [[ "$output" == *"bin/shots:8"* ]]
}

@test "c42 follows Perl entries through copies, statement modifiers and hash keys" {
  mkdir -p "$TREE/bin"
  cat > "$TREE/bin/copy" <<'EOF'
#!/usr/bin/perl
opendir(my $dh, $ENV{HOME}) or exit 0;
my @all = readdir $dh;
my @png = grep { /\.png\z/ } @all;
print for sort @png;
EOF
  cat > "$TREE/bin/modifier" <<'EOF'
#!/usr/bin/perl
opendir(my $dh, $ENV{HOME}) or exit 0;
my @names;
push @names, $_ for readdir $dh;
print for sort @names;
EOF
  cat > "$TREE/bin/seen" <<'EOF'
#!/usr/bin/perl
my %seen;
$seen{$_}++ for glob("$ENV{HOME}/*");
print for sort keys %seen;
EOF
  chmod +x "$TREE/bin/copy" "$TREE/bin/modifier" "$TREE/bin/seen"
  run_tree_gate c42-omarchy-local-resource-budget.sh
  [ "$(sev)" = "WARN" ]
  [[ "$output" == *"(3 in 3 scanned runtime file(s))"* ]]
  [[ "$output" == *"bin/copy:5"*"copied from @all"* ]]
  [[ "$output" == *"bin/modifier:5"* ]]
}

@test "c42 warns on Perl hyprctl captures with no alarm or timeout" {
  mkdir -p "$TREE/bin"
  cat > "$TREE/bin/storyboard-scan" <<'EOF'
#!/usr/bin/perl
use strict;
my $clients = `hyprctl clients -j`;
my $active = qx{hyprctl activewindow -j};
open(my $fh, '-|', 'hyprctl', 'workspaces', '-j') or exit 0;
EOF
  chmod +x "$TREE/bin/storyboard-scan"
  run_tree_gate c42-omarchy-local-resource-budget.sh
  [ "$(sev)" = "WARN" ]
  [[ "$output" == *"(3 in 1 scanned runtime file(s))"* ]]
  [[ "$output" == *"bin/storyboard-scan:3 runs"*"hyprctl"*"through backticks"* ]]
  [[ "$output" == *"bin/storyboard-scan:4 runs"*"through qx//"* ]]
}

@test "c42 passes Perl commands bounded by timeout or alarm, and ignores non-command mentions" {
  mkdir -p "$TREE/bin"
  cat > "$TREE/bin/timed" <<'EOF'
#!/usr/bin/perl
use strict;
open(my $fh, '-|', '/usr/bin/timeout', '2', 'hyprctl', 'clients', '-j') or exit 0;
my $active = qx{timeout 1 hyprctl activewindow -j | head -c 65536};
EOF
  cat > "$TREE/bin/alarmed" <<'EOF'
#!/usr/bin/perl
use strict;
local $SIG{ALRM} = sub { die "timeout\n" };
alarm 2;
my $clients = `hyprctl clients -j`;
alarm 0;
EOF
  cat > "$TREE/bin/mover" <<'EOF'
#!/usr/bin/perl
use strict;
my ($from, $to) = @ARGV;
system('/usr/bin/mv', '--no-clobber', '--', $from, $to) == 0
    or die "cannot find $to after the move\n";
EOF
  chmod +x "$TREE/bin/timed" "$TREE/bin/alarmed" "$TREE/bin/mover"
  run_tree_gate c42-omarchy-local-resource-budget.sh
  [ "$(sev)" = "PASS" ]
  [[ "$output" == *"(Perl: bin/alarmed, bin/mover, bin/timed)"* ]]
}

# ----------------------------------------------------------- empty-corpus rule

@test "a gate over an EMPTY corpus reports SKIP, never PASS" {
  # PASS asserts "checked and clean". With no files there was nothing to check,
  # and conflating the two is what let the lane report a verdict on a scope it
  # never established.
  rm -f "$TREE"/*.qml "$TREE"/*.js
  for g in c31-omarchy-qml-security.sh c34-omarchy-exec-injection.sh \
           c36-omarchy-qml-overflow.sh c42-omarchy-local-resource-budget.sh; do
    run_tree_gate "$g"
    [ "$(sev)" = "SKIP" ]
  done
}
