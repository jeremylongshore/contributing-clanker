"""Long-term memory for bounty orchestrator using LangGraph Store.

This module provides semantic-searchable memory using PostgreSQL + pgvector.
Memory persists across sessions and enables learning from past outcomes.

Memory Architecture:
- Short-term (Thread checkpoints): Current workflow state via PostgresSaver
- Long-term (Cross-thread Store): Repo knowledge, learnings, user preferences

Namespaces:
- ("repos", "<repo_id>"): Repository knowledge profiles
- ("bounties", "<bounty_id>"): Individual bounty tracking
- ("learnings", "rejections"): Lessons from rejected PRs (semantic searchable)
- ("learnings", "successes"): What worked well (semantic searchable)
- ("users", "<user_id>"): User preferences and settings
"""

import logging
import os
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Namespace constants for consistent access
NAMESPACE_REPOS = ("repos",)
NAMESPACE_BOUNTIES = ("bounties",)
NAMESPACE_LEARNINGS = ("learnings",)
NAMESPACE_USERS = ("users",)


def get_store():
    """Get production LangGraph Store with semantic search.

    Uses PostgreSQL + pgvector for cross-session memory.
    Falls back to in-memory store for development.

    Returns:
        LangGraph Store instance
    """
    database_url = os.environ.get("DATABASE_URL")

    if not database_url:
        # Dev fallback - warn loudly
        logger.warning(
            "DATABASE_URL not set - using in-memory store (data will be lost)"
        )
        from langgraph.store.memory import InMemoryStore

        return InMemoryStore()

    # Production: PostgreSQL with Vertex AI embeddings for semantic search
    try:
        from langchain_google_vertexai import VertexAIEmbeddings
        from langgraph.store.postgres import PostgresStore

        embeddings = VertexAIEmbeddings(model_name="text-embedding-004")

        store = PostgresStore(
            connection_string=database_url,
            index={
                "dims": 768,  # text-embedding-004 dimensions
                "embed": embeddings,
                "fields": ["text", "embedding_text"],  # Fields to embed
            },
        )

        logger.info("Initialized PostgresStore with pgvector semantic search")
        return store

    except ImportError as e:
        logger.error(f"Failed to import PostgresStore dependencies: {e}")
        raise
    except Exception as e:
        logger.error(f"Failed to initialize PostgresStore: {e}")
        raise


