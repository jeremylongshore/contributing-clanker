---
doc_type: AT-DECR
title: "ISEDC Decision Record — Paradigm/Centaur two-scope ease-in strategy"
date: 2026-06-02
acting_head_of_board: Jeremy Longshore
council_size: 7
pre_council: Cannon 4-agent adversarial review
decisions: 5
status: RATIFIED
counterparty: paradigmxyz/centaur
counterparty_owner: "Georgios Konstantopoulos / @gakonst (Paradigm/Tempo CTO)"
session: 2026-06-02-paradigm-centaur-engagement
---

# ISEDC Decision Record — Paradigm/Centaur two-scope ease-in

## Mission

Determine the correct **two-scope, low-overwhelm "ease-in" strategy** for Intent Solutions to engage Paradigm's newly open-sourced **Centaur** (`paradigmxyz/centaur`, ~2 weeks old, 699★, Apache-2.0 OR MIT, by Tempo/Paradigm CTO @gakonst). Operator hard constraints: (1) exactly **two scopes**; (2) **dead simple** — do not overwhelm them; stated fear *"they'll just delete my shit"*; (3) find the best way to **ease into** the relationship. Jeremy is **rung-0** (zero prior merges) and ships a **competing/overlapping** governance stack (CCSC / AGP / IRSB) — a conflict of interest the council was charged to weigh.

## Why a council

This is an **asymmetric-downside, immutable-first-impression** decision: a botched first contact with a Paradigm CTO is not merely ignored — it taints the *name* across a small, high-trust crypto-infra circle (Polygon / Lit / Nixtla inbound credibility is the asset at risk), and that impression propagates and is slow to reverse. The operator's brief carried three optimistic priors (Design-Issue-first is safe; we "found a security gap"; IRSB is the strongest bridge). A 4-agent **Cannon** adversarial pre-pass plus a 7-seat adversarial council were convened to steel-man dissent and stress-test those priors against the **live cloned repo** before any irreversible touch.

## The five questions

| # | Question | Why costly |
|---|----------|------------|
| Q1 | Lead artifact (Scope 1): which single first touch? | wrong artifact = ignored/deleted; first read is immutable |
| Q2 | Scope 2 definition + whether to reveal it in the first touch | over-reveal overwhelms; under-reveal forfeits the vision |
| Q3 | Crypto/IRSB framing: lead / hold as Scope 2 / keep out of OSS channel | crypto-grifter optics to a serious infra team is hard to recover |
| Q4 | Channel + identity for the first touch | channel sets the relationship frame; identity is a brand commitment |
| Q5 | Self-positioning vs self-promotion: how much to reveal about our stack | the overwhelm crux; COI optics; permanent + reputational |

## Council composition

| Seat | Value system | "Most costly to recover" call |
|------|--------------|-------------------------------|
| CTO / Chief Architect | technical durability, schema integrity, sequence | **Q1** |
| GC / General Counsel | liability surface, IP, the permanent paper trail | **Q3** |
| CMO / Industry-Standard Strategist | narrative coherence, positioning, authorship | **Q5** |
| CFO / Strategic Operator | opportunity cost of Jeremy-hours, stop-loss | **Q5** |
| CSO / Chief Standards Officer | OSS/standards realpolitik, the trust ladder | **Q3** |
| CISO | attestation integrity, claim discipline, disclosure | **Q5** |
| VP DevRel / Head of OSS Community | maintainer-attention economics, Saturday-dev test | **Q5** |

