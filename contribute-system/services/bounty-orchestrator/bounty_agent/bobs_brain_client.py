"""A2A Client for communicating with Bob's Brain."""

import os
from typing import Optional

import httpx


class BobsBrainClient:
    """Send prompts to Bob's Brain via A2A protocol.

    Bob's Brain is a general-purpose executor that can do ANYTHING based on prompts.
    LangChain generates the prompts, Bob's team figures out HOW to execute.
    """

    def __init__(self, base_url: Optional[str] = None):
        """Initialize the A2A client.

        Args:
            base_url: Bob's Brain A2A endpoint. Defaults to BOBS_BRAIN_A2A_URL env var.
        """
        self.base_url = base_url or os.environ.get(
            "BOBS_BRAIN_A2A_URL", "http://localhost:8080"
        )

    async def ask_bob(
        self,
        prompt: str,
        context: Optional[dict] = None,
        session_id: Optional[str] = None,
    ) -> dict:
        """Send any prompt to Bob's Brain.

        Bob's team can do ANYTHING - analyze code, write code, create PRs, research, etc.

        Args:
            prompt: Natural language task (LangChain generates this)
            context: Additional context (bounty details, repo info, etc.)
            session_id: For conversation continuity

        Returns:
            Response from Bob's Brain with the execution result
        """
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    f"{self.base_url}/a2a/run",
                    json={
                        "agent_role": "bob",  # Bob routes to right specialist
                        "prompt": prompt,
                        "context": context or {},
                        "session_id": session_id,
                    },
                    headers={"Content-Type": "application/json"},
                    timeout=120.0,  # Bob may take time for complex tasks
                )
                response.raise_for_status()
                return response.json()
            except httpx.HTTPError as e:
                # Return error response for graceful handling
                return {
                    "error": str(e),
                    "response": {},
                }


# Singleton instance for convenience
bob = BobsBrainClient()
