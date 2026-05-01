"""Tests for the FastAPI endpoints."""

import pytest
from unittest.mock import patch, AsyncMock, MagicMock

# Skip all tests if fastapi not installed
fastapi = pytest.importorskip("fastapi", reason="fastapi not installed")
from fastapi.testclient import TestClient

from bounty_agent.api import app


@pytest.fixture
def client():
    """Create a test client."""
    return TestClient(app)


class TestHealthEndpoint:
    """Tests for the health check endpoint."""

    def test_health_check(self, client):
        """Test that health endpoint returns ok."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "bounty-orchestrator"


class TestStartBountyEndpoint:
    """Tests for the start bounty endpoint."""

    def test_start_bounty_returns_session_info(self, client):
        """Test that starting a bounty returns session info."""
        with patch("bounty_agent.api.graph") as mock_graph:
            mock_graph.ainvoke = AsyncMock(return_value={})

            response = client.post(
                "/api/bounty/start",
                json={
                    "bounty_id": "test-123",
                    "issue_url": "https://github.com/owner/repo/issues/1",
                    "repo": "owner/repo",
                },
            )

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "analyzing"
            assert data["bounty_id"] == "test-123"
            assert "session_id" in data
            assert data["session_id"].startswith("bounty-test-123-")

    def test_start_bounty_missing_fields(self, client):
        """Test that missing fields return validation error."""
        response = client.post(
            "/api/bounty/start",
            json={"bounty_id": "test-123"},  # Missing issue_url and repo
        )

        assert response.status_code == 422  # Validation error


class TestBountyStatusEndpoint:
    """Tests for the bounty status endpoint."""

    def test_get_status_returns_current_state(self, client):
        """Test that status endpoint returns current workflow state."""
        mock_state = MagicMock()
        mock_state.next = ["approval"]
        mock_state.values = {
            "bounty_id": "test-123",
            "phase": "C",
            "human_approved": False,
        }

        with patch("bounty_agent.api.graph") as mock_graph:
            mock_graph.get_state.return_value = mock_state

            response = client.get("/api/bounty/test-123/status")

            assert response.status_code == 200
            data = response.json()
            assert data["current_node"] == "approval"
            assert data["state"]["phase"] == "C"

    def test_get_status_complete_workflow(self, client):
        """Test status when workflow is complete."""
        mock_state = MagicMock()
        mock_state.next = []  # Empty means complete
        mock_state.values = {
            "bounty_id": "test-123",
            "phase": "F",
            "human_approved": True,
            "execution_result": {"pr_url": "https://github.com/o/r/pull/1"},
        }

        with patch("bounty_agent.api.graph") as mock_graph:
            mock_graph.get_state.return_value = mock_state

            response = client.get("/api/bounty/test-123/status")

            assert response.status_code == 200
            data = response.json()
            assert data["current_node"] == "complete"


class TestApproveEndpoint:
    """Tests for the approve endpoint."""

    def test_approve_updates_state(self, client):
        """Test that approve endpoint updates state and resumes workflow."""
        with patch("bounty_agent.api.graph") as mock_graph:
            mock_graph.update_state = MagicMock()
            mock_graph.ainvoke = AsyncMock(return_value={})

            response = client.post("/api/bounty/test-123/approve")

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "executing"

            # Verify state was updated
            mock_graph.update_state.assert_called_once()
            call_args = mock_graph.update_state.call_args
            assert call_args[0][1] == {"human_approved": True, "phase": "D"}


class TestReposEndpoint:
    """Tests for the repos listing endpoint."""

    def test_list_repos_returns_empty_initially(self, client):
        """Test that repos endpoint returns empty list initially."""
        response = client.get("/api/repos")

        assert response.status_code == 200
        data = response.json()
        assert data == []


class TestBountiesEndpoint:
    """Tests for the bounties listing endpoint."""

    def test_list_bounties_returns_empty_initially(self, client):
        """Test that bounties endpoint returns empty list initially."""
        response = client.get("/api/bounties")

        assert response.status_code == 200
        data = response.json()
        assert data == []


class TestLearningsEndpoint:
    """Tests for the learnings search endpoint."""

    def test_search_learnings_returns_empty(self, client):
        """Test that learnings search returns empty without data."""
        response = client.get("/api/learnings?query=test")

        assert response.status_code == 200
        data = response.json()
        assert data == []
