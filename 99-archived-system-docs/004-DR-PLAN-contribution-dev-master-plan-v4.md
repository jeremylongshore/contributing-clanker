# CONTRIBUTION DEV MASTER PLAN

## Intent Solutions IO — Market Domination Engine

**Version:** 4.0 ULTRATHINK Edition
**Author:** Jeremy Longshore
**Date:** January 2026
**Classification:** COMPREHENSIVE BATTLE PLAN

---

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║   "I have all the AI in the world at my fingertips.                          ║
║    I'm not trying to market my services —                                     ║
║    I'M TRYING TO STEAL THE MARKET."                                          ║
║                                                                               ║
║   This document is the complete blueprint for building an autonomous          ║
║   bounty domination system that will make the name JEREMY LONGSHORE          ║
║   synonymous with "gets it done, proves it, ships it."                       ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

---

# TABLE OF CONTENTS

## PART I: FOUNDATION
1. [Executive Summary](#1-executive-summary)
2. [System Vision](#2-system-vision)
3. [Architecture Overview](#3-architecture-overview)

## PART II: DATA & STORAGE
4. [Data Model](#4-data-model)
5. [Firestore Collections Deep Dive](#5-firestore-collections-deep-dive)
6. [Storage Strategy](#6-storage-strategy)

## PART III: CORE COMPONENTS
7. [Component Breakdown](#7-component-breakdown)
8. [Proof Artifact System](#8-proof-artifact-system)
9. [Vetting Pipeline](#9-vetting-pipeline)
10. [CLI Reference](#10-cli-reference)
11. [SKILL.md Specification](#11-skillmd-specification)
12. [Automation Layer](#12-automation-layer)

## PART IV: INTERFACES
13. [Web Dashboard](#13-web-dashboard)
14. [TUI Dashboard (Terminal)](#14-tui-dashboard-terminal)
15. [Mobile Experience (PWA)](#15-mobile-experience-pwa)

## PART V: INTELLIGENCE
16. [Opportunity Hunter Engine](#16-opportunity-hunter-engine)
17. [Monitoring & Alerting](#17-monitoring--alerting)
18. [Categorization & Taxonomy](#18-categorization--taxonomy)
19. [Intelligence & Learning](#19-intelligence--learning)

## PART VI: BUSINESS
20. [Domain-Based Tracking](#20-domain-based-tracking)
21. [Revenue & Business Operations](#21-revenue--business-operations)
22. [Market Domination System](#22-market-domination-system)
23. [Portfolio & Marketing Engine](#23-portfolio--marketing-engine)

## PART VII: SCALE & RELIABILITY
24. [Scalability Architecture](#24-scalability-architecture)
25. [Maintainability & Operations](#25-maintainability--operations)
26. [Observability & SLA](#26-observability--sla)
27. [Security Considerations](#27-security-considerations)

## PART VIII: ULTRATHINK ANALYSIS
28. [Gap Analysis - Complete](#28-gap-analysis---complete)
29. [Value Generation for Companies](#29-value-generation-for-companies)
30. [Competitive Moats](#30-competitive-moats)
31. [Risk Mitigation](#31-risk-mitigation)
32. [Innovation Opportunities](#32-innovation-opportunities)

## PART IX: EXECUTION
33. [Technology Stack](#33-technology-stack)
34. [Project Structure](#34-project-structure)
35. [Build Phases](#35-build-phases)
36. [Multi-Site Portal Architecture](#36-multi-site-portal-architecture)
37. [Implementation Checklist](#37-implementation-checklist)

## APPENDICES
- [A: Quick Reference Card](#appendix-a-quick-reference-card)
- [B: Complete Firestore Schemas](#appendix-b-complete-firestore-schemas)
- [C: Configuration Files](#appendix-c-configuration-files)
- [D: Runbooks](#appendix-d-runbooks)
- [E: API Reference](#appendix-e-api-reference)

---

# PART I: FOUNDATION

---

# 1. Executive Summary

## 1.1 What This System Is

This is an **autonomous OSS contribution engine** — a complete system for discovering, claiming, executing, proving, and monetizing software bounties at scale.

### The Core Value Proposition

| For You (Jeremy) | For Companies Posting Bounties |
|------------------|-------------------------------|
| Find opportunities before anyone else | Issues get fixed faster |
| Execute at 10x speed with AI | Consistent, verified quality |
| Prove every action with evidence | Transparent work process |
| Build compounding reputation | Reduced risk with proof bundles |
| Automate the entire workflow | Predictable delivery patterns |
| Scale without burning out | Documentation as a byproduct |

### System Capabilities at a Glance

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CAPABILITY MATRIX                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  DETECTION          EXECUTION           VERIFICATION       REPUTATION      │
│  ─────────          ─────────           ────────────       ──────────      │
│  • GitHub           • Claude Code       • Unit tests       • Proof portals │
│  • Algora           • tmux sessions     • Integration      • Case studies  │
│  • Gitcoin          • asciinema rec     • Security scan    • Social dist   │
│  • Replit           • Playwright        • Code quality     • Testimonials  │
│  • RSS feeds        • Checkpoints       • Performance      • Leaderboards  │
│  • Email            • Git tracking      • Manual review    • Badges        │
│  • Webhooks         • Multi-parallel    • Proof bundles    • Analytics     │
│                                                                             │
│  BUSINESS           AUTOMATION          SCALE              INTELLIGENCE    │
│  ────────           ──────────          ─────              ────────────    │
│  • Invoicing        • Auto-claim        • Horizontal       • Prediction    │
│  • Payments         • Auto-work         • Queue mgmt       • Categorize    │
│  • Rate cards       • Auto-submit       • Load balance     • Similar find  │
│  • Contracts        • Notifications     • Circuit break    • Learn/adapt   │
│  • Tax tracking     • Scheduling        • Backpressure     • Market intel  │
│  • Multi-domain     • Self-healing      • Multi-region     • Competitor    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 1.2 The Flywheel Effect

Every completed bounty makes the next one easier:

```
                         ┌──────────────────┐
                         │                  │
              ┌──────────│     DETECT       │──────────┐
              │          │   opportunities  │          │
              │          └────────┬─────────┘          │
              │                   │                    │
              │                   ▼                    │
              │          ┌──────────────────┐          │
              │          │                  │          │
              │          │      CLAIM       │          │
              │          │   fastest wins   │          │
              │          └────────┬─────────┘          │
              │                   │                    │
              │                   ▼                    │
              │          ┌──────────────────┐          │
              │          │                  │          │
              │          │     EXECUTE      │          │
              │          │  Claude + record │          │
              │          └────────┬─────────┘          │
              │                   │                    │
    ┌─────────┴─────────┐         │                    │
    │                   │         ▼                    │
    │      REPEAT       │ ┌──────────────────┐         │
    │                   │ │                  │         │
    │  More bounties    │ │      VERIFY      │         │
    │  More reputation  │ │   test + proof   │         │
    │  More revenue     │ └────────┬─────────┘         │
    │  More data        │         │                    │
    │                   │         ▼                    │
    └─────────┬─────────┘ ┌──────────────────┐         │
              │          │                  │          │
              │          │     DELIVER      │          │
              │          │   PR + bundle    │          │
              │          └────────┬─────────┘          │
              │                   │                    │
              │                   ▼                    │
              │          ┌──────────────────┐          │
              │          │                  │          │
              │          │     PUBLISH      │          │
              │          │  portal + social │          │
              │          └────────┬─────────┘          │
              │                   │                    │
              │                   ▼                    │
              │          ┌──────────────────┐          │
              │          │                  │          │
              └──────────│     CONVERT      │──────────┘
                         │  reputation $$  │
                         │                  │
                         └──────────────────┘
```

**Why it compounds:**

1. **More completions** → Better reputation → More trust → Higher-value bounties
2. **More data** → Better predictions → Smarter claiming → Higher win rate
3. **More proofs** → Stronger portfolio → More inbound → Less hunting needed
4. **More automation** → Less manual work → More parallel capacity → More throughput

## 1.3 Success Metrics

### Primary KPIs

| Metric | Target | Current | Gap |
|--------|--------|---------|-----|
| Detection Latency | < 5 min | N/A | Build monitor system |
| Claim Success Rate | > 80% | N/A | Build auto-claim |
| Completion Rate | > 95% | N/A | Track all bounties |
| Vetting Pass Rate | > 98% | N/A | Build vetting pipeline |
| Client Satisfaction | > 4.8/5 | N/A | Build feedback system |
| Revenue Growth | +20%/mo | N/A | Track in ledger |
| Portfolio Growth | +10/mo | N/A | Auto-generate proofs |

### Operational Metrics

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| Time to First Commit | < 30 min | Speed shows professionalism |
| Average Cycle Time | < 6 hours | Fast delivery wins |
| Defect Rate | < 2% | Quality builds trust |
| Recording Coverage | 100% | Every action proved |
| Documentation Coverage | 100% | Proofs are complete |

### Business Metrics

| Metric | Target | Calculation |
|--------|--------|-------------|
| Effective Hourly Rate | > $75/hr | Revenue / Active Hours |
| Client Retention | > 80% | Repeat clients / Total |
| Pipeline Value | > $10k | Open bounties sum |
| Monthly Recurring | > $5k | Retainer revenue |

---

# 2. System Vision

## 2.1 The Problem Space

### Current State of the Bounty Market

The bounty ecosystem is **fragmented and inefficient**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     BOUNTY MARKET PROBLEMS                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  DISCOVERY FRAGMENTATION                                                    │
│  ─────────────────────────                                                  │
│  • GitHub issues with bounty labels (no standard)                           │
│  • Algora (requires account, separate UI)                                   │
│  • Gitcoin (crypto-focused, complex)                                        │
│  • Replit Bounties (small, scattered)                                       │
│  • Twitter/Discord mentions (impossible to track)                           │
│  • Company blogs/newsletters (manual monitoring)                            │
│                                                                             │
│  → You spend MORE TIME FINDING work than DOING work                         │
│                                                                             │
│  SPEED DISADVANTAGE                                                         │
│  ─────────────────────                                                      │
│  • Best bounties get claimed in minutes                                     │
│  • Manual monitoring = always late                                          │
│  • No unified notification system                                           │
│  • Sleep = miss opportunities                                               │
│                                                                             │
│  → First claimer often wins, even if less qualified                         │
│                                                                             │
│  TRUST PROBLEM                                                              │
│  ─────────────────                                                          │
│  • No standardized proof of work                                            │
│  • "I fixed it" isn't verifiable                                            │
│  • Past work doesn't compound into reputation                               │
│  • Each bounty starts from zero trust                                       │
│                                                                             │
│  → You re-prove yourself every single time                                  │
│                                                                             │
│  QUALITY INCONSISTENCY                                                      │
│  ───────────────────────                                                    │
│  • No standard vetting process                                              │
│  • Manual testing is error-prone                                            │
│  • Security issues slip through                                             │
│  • No evidence of testing done                                              │
│                                                                             │
│  → Companies can't trust deliveries; delays and disputes                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### The Opportunity

You have **asymmetric advantages**:

1. **AI Leverage** — Claude Code can execute at superhuman speed
2. **Technical Depth** — You understand the full stack
3. **Systems Thinking** — You can build the infrastructure
4. **Time** — You're willing to invest in the system

These advantages are **multiplicative**, not additive. The system makes each advantage compound.

## 2.2 The Solution Architecture

### Core Philosophy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                     DESIGN PRINCIPLES                                       │
│                                                                             │
│  1. EVERY ACTION IS RECORDED                                                │
│     ─────────────────────────                                               │
│     Nothing happens off the record. Terminal sessions, browser              │
│     interactions, commits, test runs — all captured, timestamped,           │
│     checksummed. This creates irrefutable proof.                            │
│                                                                             │
│  2. EVERY CLAIM IS VERIFIABLE                                               │
│     ────────────────────────                                                │
│     No "trust me" — everything has evidence. Test reports, coverage         │
│     numbers, security scans, recordings. The evidence speaks.               │
│                                                                             │
│  3. EVERY BOUNTY BUILDS THE PORTFOLIO                                       │
│     ──────────────────────────────────                                      │
│     Completed bounties don't disappear. They become case studies,           │
│     proof bundles, portfolio entries. Each one compounds reputation.        │
│                                                                             │
│  4. FINANCIAL STATE IS ALWAYS ACCURATE                                      │
│     ─────────────────────────────────                                       │
│     Know exactly what's earned, pending, paid. Real-time ledger             │
│     with full audit trail. No surprises.                                    │
│                                                                             │
│  5. AUTOMATION IS TRANSPARENT                                               │
│     ────────────────────────────                                            │
│     When Claude Code works autonomously, every step is logged.              │
│     Humans can review, intervene, or override at any point.                 │
│                                                                             │
│  6. SPEED WITHOUT SACRIFICING QUALITY                                       │
│     ──────────────────────────────────                                      │
│     Fast doesn't mean sloppy. Automated vetting ensures quality             │
│     gates are passed before any submission.                                 │
│                                                                             │
│  7. SCALE HORIZONTALLY                                                      │
│     ─────────────────────                                                   │
│     The system handles 10x load without architectural changes.              │
│     Add capacity by adding instances, not rewriting code.                   │
│                                                                             │
│  8. FAIL GRACEFULLY                                                         │
│     ─────────────────                                                       │
│     When things go wrong (and they will), the system degrades               │
│     gracefully. No data loss. No silent failures. Always recoverable.       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Layers of the System

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                        SYSTEM LAYERS                                        │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    OPPORTUNITY LAYER                                 │   │
│  │                                                                      │   │
│  │  Sources:  GitHub | Algora | Gitcoin | Replit | RSS | Email | API   │   │
│  │                           ↓                                          │   │
│  │  Monitors: Real-time detection with < 5 min latency                 │   │
│  │                           ↓                                          │   │
│  │  Processor: Normalize → Dedup → Categorize → Score → Route          │   │
│  │                           ↓                                          │   │
│  │  Output: opportunities/ and bounties/ in Firestore                  │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    ↓                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    DECISION LAYER                                    │   │
│  │                                                                      │   │
│  │  Alert Engine: Slack | Email | SMS | Push (based on rules)          │   │
│  │                           ↓                                          │   │
│  │  Auto-Dispatch: Score >= threshold → claim + spawn worker           │   │
│  │                           ↓                                          │   │
│  │  Queue: Priority queue for human review if needed                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    ↓                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    EXECUTION LAYER                                   │   │
│  │                                                                      │   │
│  │  Watcher: Monitors bounties, manages sessions                       │   │
│  │                           ↓                                          │   │
│  │  Session Manager: tmux sessions, process lifecycle                  │   │
│  │                           ↓                                          │   │
│  │  Claude Code: SKILL.md-guided autonomous execution                  │   │
│  │                           ↓                                          │   │
│  │  Recording: asciinema terminal + Playwright browser                 │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    ↓                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    VERIFICATION LAYER                                │   │
│  │                                                                      │   │
│  │  Build: Compile/transpile success                                   │   │
│  │  Lint: Code quality and style                                       │   │
│  │  Test: Unit, integration, coverage                                  │   │
│  │  Security: SAST, dependency audit, secrets scan                     │   │
│  │  Performance: Benchmark comparison (optional)                       │   │
│  │                           ↓                                          │   │
│  │  Proof Bundle: recordings + git + vetting → checksummed bundle      │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    ↓                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    DELIVERY LAYER                                    │   │
│  │                                                                      │   │
│  │  PR Creation: Auto-create with proof links                          │   │
│  │  Client Notification: Alert stakeholders                            │   │
│  │  Status Update: bounty → completed                                  │   │
│  │  Ledger Entry: Financial tracking                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    ↓                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    REPUTATION LAYER                                  │   │
│  │                                                                      │   │
│  │  Domain Portals: Per-client proof-of-work showrooms                 │   │
│  │  Public Portfolio: Curated best work                                │   │
│  │  Case Studies: Auto-generated from proof bundles                    │   │
│  │  Social Distribution: Scheduled posts about wins                    │   │
│  │  Analytics: Track what resonates                                    │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    ↓                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    BUSINESS LAYER                                    │   │
│  │                                                                      │   │
│  │  Invoicing: Generate from completed bounties                        │   │
│  │  Payments: Track receipts, reconcile                                │   │
│  │  Contracts: SOW templates per domain                                │   │
│  │  Tax: Categorize for 1099, track expenses                          │   │
│  │  Forecasting: Project pipeline value                                │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 2.3 End State Vision

When fully operational, this is what a day looks like:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                     A DAY IN THE LIFE (FUTURE STATE)                        │
│                                                                             │
│  6:00 AM  System detected 3 new bounties overnight                         │
│           • $200 GitHub - auth fix (auto-claimed, Claude working)          │
│           • $500 Algora - API integration (queued for review)              │
│           • $75 Replit - docs update (auto-claimed, completed at 4am)      │
│                                                                             │
│  8:00 AM  Wake up, check phone (PWA dashboard)                             │
│           • $75 bounty completed, proof published, awaiting payment        │
│           • $200 bounty 80% complete, Claude checkpoint: "tests passing"   │
│           • $500 bounty needs approval → review, approve, Claude starts    │
│                                                                             │
│  9:30 AM  $200 bounty submitted, vetting passed                            │
│           • PR created automatically                                        │
│           • Client notified                                                 │
│           • Proof bundle generated                                          │
│                                                                             │
│  11:00 AM High-value alert: $1,200 security audit bounty                   │
│           • Manual claim (high value)                                       │
│           • Start work personally with recording                            │
│                                                                             │
│  2:00 PM  $200 bounty merged, marked delivered                             │
│           • Ledger updated                                                  │
│           • Domain portal updated                                           │
│                                                                             │
│  4:00 PM  Security audit complete, submit                                  │
│           • Vetting passes                                                  │
│           • Manual review triggered (security category)                     │
│           • Review own work, approve                                        │
│           • PR created, client notified                                     │
│                                                                             │
│  6:00 PM  Daily digest email:                                              │
│           • Completed: 3 bounties ($1,475)                                 │
│           • In progress: 1 bounty ($500)                                   │
│           • Pipeline: 12 opportunities ($4,200)                            │
│           • Month to date: $8,400                                          │
│                                                                             │
│  10:00 PM System continues monitoring, Claude starts next bounty           │
│                                                                             │
│  Revenue today: $1,475                                                      │
│  Active hours: 4 (security audit)                                          │
│  Effective rate: $368.75/hr                                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# 3. Architecture Overview

## 3.1 High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                  EXTERNAL SOURCES                                   │
│                                                                                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │ GitHub  │ │ Algora  │ │ Gitcoin │ │ Replit  │ │ Twitter │ │  RSS    │          │
│  │  API    │ │  API    │ │  API    │ │  API    │ │  API    │ │ Feeds   │          │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘          │
│       │          │          │          │          │          │                     │
│       └──────────┴──────────┴─────┬────┴──────────┴──────────┘                     │
│                                   │                                                 │
└───────────────────────────────────┼─────────────────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                            GOOGLE CLOUD PLATFORM                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│  │                         MONITORING LAYER (Cloud Run)                             │ │
│  │                                                                                  │ │
│  │   ┌─────────────────────────────────────────────────────────────────────────┐   │ │
│  │   │                          SOURCE MONITORS                                 │   │ │
│  │   │                                                                          │   │ │
│  │   │   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐              │   │ │
│  │   │   │  GitHub  │  │  Algora  │  │  Gitcoin │  │  Others  │              │   │ │
│  │   │   │ Monitor  │  │ Monitor  │  │ Monitor  │  │ Monitors │              │   │ │
│  │   │   │          │  │          │  │          │  │          │              │   │ │
│  │   │   │ Webhook+ │  │ Poll 5m  │  │ Poll 15m │  │ Various  │              │   │ │
│  │   │   │ Poll 5m  │  │          │  │          │  │          │              │   │ │
│  │   │   └─────┬────┘  └─────┬────┘  └─────┬────┘  └─────┬────┘              │   │ │
│  │   │         │             │             │             │                    │   │ │
│  │   │         └─────────────┴─────────────┴─────────────┘                    │   │ │
│  │   │                              │                                          │   │ │
│  │   │                              ▼                                          │   │ │
│  │   │   ┌──────────────────────────────────────────────────────────────────┐ │   │ │
│  │   │   │                    EVENT PROCESSOR                                │ │   │ │
│  │   │   │                                                                   │ │   │ │
│  │   │   │  Normalize → Dedup → Categorize → Score → Route → Domain Assign  │ │   │ │
│  │   │   │                                                                   │ │   │ │
│  │   │   └───────────────────────────┬──────────────────────────────────────┘ │   │ │
│  │   │                               │                                         │   │ │
│  │   └───────────────────────────────┼─────────────────────────────────────────┘   │ │
│  │                                   │                                              │ │
│  └───────────────────────────────────┼──────────────────────────────────────────────┘ │
│                                      │                                                │
│          ┌───────────────────────────┼───────────────────────────┐                   │
│          │                           │                           │                   │
│          ▼                           ▼                           ▼                   │
│  ┌──────────────────┐    ┌────────────────────────┐    ┌──────────────────┐         │
│  │  ALERT ENGINE    │    │       FIRESTORE        │    │  AUTO-DISPATCH   │         │
│  │ (Cloud Function) │    │    (Central State)     │    │ (Cloud Run Job)  │         │
│  │                  │    │                        │    │                  │         │
│  │ • Slack instant  │    │  ┌──────────────────┐  │    │ • Check rules    │         │
│  │ • SMS critical   │    │  │ opportunities/   │  │    │ • Claim bounty   │         │
│  │ • Email digest   │    │  │ bounties/        │  │    │ • Spawn worker   │         │
│  │ • Push notify    │    │  │ work_items/      │  │    │                  │         │
│  │                  │    │  │ proofs/          │  │    │                  │         │
│  └──────────────────┘    │  │ ledger/          │  │    └────────┬─────────┘         │
│                          │  │ domains/         │  │             │                   │
│                          │  │ sessions/        │  │             │                   │
│                          │  │ activity/        │  │             │                   │
│                          │  │ monitors/        │  │             │                   │
│                          │  │ config/          │  │             │                   │
│                          │  └──────────────────┘  │             │                   │
│                          │                        │             │                   │
│                          └───────────┬────────────┘             │                   │
│                                      │                          │                   │
│          ┌───────────────────────────┼──────────────────────────┼───────────────┐   │
│          │                           │                          │               │   │
│          ▼                           ▼                          ▼               │   │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────────┐   │   │
│  │  WEB DASHBOARD   │    │ DOMAIN PORTALS   │    │    WATCHER DAEMON        │   │   │
│  │ (Firebase Host)  │    │ (Firebase Host)  │    │       (GCE VM)           │   │   │
│  │                  │    │                  │    │                          │   │   │
│  │ • Command center │    │ • bigclient/     │    │ • Poll Firestore         │   │   │
│  │ • Opportunity    │    │ • opensource/    │    │ • Manage tmux sessions   │   │   │
│  │   scanner        │    │ • etc.           │    │ • Health monitoring      │   │   │
│  │ • Active work    │    │                  │    │ • Auto-restart           │   │   │
│  │ • Financials     │    │ Per-client proof │    │                          │   │   │
│  │ • Proofs         │    │ showroom         │    └────────────┬─────────────┘   │   │
│  │ • TUI launcher   │    │                  │                 │                 │   │
│  └──────────────────┘    └──────────────────┘                 │                 │   │
│                                                               │                 │   │
│                                                               ▼                 │   │
│                                              ┌────────────────────────────────┐ │   │
│                                              │     CLAUDE CODE WORKER POOL   │ │   │
│                                              │                                │ │   │
│                                              │  ┌────────────────────────┐   │ │   │
│                                              │  │   tmux: bounty-abc123  │   │ │   │
│                                              │  │   ● asciinema recording│   │ │   │
│                                              │  │   ● SKILL.md loaded    │   │ │   │
│                                              │  │   ● bounty-cli ready   │   │ │   │
│                                              │  └────────────────────────┘   │ │   │
│                                              │                                │ │   │
│                                              │  ┌────────────────────────┐   │ │   │
│                                              │  │   tmux: bounty-def456  │   │ │   │
│                                              │  │   ● asciinema recording│   │ │   │
│                                              │  │   ● SKILL.md loaded    │   │ │   │
│                                              │  │   ● bounty-cli ready   │   │ │   │
│                                              │  └────────────────────────┘   │ │   │
│                                              │                                │ │   │
│                                              └────────────────────────────────┘ │   │
│                                                                                 │   │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│   │
│  │                           CLOUD STORAGE                                      ││   │
│  │                                                                              ││   │
│  │  gs://bounty-proofs/                gs://bounty-assets/                     ││   │
│  │  ├── {bountyId}/                    ├── domains/{domain}/                   ││   │
│  │  │   ├── terminal.cast              │   └── logo.png                        ││   │
│  │  │   ├── browser.webm               └── templates/                          ││   │
│  │  │   ├── screenshots/                                                        ││   │
│  │  │   ├── vetting/                   gs://bounty-logs/                       ││   │
│  │  │   └── manifest.json              └── sessions/{sessionId}.log            ││   │
│  │  └── ...                                                                     ││   │
│  │                                                                              ││   │
│  └─────────────────────────────────────────────────────────────────────────────┘│   │
│                                                                                  │   │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## 3.2 Component Responsibilities

| Component | Responsibility | Scaling Strategy |
|-----------|---------------|------------------|
| **Source Monitors** | Detect opportunities from external sources | Horizontal (add monitors) |
| **Event Processor** | Normalize, dedup, categorize, score, route | Horizontal (Cloud Run auto-scale) |
| **Alert Engine** | Send notifications based on rules | Cloud Function (auto-scale) |
| **Auto-Dispatch** | Claim bounties, spawn workers | Cloud Run Job (triggered) |
| **Watcher Daemon** | Monitor bounties, manage sessions | Vertical (one instance) |
| **Session Manager** | Create/destroy tmux sessions | Part of Watcher |
| **Claude Code Workers** | Execute bounty work | Horizontal (multiple sessions) |
| **Vetting Pipeline** | Run quality checks, generate proofs | Cloud Function (auto-scale) |
| **Web Dashboard** | User interface | Firebase Hosting (CDN) |
| **Domain Portals** | Client-facing proof portals | Firebase Hosting (CDN) |
| **Firestore** | Central state storage | Managed (auto-scale) |
| **Cloud Storage** | Binary artifacts (recordings, proofs) | Managed (auto-scale) |

---

# 33. Technology Stack

## 33.1 Complete Stack Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TECHNOLOGY STACK                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  LAYER              TECHNOLOGY              PURPOSE                         │
│  ─────              ──────────              ───────                         │
│                                                                             │
│  DATABASE           Firestore               Central state, real-time sync  │
│                                                                             │
│  STORAGE            Cloud Storage           Recordings, proofs, assets     │
│                                                                             │
│  COMPUTE            Cloud Run               Monitoring, processing         │
│                     Cloud Functions         Event triggers, webhooks       │
│                     GCE VM                  Watcher daemon, Claude Code    │
│                                                                             │
│  HOSTING            Firebase Hosting        Dashboard, portals             │
│                                                                             │
│  AUTH               Firebase Auth           User authentication            │
│                                                                             │
│  MESSAGING          Pub/Sub                 Event pipeline, async jobs     │
│                     Cloud Tasks             Durable work queues            │
│                                                                             │
│  SCHEDULING         Cloud Scheduler         Cron jobs, digests             │
│                                                                             │
│  SECRETS            Secret Manager          API keys, tokens               │
│                                                                             │
│  MONITORING         Cloud Monitoring        Metrics, dashboards            │
│                     Cloud Logging           Centralized logs               │
│                     Error Reporting         Exception tracking             │
│                                                                             │
│  CLI                Node.js + TypeScript    bounty-cli tool                │
│                                                                             │
│  RECORDING          asciinema               Terminal recording             │
│                     Playwright              Browser recording              │
│                     FFmpeg                  Video processing               │
│                                                                             │
│  AI                 Claude API              Code execution, review         │
│                     Vertex AI (optional)    Embeddings, predictions        │
│                                                                             │
│  INTEGRATIONS       GitHub API              Issues, PRs, webhooks          │
│                     Slack API               Notifications                  │
│                     SendGrid                Email                          │
│                     Twilio                  SMS                            │
│                     Stripe                  Payments                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 33.2 Version Requirements

```yaml
# Runtime versions
node: "20.x"
python: "3.11+"
go: "1.21+" # Optional, for performance-critical components

# Key dependencies
typescript: "5.x"
firebase-admin: "12.x"
@google-cloud/firestore: "7.x"
@google-cloud/storage: "7.x"
commander: "12.x"  # CLI framework
ink: "4.x"  # TUI framework
asciinema: "2.4+"
playwright: "1.40+"

# Development
eslint: "8.x"
prettier: "3.x"
vitest: "1.x"
```

---

# 35. Build Phases

## 35.1 Phase Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BUILD PHASES                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PHASE 1: Foundation (Weeks 1-2)                                           │
│  ────────────────────────────────                                           │
│  • Firestore schema + rules                                                │
│  • bounty-cli core (list, show, create, claim)                            │
│  • Basic config management                                                 │
│  • Manual bounty creation                                                  │
│                                                                             │
│  PHASE 2: Recording (Weeks 2-3)                                            │
│  ──────────────────────────────                                             │
│  • asciinema integration                                                   │
│  • Recording start/stop/checkpoint                                         │
│  • Upload to Cloud Storage                                                 │
│  • Basic proof structure                                                   │
│                                                                             │
│  PHASE 3: GitHub Integration (Weeks 3-4)                                   │
│  ───────────────────────────────────────                                    │
│  • GitHub webhook handler                                                  │
│  • Issue → bounty creation                                                 │
│  • PR tracking                                                             │
│  • Commit sync                                                             │
│                                                                             │
│  PHASE 4: Vetting Pipeline (Weeks 4-5)                                     │
│  ─────────────────────────────────────                                      │
│  • Build/lint/test checks                                                  │
│  • Security scanning                                                       │
│  • Proof bundle generation                                                 │
│  • Status transitions                                                      │
│                                                                             │
│  PHASE 5: Notifications (Week 5)                                           │
│  ───────────────────────────────                                            │
│  • Slack integration                                                       │
│  • Email via SendGrid                                                      │
│  • Alert rules engine                                                      │
│  • Digest scheduling                                                       │
│                                                                             │
│  PHASE 6: Automation (Weeks 6-7)                                           │
│  ───────────────────────────────                                            │
│  • Watcher daemon                                                          │
│  • tmux session management                                                 │
│  • Claude Code dispatch                                                    │
│  • SKILL.md refinement                                                     │
│  • Session monitoring                                                      │
│                                                                             │
│  PHASE 7: Dashboard (Weeks 7-8)                                            │
│  ──────────────────────────────                                             │
│  • React app setup                                                         │
│  • Core pages (bounties, proofs, financials)                              │
│  • Real-time updates                                                       │
│  • Firebase Hosting deploy                                                 │
│                                                                             │
│  PHASE 8: Monitoring Layer (Weeks 8-9)                                     │
│  ─────────────────────────────────────                                      │
│  • GitHub monitor (webhook + poll)                                         │
│  • Event processor                                                         │
│  • Categorization engine                                                   │
│  • Scoring system                                                          │
│  • Alert dispatcher                                                        │
│                                                                             │
│  PHASE 9: Domains (Weeks 9-10)                                             │
│  ─────────────────────────────                                              │
│  • Domain CRUD                                                             │
│  • Auto-assignment logic                                                   │
│  • Domain proof portals                                                    │
│  • Per-domain stats                                                        │
│                                                                             │
│  PHASE 10: External Sources (Weeks 10-11)                                  │
│  ────────────────────────────────────────                                   │
│  • Algora monitor                                                          │
│  • Gitcoin monitor                                                         │
│  • RSS/webhook monitors                                                    │
│  • Unified opportunity feed                                                │
│                                                                             │
│  PHASE 11: Intelligence (Weeks 11-12)                                      │
│  ────────────────────────────────────                                       │
│  • Similar bounty finder                                                   │
│  • Time estimation                                                         │
│  • Profitability tracking                                                  │
│  • Pre-flight checks                                                       │
│                                                                             │
│  PHASE 12: Scale & Polish (Weeks 12+)                                      │
│  ────────────────────────────────────                                       │
│  • Multi-session workers                                                   │
│  • TUI dashboard                                                           │
│  • Mobile PWA                                                              │
│  • AI code review                                                          │
│  • Self-healing                                                            │
│  • Documentation                                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# 36. Multi-Site Portal Architecture

## 36.1 The Three Domains

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       MULTI-SITE ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  DOMAIN 1: intentsolutions.io                                              │
│  ────────────────────────────                                               │
│  Purpose: Company/service brand                                            │
│  Content: Services, about, contact                                         │
│  Portal: /portal/* → bounty dashboard                                      │
│  Proof: /proof/* → client proof portals                                    │
│                                                                             │
│  DOMAIN 2: startaitools.io                                                 │
│  ─────────────────────────                                                  │
│  Purpose: AI tools/products brand                                          │
│  Content: Tool showcase, documentation                                     │
│  Portal: /portal/* → bounty dashboard (same app)                           │
│  Impact: /impact/* → public proof showcase                                 │
│                                                                             │
│  DOMAIN 3: jeremylongshore.com                                             │
│  ───────────────────────────                                                │
│  Purpose: Personal brand/portfolio                                         │
│  Content: About, blog, portfolio                                           │
│  Portal: /portal/* → bounty dashboard (same app)                           │
│  Case Studies: /work/* → detailed case studies                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 36.2 Unified Portal Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                    ONE PORTAL APP, THREE DOMAINS                            │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      PORTAL APP (Cloud Run)                          │   │
│  │                                                                      │   │
│  │  Routes:                                                             │   │
│  │  • /portal/dashboard     - Main command center                       │   │
│  │  • /portal/opportunities - Opportunity scanner                       │   │
│  │  • /portal/bounties      - Bounty list                               │   │
│  │  • /portal/bounties/:id  - Bounty detail                             │   │
│  │  • /portal/proofs        - Proof library                             │   │
│  │  • /portal/financials    - Ledger and stats                          │   │
│  │  • /portal/domains       - Domain management                         │   │
│  │  • /portal/settings      - Configuration                             │   │
│  │                                                                      │   │
│  │  Public routes:                                                      │   │
│  │  • /proof/:domain        - Domain proof portal (public)              │   │
│  │  • /proof/:domain/:slug  - Individual proof (public)                 │   │
│  │  • /impact               - Public impact showcase                     │   │
│  │                                                                      │   │
│  │  Theming:                                                            │   │
│  │  • Host-based theme detection                                        │   │
│  │  • intentsolutions.io → Intent Solutions theme                       │   │
│  │  • startaitools.io → StartAI theme                                   │   │
│  │  • jeremylongshore.com → Personal theme                              │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│                              ▲                                              │
│                              │                                              │
│          ┌───────────────────┼───────────────────┐                         │
│          │                   │                   │                         │
│          │                   │                   │                         │
│  ┌───────┴───────┐   ┌───────┴───────┐   ┌───────┴───────┐                │
│  │               │   │               │   │               │                │
│  │ intentsolu-   │   │ startaitools  │   │ jeremylong-   │                │
│  │ tions.io      │   │ .io           │   │ shore.com     │                │
│  │               │   │               │   │               │                │
│  │ Firebase      │   │ Firebase      │   │ Firebase      │                │
│  │ Hosting       │   │ Hosting       │   │ Hosting       │                │
│  │               │   │               │   │               │                │
│  │ Rewrites:     │   │ Rewrites:     │   │ Rewrites:     │                │
│  │ /portal/* →   │   │ /portal/* →   │   │ /portal/* →   │                │
│  │   Cloud Run   │   │   Cloud Run   │   │   Cloud Run   │                │
│  │ /proof/* →    │   │ /impact/* →   │   │ /work/* →     │                │
│  │   Cloud Run   │   │   Cloud Run   │   │   Cloud Run   │                │
│  │               │   │               │   │               │                │
│  └───────────────┘   └───────────────┘   └───────────────┘                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 36.3 Firebase Hosting Configuration

```json
// intentsolutions.io/firebase.json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*"],
    "rewrites": [
      {
        "source": "/portal/**",
        "run": {
          "serviceId": "bounty-portal",
          "region": "us-central1"
        }
      },
      {
        "source": "/proof/**",
        "run": {
          "serviceId": "bounty-portal",
          "region": "us-central1"
        }
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

---

# Appendix A: Quick Reference Card

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                       BOUNTY CLI QUICK REFERENCE                              ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  FIND WORK                                                                    ║
║  ─────────                                                                    ║
║    bounty scan                         # Scan all sources now                 ║
║    bounty scan --watch                 # Continuous scanning                  ║
║    bounty opportunities                # List detected opportunities          ║
║    bounty list                         # List all bounties                    ║
║    bounty list --status=open           # Filter by status                     ║
║    bounty list --domain=bigclient      # Filter by domain                     ║
║    bounty show <id>                    # View bounty details                  ║
║                                                                               ║
║  START WORK                                                                   ║
║  ──────────                                                                   ║
║    bounty claim <id>                   # Claim a bounty                       ║
║    bounty work start <id>              # Start work + recording               ║
║                                                                               ║
║  DURING WORK                                                                  ║
║  ───────────                                                                  ║
║    bounty work checkpoint "msg"        # Mark milestone                       ║
║    bounty work status                  # Check current session                ║
║    bounty work log                     # View work log                        ║
║                                                                               ║
║  FINISH WORK                                                                  ║
║  ───────────                                                                  ║
║    bounty work stop                    # Stop recording                       ║
║    bounty submit <id>                  # Submit for vetting                   ║
║                                                                               ║
║  VETTING                                                                      ║
║  ───────                                                                      ║
║    bounty vet <id> --local             # Run vetting locally                  ║
║    bounty vet status <id>              # Check vetting status                 ║
║                                                                               ║
║  PROOFS                                                                       ║
║  ──────                                                                       ║
║    bounty proof show <id>              # View proof bundle                    ║
║    bounty proof verify <id>            # Verify integrity                     ║
║    bounty proof publish <id>           # Publish to portal                    ║
║                                                                               ║
║  FINANCIAL                                                                    ║
║  ─────────                                                                    ║
║    bounty ledger show                  # View transactions                    ║
║    bounty ledger summary               # Monthly summary                      ║
║    bounty ledger --domain=bigclient    # Filter by domain                     ║
║                                                                               ║
║  MONITORING                                                                   ║
║  ──────────                                                                   ║
║    bounty monitor status               # Check all monitors                   ║
║    bounty monitor test github          # Test specific monitor                ║
║    bounty alert test                   # Send test notification               ║
║                                                                               ║
║  DOMAINS                                                                      ║
║  ───────                                                                      ║
║    bounty domain list                  # List all domains                     ║
║    bounty domain show <slug>           # Domain details                       ║
║    bounty domain create <slug>         # Create new domain                    ║
║                                                                               ║
║  SESSIONS                                                                     ║
║  ────────                                                                     ║
║    bounty session list                 # List active sessions                 ║
║    bounty session attach <id>          # Attach to tmux session               ║
║    bounty session kill <id>            # Kill session                         ║
║                                                                               ║
║  CONFIG                                                                       ║
║  ──────                                                                       ║
║    bounty config init                  # Initialize config                    ║
║    bounty config show                  # Show current config                  ║
║    bounty config set <key> <value>     # Set config value                     ║
║                                                                               ║
║  TUI                                                                          ║
║  ───                                                                          ║
║    bounty tui                          # Launch terminal UI                   ║
║                                                                               ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  STATUS FLOW                                                                  ║
║  ───────────                                                                  ║
║  open → claimed → in_progress → submitted → vetting → completed → paid       ║
║                                                                               ║
║  MONITOR FLOW                                                                 ║
║  ────────────                                                                 ║
║  source → detect → dedup → categorize → score → route → alert/claim          ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

---

# END OF DOCUMENT

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║                    BOUNTY DEV MASTER PLAN v4.0                               ║
║                       ULTRATHINK EDITION                                      ║
║                                                                               ║
║                    Intent Solutions IO                                        ║
║                    Jeremy Longshore                                           ║
║                    January 2026                                               ║
║                                                                               ║
║  "Track everything. Record everything. Prove everything. Dominate everything."║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```
