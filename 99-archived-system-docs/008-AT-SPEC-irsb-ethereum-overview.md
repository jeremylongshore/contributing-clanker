# IRSB Ethereum Overview

**System**: Intent Receipts & Solver Bonds - Solver Accountability Protocol
**Location**: `/home/jeremy/000-projects/ethereum/`
**Tagline**: "Intents need receipts. Solvers need skin in the game."

---

## What It Is

IRSB is an **Ethereum accountability protocol** for intent-based transactions. It provides the missing enforcement primitive that makes "solver-driven everything" safe at scale.

**Core Problem Solved**: ERC-7683 standardizes cross-chain intents, but provides no accountability. IRSB adds:
- **Intent Receipts**: On-chain proof that a solver executed work
- **Solver Bonds**: Staked collateral slashable for violations
- **Deterministic Enforcement**: Automated slashing without human judges

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              IRSB PROTOCOL                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                      SolverRegistry                               │  │
│  │  • Register solvers          • Manage bond deposits              │  │
│  │  • Track status (Active/Jailed/Banned)                           │  │
│  │  • 7-day cooldown on withdrawals                                 │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                   │                                     │
│                                   ▼                                     │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    IntentReceiptHub                               │  │
│  │  • Post receipts             • Verify signatures (ECDSA/EIP-712) │  │
│  │  • Manage dispute windows    • Execute deterministic slashing    │  │
│  │  • Batch posting (max 50)    • Finalize receipts                 │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                   │                                     │
│                                   ▼                                     │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     DisputeModule (v0.2)                          │  │
│  │  • Pluggable interface       • Evidence submission (24hr window) │  │
│  │  • Arbitration fees          • Escalation for subjective cases   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Language** | Solidity ^0.8.25 | Smart contracts |
| **Framework** | Foundry (Forge/Anvil/Cast) | Build, test, deploy |
| **Dependencies** | OpenZeppelin v5.5.0 | Security primitives |
| **Standards** | EIP-712, ERC-7683 | Signature, intent compatibility |
| **Testing** | Foundry Test | Unit + fuzz testing |

---

## Core Concepts

### 1. Intent Receipt

On-chain verifiable record that a solver executed an intent:

```solidity
struct IntentReceipt {
    bytes32 intentHash;       // What was requested
    bytes32 constraintsHash;  // What constraints were promised
    bytes32 routeHash;        // What path was used
    bytes32 outcomeHash;      // What outcome was achieved
    bytes32 evidenceHash;     // Where evidence lives (IPFS/Arweave)
    uint64  createdAt;
    uint64  expiry;
    bytes32 solverId;
    bytes   solverSig;
}
```

### 2. Solver Bonds

Economic accountability through staked collateral:

- **Minimum Bond**: 0.1 ETH
- **Slashable For**: Timeout, constraint violation, receipt forgery
- **Withdrawal Cooldown**: 7 days
- **Max Jails Before Ban**: 3

### 3. Deterministic Slashing

Automated enforcement without human judges:

| Violation | Trigger | Slashing |
|-----------|---------|----------|
| **Timeout** | Expiry passes, no valid settlement | 100% of locked bond |
| **Constraint Violation** | amountOut < minOut | Proportional to violation |
| **Receipt Forgery** | Invalid signature or schema | 100% + permanent ban |

### 4. Slashing Distribution

```
Total Slash Amount
├── 80% → User (compensation)
├── 15% → Challenger (reward)
└── 5%  → Treasury (protocol fee)

Challenger must bond 10% to open dispute
```

---

## Smart Contracts

### SolverRegistry.sol

```solidity
// Registration
function registerSolver(string metadataURI, address operator) external;

// Bond management
function depositBond(bytes32 solverId) external payable;
function withdrawBond(bytes32 solverId, uint256 amount) external;

// Status
function getSolverStatus(bytes32 solverId) external view returns (SolverStatus);
// Returns: Inactive | Active | Jailed | Banned
```

### IntentReceiptHub.sol

