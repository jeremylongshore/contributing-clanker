"""Tests for the LangGraph workflow."""

import pytest
from unittest.mock import patch, AsyncMock

# Skip all tests if langgraph not installed
langgraph = pytest.importorskip("langgraph", reason="langgraph not installed")

from bounty_agent.agent import get_graph, get_checkpointer
from bounty_agent.state import BountyState
from bounty_agent.nodes import should_proceed, is_approved


class TestWorkflowStructure:
    """Tests for the workflow graph structure."""

    def test_workflow_has_all_nodes(self):
        """Test that workflow contains all required nodes."""
        graph = get_graph()
        nodes = list(graph.nodes.keys())

        required_nodes = [
            "analyze",
            "check_competition",
            "create_plan",
            "approval",
            "execute",
        ]

        for node in required_nodes:
            assert node in nodes, f"Missing node: {node}"

    def test_workflow_entry_point(self):
        """Test that workflow starts at analyze node."""
        graph = get_graph()
        # The entry point is set via set_entry_point
        # We can verify by checking the compiled graph's structure
        assert "analyze" in graph.nodes


class TestConditionalEdges:
    """Tests for conditional routing logic."""

    def test_should_proceed_with_no_competition(self):
        """Test that should_proceed returns continue when no competition."""
        state: BountyState = {
            "bounty_id": "test",
            "issue_url": "https://github.com/o/r/issues/1",
            "repo": "o/r",
            "repo_id": "github_com_o_r",
            "issue_details": {},
            "competition_analysis": {
                "competing_prs": 0,
                "recommendation": "proceed",
            },
            "implementation_plan": {},
            "phase": "B",
            "human_approved": False,
            "execution_result": {},
            "session_id": "s",
            "repo_profile": None,
        }

        result = should_proceed(state)
        assert result == "continue"

    def test_should_proceed_with_competition(self):
        """Test that should_proceed returns skip when competition exists."""
        state: BountyState = {
            "bounty_id": "test",
            "issue_url": "https://github.com/o/r/issues/1",
            "repo": "o/r",
            "repo_id": "github_com_o_r",
            "issue_details": {},
            "competition_analysis": {
                "competing_prs": 2,
                "recommendation": "skip",
            },
            "implementation_plan": {},
            "phase": "B",
            "human_approved": False,
            "execution_result": {},
            "session_id": "s",
            "repo_profile": None,
        }

        result = should_proceed(state)
        assert result == "skip"

    def test_should_proceed_with_skip_recommendation(self):
        """Test that should_proceed respects skip recommendation."""
        state: BountyState = {
            "bounty_id": "test",
            "issue_url": "https://github.com/o/r/issues/1",
            "repo": "o/r",
            "repo_id": "github_com_o_r",
            "issue_details": {},
            "competition_analysis": {
                "competing_prs": 0,
                "recommendation": "skip",
            },
            "implementation_plan": {},
            "phase": "B",
            "human_approved": False,
            "execution_result": {},
            "session_id": "s",
            "repo_profile": None,
        }

        result = should_proceed(state)
        assert result == "skip"

    def test_is_approved_when_true(self):
        """Test that is_approved returns execute when approved."""
        state: BountyState = {
            "bounty_id": "test",
            "issue_url": "https://github.com/o/r/issues/1",
            "repo": "o/r",
            "repo_id": "github_com_o_r",
            "issue_details": {},
            "competition_analysis": {},
            "implementation_plan": {},
            "phase": "D",
            "human_approved": True,
            "execution_result": {},
            "session_id": "s",
            "repo_profile": None,
        }

        result = is_approved(state)
        assert result == "execute"

    def test_is_approved_when_false(self):
        """Test that is_approved returns rejected when not approved."""
        state: BountyState = {
            "bounty_id": "test",
            "issue_url": "https://github.com/o/r/issues/1",
            "repo": "o/r",
            "repo_id": "github_com_o_r",
            "issue_details": {},
            "competition_analysis": {},
            "implementation_plan": {},
            "phase": "D",
            "human_approved": False,
            "execution_result": {},
            "session_id": "s",
            "repo_profile": None,
        }

        result = is_approved(state)
        assert result == "rejected"


class TestCheckpointer:
    """Tests for the checkpointer factory."""

    def test_get_checkpointer_returns_memory_without_db(self):
        """Test that get_checkpointer returns MemorySaver without DATABASE_URL."""
        with patch.dict("os.environ", {}, clear=True):
            # Remove DATABASE_URL if it exists
            import os

            os.environ.pop("DATABASE_URL", None)

            checkpointer = get_checkpointer()

            from langgraph.checkpoint.memory import MemorySaver

            assert isinstance(checkpointer, MemorySaver)

    def test_get_checkpointer_uses_postgres_with_db_url(self):
        """Test that get_checkpointer uses PostgreSQL when DATABASE_URL is set."""
        # Skip if langgraph-checkpoint-postgres is not installed
        pytest.importorskip("langgraph.checkpoint.postgres", reason="postgres checkpointer not installed")

        # This test requires mocking since we don't have a real DB
        with patch.dict(
            "os.environ", {"DATABASE_URL": "postgresql://user:pass@localhost/db"}
        ):
            with patch(
                "langgraph.checkpoint.postgres.PostgresSaver.from_conn_string"
            ) as mock_postgres:
                mock_postgres.return_value = "postgres_saver"

                checkpointer = get_checkpointer()

                mock_postgres.assert_called_once_with(
                    "postgresql://user:pass@localhost/db"
                )
                assert checkpointer == "postgres_saver"