**Pre-council Cannon (4 adversaries, all verdict = `reshape-the-plan`):** The Deletion Realist (maintainer-attention realpolitik); The Wedge Skeptic (steel-manning Paradigm's threat model); Crypto-Distraction Critic (IRSB is a credibility trap); Credibility / Conflict-of-Interest Auditor (governance contribution = competitor-to-competitor move).

---

## Per-question record

### Q1 — Lead artifact (Scope 1)

**Seat recommended answers (verbatim-ish):**
- **CTO** — Option (c) hardened: ONE tiny impersonal non-governance bug-fix PR — the verified `set -e` without `pipefail` defect in `services/sandbox/entrypoint.sh`. NOT a Design Issue, which is "empirically wrong" — the gaps are documented intentional decisions.
- **GC** — Option (c) hardest form: <=30 LOC, 1 file, against a defect their team/external reporters already surfaced (#281 pipefail, #357/#358 projection class). Zero governance code. First public artifact attached to Jeremy's name must be "legally and reputationally inert."
- **CMO** — Option (c). Instinct was (b) plant-the-flag Design Issue, but conceded the arena: a merged green checkmark ("Centaur contributor") is the highest-ROI narrative asset at rung-0, and it is TRUE not a claim.
- **CFO** — Option (c), <=2 Jeremy-hours, **but run the cheaper public-reply (Q4) move FIRST** — the PR is touch #2; rung-0 PR merge is a coin-flip.
- **CSO** — Option (c) escalated to safest sub-variant; rules out the wedge Design Issue "absolutely." Standing is earned by one merge.
- **CISO** — Option (c). "As CISO I am the seat that would normally PUSH the signed-audit Design Issue — and I am voting AGAINST it, on integrity grounds, not timidity."
- **VP DevRel** — Option (c) hardened: fix the #281-class crash. "A Design Issue is the single worst opening move here, full stop."

**Vote tally:** **7/7 → micro-fix PR (option c); Design Issue unanimously rejected.**

**Primary tension:** Substance is unanimous. Tension is on **sequence/signal**: CFO wants a near-zero-cost public reply first (PR as touch #2); CMO/VP DevRel chafe that a janitor PR carries no thought-leadership. Five seats offer the substantive-public-reply as the fallback if no clean micro-fix exists. CTO names Q1 the single most-costly question (immutable first read).

**RECOMMENDED DECISION:** Lead Scope 1 with **ONE tiny, impersonal, non-governance bug-fix PR** (entrypoint.sh `pipefail` / projection-delivery bug class, <=30 LOC, 1 file, Conventional Commits, passes `uv run ruff check . && ruff format . && pytest`), under personal identity, touching zero governance/audit/permissions code. **Stacked minority constraints:** (CFO) cap at <=2 Jeremy-hours and treat as a cheap option, not a project; (all) if no defensible non-governance micro-fix is currently mergeable, ship NOTHING and instead establish identity via a substantive non-governance public technical reply under the decorated `jeremylongshore` profile.

**Dissent acknowledged:** CFO's "public reply first, PR second" is adopted as the recommended ordering under Q4; it is a sequence refinement, not a contradiction.

---

### Q2 — Scope 2 definition + reveal

**Seat recommended answers (verbatim-ish):**
- **CTO** — Scope 2 = governance interop framed inside Centaur's worldview; a Design Issue engaging the `advanced-permissioning.md` WIP ("feedback wanted"), posing tamper-evident audit as a QUESTION. HOLD until Scope 1 merges. "Sequence is load-bearing."
- **GC** — Governance/signed-audit interop as a question, NOT IRSB; held back entirely; COI front-loaded in the issue body. "A two-scope opening is a written commitment we cannot retract."
- **CMO** — Design Issue (never a PR) citing their WIP doc back to them; held back until the PR merges. "Holding it back makes it land harder."
- **CFO** — CCSC governance-interop, defined now but FORBIDDEN to mention until a Scope-1 merge banks identity. Evidence-gating.
- **CSO** — Engages their published advanced-permissioning roadmap on its own terms (the door they already opened); single-scope first touch.
- **CISO** — Interop (verify their `proxy_audit` against an external signer), not a "you have a gap" pitch; their SECURITY.md scopes the host-attacker threat OUT, so honesty demands the open-question framing.
- **VP DevRel** — Held back entirely; no tease. Question, never a PR — per-tool-call HITL as code collides with their channel-scoped-grant-at-egress direction.

**Vote tally:** **7/7 → governance/signed-audit INTEROP as a QUESTION (not IRSB), held back entirely until Scope 1 merges.**

**Primary tension:** Intensity, not direction. CMO/CSO/CISO reserve the right to **KILL** the governance Scope 2 entirely if the COI cannot read as "domain expert" rather than "competitor planting primitives." GC sets a binding floor (if named in touch #1 at all: one disclosed line, no primitive described). VP DevRel wants it PRE-DRAFTED to fire the instant Scope 1 merges.

**RECOMMENDED DECISION:** Scope 2 = a **governance/signed-audit-and-HITL interop Design Issue** (never a PR) posed as a **question inside Centaur's own published worldview**, citing their `advanced-permissioning.md` WIP doc and host-attacker exclusion back to them, with the **COI disclosed in the issue body**. **Held back entirely** — zero mention or tease in touch #1 — and gated behind a banked Scope-1 merge. **Stacked minority constraints:** (CMO/CSO/CISO) if the COI cannot be made to read as domain-expertise, KILL Scope 2 and carry the relationship on pure good-citizenship; (VP DevRel) pre-draft it so it is ready to fire on the merge signal.

**Dissent acknowledged:** None on direction; the kill-switch and pre-draft are preserved as binding options.

---

### Q3 — Crypto / IRSB framing

**Seat recommended answers (verbatim-ish):**
- **CTO** — IRSB entirely OUT of the OSS channel; BD only; two triggers (a merge AND a real on-chain write/signing path). "Clearest technical call on the board and I will not soften it." `tools/crypto` is read-only; `mpp/client.py` only pays Tempo per-query.
- **GC** — Entirely out; BD only; both triggers. BUSL-1.1's Additional Use Grant names "on-chain policy enforcement" as a forbidden Competing Service — IRSB legally fences off Centaur's exact domain. "Three independent vetoes from my chair."
- **CMO** — "The one place I fully cede my own bias." IRSB and Centaur tell incoherent stories right now; forcing them together breaks coherence.
- **CFO** — Entirely out; BD only; both triggers. IRSB spend on this channel is negative-ROI — solves a non-problem.
- **CSO** — Out of Scope 1, Scope 2, any GitHub touch. "The clearest call on the board and I hold it without hedge."
- **CISO** — Benched until a merge AND a real on-chain write-path AND the BUSL contradiction is resolved in writing. IRSB attests to a transaction surface that does not exist in their system.
- **VP DevRel** — "IRSB is not the bridge; it is the landmine." BD-only, two triggers; log it in CRM as a "watch for Tempo write-path" note.

**Vote tally:** **7/7 → IRSB entirely OUT of the OSS channel; BD/relationship only; behind two triggers (banked merge + a real Centaur/Tempo on-chain WRITE path).**

**Primary tension:** Unanimous and emphatic. The only residual pull: CFO/CMO concede they are forgoing the brief's "strongest bridge" and worry about first-mover loss. GC/CSO/CISO add a binding precondition: the BUSL-1.1 Competing-Service contradiction must be resolved **in writing** before IRSB is named to Paradigm in any channel.

**RECOMMENDED DECISION:** **IRSB stays entirely out of every OSS channel** (not Scope 1, not Scope 2). It may be reintroduced **only via the BD/relationship channel**, and **only after BOTH triggers fire**: (1) IS has at least one merged Centaur contribution, AND (2) Centaur/Tempo ships an agent primitive that actually signs/sends on-chain (agent wallet, MPP write-path, or a write connector). **Stacked minority constraint (GC/CSO/CISO):** even then, the **BUSL-1.1 Competing-Service contradiction must be resolved in writing first** (carve-out or relicense), and IRSB enters only as a Design-Issue-style "open question" referencing the specific new write-path — never a pre-built BUSL product drop.

**Dissent acknowledged:** CFO/CMO's "strongest bridge / first-mover" concern is logged; the council judges an unresolved license contradiction makes IRSB a liability, not an asset, until the paper is clean.

---

### Q4 — Channel + identity

**Seat recommended answers (verbatim-ish):**
- **CTO** — GitHub PR under PERSONAL `jeremylongshore` (not the IS org). Governance topics → private security@tempo.xyz with upfront COI. Don't lead via the tweet thread unless it's a substantive non-governance reply.
- **GC** — Public PR for Scope 1 (the merge is the identity proof); personal identity; security@tempo.xyz reserved for genuine security observation. "Identity choice is a COI-management decision."
- **CMO** — Two-step: warm substantive technical reply on gakonst's existing public thread FIRST under the decorated personal handle, THEN the micro-fix PR — same personal identity. Org identity stays out of first contact.
- **CFO** — Lead with the public technical reply (cheapest, highest-visibility), micro-PR second; personal identity; security@tempo.xyz only for a real vuln.
- **CSO** — GitHub PR for the micro-fix; invited-feedback Design Issue for Scope 2; personal identity; security@ is a vulnerability mailbox, not a DM line.
- **CISO** — Personal-identity PR; private responsible-disclosure to security@tempo.xyz for any governance topic; warm reply acceptable before the PR but not the lead.
- **VP DevRel** — First touch is a GitHub PR, personal decorated identity; governance → private security@tempo.xyz with COI; tweet reply only as the no-PR fallback. "Maintainers merge people, not orgs."

**Vote tally:** **7/7 → GitHub PR under PERSONAL `jeremylongshore` identity (not IS org); security@tempo.xyz reserved for genuine responsible-disclosure with upfront COI; never a cold public Design Issue on the governance gaps.**

**Primary tension:** Personal-not-org is unanimous. Tension is on the **warm-public-reply**: CMO/CFO/VP DevRel/CTO want a substantive non-governance reply on gakonst's existing thread FIRST (highest-EV, near-zero-cost identity-warming); CISO/CSO/GC accept it only as a fallback and warn a public thread is high-exposure.

**RECOMMENDED DECISION:** All first contact under **personal `jeremylongshore`** (decorated profile: 2k+ star OSS, Anthropic cohort) — **NOT the Intent Solutions org**. **Sequence:** a substantive, non-promotional, non-governance technical reply on gakonst's/Centaur's existing public thread to warm identity, **then** the Scope-1 micro-fix **GitHub PR** under the same identity. Any governance/security observation goes **privately to security@tempo.xyz** with the COI on line one — never a public issue. **Stacked minority constraint (CISO/CSO/GC):** the public-thread reply must be genuinely substantive and zero-pitch, or it is skipped — a flat or governance-flavored public reply is worse than silence. Org-brand attribution is deferred to a later relationship stage (a passive, factual GitHub bio is the only org signal permitted at first touch).

**Dissent acknowledged:** The warm-reply-first ordering (favored 4 seats) is adopted with the high-substance guardrail the cautious 3 seats demanded.

---

### Q5 — Self-positioning vs self-promotion (the overwhelm crux)

**Seat recommended answers (verbatim-ish):**
- **CTO** — NOTHING in the first touch; zero CCSC/AGP/IRSB; COI front-loaded only the moment governance is raised. Two-state rule: silent while non-governance, disclose-first when governance enters.
- **GC** — Reveal nothing; "light we-built-adjacent-primitives" forbidden at touch #1; mandatory one-line COI when governance arises. "The strictest on the board."
- **CMO** — Reveal nothing; hardest concession for the positioning seat. Verified AGP `MARKETING_CLAIMS.md` BANS "tamper-evident" while CCSC's README uses it. Delayed gratification; disclosure-first is the only recovery path.
- **CFO** — Reveal nothing; disclose proactively only if governance is genuinely raised; the full pitch never belongs in the OSS channel — it's a BD conversation.
- **CSO** — Reveal nothing on the first touch; light "adjacent primitives" framing is the MAXIMUM ever acceptable, and only inside a disclosed-COI Design Issue post-merge.
- **CISO** — Reveal nothing; adds a hard precondition no other seat raises: **fix the CCSC/AGP "tamper-evident" claim contradiction internally before critiquing anyone's audit log.**
- **VP DevRel** — NOTHING. A FIREWALL. A silent competing stack discovered via diligence reads as humility; a volunteered one reads as "adversarial reconnaissance wearing a contribution costume."

**Vote tally:** **7/7 → reveal NOTHING about the competing stack in the first touch; disclosure-first (one-line COI) only if/when governance is later raised — never discovery-first.**

**Primary tension:** Direction is unanimous. Tension is **deferred vs abandoned**: CMO/CFO/VP DevRel insist this is DEFERRED positioning (a banked merge earns a later authorship move), not permanent silence. CISO adds the binding precondition: resolve the CCSC-vs-AGP "tamper-evident" contradiction internally first.

**RECOMMENDED DECISION:** **Reveal nothing** about CCSC/AGP/IRSB in the first touch — pure helpful contribution, no "we've built adjacent primitives," no claim about what Centaur is "missing." The **only** self-positioning permitted is a passive, factual GitHub profile bio (diligence surfaces the repos honestly). When — and only when — a governance topic is later raised by us, lead with a **one-line COI disclosure** ("full disclosure: I maintain an overlapping governance project — treat this as a heads-up, not a pitch") **before** they discover it. **Stacked minority constraints:** (CISO) **resolve the CCSC-README-vs-AGP-`MARKETING_CLAIMS.md` "tamper-evident" claim contradiction internally BEFORE any governance surface faces Paradigm**; (CMO/CFO/VP DevRel) treat this as deferred, not abandoned — a banked merge unlocks a later, surface-appropriate authorship move.

**Dissent acknowledged:** The promotional seats' concern that silence forfeits positioning is honored via the "deferred, not abandoned" framing; no seat dissents to the firewall itself.

---

## Council memos (cross-question themes)

- **CTO — "Sequence is the architecture."** Every answer reduces to one ordering invariant: bank a verifiable, non-contested merge under personal identity BEFORE any governance claim, and front-load the COI the instant governance enters. The wedge is technically real but every gap is a documented intentional decision in `security.md`, making "we found a gap" empirically false and non-credible. The plan is a state machine: merge → question on the one invited surface → IRSB frozen until a real write-path exists.
- **GC — "The first artifact must be legally and reputationally inert."** Three verified findings of fact: BUSL-1.1 fences "on-chain policy enforcement"; AGP's one-liner is verbatim the three wedge gaps; AGP bans "tamper-evident" while CCSC uses it. Disclosure-first, not discovery-first; the paper trail is sacrosanct on both sides.
- **CMO — "Merge over manifesto; earned authorship over unsolicited audit."** The arena data inverts the positioning instinct: in a dead-issue-tracker repo where the merge filter is "do I know you," the highest-value positioning asset is a single merged checkmark under the personal handle. Coherence over flag-planting.
- **CFO — "Spend cheap, gate on evidence, never let the COI lead."** A low-probability relationship OPTION, not a project: 95 merges/7d, a 12-deep external-PR graveyard, a merged-author set dominated by recognizable Ethereum identities. Tight stop-loss; defer every dollar of Jeremy-hours until a merge/attention signal justifies the next spend.
- **CSO — "You cannot propose before you have standing, and rung-0 has zero standing."** Verified the live clone (last commit 2026-06-02, minute-scale merges, zero-reply external issues). Governance enters only through the door they already opened (the WIP doc that says "feedback wanted"), COI in line one.
- **CISO — "Do not open a public security critique while your own attestation claims are internally inconsistent."** The real blocker is internal: AGP bans "tamper-evident," CCSC ships it. Fix that before critiquing any audit posture. The wedge is real engineering value but toxic as a rung-0 opener.
- **VP DevRel — "Maintainer attention is the scarcest resource; you BUY it with a banked merge, never requisition it with a proposal."** Verified all four Cannon objections against the live clone. Identity before wedge, merge before proposal, disclosure-first before discovery.

## Cross-cutting themes

**"Most costly to recover" tally:**

| Question | Seats | Count |
|----------|-------|-------|
| **Q5** (self-positioning) | CMO, CFO, CISO, VP DevRel | **4 (plurality)** |
| **Q3** (IRSB framing) | GC, CSO | 2 |
| **Q1** (lead artifact) | CTO | 1 |
| Q2, Q4 | — | 0 |

**Adversarial-integrity check:** All 4 Cannon adversaries returned **`reshape-the-plan`** — none said proceed-as-briefed. The council did not rubber-stamp the operator's brief; it **inverted all three of its priors**, each against live-repo evidence:

1. *"A Design Issue is the safe low-overwhelm move"* → **reversed** (Deletion Realist): the issue tracker is a graveyard — 5 non-bot issues / 699 stars, every external issue gets 0 maintainer replies — while 67 PRs merged in 7 days at 3-8 min internal cycles. A Design Issue is the channel they ignore MOST.
2. *"We found a security gap"* → **reversed** (Wedge Skeptic): every gap is a documented intentional decision in `security.md` (host-attacker exclusion `:30-32`; broad-sandbox-perms `:144-147`). Pitching tamper-evidence addresses an explicitly-excluded threat; to a security CTO it reads "I didn't read your threat model."
3. *"IRSB may be the strongest bridge"* → **inverted to "strongest landmine"** (Crypto-Distraction Critic + COI Auditor): `tools/crypto` is read-only analytics (`mpp/client.py` only PAYS Tempo per-query, no agent wallet), and IRSB's own BUSL-1.1 Additional Use Grant names "on-chain policy enforcement" as a forbidden Competing Service — Jeremy's license legally fences off Centaur's exact domain.

**Dissent was preserved, not suppressed.** Every question resolved 7/7 on direction, but the binding minority constraints (CISO's claim-contradiction precondition; GC/CSO's written-BUSL-resolution gate; the Q5 firewall; CFO's stop-loss; the "deferred-not-abandoned" framing) are stacked on top of the majority, not voted away. The strongest integrity signal: the seats whose job is to **promote** (CMO, CFO, VP DevRel) plus the CISO converged on **Q5 silence** against their own instincts — promotion seats voted hardest for restraint.

## ASCII decision tree

```
ISEDC DECISION TREE — Paradigm/Centaur two-scope ease-in (2026-06-02)
Council: 7 seats | Pre-council: Cannon x4 (ALL "reshape-the-plan")
Legend:  [U] = unanimous (7/7)   (*) = seat named this question "most costly to recover"

ROOT: "What is the two-scope, low-overwhelm ease-in for engaging paradigmxyz/centaur?"
│
├─ Q1  LEAD ARTIFACT (Scope 1) ........................................ [U] 7/7
│   │   DECISION: tiny IMPERSONAL non-governance micro-fix PR (no Design Issue)
│   ├── CONSENSUS: CTO GC CMO CSO CISO VP-DevRel ── micro-fix PR is touch #1
│   └── DISSENT (sequence, not substance):
│         └─ CFO ── public technical reply FIRST, PR is touch #2 (<=2 Jeremy-hrs)
│         └─ CMO / VP-DevRel ── grudge: janitor PR carries zero thought-leadership
│         (lone-wolf "most costly": CTO *)
│
├─ Q2  SCOPE 2 DEFINITION + REVEAL .................................... [U] 7/7
│   │   DECISION: governance/signed-audit INTEROP as a QUESTION on their
│   │            advanced-permissioning WIP; NOT IRSB; HELD BACK until merge
│   ├── CONSENSUS: all 7 ── interop-as-question, gated behind a merge, COI front-loaded
│   └── DISSENT (kill-switch, not direction):
│         └─ CMO / CSO / CISO ── KILL governance Scope 2 if COI can't read clean
│         └─ VP-DevRel ── PRE-DRAFT it so it fires the instant Scope 1 merges
│
├─ Q3  CRYPTO / IRSB FRAMING .......................................... [U] 7/7
│   │   DECISION: IRSB ENTIRELY OUT of OSS. BD only. 2 triggers
│   │            (banked merge + real Centaur/Tempo on-chain WRITE path)
│   ├── CONSENSUS: all 7 ── "clearest call on the board"
│   └── BINDING MINORITY CONSTRAINT:
│         └─ GC / CSO / CISO (*) ── resolve BUSL-1.1 Competing-Service
│              contradiction IN WRITING before IRSB is named to Paradigm
│         └─ CFO / CMO ── note: forgoing brief's "strongest bridge" + first-mover risk
│
├─ Q4  CHANNEL + IDENTITY ............................................. [U] 7/7
│   │   DECISION: GitHub PR under PERSONAL jeremylongshore (not IS org);
│   │            security@tempo.xyz for governance; NO cold public Design Issue
│   ├── CONSENSUS: all 7 ── personal-not-org; private security channel for governance
│   └── DISSENT (warm-reply weighting):
│         └─ CMO / CFO / VP-DevRel / CTO ── substantive public reply on gakonst's
│              thread FIRST (highest-EV identity-warming)
│         └─ CISO / CSO / GC ── that reply ONLY as fallback; public thread = high-exposure
│
└─ Q5  SELF-POSITIONING vs SELF-PROMOTION (the overwhelm crux) ........ [U] 7/7
    │   DECISION: REVEAL NOTHING in touch #1. Disclosure-FIRST (one-line COI)
    │            only if governance is later raised — never discovery-first
    ├── CONSENSUS: all 7 ── zero promotion at touch #1; mandatory COI when governance enters
    └── BINDING MINORITY CONSTRAINTS:
          └─ CISO (*) ── RESOLVE the CCSC-vs-AGP "tamper-evident" claim
               contradiction INTERNALLY before critiquing any audit log
          └─ CMO / CFO / VP-DevRel (*) ── DEFERRED positioning, not abandoned
          (MAJORITY "most costly": CMO * CFO * CISO * VP-DevRel *  — 4 of 7)

"MOST COSTLY TO RECOVER" HEAT MAP
   Q1  ██                CTO                         (1)
   Q3  ████              GC · CSO                    (2)
   Q5  ████████████████  CMO · CFO · CISO · VP-DevRel (4)  <-- PLURALITY
   Q2  ·   (none)        Q4  ·   (none)

UNANIMITY: every question 7/7 on direction. All dissent is on SEQUENCE,
INTENSITY, or a STACKED PRECONDITION — never on the core call.
```

## Implementation directives

1. **Scope 1 (now):** Confirm a current, defensible non-governance defect exists in Centaur's bug surface (entrypoint.sh `pipefail` / projection-delivery class). If yes → ship ONE <=30 LOC / 1-file fix PR, Conventional Commits, passing `uv run ruff check . && ruff format . && pytest`, under personal `jeremylongshore`, zero stack mention. If no clean mergeable defect → ship NOTHING; establish identity via a substantive non-governance public technical reply first.
2. **Identity-warming (recommended pre-step):** a substantive, zero-pitch technical reply on an existing gakonst/Centaur public thread under the decorated personal profile, BEFORE the PR.
3. **Scope 2 (gated):** pre-draft a governance/signed-audit-interop **Design Issue posed as a question** on the `advanced-permissioning.md` WIP doc, COI on line one — DO NOT send until a Scope-1 merge banks identity. Hold the kill-switch (drop Scope 2 entirely if COI cannot read clean).
4. **IRSB:** frozen, out of every OSS channel. BD-only, behind both triggers. **Block on:** GC resolving the BUSL-1.1 Competing-Service contradiction in writing before IRSB is ever named to Paradigm.
5. **CISO precondition (internal, do first):** resolve the CCSC-README-vs-AGP-`MARKETING_CLAIMS.md` "tamper-evident" claim contradiction before any governance surface faces Paradigm.
6. **Channel discipline:** all first contact personal-identity; governance/security observations go private to security@tempo.xyz with COI; never a cold public Design Issue on the gaps.
7. **Reveal discipline:** nothing about the competing stack in touch #1; disclosure-first the moment governance enters; passive factual GitHub bio is the only permitted self-positioning.

---

## ACTING HEAD OF BOARD DECISION

> **Acting head of board:** Jeremy Longshore
> **Status:** RATIFIED — accepted the council's unanimous (7/7) recommendations as-is, with all four binding minority constraints adopted.

**Ratification (2026-06-02):**

- [x] **Q1 — Lead artifact:** Tiny NON-governance bug-fix PR (≤30 LOC, 1 file), under personal identity, zero mention of our stack. If no clean micro-fix exists, ship nothing and build identity through public adjacency first.
- [x] **Q2 — Scope 2 + reveal:** Scope 2 = a signed-audit-interop **Design Issue posed as a question** on Centaur's `advanced-permissioning.md` "feedback-wanted" surface, COI disclosed in-body — **held entirely until Scope 1 merges.** Not mentioned in the first touch.
- [x] **Q3 — IRSB framing:** IRSB stays **out of all OSS-contribution channels.** BD/relationship channel only, behind two triggers: (a) a merged Scope-1 PR AND (b) Centaur/Tempo shipping a real on-chain write-path. Resolve the BUSL-1.1 Competing-Service contradiction in writing first.
- [x] **Q4 — Channel + identity:** GitHub PR under **personal `jeremylongshore`** (never the Intent Solutions org). `security@tempo.xyz` for any security/governance matter; never a cold public issue.
- [x] **Q5 — Self-positioning:** Reveal **nothing** about CCSC/AGP/IRSB in touch #1. Disclosure-first one-liner only if/when a governance question is later raised.

**Overrides / amendments to the recommended decisions:** None. Ratified as-is.

**Binding minority constraints adopted:**

- [x] CISO precondition (resolve CCSC/AGP "tamper-evident" claim contradiction internally first) — **ADOPT**
- [x] GC/CSO precondition (resolve BUSL-1.1 contradiction in writing before any IRSB mention) — **ADOPT**
- [x] CFO stop-loss (≤2 Jeremy-hours on Scope 1) — **ADOPT**
- [x] CMO/CFO/VP DevRel "deferred not abandoned" framing for Scope 2 — **ADOPT**

**Decided by:** Jeremy Longshore (acting head of board)  **Date:** 2026-06-02

**Signature:** Jeremy Longshore
