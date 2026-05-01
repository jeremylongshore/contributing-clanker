# Bounty Hunting Fundamentals & The AI Reality

**For: Ope Ariyo**
**Created: January 2026**
**CRITICAL READING - Please read this entire document**

---

## Part 1: What Are Bounties?

### The Basic Concept

A **bounty** is a cash reward offered by an open source project for completing a specific task - usually fixing a bug, adding a feature, or improving documentation.

**How it works:**
1. A company or maintainer posts an issue on GitHub
2. They attach a bounty (money) to that issue
3. Someone claims the bounty and does the work
4. They submit a Pull Request (PR)
5. If the PR is merged, they get paid

### Where Bounties Come From

| Platform | How It Works | Typical Amounts |
|----------|--------------|-----------------|
| **Algora** | Companies fund bounties through platform | $25 - $500+ |
| **GitHub Sponsors** | Maintainers directly reward contributors | Varies |
| **Gitcoin** | Crypto/Web3 projects | $50 - $5,000+ |
| **Open Collective** | Community-funded projects | $20 - $200 |
| **Direct** | Company posts bounty in issue | Varies widely |

### Why Companies Pay for This

1. **Faster bug fixes** - External help speeds up development
2. **Fresh perspectives** - Outside contributors see problems differently
3. **Cost effective** - Cheaper than hiring full-time developers
4. **Community building** - Encourages open source participation

### The Economics

Typical bounty values:
- **$25-50** - Simple bug fix, typo, documentation
- **$50-150** - Medium complexity feature or fix
- **$150-500** - Significant feature, complex bug
- **$500+** - Major feature, security issue, architectural work

**Your earning potential:**
- Part-time (5-10 hrs/week): $200-800/month
- Serious effort (15-20 hrs/week): $800-2000/month
- Full-time focus: $2000-5000/month

*These are realistic estimates, not guarantees.*

---

## Part 2: The AI Problem (CRITICAL)

### The Current Reality

**Open source maintainers are increasingly skeptical of AI-generated contributions.**

This is not paranoia - it's a real and growing problem:

1. **Flood of low-quality PRs** - Since ChatGPT launched, maintainers report 10x more junk PRs
2. **Broken code that "looks right"** - AI generates plausible-looking code that doesn't actually work
3. **Ignored contributor guidelines** - AI tools don't read CONTRIBUTING.md
4. **Hallucinated solutions** - AI confidently proposes fixes that make no sense for the codebase
5. **Spam bounty claims** - People use AI to mass-claim bounties they can't complete

### Real Examples of AI PR Failures

**Example 1: The Confident Wrong Fix**
```
Issue: "Button doesn't work on mobile"
AI PR: Changes button CSS padding
Reality: The issue was a JavaScript event handler bug
Result: PR rejected, contributor reputation damaged
```

**Example 2: The Style Guide Violation**
```
Issue: "Add dark mode support"
AI PR: Adds inline styles everywhere
Reality: Project uses CSS modules, has strict style guide
Result: PR rejected as "didn't read contributing guide"
```

**Example 3: The Test-Breaking Change**
```
Issue: "Optimize database query"
AI PR: Changes query logic
Reality: Breaks 47 existing tests, changes behavior
Result: PR rejected, maintainer frustrated
```

### How Maintainers Detect AI PRs

They look for:
- Generic commit messages ("fix: resolved issue")
- Code that doesn't match project style
- Solutions that ignore existing patterns
- Over-engineered or unnecessarily complex fixes
- Missing context about why changes were made
- No evidence the contributor understands the codebase

### The Reputation Risk

**Once labeled as an "AI spammer", you're done.**

- Maintainers talk to each other
- Your GitHub profile becomes toxic
- Future legitimate PRs get auto-rejected
- Bounty platforms may ban you

**This is why human oversight is non-negotiable.**

---

## Part 3: Why Human-in-the-Loop is Critical

### What "Human-in-the-Loop" Means

Every submission goes through human review before reaching maintainers:

```
You write code → System records work → Jeremy reviews → External submission
                                          ↓
                              (Quality gate - catches problems)
```

### What Jeremy Checks Before Approval

1. **Contributor Guidelines**
   - Did you actually read CONTRIBUTING.md?
   - Are you following their code style?
   - Did you run their required checks?

2. **Code Quality**
   - Does the code actually solve the problem?
   - Is it the right approach for this codebase?
   - Are there obvious bugs or issues?

3. **Test Coverage**
   - Do existing tests pass?
   - Did you add tests for new code?
   - Did you test edge cases?

4. **PR Quality**
   - Is the description clear and complete?
   - Does it reference the issue properly?
   - Are commits properly organized?

5. **Red Flags**
   - Over-complicated solutions
   - Unnecessary changes outside the issue scope
   - Copy-pasted code that doesn't fit

### Why We Can't Trust the System Yet

**The bounty system uses AI for:**
- Scoring bounties (recommendations)
- Analyzing issues (complexity estimates)
- Vetting submissions (automated checks)

**But AI makes mistakes:**
- Misreads issue requirements
- Overestimates or underestimates complexity
- Misses context that humans catch
- Doesn't understand maintainer preferences

**Until we have more data and confidence, every external action needs human verification.**

---

## Part 4: The Process (Step by Step)

