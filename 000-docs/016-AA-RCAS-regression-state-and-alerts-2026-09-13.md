# Regression state contaminated the operational recap

On September 9 at 04:35:11 UTC, `test-override-audit.sh` appended a synthetic
A05 override to the operator's live `log.jsonl`. The reason exactly matched
`test 2: real override audit` and the candidate was a temporary test file.
September 9–13 daily emails counted it as an override needing operator review.
No real upstream override or maintainer action is established by that event.

## Cause and history

The test was vendored in `5af2180` on May 3 and retained the hard-coded
`$HOME/.contribute-system` path through the June 17 test expansion `f28e90d`.
The July recap could select a fixture directory, but the transition writer,
runner, log helper and integration tests could not. The plugin-discovery test
also planted a temporary gate into the real operator override directory.
Separately, the override trend's strict JSON parse turned historical torn
lines into an empty report, hiding the same signal that the tolerant daily
recap displayed. Those earlier changes did not isolate the writers.

## Correction

`CONTRIBUTE_STATE_DIR` now selects the transition and runner log, dossier and
override directory and the shared gate logging/history paths. Production's
default stays the existing operator directory. The three regression writers
always create private temporary state, even when their caller supplies a
state directory; the caller's state is never the test fixture. Source-local
test resolution also prevents pre-commit and unit checks from testing an
older installed copy.

`reviewed-events.py` annotates a specific proven test override only when an
append-only `test_event_reviewed` record supplies its exact SHA256, classification,
reason and evidence. SHA256 covers sorted, compact ASCII-escaped JSON of the
entire original event. Recaps disclose the reviewed count and retain the raw
history. Another event with the same text remains an active override. Review
records cannot classify transitions or policy strikes. Both reports share
the tolerant event stream; real overrides survive torn historical lines.

## Tests and replay

Run:

```sh
scripts/lint-bash.sh
python3 -m unittest discover -s tests/integration -p 'test_*.py' -v
bats tests/unit/gates/ tests/unit/
skills/contribute/scripts/test-known-traps.sh
```

The Python integration harness copies the real writers into a private fixture
and relocates only the literal default state path to a canary. It does not
change HOME or expose the operator's real log to historical buggy writers.
`CONTRIBUTE_TEST_SOURCE=/path/to/historical-checkout` runs the same assertions
against old source. `70cec62` fails four of five writer-isolation assertions;
the corrected source passes all five, plus three review-binding tests.
The complete gate/reporter run passes 322 Bats tests. Live upstream trap
checks remain a separate integration lane, not a claim of hermetic CI.

## Installation, verification and rollback

After merge, fast-forward the clean canonical checkout. Existing skill and
runtime symlinks resolve there; verify with `scripts/doctor.sh` and compare
installed writer/reader hashes with the merge commit. If a copy installation
is used, preserve it and use the established `bin/install.sh` procedure.

Generate `contribute-daily-recap.sh --dry-run` against actual state and retain
the HTML privately; this sends nothing. Preserve a private snapshot of the
original audit log before appending a classification, bind only the exact
demonstrated fixture event and verify the original byte prefix is unchanged.
The September review should remove the one synthetic override action while
keeping both genuinely quiet upstream PRs visible. Never reset candidate
timestamps or send upstream pings simply to make a recap look healthy.

Rollback restores the prior installed scripts or source revision. Keep the
audit log and review receipt intact. Old reporters ignore review records and
will display the synthetic override until it leaves their seven-day window.
Do not roll back by deleting the original event or disabling a legitimate
test. The next naturally scheduled email remains separate verification from
the no-send runtime preview.
