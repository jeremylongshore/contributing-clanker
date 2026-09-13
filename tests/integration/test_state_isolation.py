"""Run real shell writers with a protected default-state canary.

Only the literal default state path is relocated in the copied scripts, so
old-source regression runs cannot touch the operator's real audit log. HOME
is never changed. The runner, overrides, JSONL writes and gates execute.
CONTRIBUTE_TEST_SOURCE may select a historical checkout for a red replay.
"""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


SOURCE = Path(os.environ.get("CONTRIBUTE_TEST_SOURCE", Path(__file__).resolve().parents[2]))


class StateIsolation(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory(prefix="contribute-isolation-")
        self.root = Path(self.scratch.name)
        self.canary = self.root / "operator-state"
        self.state = self.root / "requested-state"
        self.scripts = self.root / "scripts"
        for state in (self.canary, self.state):
            (state / "gates").mkdir(parents=True)
            (state / "log.jsonl").write_text('{"event":"canary"}\n')
        source = SOURCE / "skills/contribute/scripts"
        self.scripts.mkdir()
        for file in source.glob("*.sh"):
            shutil.copy2(file, self.scripts / file.name)
        library = self.scripts / "gates/lib"
        library.mkdir(parents=True)
        shutil.copy2(source / "gates/lib/preamble.sh", library / "preamble.sh")
        for file in self.scripts.rglob("*.sh"):
            text = file.read_text()
            for literal in ("$HOME/.contribute-system", "${HOME}/.contribute-system", "~/.contribute-system"):
                text = text.replace(literal, str(self.canary))
            file.write_text(text)
        for name, verdict in (("a05-closed.sh", "block"), ("a01-unassigned.sh", "pass")):
            gate = self.scripts / "gates" / name
            gate.write_text('#!/usr/bin/env bash\nsource "$(dirname "$0")/lib/preamble.sh"\ngate_read_input\ngate_' + verdict + ' "fixture"\n')
            gate.chmod(0o755)
        self.candidate = self.root / "candidate.md"
        self.candidate.write_text("---\nrepo: example/repo\nissue_number: 1\nstatus: open\n---\n\n## Scope\n## Files to touch\n## Claim comment draft\n")
        self.env = dict(os.environ, CONTRIBUTE_STATE_DIR=str(self.state))

    def tearDown(self):
        self.scratch.cleanup()

    def run_script(self, name, *args, env=None):
        return subprocess.run(["bash", str(self.scripts / name), *args], env=env or self.env, text=True, capture_output=True, timeout=30)

    def assert_canary_unchanged(self):
        self.assertEqual((self.canary / "log.jsonl").read_text(), '{"event":"canary"}\n')
        self.assertEqual(list((self.canary / "gates").iterdir()), [])

    def test_transition_override_and_runner_write_requested_state(self):
        result = self.run_script("transition.sh", "shortlist→claimed", str(self.candidate), "--override-gate", "A05", "explicit fixture override")
        self.assertEqual(result.returncode, 0, result.stderr)
        events = (self.state / "log.jsonl").read_text()
        for event in ("gate_override", "gate_run", "transition_attempt", "transition_committed"):
            self.assertIn(event, events)
        self.assert_canary_unchanged()

    def test_gate_helper_writes_requested_state(self):
        result = subprocess.run(["bash", "-c", 'source "$1"; GATE_ACTION=test; GATE_REPO=example/repo; gate_log_run PASS', "fixture", str(self.scripts / "gates/lib/preamble.sh")], env=self.env, capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("gate_run", (self.state / "log.jsonl").read_text())
        self.assert_canary_unchanged()

    def test_override_regression_does_not_write_inherited_operator_state(self):
        result = self.run_script("test-override-audit.sh")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual((self.state / "log.jsonl").read_text(), '{"event":"canary"}\n')
        self.assert_canary_unchanged()

    def test_plugin_regression_keeps_operator_gate_directory_untouched(self):
        result = self.run_script("test-plug-in.sh")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(list((self.state / "gates").iterdir()), [])
        self.assert_canary_unchanged()

    def test_default_operator_state_still_receives_real_events(self):
        env = dict(self.env)
        env.pop("CONTRIBUTE_STATE_DIR")
        result = self.run_script("transition.sh", "shortlist→claimed", str(self.candidate), "--override-gate", "A05", "operator override", env=env)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("gate_override", (self.canary / "log.jsonl").read_text())


if __name__ == "__main__":
    unittest.main()
