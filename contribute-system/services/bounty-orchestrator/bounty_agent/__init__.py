"""Bounty Agent - LangGraph-based bounty workflow orchestrator.

This package provides a production-ready bounty workflow orchestrator
designed for Vertex AI Agent Engine deployment.

Key components:
- BountyOrchestrator: Main agent class following serialization protocol
- graph: Legacy compiled graph export for local testing (lazy-loaded)
- get_graph: Explicit function to get the compiled graph
- MemoryManager: Long-term memory with semantic search
"""

from .agent import BountyOrchestrator, graph, get_graph
from .memory import MemoryManager, get_store

__all__ = [
    "BountyOrchestrator",
    "graph",
    "get_graph",
    "MemoryManager",
    "get_store",
]