```solidity
// Receipt lifecycle
function postReceipt(IntentReceipt receipt) external;
function postReceiptBatch(IntentReceipt[] receipts) external; // max 50

// Disputes
function openDispute(bytes32 receiptId, DisputeReason reason, bytes evidence) external;
function resolveDeterministic(bytes32 receiptId) external;

// Finalization
function finalize(bytes32 receiptId) external;
```

### DisputeModule.sol

```solidity
// Evidence
function submitEvidence(bytes32 disputeId, bytes evidence) external; // 24hr window

// Arbitration
function escalate(bytes32 disputeId) external payable; // 0.01 ETH fee

// Resolution
function resolveDispute(bytes32 disputeId, bool slasherWins) external; // Admin/DAO
```

---

## Dispute Reasons

```solidity
enum DisputeReason {
    Timeout,           // Expiry passed without settlement
    MinOutViolation,   // Output less than promised minimum
    WrongToken,        // Different token than specified
    WrongChain,        // Settled on wrong chain
    WrongRecipient,    // Sent to wrong address
    ReceiptMismatch,   // Receipt doesn't match actual outcome
    InvalidSignature,  // Bad ECDSA signature
    Subjective         // Requires arbitration
}
```

---

## IntentScore (Reputation)

Protocol-native reputation computed from:

```solidity
struct IntentScore {
    uint64 totalFills;       // All attempts
    uint64 successfulFills;  // Completed without dispute
    uint32 disputesLost;     // Lost disputes
    uint256 totalSlashed;    // Total ETH slashed
}

// Derived metrics (off-chain):
// - Fill success rate
// - Time-to-finalization
// - Disputes per volume
// - Severity-weighted slashing events
```

---

## ERC-7683 Integration

IRSB sits alongside ERC-7683:

```
ERC-7683 Order Created
       │
       ▼
Solver claims order
       │
       ▼
Solver posts IRSB receipt (intentHash = hash of ERC-7683 order)
       │
       ▼
Solver executes cross-chain settlement
       │
       ▼
Solver posts outcome proof → Receipt finalizes
       │
       ▼
Success: Solver earns fee, reputation improves
Failure: Slashing triggered, user compensated
```

---

## How to Use Standalone

### Prerequisites
- Foundry installed (`curl -L https://foundry.paradigm.xyz | bash`)
- Ethereum RPC endpoint
- ETH for deployment and testing

### Build & Test
```bash
cd /home/jeremy/000-projects/ethereum

# Install dependencies
forge install

# Build contracts
forge build

# Run tests
forge test

# Run with verbose traces
forge test -vvv

# Check coverage
forge coverage
```

### Deploy
```bash
# Set environment
export RPC_URL=https://your-rpc-endpoint
export PRIVATE_KEY=0x...

# Deploy
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast
```

### Interact
```bash
# Register as solver
cast send $SOLVER_REGISTRY "registerSolver(string,address)" "ipfs://..." $OPERATOR --rpc-url $RPC_URL

# Deposit bond
cast send $SOLVER_REGISTRY "depositBond(bytes32)" $SOLVER_ID --value 0.1ether --rpc-url $RPC_URL
```

---

## Integration Points

### Inputs
- **ERC-7683 Orders**: Intent references
- **Settlement Proofs**: Cross-chain tx hashes
- **Evidence Bundles**: IPFS/Arweave hashes

### Outputs
- **Intent Receipts**: Verifiable execution proofs
- **Slashing Events**: Automated enforcement
- **Reputation Scores**: On-chain queryable

### Extension Points
- **DisputeModule**: Pluggable arbitration (Kleros, UMA, custom)
- **Governance**: DAO-controlled parameters
- **Cross-Chain**: Bridge adapters for multi-chain proofs

---

## What's Next

- **v0.2**: Full DisputeModule with arbitration fees
- **Testnet Deployment**: Sepolia + Holesky
- **SDK**: TypeScript/Python for integrators
- **ERC Proposal**: Formal "IRSB v0.1" specification
- **Integration**: Connect to Bounty System for verifiable AI work proofs
