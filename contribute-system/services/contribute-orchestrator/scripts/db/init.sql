-- Intentional Bounty - PostgreSQL Database Initialization
-- Run this once on your self-hosted PostgreSQL instance
-- Requires: PostgreSQL 15+ with pgvector extension available

-- Enable pgvector extension (required for semantic search)
CREATE EXTENSION IF NOT EXISTS vector;

-- Create schema for langgraph
CREATE SCHEMA IF NOT EXISTS langgraph;

-- Grant permissions (adjust 'bounty_user' to your actual user)
-- GRANT ALL ON SCHEMA langgraph TO bounty_user;
-- GRANT ALL ON ALL TABLES IN SCHEMA langgraph TO bounty_user;

-- LangGraph will auto-create these tables, but here's what to expect:
--
-- langgraph.checkpoints - Workflow state checkpoints
--   - thread_id (text): Unique identifier for each workflow execution
--   - checkpoint_ns (text): Namespace for the checkpoint
--   - checkpoint_id (text): Unique checkpoint identifier
--   - parent_checkpoint_id (text): Parent checkpoint for branching
--   - type (text): Checkpoint type
--   - checkpoint (bytea): Serialized state
--   - metadata (jsonb): Additional metadata
--   - created_at (timestamp): Creation time
--
-- langgraph.writes - Pending writes
--   - thread_id (text)
--   - checkpoint_ns (text)
--   - checkpoint_id (text)
--   - task_id (text)
--   - idx (integer)
--   - channel (text)
--   - type (text)
--   - blob (bytea)
--
-- For LangGraph Store (long-term memory):
-- langgraph.store - Key-value store with vector search
--   - namespace (text[]): Hierarchical namespace
--   - key (text): Item key within namespace
--   - value (jsonb): Stored data
--   - embedding (vector): Optional embedding for semantic search
--   - created_at (timestamp)
--   - updated_at (timestamp)

-- Test that pgvector is working
SELECT '[1,2,3]'::vector;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Database initialized successfully!';
    RAISE NOTICE 'pgvector extension is enabled and working.';
    RAISE NOTICE 'LangGraph will auto-create tables on first use.';
END $$;
