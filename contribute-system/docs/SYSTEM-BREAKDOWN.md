# Contribute System Overview

**For: Ope Ariyo**
**Created: January 2026**

---

## What Is This?

The Contribute System is a platform for finding, tracking, and completing open source bounties. Companies and projects post bounties (cash rewards) for specific issues they want solved. We find these bounties, work on them, and earn money when our PRs get merged.

**The Goal:** Earn extra income by solving real-world software problems for open source projects.

---

## How It Works

### The Big Picture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BOUNTY SOURCES                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │    GitHub    │  │    Algora    │  │  Other APIs  │          │
│  │   Issues     │  │   Platform   │  │   (future)   │          │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘          │
└─────────┼─────────────────┼────────────────────────────────────┘
          │                 │
          ▼                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BOUNTY SYSTEM                              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    DASHBOARD (Web UI)                      │ │
│  │  • Discover bounties          • Track progress             │ │
│  │  • View scoring/recommendations • Manage submissions       │ │
│  │  • Watch terminal recordings  • Monitor earnings           │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                      CLI (Command Line)                    │ │
│  │  • bounty list/claim/submit   • bounty work start/stop    │ │
│  │  • bounty vet/score           • bounty work checkpoint    │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    FIREBASE (Database)                     │ │
│  │  • Bounty tracking            • Work sessions              │ │
│  │  • Proof bundles              • User settings              │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      JEREMY'S APPROVAL                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  • Reviews proof bundles      • Approves/rejects           │ │
│  │  • Submits PRs externally     • Handles maintainer comms   │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      EXTERNAL WORLD                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  GitHub PR   │  │  Maintainer  │  │   Payment    │          │
│  │  Submitted   │  │   Review     │  │   Received   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

---

## The Components

### 1. Dashboard (Web App)

A Next.js web application where you can:
- **Discover** new bounties from GitHub and Algora
- **Track** your active work
- **View** terminal recordings of your work sessions
- **Monitor** earnings and statistics

URL: http://localhost:3000 (development)

### 2. CLI (Command Line Tool)

The primary tool for contributors. Used to:
- List and search bounties
- Claim bounties for work
- Track work sessions with recordings
- Submit completed work for review

### 3. Core Library

Shared code including:
- TypeScript schemas (Zod validation)
- Firebase integration
- Utility functions

### 4. Firebase (Backend)

Cloud database storing:
- Bounty records
- Work sessions
- Proof bundles
- Terminal recordings (Cloud Storage)

---

## Your Role

As a contributor, you will:

1. **Find Bounties**
   - Use the Dashboard or CLI to discover opportunities
   - Evaluate difficulty, competition, and maintainer activity
   - Pick bounties that match your skills

2. **Claim and Work**
   - Claim bounties you want to work on
   - Start work sessions (with recording)
   - Add checkpoints to document progress
   - Write code, tests, documentation

3. **Submit for Review**
   - Create a PR in the target repository
   - Submit through our system
   - Wait for Jeremy's approval

4. **Report Issues**
   - When something breaks, create GitHub issues
   - Help us improve the system

---

## The Approval Workflow (Important!)

**Nothing goes to the outside world without Jeremy's approval.**

This is critical for several reasons:
- Quality control before maintainers see our work
- Learning opportunity to improve submissions
- Protecting our reputation with maintainers
- Ensuring proper proof of work

### What You Control

| Action | Approval Needed? |
|--------|------------------|
| Browse/search bounties | No |
| Claim bounty (internal tracking) | No |
| Start/stop work sessions | No |
| Add checkpoints | No |
| Write code | No |
| Create local PR draft | No |
| Submit for review | No (queues for approval) |

### What Requires Approval

| Action | Approval Needed? |
|--------|------------------|
| Submit PR to external repo | YES |
| Comment on GitHub issues | YES |
| Contact maintainers | YES |

---

## Typical Bounty Lifecycle

