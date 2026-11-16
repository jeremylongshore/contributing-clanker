# Submission, Trust, and Approval Policy

Read this reference before choosing or sending a first-touch artifact.

## Required fit fields

### Collaboration surface

Classify the repository from recent external merge rate, maintainer issue
responses, internal merge velocity, and its contribution documents.

- `open`: maintainers use public issues to collaborate and merge external work
  on quality.
- `guarded`: some external work lands, but slowly or after identity is known.
- `closed`: the canonical repository develops internally and rarely uses its
  public tracker as a collaboration surface. This describes posture, not
  provenance.

First touch follows that posture:

| Surface | Allowed first touch |
|---|---|
| `open` | Design Issue by default, or a direct small PR when requested by upstream policy |
| `guarded` | Tiny self-contained PR that banks identity before any broad proposal |
| `closed` | Non-proposal micro-fix of at most 30 lines in one file; otherwise ship nothing |

### Counterparty design intent

Read security, threat-model, architecture, and roadmap documents. Record what
maintainers call deliberate, excluded, or feedback-wanted. Only the last group
is a safe design-question surface. Never frame an explicit design choice as an
oversight.

### Positioning risk

Classify overlap between the contributor's public products and the target as
`none`, `adjacent-builder`, or `direct-competitor`. This is optics risk, not a
legal conflict. For overlap, use one honest disclosure line where relevant and
keep a first touch free of self-promotion or strategic product positioning.

### Competing license fence

Inspect any contributor-owned product referenced by the contribution for
BUSL, SSPL, Commons Clause, or another competing-service restriction. Resolve
the naming and cross-promotion boundary in writing before submission.

### Local test fit

Classify verification as `isolated`, `partial`, or `full-stack-only`. If the
documented path requires an unavailable cluster, secrets estate, or full
service graph, accept only a change whose relevant behavior can be isolated and
state that limitation honestly. Never report a full-stack pass from a narrow
test.

## Rejection and supersession checks

Read the dossier's rejection patterns mined from closed external PRs. Confirm
the target file is not being rewritten, the issue has not been fixed, and no
maintainer or competing contributor has active work that supersedes the patch.

The named failures in `anti-patterns.md` are review inputs. In particular,
avoid audit dumps, umbrella first contributions, maintainer-decision punts,
generated-artifact bloat, AI-authorship promotion, unsupported frontmatter
claims, and engagement framing in product content.

## Trust ladder

Scope grows only after merged work in the same upstream repository.

| Prior merges | Permitted scope | Size cap |
|---|---|---|
| 0 | One tracked issue, one bounded fix, or a Design Issue | 200 changed lines, 10 files, no new top-level directory |
| 1 through 3 | One issue or fix; umbrella work warns | 500 changed lines, 20 files, no new top-level directory |
| 4 or more | Broader work allowed subject to upstream policy | No Clanker-specific cap |

`a07-trust-ladder-fit.sh` enforces claim-stage scope.
`b13-trust-ladder-size.sh` enforces submission-stage diff size. Candidate
`scope_intent` must be one of `single-issue`, `single-fix`, `umbrella`, or
`design-discussion`.

Dossier overrides are exceptional and require maintainer evidence. A user may
explicitly override A07 or B13 with a logged reason, but repeated overrides must
surface in the override audit.

## Human approval boundary

Before submitting anything to an external repository:

1. Run all applicable native tests and linters.
2. List changed files and any verification gap.
3. Show the exact proposed title and complete body.
4. Ask the user for approval.
5. Send only after that explicit approval.

This applies to claims, Design Issues, PRs, reviews, comments, and Wasteland
claim or completion updates. An earlier approval for research or code changes
does not authorize a later external submission.

## Attribution and identity

Remove automatic personal or company promotional footers from upstream commit
messages and PR bodies. Never add AI-generation or co-author trailers. Use the
authenticated user's normal GitHub identity. Add a DCO sign-off only when the
dossier proves it is required.

After creating a PR, read its remote body back and check for unintended
attribution, private names, AI-authorship text, or generated-with footers.
Correct only the submitted body the user approved.

## Standard submission gates

Run:

```bash
${CLAUDE_SKILL_DIR}/scripts/transition.sh working→submitted CANDIDATE_FILE
```

This covers branch, commit, scope, test-evidence, PR-content, review-bot,
identity, legal, and protected-infrastructure rules. A block stops submission;
a warning is disclosed to the user.

## Omarchy marketplace lane

For an entire Omarchy marketplace entry owned by the user, run:

```bash
${CLAUDE_SKILL_DIR}/scripts/gate-runner.sh omarchy-submit ENTRY_REPOSITORY
```

The dedicated gates cover prose voice, private names, Markdown rendering, QML
text safety, validator results, command injection, runtime dependencies, layout
overflow, rig evidence, SSRF destination policy, state-file hygiene, bounded
resource use in shipped shell and Perl helpers, and marketplace presentation.
C42 names the files it scanned when it passes and skips when its corpus is
empty, so read its PASS for what it covered. The scripts beneath
`scripts/gates/c28-*` through `c44-*` are authoritative for exact checks.

Deterministic gates do not replace judgment about product taste, unnecessary
configuration, dead-code altitude, or AI-sounding copy. Review those separately.

## Candidate update after submission

After an approved PR exists, update `pr_number`, `pr_url`, and `status` in the
candidate file atomically and append the submission event. For Wasteland, use
the actual PR URL as `wl done` evidence only after user approval.
