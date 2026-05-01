# Contributor User Manual

**For: Ope Ariyo**
**Created: January 2026**
**Version: 1.0**

Welcome to the Contribute System! This manual serves as both a learning guide and a testing checklist. Work through each section systematically to learn the system while helping us identify bugs.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Core Workflow](#2-core-workflow)
3. [CLI Commands Reference](#3-cli-commands-reference)
4. [Dashboard Guide](#4-dashboard-guide)
5. [Feature Testing Matrix](#5-feature-testing-matrix)
6. [Issue Reporting Protocol](#6-issue-reporting-protocol)
7. [Rules & Approval Workflow](#7-rules--approval-workflow)

---

## 1. Getting Started

### 1.1 Prerequisites

Before you begin, ensure you have:

- [ ] Node.js 20+ installed (`node --version`)
- [ ] pnpm installed (`pnpm --version`)
- [ ] Git configured with your GitHub account
- [ ] Access to the contribute-system repository
- [ ] Firebase CLI installed (`npm install -g firebase-tools`)

### 1.2 Environment Setup

```bash
# Clone the repository
git clone https://github.com/intent-solutions/contribute-system.git
cd contribute-system

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### 1.3 Configuration

Create your local environment file:

```bash
cd packages/cli
cp .env.example .env
# Edit .env with your credentials (ask Jeremy for values)
```

### 1.4 Verify Installation

**Test Case 1.4.1: CLI Installation**
```bash
# Run the CLI
pnpm --filter @contribute-system/cli start --help
```

**Expected Result:**
- CLI shows help with all available commands
- No error messages

**Test Case 1.4.2: Dashboard Startup**
```bash
# Start the dashboard
pnpm --filter @contribute-system/dashboard dev
```

**Expected Result:**
- Dashboard starts on http://localhost:3000
- No build errors in terminal

---

## 2. Core Workflow

This is the standard workflow for hunting bounties. Follow these steps in order.

### 2.1 Find a Bounty

**Step 1: Browse Available Bounties**

Using CLI:
```bash
bounty list --status open
```

Using Dashboard:
1. Go to http://localhost:3000/dashboard/discover
2. Use filters to search by source (GitHub/Algora)
3. Review scoring recommendations (Claim/Consider/Skip)

### 2.2 Evaluate a Bounty

Before claiming, always check:

1. **Read the issue carefully** - Understand requirements
2. **Check for competing PRs** - Don't duplicate work
3. **Verify your skills match** - Can you actually do this?
4. **Estimate time required** - Be realistic

Using CLI:
```bash
bounty show <bounty-id>
bounty vet <bounty-id>      # Run automated vetting
bounty score <bounty-id>    # Get AI-powered scoring
```

### 2.3 Claim a Bounty

```bash
bounty claim <bounty-id>
```

This will:
- Show pre-flight checklist
- Mark bounty as "claimed" in your tracker
- **Does NOT notify the maintainer yet** (approval required)

### 2.4 Start Working

```bash
bounty work start <bounty-id>
```

This will:
- Create a work session
- Start terminal recording (if asciinema installed)
- Update bounty status to "in_progress"

**During Work:**
```bash
# Add progress checkpoints frequently
bounty work checkpoint "Completed initial research"
bounty work checkpoint "Implemented basic structure"
bounty work checkpoint "Added tests"

# Check current session status
bounty work status
```

### 2.5 Stop Working

When done for the day or completing the bounty:

```bash
bounty work stop
```

This will:
- End the work session
- Upload recording to cloud storage
- Save all checkpoints

### 2.6 Submit for Approval

**IMPORTANT: This queues for Jeremy's approval - nothing is submitted externally yet!**

```bash
bounty submit <bounty-id> --pr <github-pr-url>
```

This creates a proof bundle with:
- Work sessions
- Terminal recordings
- Git stats (lines added/deleted)
- PR reference

**What happens next:**
1. Jeremy receives notification
2. Jeremy reviews your work
3. If approved, PR is submitted externally
4. If needs revision, you'll be notified

---

## 3. CLI Commands Reference

### 3.1 Bounty Management

| Command | Description | Example |
|---------|-------------|---------|
| `contribute list` | List all bounties | `contribute list --status open` |
| `contribute show <id>` | Show bounty details | `contribute show bty-123` |
| `contribute create` | Create new bounty | `contribute create --interactive` |
| `contribute claim <id>` | Claim a bounty | `contribute claim bty-123` |
| `contribute unclaim <id>` | Release a claim | `contribute unclaim bty-123 -r "Too complex"` |

### 3.2 Work Session Management

| Command | Description | Example |
|---------|-------------|---------|
| `contribute work start <id>` | Start work session | `contribute work start bty-123` |
| `contribute work checkpoint` | Add progress checkpoint | `contribute work checkpoint "Fixed auth bug"` |
| `contribute work status` | Check session status | `contribute work status` |
| `contribute work stop` | End work session | `contribute work stop -m "Done for today"` |
| `contribute work recordings` | List local recordings | `contribute work recordings` |

### 3.3 Submission & Vetting

| Command | Description | Example |
|---------|-------------|---------|
| `contribute submit <id>` | Submit for review | `contribute submit bty-123 --pr https://...` |
| `contribute vet <id>` | Run vetting checks | `contribute vet bty-123` |
| `contribute score <id>` | AI-powered scoring | `contribute score bty-123` |

### 3.4 Configuration

| Command | Description | Example |
|---------|-------------|---------|
| `contribute config` | Show/set config | `contribute config set github.token xyz` |
| `contribute github auth` | GitHub authentication | `contribute github auth` |

---

## 4. Dashboard Guide

### 4.1 Navigation

| Page | URL | Purpose |
|------|-----|---------|
| Overview | `/dashboard` | Summary stats and recent activity |
| Discover | `/dashboard/discover` | Find new bounties |
| Active | `/dashboard/active` | Your in-progress work |
| All Bounties | `/dashboard/bounties` | Complete bounty list |
| Financials | `/dashboard/financials` | Earnings tracking |
| Proofs | `/dashboard/proofs` | Proof bundles |
| Alerts | `/dashboard/alerts` | Notifications |
| Settings | `/dashboard/settings` | Configuration |

### 4.2 Discover Page

**Features to test:**
- [ ] Source filter (GitHub/Algora/All)
- [ ] Organization search
- [ ] Repository search
- [ ] Bounty label filter
- [ ] Recommendation filters (Claim/Consider/Skip)
- [ ] Mobile responsive layout

### 4.3 Active Bounties Page

**Features to test:**
- [ ] Phase tracker visualization
- [ ] Grouping by status (In Progress/Submitted/Needs Revision)
- [ ] Link to GitHub issues
- [ ] Link to GitHub PRs
- [ ] Timeline preview

### 4.4 Bounty Detail Page

**Features to test:**
- [ ] Maintainer info loading
- [ ] Issue preview panel
- [ ] Work sessions list
- [ ] Terminal recording playback
- [ ] Checkpoint timeline

---

## 5. Feature Testing Matrix

Complete each test and mark the result.

### 5.1 CLI Tests

| Test ID | Test Description | Steps | Expected Result | Actual | Pass? |
|---------|-----------------|-------|-----------------|--------|-------|
| CLI-001 | List open bounties | `contribute list --status open` | Shows table of open bounties | | |
| CLI-002 | Filter by domain | `contribute list -d frontend` | Only frontend bounties shown | | |
| CLI-003 | Show bounty details | `contribute show <id>` | Full bounty info displayed | | |
| CLI-004 | Claim bounty | `contribute claim <id>` | Pre-flight checklist shown, bounty claimed | | |
| CLI-005 | Claim already claimed | `contribute claim <claimed-id>` | Error: bounty not open | | |
| CLI-006 | Start work session | `contribute work start <id>` | Session created, recording starts | | |
| CLI-007 | Double session start | `contribute work start <id>` again | Error: session already active | | |
| CLI-008 | Add checkpoint | `contribute work checkpoint "test"` | Checkpoint added | | |
| CLI-009 | Check work status | `contribute work status` | Shows current session info | | |
| CLI-010 | Stop work session | `contribute work stop` | Session ended, summary shown | | |
| CLI-011 | Submit bounty | `contribute submit <id> --pr <url>` | Proof bundle created | | |
| CLI-012 | Submit wrong status | `contribute submit <open-bounty>` | Error: cannot submit | | |
| CLI-013 | Unclaim bounty | `contribute unclaim <id>` | Bounty returned to open | | |
| CLI-014 | List recordings | `contribute work recordings` | Local recordings listed | | |

### 5.2 Dashboard Tests

| Test ID | Test Description | Steps | Expected Result | Actual | Pass? |
|---------|-----------------|-------|-----------------|--------|-------|
| DASH-001 | Overview loads | Visit /dashboard | Stats displayed, no errors | | |
| DASH-002 | Discover search | Enter org name, click Search | Bounties from org shown | | |
| DASH-003 | Filter by source | Select "Algora" source | Only Algora bounties | | |
| DASH-004 | Recommendation filter | Click "Claim" filter | Only recommended bounties | | |
| DASH-005 | Active bounties | Visit /dashboard/active | Your bounties with phases | | |
| DASH-006 | Phase tracker | View bounty in different states | Correct phases highlighted | | |
| DASH-007 | Bounty detail | Click on bounty | Full details load | | |
| DASH-008 | Maintainer info | View bounty detail | Maintainer card shows | | |
| DASH-009 | Terminal recording | Play recording | Asciinema player works | | |
| DASH-010 | Mobile responsive | Resize to mobile width | Layout adapts correctly | | |
| DASH-011 | Dark mode | Toggle theme | All elements visible | | |
| DASH-012 | Empty states | View page with no data | Helpful empty state shown | | |

### 5.3 Integration Tests

| Test ID | Test Description | Steps | Expected Result | Actual | Pass? |
|---------|-----------------|-------|-----------------|--------|-------|
| INT-001 | Full claim flow | Discover -> Claim via CLI -> Check Dashboard | Bounty appears in Active | | |
| INT-002 | Work session sync | Start session CLI -> Check Dashboard | Session visible in UI | | |
| INT-003 | Checkpoint sync | Add checkpoint CLI -> Refresh Dashboard | Checkpoint in timeline | | |
| INT-004 | Submit flow | Submit CLI -> Check Dashboard | Status changes to submitted | | |
| INT-005 | Recording playback | Stop session -> View in Dashboard | Recording plays correctly | | |

---

## 6. Issue Reporting Protocol

When you encounter bugs or issues, create a GitHub issue with this template:

### Issue Template

```markdown
## Bug Report / Feature Request

**Type:** [Bug / Feature / Question]

### What I Was Doing
[Step-by-step of what I tried]
1. Step 1
2. Step 2
3. Step 3

### What I Expected
[Expected behavior]

### What Actually Happened
[Actual behavior - include error messages if any]

### Environment
- CLI version: [run `contribute --version`]
- Node version: [run `node --version`]
- OS: [your operating system]
- Browser (if dashboard): [browser name and version]

### Screenshots/Recordings
[Attach any relevant screenshots or terminal recordings]

### Test Case Reference
[If from testing matrix, include Test ID: e.g., CLI-007]
```

### Labels to Use

| Label | When to Use |
|-------|-------------|
| `ope-testing` | Always add this label |
| `bug` | Something is broken |
| `enhancement` | Feature request or improvement |
| `question` | Need clarification |
| `ui` | Dashboard/frontend issue |
| `cli` | Command-line issue |
| `critical` | Blocks core workflow |

### Example Issue

```markdown
## Bug Report

**Type:** Bug

### What I Was Doing
1. Ran `contribute work start bty-abc123`
2. Session started successfully
3. Ran `contribute work start bty-abc123` again

### What I Expected
Error message saying session already active

### What Actually Happened
New session started, overwriting the previous one

### Environment
- CLI version: 0.1.0
- Node version: 20.10.0
- OS: Ubuntu 22.04

### Test Case Reference
Test ID: CLI-007
```

---

## 7. Rules & Approval Workflow

### 7.1 Golden Rules

1. **NOTHING goes external without Jeremy's approval**
   - No PR submissions
   - No issue comments
   - No direct maintainer contact

2. **Always use the system**
   - Track all work through bounty CLI
   - Record work sessions
   - Add checkpoints frequently

3. **Report issues immediately**
   - Use GitHub issues
   - Include all context
   - Don't try to fix yourself (unless asked)

### 7.2 Approval Workflow

```
YOUR ACTIONS                    JEREMY'S APPROVAL NEEDED
──────────────────────────────────────────────────────────
Browse bounties                 No
Discover/search                 No
View bounty details             No
Claim bounty (internal)         No
Start work session              No
Record work                     No
Add checkpoints                 No
Stop work session               No
Submit for review               YES - Creates approval queue
Create GitHub PR                YES - Wait for approval
Comment on GitHub               YES - Wait for approval
Contact maintainer              YES - Wait for approval
```

### 7.3 Submission Process

1. **You do:**
   - Complete your work
   - Commit to your branch
   - Create PR draft locally
   - Run `contribute submit <id> --pr <draft-url>`

2. **System does:**
   - Creates proof bundle
   - Queues for approval
   - Notifies Jeremy via Slack

3. **Jeremy does:**
   - Reviews proof bundle
   - Reviews code changes
   - Approves or requests revision

4. **If approved:**
   - Jeremy submits PR externally
   - You get credited for the work
   - Bounty moves to "completed" when paid

5. **If needs revision:**
   - You receive feedback
   - Make changes
   - Submit again

### 7.4 Communication

- **Questions about bounties:** Create GitHub issue with `question` label
- **Bugs found:** Create GitHub issue with `bug` label
- **Urgent matters:** Message Jeremy directly on Slack
- **Daily standup:** Not required, but appreciated

---

## Quick Reference Card

### Essential Commands

```bash
# Find work
bounty list --status open
bounty show <id>

# Claim and start
bounty claim <id>
bounty work start <id>

# During work
bounty work checkpoint "message"
bounty work status

# Finish
bounty work stop
bounty submit <id> --pr <url>
```

### Status Flow

```
open → claimed → in_progress → submitted → [vetting] → completed
                     ↓                         ↓
                  unclaimed               revision
```

### Keyboard Shortcuts (Dashboard)

| Shortcut | Action |
|----------|--------|
| `?` | Show help |
| `d` | Go to Discover |
| `a` | Go to Active |
| `Esc` | Close modal |

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 2026 | Initial manual |

---

**Questions?** Create a GitHub issue with the `question` label and tag `@jeremy`.

Happy hunting!