```
1. DISCOVER
   └── Find bounty on Dashboard or via `contribute list`
   └── Check: Value, difficulty, competition, maintainer activity

2. EVALUATE
   └── Run `contribute vet <id>` for automated checks
   └── Run `contribute score <id>` for AI recommendation
   └── Read the actual issue/requirements

3. CLAIM
   └── Run `contribute claim <id>`
   └── Review pre-flight checklist
   └── Status: open → claimed

4. WORK
   └── Run `contribute work start <id>`
   └── Terminal recording begins
   └── Add checkpoints: `contribute work checkpoint "message"`
   └── Write code, commit to branch
   └── Status: claimed → in_progress

5. COMPLETE
   └── Run `contribute work stop`
   └── Recording saved and uploaded
   └── Create PR in target repo (draft)

6. SUBMIT
   └── Run `contribute submit <id> --pr <url>`
   └── Proof bundle created with recordings, stats
   └── Status: in_progress → submitted
   └── Notification sent to Jeremy

7. REVIEW
   └── Jeremy reviews proof bundle
   └── Jeremy reviews code quality
   └── Either approves or requests revision

8. APPROVAL
   └── Jeremy submits PR externally
   └── Status: submitted → vetting

9. PAYMENT
   └── Maintainer merges PR
   └── Payment processed through bounty platform
   └── Status: vetting → completed
```

---

## What Makes a Good Bounty?

When evaluating bounties, look for:

### Green Flags

- **Active maintainer** - Recently merged PRs, responds to issues
- **Clear requirements** - Well-defined acceptance criteria
- **No competing PRs** - You won't duplicate effort
- **Reasonable value** - Pay matches complexity
- **Matches your skills** - You can actually do it

### Red Flags

- **Stale issue** - Posted months ago, no activity
- **Vague requirements** - Unclear what "done" means
- **Multiple PRs exist** - Competition already working
- **Toxic maintainer** - History of rejecting PRs rudely
- **Too complex** - Requires deep project knowledge

### The Scoring System

Our AI scoring rates bounties on:
- **Complexity** (estimated lines of code, difficulty)
- **Competition** (existing PRs, claimed status)
- **Maintainer** (activity, responsiveness)
- **Value** (pay per estimated hour)

Recommendations:
- **Claim** - High score, good opportunity
- **Consider** - Medium score, evaluate carefully
- **Skip** - Low score, probably not worth it

---

## Tools You'll Use

### Required

- **Git** - Version control
- **Node.js 20+** - Runtime
- **pnpm** - Package manager
- **VS Code** or editor of choice

### Recommended

- **asciinema** - Terminal recording
  ```bash
  pip install asciinema
  ```
- **GitHub CLI (gh)** - GitHub operations
  ```bash
  # Install varies by OS
  gh auth login
  ```

### Project-Specific

Each bounty target may require different tools:
- Python projects: `python3`, `pip`, `pytest`
- Rust projects: `cargo`, `rustc`
- Frontend: Various frameworks

---

## File Structure

```
contribute-system/
├── apps/
│   └── dashboard/          # Next.js web app
│       ├── src/
│       │   ├── app/        # Pages (App Router)
│       │   ├── components/ # UI components
│       │   └── lib/        # Utilities & hooks
│       └── package.json
│
├── packages/
│   ├── cli/               # Command-line tool
│   │   ├── src/
│   │   │   ├── commands/  # CLI commands
│   │   │   └── lib/       # CLI utilities
│   │   └── package.json
│   │
│   └── core/              # Shared library
│       ├── src/
│       │   └── schemas/   # Zod schemas
│       └── package.json
│
├── services/
│   └── contribute-orchestrator/ # Python backend (future)
│
├── docs/                  # Documentation (you are here)
├── 000-docs/              # DevOps documentation
└── package.json           # Root package.json
```

---

## Getting Help

### Documentation

1. **This document** - System overview
2. **USER-MANUAL-OPE.md** - Testing guide and commands
3. **001-AA-AUDT-appaudit-devops-playbook.md** - Technical operations

### Communication

- **GitHub Issues** - For bugs and questions
- **Slack** - For urgent matters (message Jeremy)

### When Stuck

1. Check the documentation first
2. Try the `--help` flag on CLI commands
3. Create a GitHub issue with the `question` label
4. Message Jeremy on Slack if urgent

---

## Summary

1. **Use the system** - Track all work through bounty CLI
2. **Document everything** - Add checkpoints, record sessions
3. **Submit for approval** - Nothing goes external without review
4. **Report issues** - Help us improve
5. **Ask questions** - No question is too small

Welcome aboard! Let's hunt some bounties.
