# Surgical PR Contribution Tracker

Generated: 2026-01-10

## Methodology

**Surgical PRs** = Small, focused, template-based changes
- < 100 lines of code
- 1-3 files max
- Follow existing patterns
- Low competition (0-2 comments)

---

## Tier 1: Template-Based ($50-100) - BEST FOR SURGICAL

### archestra-ai/archestra - LLM Provider Integration
Each follows same template. Check docs: https://archestra.ai/docs/platform-adding-llm-providers

| Issue | Amount | Provider | Competition |
|-------|--------|----------|-------------|
| #1856 | $50 | Groq | Has PR |
| #1855 | $50 | MiniMax | Has PR |
| #1854 | $50 | Perplexity | Has PR |
| #1853 | $50 | Cerebras | Has PR |
| #1852 | $100 | Cohere | Has PR |
| #1851 | $50 | Z.ai (Zhipu) | Has PR |
| #1850 | $50 | x.ai (Grok) | Has PR |
| #1849 | $50 | Mistral | Has PR |
| #1846 | $50 | DeepSeek | Has PR |

**Strategy:** PRs exist but may not be merged. Check PR quality, improve if needed.

---

## Tier 2: Environment/Config Tasks ($50-200)

### PrimeIntellect-ai/prime-environments
Adding test environments for AI evaluation.

| Issue | Task | Complexity |
|-------|------|------------|
| #467 | Add polars_env | Small |
| #450 | Pandas Software Eval | Medium |
| #435 | UCI Prediction | Small |
| #432 | Add UBench | Small |
| #423 | MongoDB MCP env | Medium |
| #417 | Next.js | Medium |
| #380 | OpenbookQA env | Small |
| #360 | Exa MCP web search | Medium |
| #355 | Torch ao search | Medium |
| #354 | Codex CLI search | Medium |
| #352 | Next.js codebase search | Medium |

---

## Tier 3: High Value ($1,500) - Larger but well-defined

### tenstorrent/tt-metal - Model Bring-ups
Each is a model integration using TTNN APIs.

| Issue | Model | Type |
|-------|-------|------|
| #32143 | MoLE | ML |
| #32142 | Granite Timeseries | ML |
| #32140 | Time Series Transformer | ML |
| #32139 | PatchTST | ML |
| #32138 | PatchTSMixer | ML |
| #32137 | Informer | ML |
| #32069 | Bark Small (Audio) | Audio |
| #32068 | Higgs Audio v2 | Audio |
| #32064 | Llasa-3B | LLM |
| #31290 | DPT-Large | Vision |
| #31289 | MonoDiffusion | Vision |
| #31286 | Depth-Anything-V2 | Vision |

**Note:** These require ML expertise and Tenstorrent hardware knowledge.

---

## Tier 4: Documentation/Tutorial ($50-200)

### midnightntwrk/contributor-hub
Midnight blockchain tutorials and videos.

| Issue | Type | Topic |
|-------|------|-------|
| #237 | Tutorial | Private AMM |
| #236 | Video | DEX Order Book |
| #233 | Video | Private voting |
| #232 | Tutorial | Private state |
| #231 | Video | ZK Proofs intro |
| #230 | Tutorial | Dev environment |
| #229 | Tutorial | Private NFT Marketplace |
| #228 | Tutorial | Decentralized Identity |
| #227 | Tutorial | AI inference + proofs |
| #226 | Tutorial | Storage solutions |

---

## Tier 5: Web3/DeFi Agents

### daydreamsai/agent-bounties
Building DeFi monitoring agents.

| Issue | Agent | Function |
|-------|-------|----------|
| #10 | Bridge Route Pinger | Monitor bridges |
| #9 | Lending Liquidation Sentinel | Liquidation alerts |
| #8 | Perps Funding Pulse | Funding rate monitor |
| #7 | LP Impermanent Loss | IL calculator |
| #6 | Yield Pool Watcher | APY tracking |
| #5 | Approval Risk Auditor | Token approval risks |
| #4 | GasRoute Oracle | Gas optimization |
| #3 | Slippage Sentinel | Slippage alerts |
| #2 | Cross DEX Arbitrage | Arb opportunities |
| #1 | Fresh Markets Watch | New market scanner |

---

## Quick Wins (0 comments, simple)

| Repo | Issue | Task |
|------|-------|------|
| cortexlinux/cortex | #441 | CUDA/cuDNN installer |
| cortexlinux/cortex | #164 | Package dependency tree |
| cortexlinux/cortex | #163 | Multi-version packages |
| cortexlinux/cortex | #154 | Semantic version resolution |
| cortexlinux/cortex | #144 | Package install profiles |
| cortexlinux/cortex | #143 | System migration assistant |
| cortexlinux/cortex | #140 | Install script generator |
| ubounty-app/ubounty-demo | #9 | Test bounty (USDC) |

---

## Action Plan

1. **This week:** Fork archestra-ai, study their provider template
2. **First PR:** Pick provider with weakest existing PR, do it better
3. **Parallel:** Check daydreamsai agents - simpler scope
4. **Document:** Each PR should be < 100 LOC, < 3 files

---

## Stats

- Total bounty issues on GitHub: **2,759**
- Surgical opportunities identified: **~80**
- Estimated unclaimed value: **$15,000+**
