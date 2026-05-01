"""Production agent for Vertex AI Agent Engine deployment.

This module implements the BountyOrchestrator class following the
Agent Engine serialization protocol:

- __init__: Store ONLY primitives (runs locally, gets pickled)
- set_up: Initialize clients and graph (runs remotely after unpickle)
- query: Synchronous entry point for Agent Engine
- stream_query: Streaming entry point for long operations

The separation is CRITICAL because cloudpickle cannot serialize:
- gRPC channels (ChatVertexAI)
- Connection pools (databases)
- SSL sockets (httpx clients)
- Thread locks

See: Phase 8.2.1 in deployment plan for serialization protocol.
"""

import logging
import os
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class BountyOrchestrator:
    """
    Production agent for Vertex AI Agent Engine.

    Follows the __init__ (local) / set_up (remote) separation pattern
    required for Agent Engine's cloudpickle serialization.

    Usage:
        # Deploy to Agent Engine
        agent = BountyOrchestrator(
            project_id="intentional-bounty",
            location="us-central1",
            model_name="gemini-2.0-flash",
        )
        remote_agent = reasoning_engines.ReasoningEngine.create(agent, ...)

        # Query the deployed agent
        result = remote_agent.query("Analyze issue #123")
    """

    def __init__(
        self,
        project_id: str,
        location: str = "us-central1",
        model_name: str = "gemini-2.0-flash",
        bobs_brain_url: Optional[str] = None,
    ):
        """
        Phase 1: Configuration (LOCAL - runs before pickle)

        ONLY store primitives here. No API clients!
        This method runs locally and the object is then serialized.

        Args:
            project_id: GCP project ID for Vertex AI
            location: GCP region (e.g., us-central1)
            model_name: Gemini model name for LLM calls
            bobs_brain_url: Optional A2A endpoint for Bob's Brain
        """
        # Store ONLY primitives - these get pickled
        self.project_id = project_id
        self.location = location
        self.model_name = model_name
        self.bobs_brain_url = bobs_brain_url

        # Config dict (primitives only)
        self.config = {
            "temperature": 0.1,
            "max_output_tokens": 8192,
            "recursion_limit": 50,
        }

        # These will be initialized in set_up() AFTER unpickling
        self.graph = None
        self.checkpointer = None
        self.http_client = None

    def set_up(self):
        """
        Phase 2: Hydration (REMOTE - runs after unpickle in cloud)

        Initialize all clients and heavy objects here.
        This method is called automatically by Agent Engine runtime.

        IMPORTANT: All imports that use network/gRPC should be inside
        this method to ensure they're available in the remote environment.
        """
        # Import inside set_up to ensure availability in remote env
        from langgraph.graph import StateGraph, END

        from .state import BountyState
        from .nodes import (
            analyze_bounty,
            check_competition,
            should_proceed,
            create_plan,
            is_approved,
            execute_via_bob,
        )

        # 1. Set up Bob's Brain URL from env if not provided
        if not self.bobs_brain_url:
            self.bobs_brain_url = os.environ.get("BOBS_BRAIN_A2A_URL")

        # 2. Initialize HTTP client for A2A communication
        import httpx

        self.http_client = httpx.AsyncClient(
            base_url=self.bobs_brain_url or "",
            timeout=120.0,
        )

        # 3. Initialize checkpointer (PostgreSQL for production)
        self.checkpointer = self._get_checkpointer()

        # 4. Build the LangGraph workflow
        workflow = StateGraph(BountyState)

        # Add nodes
        workflow.add_node("analyze", analyze_bounty)
        workflow.add_node("check_competition", check_competition)
        workflow.add_node("create_plan", create_plan)
        workflow.add_node("approval", lambda s: s)  # Human checkpoint
        workflow.add_node("execute", execute_via_bob)

        # Set entry point
        workflow.set_entry_point("analyze")

        # Wire edges
        workflow.add_edge("analyze", "check_competition")

        workflow.add_conditional_edges(
            "check_competition",
            should_proceed,
            {
                "continue": "create_plan",
                "skip": END,
            },
        )

        workflow.add_edge("create_plan", "approval")

        workflow.add_conditional_edges(
            "approval",
            is_approved,
            {
                "execute": "execute",
                "rejected": END,
            },
        )

        workflow.add_edge("execute", END)

        # Compile with checkpointer
        self.graph = workflow.compile(checkpointer=self.checkpointer)

        logger.info(
            "BountyOrchestrator initialized",
            extra={
                "project_id": self.project_id,
                "location": self.location,
                "model_name": self.model_name,
                "has_checkpointer": self.checkpointer is not None,
            },
        )

    def _get_checkpointer(self):
        """Get the appropriate checkpointer based on environment.

        Production uses PostgreSQL (L5 compliance).
        Development uses in-memory for testing.
        """
        database_url = os.environ.get("DATABASE_URL")

        if database_url:
            # Production: Use PostgreSQL
            from langgraph.checkpoint.postgres import PostgresSaver

            logger.info("Using PostgreSQL checkpointer for production")
            return PostgresSaver.from_conn_string(database_url)
        else:
            # Development: Use in-memory (testing only)
            from langgraph.checkpoint.memory import MemorySaver

            logger.warning(
                "DATABASE_URL not set - using MemorySaver (data will be lost)"
            )
            return MemorySaver()

    def query(self, input: str, config: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Synchronous entry point for Agent Engine.

        This method is called by the runtime when a request arrives.

        Args:
            input: The user's input/query
            config: Optional configuration including thread_id

        Returns:
            The graph execution result
        """
        if self.graph is None:
            raise RuntimeError("Agent not initialized. Call set_up() first.")

        thread_id = config.get("thread_id", "default") if config else "default"

        return self.graph.invoke(
            {"input": input},
            config={
                "configurable": {"thread_id": thread_id},
                "recursion_limit": self.config["recursion_limit"],
            },
        )

    def stream_query(self, input: str, config: Optional[Dict] = None):
        """
        Streaming entry point for Agent Engine.

        Use streaming for long operations to prevent gateway timeouts.

        Args:
            input: The user's input/query
            config: Optional configuration including thread_id

        Yields:
            Streaming chunks from the graph execution
        """
        if self.graph is None:
            raise RuntimeError("Agent not initialized. Call set_up() first.")

        thread_id = config.get("thread_id", "default") if config else "default"

        return self.graph.stream(
            {"input": input},
            config={
                "configurable": {"thread_id": thread_id},
                "recursion_limit": self.config["recursion_limit"],
            },
        )


# =============================================================================
# Legacy exports for backwards compatibility and local testing
# =============================================================================


def get_checkpointer():
    """Get checkpointer for local testing.

    DEPRECATED: Use BountyOrchestrator class for Agent Engine deployment.
    """
    database_url = os.environ.get("DATABASE_URL")

    if database_url:
        from langgraph.checkpoint.postgres import PostgresSaver

        return PostgresSaver.from_conn_string(database_url)
    else:
        from langgraph.checkpoint.memory import MemorySaver

        return MemorySaver()


def _build_graph():
    """Build graph for local testing.

    DEPRECATED: Use BountyOrchestrator class for Agent Engine deployment.
    """
    from langgraph.graph import StateGraph, END

    from .state import BountyState
    from .nodes import (
        analyze_bounty,
        check_competition,
        should_proceed,
        create_plan,
        is_approved,
        execute_via_bob,
    )

    workflow = StateGraph(BountyState)

    workflow.add_node("analyze", analyze_bounty)
    workflow.add_node("check_competition", check_competition)
    workflow.add_node("create_plan", create_plan)
    workflow.add_node("approval", lambda s: s)
    workflow.add_node("execute", execute_via_bob)

    workflow.set_entry_point("analyze")
    workflow.add_edge("analyze", "check_competition")

    workflow.add_conditional_edges(
        "check_competition",
        should_proceed,
        {"continue": "create_plan", "skip": END},
    )

    workflow.add_edge("create_plan", "approval")

    workflow.add_conditional_edges(
        "approval",
        is_approved,
        {"execute": "execute", "rejected": END},
    )

    workflow.add_edge("execute", END)

    return workflow.compile(checkpointer=get_checkpointer())


# Legacy export for langgraph.json and local testing
# For Agent Engine, use BountyOrchestrator class instead
# Lazy-loaded to prevent import errors when langgraph not installed
_graph_instance = None


def get_graph():
    """Get or create the compiled graph. Lazy-loaded."""
    global _graph_instance
    if _graph_instance is None:
        _graph_instance = _build_graph()
    return _graph_instance


# For backwards compatibility with langgraph.json which expects 'graph'
# This creates a lazy property-like behavior
class _LazyGraph:
    """Lazy wrapper for graph to defer initialization until first access."""

    _instance = None

    def __getattr__(self, name):
        if _LazyGraph._instance is None:
            _LazyGraph._instance = _build_graph()
        return getattr(_LazyGraph._instance, name)

    def __call__(self, *args, **kwargs):
        if _LazyGraph._instance is None:
            _LazyGraph._instance = _build_graph()
        return _LazyGraph._instance(*args, **kwargs)


graph = _LazyGraph()