class MemoryManager:
    """High-level interface for bounty orchestrator memory operations.

    Provides typed methods for common memory operations:
    - Repo knowledge storage and retrieval
    - Bounty state tracking
    - Learning from outcomes
    """

    def __init__(self, store=None):
        """Initialize memory manager.

        Args:
            store: Optional LangGraph Store instance. If not provided,
                   creates one using get_store().
        """
        self.store = store or get_store()

    # ==========================================
    # Repo Knowledge Operations
    # ==========================================

    async def get_repo_profile(self, repo_id: str) -> Optional[Dict[str, Any]]:
        """Get stored repo profile.

        Args:
            repo_id: Unique repo identifier (e.g., "github_com_posthog_posthog")

        Returns:
            Repo profile dict or None if not found
        """
        try:
            result = await self.store.aget(
                namespace=(*NAMESPACE_REPOS, repo_id),
                key="profile",
            )
            return result.value if result else None
        except Exception as e:
            logger.error(f"Failed to get repo profile {repo_id}: {e}")
            return None

    async def save_repo_profile(self, repo_id: str, profile: Dict[str, Any]) -> None:
        """Save or update repo profile.

        Args:
            repo_id: Unique repo identifier
            profile: Repo profile data including:
                - quick_summary: List of key points
                - commands: Dict of lint/test commands
                - style_rules: Dict of style requirements
                - gotchas: List of known issues
                - last_synced: ISO timestamp
        """
        await self.store.aput(
            namespace=(*NAMESPACE_REPOS, repo_id),
            key="profile",
            value=profile,
        )
        logger.info(f"Saved repo profile: {repo_id}")

    async def list_repos(self) -> List[Tuple[str, Dict[str, Any]]]:
        """List all tracked repos.

        Returns:
            List of (repo_id, profile) tuples
        """
        results = await self.store.alist(namespace=NAMESPACE_REPOS)
        return [(r.key, r.value) for r in results]

    # ==========================================
    # Bounty State Operations
    # ==========================================

    async def get_bounty_state(self, bounty_id: str) -> Optional[Dict[str, Any]]:
        """Get current bounty workflow state.

        Args:
            bounty_id: Unique bounty identifier

        Returns:
            Bounty state dict or None if not found
        """
        try:
            result = await self.store.aget(
                namespace=(*NAMESPACE_BOUNTIES, bounty_id),
                key="state",
            )
            return result.value if result else None
        except Exception as e:
            logger.error(f"Failed to get bounty state {bounty_id}: {e}")
            return None

    async def save_bounty_state(
        self, bounty_id: str, state: Dict[str, Any]
    ) -> None:
        """Save or update bounty workflow state.

        Args:
            bounty_id: Unique bounty identifier
            state: Bounty state including:
                - phase: Current workflow phase (A-F)
                - issue_url: GitHub issue URL
                - repo_id: Reference to repo profile
                - issue_summary: AI-generated summary
                - competition: Competition check results
                - implementation: Implementation state
                - checkpoint_id: LangGraph checkpoint reference
        """
        await self.store.aput(
            namespace=(*NAMESPACE_BOUNTIES, bounty_id),
            key="state",
            value=state,
        )
        logger.info(f"Saved bounty state: {bounty_id} (phase: {state.get('phase', '?')})")

    async def list_bounties_by_phase(self, phase: str) -> List[Dict[str, Any]]:
        """List bounties by workflow phase.

        Args:
            phase: Phase to filter by (A, B, C, D, E, F)

        Returns:
            List of bounty states matching the phase
        """
        all_bounties = await self.store.alist(namespace=NAMESPACE_BOUNTIES)
        return [
            {"id": b.key, **b.value}
            for b in all_bounties
            if b.value.get("phase") == phase
        ]

    # ==========================================
    # Learning Operations (Semantic Searchable)
    # ==========================================

    async def record_learning(
        self,
        category: str,  # "rejections" or "successes"
        learning_id: str,
        repo: str,
        description: str,
        lesson: str,
    ) -> None:
        """Record a learning for future reference.

        Args:
            category: "rejections" or "successes"
            learning_id: Unique identifier for this learning
            repo: Repository this learning relates to
            description: What happened
            lesson: The key takeaway
        """
        await self.store.aput(
            namespace=(*NAMESPACE_LEARNINGS, category),
            key=f"learn_{learning_id}",
            value={
                "repo": repo,
                "what_happened": description,
                "lesson": lesson,
                # This field is embedded for semantic search
                "embedding_text": f"{repo} {category} {lesson}",
            },
        )
        logger.info(f"Recorded learning ({category}): {lesson[:50]}...")

    async def search_learnings(
        self, query: str, category: Optional[str] = None, limit: int = 5
    ) -> List[Dict[str, Any]]:
        """Semantic search over past learnings.

        Args:
            query: Search query (natural language)
            category: Optional filter ("rejections" or "successes")
            limit: Maximum results to return

        Returns:
            List of matching learnings with similarity scores
        """
        namespace = NAMESPACE_LEARNINGS
        if category:
            namespace = (*NAMESPACE_LEARNINGS, category)

        results = await self.store.asearch(
            namespace=namespace,
            query=query,
            limit=limit,
        )
        return [{"score": r.score, **r.value} for r in results]

    async def get_repo_gotchas(self, repo_id: str) -> List[str]:
        """Get gotchas for a repo, including learned ones.

        Combines:
        - Static gotchas from repo profile
        - Learned gotchas from rejection learnings

        Args:
            repo_id: Unique repo identifier

        Returns:
            List of gotcha strings
        """
        gotchas = []

        # Get static gotchas from profile
        profile = await self.get_repo_profile(repo_id)
        if profile:
            gotchas.extend(profile.get("gotchas", []))

        # Search for learned gotchas from rejections
        repo_name = repo_id.replace("_", "/").replace("github/com/", "")
        learnings = await self.search_learnings(
            query=f"rejection {repo_name}",
            category="rejections",
            limit=3,
        )
        for learning in learnings:
            if learning.get("lesson"):
                gotchas.append(learning["lesson"])

        return list(set(gotchas))  # Deduplicate

    # ==========================================
    # User Preferences
    # ==========================================

    async def get_user_preferences(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get user preferences.

        Args:
            user_id: Unique user identifier

        Returns:
            User preferences dict or None
        """
        result = await self.store.aget(
            namespace=(*NAMESPACE_USERS, user_id),
            key="preferences",
        )
        return result.value if result else None

    async def save_user_preferences(
        self, user_id: str, preferences: Dict[str, Any]
    ) -> None:
        """Save user preferences.

        Args:
            user_id: Unique user identifier
            preferences: User preferences including:
                - tech_stack: Preferred technologies
                - automation_rules: Auto-filter rules
                - notification_preferences: Email/Slack settings
        """
        await self.store.aput(
            namespace=(*NAMESPACE_USERS, user_id),
            key="preferences",
            value=preferences,
        )
        logger.info(f"Saved user preferences: {user_id}")
