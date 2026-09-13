import importlib.util
from pathlib import Path
import unittest

SCRIPT = Path(__file__).resolve().parents[2] / "skills/contribute/scripts/reviewed-events.py"
SPEC = importlib.util.spec_from_file_location("reviewed_events", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ReviewedEvents(unittest.TestCase):
    def setUp(self):
        self.event = {"ts": "2026-09-09T04:35:11Z", "event": "gate_override", "details": {"gate": "A05", "reason": "test 2: real override audit", "candidate": "/tmp/fixture.md"}}
        self.review = {"event": "test_event_reviewed", "details": {"classification": "regression_fixture", "target_sha256": MODULE.event_hash(self.event), "reason": "reproduced test writer", "evidence": "source test and matching receipt"}}

    def test_only_complete_exact_review_marks_fixture_and_preserves_original(self):
        other = dict(self.event, ts="2026-09-10T04:35:11Z")
        result = list(MODULE.annotate([self.event, other, self.review, self.review]))
        self.assertTrue(result[0]["reviewed_test_fixture"])
        self.assertNotIn("reviewed_test_fixture", result[1])
        self.assertEqual(len(result), 4)
        self.assertNotIn("reviewed_test_fixture", self.event)

    def test_missing_evidence_cannot_hide_an_override(self):
        del self.review["details"]["evidence"]
        self.assertNotIn("reviewed_test_fixture", list(MODULE.annotate([self.event, self.review]))[0])

    def test_event_cannot_self_certify_or_mark_unrelated_transition(self):
        event = dict(self.event, reviewed_test_fixture=True)
        self.assertNotIn("reviewed_test_fixture", list(MODULE.annotate([event]))[0])
        event = dict(self.event, event="transition_committed")
        self.review["details"]["target_sha256"] = MODULE.event_hash(event)
        self.assertNotIn("reviewed_test_fixture", list(MODULE.annotate([event, self.review]))[0])


if __name__ == "__main__":
    unittest.main()