### Before Claiming a Bounty

**YOU must verify (don't trust the system):**

1. **Read the actual issue** - Not just our summary
   ```
   Go to GitHub → Read entire issue thread → Understand context
   ```

2. **Read CONTRIBUTING.md** - Every project is different
   ```
   Look for: Code style, testing requirements, PR format, branch naming
   ```

3. **Check for competing PRs** - Don't duplicate work
   ```
   GitHub → Pull Requests → Search for issue number
   ```

4. **Verify you can actually do it** - Be honest with yourself
   ```
   Do you understand the codebase? The language? The framework?
   ```

5. **Check maintainer activity** - Is anyone home?
   ```
   Look at: Recent merges, issue responses, last commit date
   ```

### While Working

**Document everything:**

1. **Start recording** - `bounty work start <id>`
2. **Add checkpoints** - Every significant step
3. **Commit frequently** - Small, logical commits
4. **Test thoroughly** - Run ALL project tests

**Don't:**
- Rush to submit
- Skip reading project docs
- Ignore failing tests
- Make changes outside issue scope

### Before Submitting

**Complete this checklist:**

- [ ] I read the entire issue thread
- [ ] I read CONTRIBUTING.md
- [ ] I followed their code style
- [ ] I ran their test suite - ALL tests pass
- [ ] I ran their linter/formatter
- [ ] My PR description explains the "why" not just "what"
- [ ] I referenced the issue properly
- [ ] I didn't change anything outside the issue scope
- [ ] I would approve this PR if I were the maintainer

### The Submission Flow

```
1. YOU: Complete work, create PR draft
         ↓
2. YOU: Run `bounty submit <id> --pr <url>`
         ↓
3. SYSTEM: Creates proof bundle (recordings, stats)
         ↓
4. SYSTEM: Notifies Jeremy via Slack
         ↓
5. JEREMY: Reviews proof bundle and code
         ↓
6. JEREMY: Either approves or requests changes
         ↓
7. IF APPROVED: Jeremy submits PR externally
         ↓
8. MAINTAINER: Reviews and (hopefully) merges
         ↓
9. PAYMENT: Bounty platform processes payment
```

---

## Part 5: Common Mistakes to Avoid

### Mistake 1: Trusting AI Recommendations Blindly

**Wrong:**
> "The system said to claim this bounty, so I did"

**Right:**
> "The system recommended this, but I verified by reading the issue, checking competition, and confirming I have the skills"

### Mistake 2: Skipping Contributor Guidelines

**Wrong:**
> "I'll just submit and see what happens"

**Right:**
> "I read CONTRIBUTING.md, followed their style guide, and ran their required checks"

### Mistake 3: Over-Engineering

**Wrong:**
> "I added a whole new module to fix this bug"

**Right:**
> "I made the minimal change needed to fix the issue"

### Mistake 4: Ignoring Context

**Wrong:**
> "The issue says 'fix button' so I fixed the button"

**Right:**
> "I read the whole thread, understood they meant the mobile button specifically, and tested on actual mobile devices"

### Mistake 5: Rushing to Submit

**Wrong:**
> "First to submit wins!"

**Right:**
> "Quality wins. A late, excellent PR beats an early, mediocre one"

---

## Part 6: Red Flags in Bounties

### Skip These Bounties

1. **Vague requirements**
   - "Improve performance" (how? where? by how much?)
   - "Fix the UX" (what specifically?)

2. **Inactive maintainers**
   - No merges in 3+ months
   - Issues go unanswered
   - Last commit was ages ago

3. **Toxic environment**
   - Maintainers are rude in comments
   - PRs get rejected with no explanation
   - History of abandoned PRs

4. **Too good to be true**
   - $500 for "simple" bug
   - Easy issue, no one's claimed it
   - (There's usually a catch)

5. **Requires deep knowledge**
   - "Fix race condition in scheduler"
   - "Optimize query planner"
   - (Unless you actually have that knowledge)

---

## Part 7: Building Reputation

### The Long Game

Bounty hunting is a reputation business:

1. **Start small** - $25-50 bounties, prove yourself
2. **Be reliable** - Finish what you claim
3. **Be professional** - Clear communication, quality work
4. **Build relationships** - Same maintainers will remember you
5. **Grow gradually** - Bigger bounties come with trust

### What Maintainers Remember

**Good:**
- "This person always reads the docs"
- "Their PRs are always ready to merge"
- "They respond quickly to feedback"

**Bad:**
- "This person submits AI garbage"
- "They never follow our guidelines"
- "Claims bounties then disappears"

---

## Summary: The Rules

1. **Never trust the system blindly** - Always verify manually
2. **Read CONTRIBUTING.md** - Every. Single. Time.
3. **Check for competing PRs** - Don't waste effort
4. **Human review before external action** - Nothing goes out without approval
5. **Quality over speed** - A great late PR beats a rushed bad one
6. **Document your work** - Recordings, checkpoints, commits
7. **Report issues** - Help us improve the system
8. **Build reputation** - Think long-term

---

## Questions?

Create a GitHub issue with the `question` label, or message Jeremy on Slack.

Remember: We're building something valuable here, but we have to do it right. The AI tools help us work faster, but human judgment is what keeps us from making costly mistakes.

Let's hunt bounties responsibly.
