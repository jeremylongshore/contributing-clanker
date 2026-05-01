# Archived System Docs

These documents describe the **deprecated `contribute-system` (formerly `bounty-system`) monorepo** — a Next.js dashboard, TS CLI, Cloud Functions service, and Vertex AI orchestrator that were planned and partially built but never actually used in practice.

On 2026-04-30 the entire monorepo was deleted from the repo and the GCP project (`intentional-bounty`) was scheduled for deletion. The system collapsed into a single `/contribute` Claude Code skill that talks directly to `gh` + the local SQLite tracker at `~/.contribute-system/contribute.db`.

These docs are kept for historical reference only. They describe a vision that wasn't adopted. Do not treat them as current architecture.

| File | What it described |
|------|-------------------|
| 003-DR-PLAN-master-contribution-portal.md | Multi-site web portal for tracking contributions |
| 004-DR-PLAN-contribution-dev-master-plan-v4.md | "Market domination engine" master plan |
| 005-AT-SPEC-contribute-system-overview.md | System architecture spec |
| 006-AT-SPEC-bobs-brain-overview.md | Bob's Brain integration |
| 007-AT-SPEC-git-with-intent-overview.md | Git With Intent integration |
| 008-AT-SPEC-irsb-ethereum-overview.md | On-chain accountability via Ethereum |
| 009-AT-DSGN-ultrathink-integration.md | Decentralized AI bounty marketplace |
| CONTRIBUTE-SYSTEM-ALIGNMENT-NOTES.md | Alignment notes from the rebrand |
| CONTRIBUTE-SYSTEM-VERIFICATION-REPORT.md | System verification report |

If we ever revive any of this, recover from `git log -- contribute-system/` and these docs.
