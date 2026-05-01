"""Tests for Bob's Brain A2A client."""

import os
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from bounty_agent.bobs_brain_client import BobsBrainClient, bob


class TestBobsBrainClient:
    """Tests for the BobsBrainClient class."""

    def test_client_uses_default_without_env_var(self):
        """Test that client uses default localhost URL without env var."""
        with patch.dict(os.environ, {}, clear=True):
            # Remove BOBS_BRAIN_A2A_URL if it exists
            os.environ.pop("BOBS_BRAIN_A2A_URL", None)
            client = BobsBrainClient()
            assert client.base_url == "http://localhost:8080"

    def test_client_uses_env_var(self):
        """Test that client uses environment variable."""
        test_url = "https://test-a2a-gateway.run.app"
        with patch.dict(os.environ, {"BOBS_BRAIN_A2A_URL": test_url}):
            client = BobsBrainClient()
            assert client.base_url == test_url

    @pytest.mark.asyncio
    async def test_ask_bob_sends_correct_payload(self):
        """Test that ask_bob sends the correct payload structure."""
        test_url = "https://test-a2a-gateway.run.app"

        with patch.dict(os.environ, {"BOBS_BRAIN_A2A_URL": test_url}):
            client = BobsBrainClient()

            # Mock the httpx client - use MagicMock for sync methods
            mock_response = MagicMock()
            mock_response.json.return_value = {"response": {"status": "ok"}}
            mock_response.raise_for_status = MagicMock()

            with patch("httpx.AsyncClient") as mock_client_class:
                mock_client = AsyncMock()
                mock_client.post.return_value = mock_response
                mock_client.__aenter__.return_value = mock_client
                mock_client.__aexit__.return_value = None
                mock_client_class.return_value = mock_client

                result = await client.ask_bob(
                    prompt="Test prompt",
                    context={"key": "value"},
                    session_id="test-session",
                )

                # Verify the call was made correctly
                mock_client.post.assert_called_once()
                call_args = mock_client.post.call_args

                assert call_args[0][0] == f"{test_url}/a2a/run"
                assert call_args[1]["json"]["agent_role"] == "bob"
                assert call_args[1]["json"]["prompt"] == "Test prompt"
                assert call_args[1]["json"]["context"] == {"key": "value"}
                assert call_args[1]["json"]["session_id"] == "test-session"
                assert call_args[1]["timeout"] == 120.0

                assert result == {"response": {"status": "ok"}}

    @pytest.mark.asyncio
    async def test_ask_bob_default_context(self):
        """Test that ask_bob uses empty dict for default context."""
        test_url = "https://test-a2a-gateway.run.app"

        with patch.dict(os.environ, {"BOBS_BRAIN_A2A_URL": test_url}):
            client = BobsBrainClient()

            mock_response = MagicMock()
            mock_response.json.return_value = {"response": {}}
            mock_response.raise_for_status = MagicMock()

            with patch("httpx.AsyncClient") as mock_client_class:
                mock_client = AsyncMock()
                mock_client.post.return_value = mock_response
                mock_client.__aenter__.return_value = mock_client
                mock_client.__aexit__.return_value = None
                mock_client_class.return_value = mock_client

                await client.ask_bob(prompt="Test prompt")

                call_args = mock_client.post.call_args
                assert call_args[1]["json"]["context"] == {}
                assert call_args[1]["json"]["session_id"] is None


class TestGlobalBobInstance:
    """Tests for the global bob instance."""

    def test_global_bob_exists(self):
        """Test that global bob instance is created."""
        assert bob is not None
        assert isinstance(bob, BobsBrainClient)
