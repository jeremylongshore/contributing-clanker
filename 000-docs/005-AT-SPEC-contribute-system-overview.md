# Contribute System Overview

**System**: Autonomous OSS Contribution Engine
**Location**: `/home/jeremy/000-projects/contributions/contribute-system/`
**Status**: Phases 1-6 Complete | Active Development

---

## What It Is

The Contribute System is an autonomous bounty tracking and proof-of-work platform that:

1. **Sources bounties** from GitHub issues, Algora, and direct entries
2. **Vets opportunities** through automated quality pipelines
3. **Tracks work** with terminal recordings and checkpoints
4. **Generates proofs** with cryptographic verification
5. **Publishes results** across 3 branded websites

Built for a developer who hunts open source bounties professionally and needs verifiable proof of work.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         BOUNTY SYSTEM                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │   CLI        │    │  Dashboard   │    │   Vetting    │              │
│  │  bounty-cli  │    │  (Next.js)   │    │   Pipeline   │              │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘              │
│         │                   │                    │                      │
│         └───────────────────┼────────────────────┘                      │
│                             │                                           │
│                    ┌────────▼────────┐                                  │
│                    │    Firestore    │                                  │
│                    │   (Real-time)   │                                  │
│                    └────────┬────────┘                                  │
│                             │                                           │
│         ┌───────────────────┼───────────────────┐                       │
│         │                   │                   │                       │
│  ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐                 │
│  │ intent      │    │ startai     │    │ jeremy      │                 │
│  │ solutions.io│    │ tools.io    │    │ longshore   │                 │
│  └─────────────┘    └─────────────┘    └─────────────┘                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | Next.js 15, React 19, Tailwind | Dashboard & Portal |
| **Backend** | Firebase Cloud Functions | Webhooks, Automation |
| **Database** | Firestore (Native mode) | Real-time bounty state |
| **Storage** | Cloud Storage | Recordings, proof bundles |
| **Auth** | Firebase Auth | Google + GitHub SSO |
| **Hosting** | Firebase Hosting | 3 domains with rewrites |
| **Build** | Turborepo + pnpm | Monorepo management |

---

## Key Components

### 1. CLI (`packages/cli`)

```bash
bounty list                    # List all bounties
bounty show <id>               # Show bounty details
bounty create                  # Create new bounty
bounty claim <id>              # Claim a bounty
bounty work start <id>         # Start recording work
bounty work checkpoint "msg"   # Create checkpoint
bounty work stop               # Stop recording
bounty submit <id>             # Submit for vetting
bounty vet <id>                # Run vetting pipeline
```

### 2. Dashboard (`apps/dashboard`)

Private portal with Firebase Auth:
- **Dashboard**: Overview, stats, recent activity
- **Bounties**: List, filter, manage bounties
- **Proofs**: View recordings, screenshots, vetting results
- **Financials**: Revenue tracking, payment status
- **Settings**: Profile, notifications

### 3. Vetting Pipeline (`packages/vetting`)

Automated quality gates:
```
Clone → Build → Lint → Test → Security → Bundle
```

Each stage produces verifiable artifacts with checksums.

### 4. Recording System (`packages/recording`)

Captures terminal work with asciinema:
- Starts recording on `contribute work start`
- Creates checkpoints with messages
- Uploads to Cloud Storage on stop
- Generates proof manifest with hashes

---

## Data Model

### Firestore Collections

```typescript
// bounties/{bountyId}
{
  title: string;
  value: number;
  currency: 'USD' | 'ETH' | 'BTC';
  status: 'open' | 'claimed' | 'in_progress' | 'submitted' | 'completed' | 'paid';
  source: 'github' | 'algora' | 'direct';
  repo: string;
  issue?: string;
  pr?: string;
  domainId: string;
  categories: string[];
  timeline: Checkpoint[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// proofs/{proofId}
{
  bountyId: string;
  recordings: string[];      // Cloud Storage URLs
  screenshots: string[];
  vetting: VettingResult;
  manifest: string;          // Hash of all artifacts
  checksums: Record<string, string>;
  published: boolean;
  createdAt: Timestamp;
}

// domains/{domainId}
{
  name: string;
  slug: string;
  branding: ThemeConfig;
  stats: {
    completed: number;
    revenue: number;
    avgCycleTime: number;
  }
}
```

---

## Multi-Site Architecture

One codebase, three branded experiences:

| Domain | Target | Theme |
|--------|--------|-------|
| `intentsolutions.io/portal` | `intent` | Blue (#2563eb) |
| `startaitools.io/portal` | `startai` | Green (#059669) |
| `jeremylongshore.com/portal` | `jeremy` | Purple (#7c3aed) |

Host-based theming in middleware:
```typescript
// middleware.ts
const SITE_MAP = {
  'intentsolutions.io': 'intent',
  'startaitools.io': 'startai',
  'jeremylongshore.com': 'jeremy',
};

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host');
  const siteId = SITE_MAP[hostname] || 'default';
  response.headers.set('x-site-id', siteId);
  return response;
}
```

---

## How to Use Standalone

### Prerequisites
- Node.js 20+
- pnpm 9+
- Firebase project with Firestore enabled
- GCP project with Cloud Storage

### Setup
```bash
cd /home/jeremy/000-projects/contributions/contribute-system

# Install dependencies
pnpm install

# Configure Firebase
firebase login
firebase use --add

# Set environment variables
cp .env.example .env.local
# Edit with your Firebase config

# Run development server
pnpm dev
```

### Deploy
```bash
# Build all packages
pnpm build

# Deploy to Firebase
firebase deploy
```

---

## Integration Points

### Inputs
- **GitHub Webhooks**: Auto-create bounties from labeled issues
- **Algora API**: Import bounties from Algora platform
- **Manual Entry**: CLI or dashboard for direct bounties

### Outputs
- **Proof Bundles**: Verifiable work artifacts
- **Public Proof Wall**: Showcase completed bounties
- **Stats API**: Portfolio metrics for external consumption

### Extension Points
- **Automation Rules**: YAML-based auto-claim engine
- **Notification Channels**: Slack, email, SMS
- **Worker Assignment**: Route bounties to external systems

---

## What's Next

- **Phase 7**: Public proof wall with polished showcases
- **Phase 8**: Notifications and automation rules engine
- **Integration**: Connect to Bob's Brain and Git With Intent for autonomous execution
