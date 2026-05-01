# Bounty System Alignment Notes

**Generated:** 2026-02-04
**Purpose:** Gap analysis between mega-prompts and current implementation

---

## 1. What Matches Prior Mega-Prompts

| Feature | Status | Notes |
|---------|--------|-------|
| Slack Mandatory Command Center | ✅ ALIGNED | strict=true default, --no-slack bypass |
| Forked repos at ~/000-forked/ | ✅ ALIGNED | bootstrap.ts, env.ts use this path |
| Estimates as Lo/Best/Hi minutes | ✅ ALIGNED | engagement_metrics has est_minutes_lo/best/hi |
| Hi <= 480 cap | ✅ ALIGNED | scoring.ts enforces max 480 |
| Index-first architecture | ✅ ALIGNED | sources, issues_index, ingest working |
| Repo rules always-on | ✅ ALIGNED | rules.ts with hash change detection |
| Style guide sampler | ✅ ALIGNED | style.ts samples PRs, generates guide |
| Eligibility + CLA preflight | ✅ ALIGNED | qualify.ts checks both |
| Evidence bundles (7 files) | ✅ ALIGNED | evidence.ts creates bundles |
| Judge agent (7 gates) | ✅ ALIGNED | judge.ts checks all gates |
| Test runner with DB storage | ✅ ALIGNED | test.ts stores in test_runs table |
| Env detection (local/VM) | ✅ ALIGNED | env.ts detects and recommends |
| Rep mode | ✅ ALIGNED | rep.ts with credibility scoring |
| Abort/pivot with reasons | ✅ ALIGNED | abort.ts tracks reasons |
| Metrics commands | ✅ ALIGNED | metrics.ts with money/sources/repos |
| Maintainer intel CRM | ✅ ALIGNED | maintainer.ts with sync/rate |
| Schema v6 | ✅ ALIGNED | All tables present |

---

## 2. What Is Missing or Inconsistent

### 2A. Text Rewrite Tool - **NOT IMPLEMENTED**

**Gap:** Tone lint can detect AI patterns but CANNOT fix them.
- `bounty style lint` flags issues
- `bounty judge` reports tone_lint failures
- NO command to auto-rewrite content

**Required:**
- `bounty text rewrite --repo <owner/repo> --in <file> --out <file> [--intent claim|pr|issue]`
- Must conform to rules_json and style_guide_json
- Must remove AI-ish patterns
- Slack: DRAFT_PREVIEW with before/after

### 2B. Competition Monitoring Commands - **NOT IMPLEMENTED**

**Gap:** Competition is checked during qualify but NOT surfaced as standalone commands.
- `qualify.ts` calls `competitionFromPRs()`
- engagement_metrics has competition_risk_score, competition_data_json
- NO dedicated commands exist

**Required:**
- `bounty competition check <engagement_id>`
- `bounty competition list [--repo owner/repo] [--status open|merged|all]`
- `bounty competition watch <engagement_id> --interval-min <n>`
- DB table: `competition_checks` (engagement_id, ts, risk_score, drivers_json)
- Slack: COMPETITION_ALERT with actionable recommendations

### 2C. Engagement Adapter Selection - **PARTIALLY IMPLEMENTED**

**Gap:** Adapter types exist on sources but NOT per-engagement.
- `sources.adapter_type` exists (github_label, comment_intent, etc.)
- engagements table has NO adapter field
- qualify does NOT show adapter selection

**Required:**
- DB field: `engagements.adapter`
- Selection during qualify based on:
  - repo rules signals
  - issue template type
  - maintainer cues
- Qualify output must show adapter + why + next commands

### 2D. SKILL.md is Severely Outdated - **NEEDS FULL REWRITE**

**Gap:** Current SKILL.md reflects old CSV-based workflow, not new CLI.
- Missing: hunt, qualify, plan, draft, claim-submit, evidence, test, judge
- Missing: rules, style, cla, dco, env, rep, abort, metrics
- Missing: Slack strict mode documentation
- Missing: Gate requirements for posting
- No daily workflow section
- No troubleshooting section

---

## 3. Implementation Plan

### Slice 1: Text Rewrite Tool
**Lo/Best/Hi: 60/90/150 min**

Tasks:
1. Create `bounty-system/packages/cli/src/commands/text.ts`
2. Implement rewrite logic using rules_json + style_guide_json
3. Remove AI-ish patterns (use existing pattern list from style.ts)
4. Add Slack DRAFT_PREVIEW with before/after
5. Wire into draft/submit as optional auto-rewrite
6. Add golden tests

Files:
- NEW: `src/commands/text.ts`
- MODIFY: `src/index.ts` (register command)

### Slice 2: Competition Monitoring Commands
**Lo/Best/Hi: 90/120/180 min**

Tasks:
1. Create DB table `competition_checks` (migration v7)
2. Create `bounty-system/packages/cli/src/commands/competition.ts`
3. Implement check command (uses existing competitionFromPRs)
4. Implement list command (query DB)
5. Implement watch command (polling with interval)
6. Slack COMPETITION_ALERT with actionable recommendations
7. Add tests with mocked gh api responses

Files:
- MODIFY: `src/lib/migrations.ts` (add v7)
- NEW: `src/commands/competition.ts`
- MODIFY: `src/index.ts` (register commands)

### Slice 3: Engagement Adapter Selection
**Lo/Best/Hi: 45/60/90 min**

Tasks:
1. Add `adapter` column to engagements table (migration v7)
2. Implement adapter selection logic in qualify
3. Show adapter in qualify output + Slack
4. Document adapter types and selection rules

Files:
- MODIFY: `src/lib/migrations.ts` (add column in v7)
- MODIFY: `src/commands/qualify.ts` (add adapter selection)
- MODIFY: `src/lib/slack.ts` (include adapter in qualify message)

### Slice 4: SKILL.md Full Rewrite
**Lo/Best/Hi: 45/60/90 min**

Tasks:
1. Rewrite menu options to match actual commands
2. Add Daily Workflow section
3. Add Troubleshooting section
4. Add Safety/Quality Gates section
5. Document all commands with examples
6. Document Slack strict mode

Files:
- REWRITE: `~/.claude/skills/bounty/SKILL.md`

### Slice 5: Verification & Cleanup
**Lo/Best/Hi: 30/45/60 min**

Tasks:
1. Update BOUNTY-SYSTEM-VERIFICATION-REPORT.md
2. Run all verification commands
3. Ensure tests pass
4. Create PR

---

## 4. Total Estimates

| Slice | Lo | Best | Hi |
|-------|-----|------|-----|
| Text Rewrite | 60 | 90 | 150 |
| Competition Commands | 90 | 120 | 180 |
| Adapter Selection | 45 | 60 | 90 |
| SKILL.md Rewrite | 45 | 60 | 90 |
| Verification | 30 | 45 | 60 |
| **TOTAL** | **270** | **375** | **570** |

All slices have Hi <= 480 individually. Total Hi of 570 requires 2 work sessions if doing sequentially.

---

## 5. Execution Order

1. **Slice 1** - Text Rewrite (foundation for fixing lint failures)
2. **Slice 2** - Competition Commands (high value moat feature)
3. **Slice 3** - Adapter Selection (completes engagement workflow)
4. **Slice 4** - SKILL.md (document final state)
5. **Slice 5** - Verification (confirm everything works)

---

*Generated by Claude Code alignment check*
