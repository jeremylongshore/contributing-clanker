"""Tests for BountyState schema."""

import pytest

from bounty_agent.state import BountyState


def test_bounty_state_required_fields():
    """Test that BountyState has all required fields."""
    # TypedDict doesn't enforce at runtime, but we can check annotations
    annotations = BountyState.__annotations__

    required_fields = [
        "bounty_id",
        "issue_url",
        "repo",
        "repo_id",
        "issue_details",
        "competition_analysis",
        "implementation_plan",
        "phase",
        "human_approved",
        "execution_result",
        "session_id",
    ]

    for field in required_fields:
        assert field in annotations, f"Missing field: {field}"


def test_bounty_state_can_be_instantiated():
    """Test that BountyState can be created with valid data."""
    state: BountyState = {
        "bounty_id": "test-123",
        "issue_url": "https://github.com/owner/repo/issues/1",
        "repo": "owner/repo",
        "repo_id": "github_com_owner_repo",
        "issue_details": {},
        "competition_analysis": {},
        "implementation_plan": {},
        "phase": "A",
        "human_approved": False,
        "execution_result": {},
        "session_id": "session-abc",
        "repo_profile": None,
    }

    assert state["bounty_id"] == "test-123"
    assert state["phase"] == "A"
    assert state["human_approved"] is False


def test_bounty_state_phases():
    """Test valid phase values."""
    valid_phases = ["A", "B", "C", "D", "E", "F"]

    for phase in valid_phases:
        state: BountyState = {
            "bounty_id": "test",
            "issue_url": "https://github.com/o/r/issues/1",
            "repo": "o/r",
            "repo_id": "github_com_o_r",
            "issue_details": {},
            "competition_analysis": {},
            "implementation_plan": {},
            "phase": phase,
            "human_approved": False,
            "execution_result": {},
            "session_id": "s",
            "repo_profile": None,
        }
        assert state["phase"] == phase
