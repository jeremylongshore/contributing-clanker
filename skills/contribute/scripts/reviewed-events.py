#!/usr/bin/env python3
"""Annotate exact, reviewed test events without altering append-only history."""
import hashlib
import json
import re
import sys


def event_hash(event):
    payload = json.dumps(event, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(payload.encode()).hexdigest()


def annotate(events):
    reviewed = set()
    for event in events:
        details = event.get("details")
        if event.get("event") != "test_event_reviewed" or not isinstance(details, dict):
            continue
        target = details.get("target_sha256")
        if (
            details.get("classification") == "regression_fixture"
            and isinstance(target, str)
            and re.fullmatch(r"[0-9a-f]{64}", target)
            and isinstance(details.get("reason"), str)
            and details["reason"].strip()
            and isinstance(details.get("evidence"), str)
            and details["evidence"].strip()
        ):
            reviewed.add(target)
    for event in events:
        # A marker in an original event cannot self-certify a review. Only a
        # separate review record bound to its complete contents qualifies.
        original = dict(event)
        event = dict(event)
        event.pop("reviewed_test_fixture", None)
        if event.get("event") == "gate_override" and event_hash(original) in reviewed:
            event["reviewed_test_fixture"] = True
        yield event


def main():
    events = []
    with open(sys.argv[1], encoding="utf-8") as stream:
        for line in stream:
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue  # Existing reporters expose the malformed-line count.
            if isinstance(event, dict):
                events.append(event)
    for event in annotate(events):
        print(json.dumps(event, ensure_ascii=True))


if __name__ == "__main__":
    main()
