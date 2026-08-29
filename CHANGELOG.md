# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- C43 fail-closed Omarchy marketplace presentation gate: full 500-character
  copy, plugin-specific SVG banner, and exact-run/hash-bound live preview proof.

## [0.3.0] - 2026-07-06

Minor release. Twenty days of test-driven hardening since v0.2.0: full bats coverage surfaced 6 real gate-logic bugs (one fail-OPEN) and all are fixed red-tests-first; CI was rebuilt on CodeQL + a deterministic shellcheck/bats lane; Wasteland federation and the ASCII status dashboard landed; and the system grew its first observability layer — a deterministic daily recap email in the house HTML template, live on cron. No breaking changes.

### Added

- **Wasteland federation support** — the `wl claim → PR → wl done` flow, board→repo mapping, A-phase gate adaptations for federated claims, the `[wendy:github-mirror]` staleness trap, and the collaboration-surface inversion; specified in `references/wasteland-federation.md` (#62).
- **`scripts/dashboard.sh`** — local-only ASCII status dashboard (pipeline funnel / in-flight / shipped / suggested-next / timeline), printed first by `/contribute` Step 0; +8 bats cases with an alignment invariant guarding multibyte-title border drift (#60).
- **`scripts/contribute-daily-recap.sh`** — deterministic personal daily recap email in the Intent Solutions house HTML template (stat tiles, Action-needed card, pipeline funnel + in-flight tables, event badges, override-trend table). Heartbeat only on positive log-read proof; fixed 2-day event window, no watermark by design; zero LLM in the correctness path. Live on the dev-box crontab at `45 6 * * *`; weekly team mode ready behind `--window`/`--to` flags (#66).
- **Full bats coverage for all 51 gates** — one `.bats` per gate, genuine (non-tautological) assertions; surfaced 5 real gate-logic bugs, all since fixed (#54).
- **CI rebuilt** — CodeQL + deterministic shellcheck/bats gate workflow (#55); apt dropped from CI in favor of preinstalled shellcheck/jq + npm bats, with job timeouts (#57).

### Changed

- **PR-review workhorse switched Gemini Code Assist → CodeRabbit** (#56); estate-wide Greptile transition noted for when the GitHub App swap reaches this repo.
- **README reshaped** to the versioned product-landing standard (#53).
- CLAUDE.md drift corrected against the tree — script counts, release machinery, support subagents, Wasteland reference, review-bot transition, #60–#62 history (#63).
- `audit-overrides.sh` honors `CONTRIBUTE_STATE_DIR` (parity with `dashboard.sh`, testability) (#66).

### Fixed

- **Gate c24 `engagement-frame-leakage` was fail-OPEN** — its `|`-split TOKENS table truncated 3 regexes into unparseable patterns (grep exit 2 silently swallowed) and the author-footer anchor could never match the extracted line shape. Fixed red-tests-first with parallel token arrays, a re-anchored footer token, and a loud BLOCK when the gate cannot evaluate one of its own rules (#64).
- **Gate c22 `cross-cli-vocabulary` fail-closed under `set -e`** — `((x++))` from 0 tripped the ERR trap on the first signal (#59, #61).
- **Gates c26/c11/f04 dead branches revived** (#65): c26's no-new-functions SKIP was unreachable under `pipefail`; c11 emitted `0\n0` arithmetic stderr noise on every fast-forward PASS (now `git rev-list --count`); f04's disclosure-verify paths were dead (PR-body capture stopped at the disclosure's own `## ` heading) and lowercase gate IDs crashed the gate — capture now stops only at known candidate sections, ID extraction is case-insensitive, unparseable override lines fail loud.
- **Gate e02 `ai-strike-track` crashed fail-closed on every `shortlist→claimed`** — strict jq aborted (exit 5) on historical torn `hook_intercept` log lines; now a tolerant per-line parse that still counts strikes past torn lines. Caught by the daily recap's block-event table on its first live day (#66).
- **`log.jsonl` appends fail loud, never silent** — `gate_log_run` and all four `transition.sh` appends print a visible stderr WARN on write failure instead of swallowing it; the unguarded `gate_override` append could previously torn-abort a committed transition under `set -e` (#65).
- `scout --refresh` drops closed issues — `--jq` scalar output broke `json.loads` (#58).
- `tools/`: cosmiconfig js-yaml patched to 4.2.0; gray-matter residual documented (#52).

## [0.2.0] - 2026-06-16

Minor release. 43 days of dogfood-driven hardening since v0.1.2: a trust-ladder discipline, ten new gates (C20–C27 + A07/B13), a self-maintaining runtime-mirror deploy with a drift checker, surgical scout targeting, and a batch of researcher-build correctness fixes — all surfaced by real contribution round-trips (kobiton, secureblue, the MCP pipeline). No breaking changes.

> Note: the `v0.2.0` tag from 2026-02-03 (pre-rebaseline "schema consolidation," never released) was removed during this release; this is the first real 0.2.0.

### Added

- **Trust-ladder rule** for first-time contributions — a contributor's (N+1)th PR scope is governed by their N prior merges in that repo. Enforced by gates **A07** (`a07-trust-ladder-fit`) and **B13** (`b13-trust-ladder-size`); overrides logged + audited.
- **Content-fidelity gates C20–C23** + **G03** hardening, derived from the kobiton/automate PR-review round-trip: doc file-reference resolution, SKILL.md frontmatter-vs-body, cross-CLI vocabulary, MCP tool-annotation spec.
- **Gates C24 + C25** — engagement-frame leakage and maintainer-URL leakage in customer-facing diffs (#45).
- **Gates C26 + C27** — coverage-tool blindspot detection and sibling-issue (root-cause) scan, rescued from deploy-only into source control (#47).
- **`/contribute <url>` / `owner/repo` onboarding** — two-branch (new-repo onboarding / known-repo briefing) entry mode with own-org scope guard (#38).
- **`scout-discover.sh --repos=<csv>`** surgical mode for explicit target lists, plus a fix-locality drop of pure issue-tracker / no-code repos (#51).
- **`researcher-build.sh` smart refresh** — preserves engineer-curated `## Pet peeves` / `## Failure log` / `## Notes` across rebuilds (#30); resolves the v0.1.2 caveat.
- **`.github/semantic.yml` detection** in `researcher-build.sh` → sets `conventional_commits` and emits `pr_title_regex`, which activates gate **C02** (#50).
- **Runtime-mirror deploy** — `bin/install.sh` now deploys `skills/contribute/scripts/` → `~/.contribute-system/bin/` (symlink or copy), and a new **`scripts/doctor.sh`** verifies the deployed copy matches the repo. The four scout scripts (`scout-discover.sh`, `scout-{refresh,score,write}.py`) are now in source control (#46).
- MCP server target-list reference doc (#31).

### Changed

- **`@researcher` agent** (Steps 3/4) realigned to the builder's write-to-file + internal smart-refresh interface — removed the obsolete stdout-redirect / manual snapshot-splice dance (#49).
- **ISEDC Centaur decision** (AT-DECR 013) recorded + first-touch-fit skill hardening (#41).
- CLAUDE.md drift corrected — gate counts, scripts/templates inventory, runtime-deployment model (#43).
- Vendored `@intentsolutions/audit-harness` bumped to v1.1.5 (#42).

### Fixed

- `researcher-build.sh`: `ai_disclosure_required` no longer false-positives on bare AI/Claude/Copilot mentions — now requires an actual disclosure demand (#50).
- `researcher-build.sh`: empty `policy_files` no longer emits a dangling YAML colon (root cause: `POLICY_FILES` was declared without `=()` → `set -u` unbound on zero-policy repos) (#50).
- `precheck-hook.sh`: three-path candidate lookup (explicit number / `--head` branch / single-active fallback) (#39).
- `scripts/doctor.sh`: symlink short-circuit now resolves `SRC` with `pwd -P`, so it's correct whether invoked from the repo or the deployed symlink (#48).
- `test-stale-dossier-refresh.sh` + `test-known-traps.sh` realigned with the builder interface and the bin/ mirror gate location (#49).
- Two robustness bugs in the trust-ladder gates caught in PR #40 review.

### Security

- `npm audit fix` in `tools/` (PDF tooling) — patched `ip-address` (XSS in Address6 HTML methods) and `ws` (uninitialized memory disclosure); `npm audit` now clean (#44).

## [0.1.2] - 2026-05-03

Patch release. Three runtime correctness bugs surfaced by a single qualifying flow against `secureblue/secureblue#2138`. All three were silent failures the gate framework was meant to catch — but were inside the framework itself.

### Fixed

- **`skills/contribute/scripts/researcher-build.sh`** — stopped fabricating the `policy_files` inventory. Earlier implementation captured stdout from `gh api` to detect file existence; on 404 `gh api` prints the error JSON to stdout (not stderr), so every probe registered as "exists." Replaced with exit-code-based probing (`gh api ... >/dev/null 2>&1`). Also added `docs/` subdir probing for projects (like secureblue) that house policy docs in `docs/CODE_OF_CONDUCT.md` etc. instead of the repo root. (#24)
- **`skills/contribute/scripts/transition.sh`** — fixed YAML corruption when adding `--override-gate` entries to candidate frontmatter. Earlier implementation used `awk -v RS='---'` + `sed -i` and produced malformed output (opening `---` became `------`, override entries landed outside the `overrides:` array as sibling top-level list items). Replaced with a Python `yaml` round-trip using `yaml.safe_dump`. NUL-separated pairs file passes overrides bash→Python so reasons containing `:` or `"` round-trip correctly. (#25)
- **`skills/contribute/scripts/gates/a09-mention-routing.sh`** — fixed false-positive BLOCK on every claim/PR draft without an `@-mention`. Earlier implementation chained `grep -oE | grep -viE | wc -l`; under `set -uo pipefail`, an empty first `grep` returns exit 1, killing the whole pipeline → fail-closed BLOCK. Replaced with a single `awk` pass that handles empty input cleanly and strips trailing punctuation. (#26)

### Caveats

- The 12 dossiers built before this patch have fabricated `policy_files` entries. `@researcher refresh <repo>` would correctly probe + emit honest entries — but the existing `researcher-build.sh` overwrites engineer-curated `## Pet peeves`, `## Failure log`, and `## Notes` sections on refresh. A "smart refresh" that preserves manual sections is a separate follow-up.

## [0.1.1] - 2026-05-03

Patch release. Fixes a real misframing bug surfaced in conversation post-v0.1.0: Step 0 was reporting the user's own-repo PRs as if they were in `/contribute` scope.

### Fixed

- **`skills/contribute/SKILL.md` Step 0** — scope PR queries to upstream-only via OWN_ORGS prefix exclusion (`jeremylongshore/`, `intent-solutions-io/`). Replaces deprecated `gh pr list --json repository` with `gh search prs`. Adds explicit "Scope rule (non-negotiable)" paragraph documenting the rationale.

## [0.1.0] - 2026-05-03

First marketplace release. Plugin live at `jeremylongshore/claude-code-plugins-plus-skills/plugins/community/contributing-clanker/`. Install via `/plugin install contributing-clanker`.

### Added

#### Plugin distribution (Phase 2 — Epic 11/yvb)

- **Marketplace plugin** at `plugins/community/contributing-clanker/` in `claude-code-plugins-plus-skills` with `plugin.json` (manifest) + Pattern A landing README + operator audit
- **Release script** `bin/release-plugin.sh <version> [--dry-run]` — semver-validated, rsync-syncs `skills/contribute/` → plugin dir, updates `plugin.json#version`, tags source repo, branches plugin repo, prints next-step commands. Idempotent.
- **Install/uninstall hooks** at `release/hooks/{install,uninstall}.sh` — install creates 7 runtime subdirs + copies 41 gates + 10 scripts + lib + writes profile.md template; uninstall removes plugin-shipped scripts but preserves user data (candidates/, research/, log.jsonl, profile.md)
- **E2E integration test** `tests/integration/test-plugin-install.sh` — 26 assertions covering install + user-data + uninstall preservation (sha256-verified)
- **Audit-harness** `@intentsolutions/audit-harness@v0.1.0` vendored at `.audit-harness/` per Intent Solutions Testing SOP

#### Anti-slop safety architecture (Phase 1)

- 41 deterministic gates across phases A/B/C/D/E/F/G covering 62 enumerated AI-slop failure modes
- Per-repo dossier system at `~/.contribute-system/research/<owner>__<repo>.md` built by `@researcher` subagent
- Lifecycle workflow (`transition.sh`) walking each candidate through `open → shortlist → claimed → working → submitted → merged`
- Override audit trail (`audit-overrides.sh`) — per-gate override frequency from `log.jsonl`
- Catalog-to-gate coverage report (`catalog-coverage.sh`)
- Scout-refresh regression harness (`test-scout-refresh.sh`, 10 assertions)
- Community failure-mode submission template at `000-docs/011-DR-TMPL-community-failure-mode-submission.md`
- 5 subagents in skill bundle: `scout`, `researcher`, `draft-writer`, `test-runner`, `repo-analyzer`
- Issue-template detection in dossier (`.github/ISSUE_TEMPLATE/` + legacy single-template)
- Pet peeves & Failure log dossier sections (manually curated, survive refresh)

#### Documentation

- 11 design docs under `000-docs/` (vision, architecture, scout/researcher specs, gate inventory, lifecycle workflow, failure-mode catalog, testing/verification, plugin-distribution plan, risk register, community submission template)
- QMD trigger conditions in `010-OD-RISK` — deferred until concrete signals surface
- Initial governance set: README, CLAUDE.md, AGENTS.md, LICENSE (MIT)

### Changed

- **Subagents relocated to skill bundle** per skill-creator spec: moved from `~/.claude/agents/` to `~/.claude/skills/contribute/agents/` (canonical, packageable; no symlinks)
- 5 L4 regression suites green (32/32 assertions): known-traps + override-audit + plug-in + stale-dossier + scout-refresh
- Repo renamed from `intent-solutions-io/contributions` → `jeremylongshore/contributing-clanker`
- SKILL.md migrated from SQLite tracker to markdown-only data model
- Dropped all bounty / payment / Algora / Gumroad / Cortex framing — this is a contribution tool, not a tracker
- `.beads/issues.jsonl` git-tracked — beads state survives machine death

### Removed

- SQLite tracker at `~/.contribute-system/contribute.db` (was never used)
- Stale money-flavored docs: `001-BL-TRCK-payment-tracker.md`, `002-PM-BKLG-contribution-tracker.csv`, `surgical-contributions.md/pdf`
- `~/000-projects/contribute-md/` parallel directory (redundant snapshot of `~/.contribute-system/`)

[Unreleased]: https://github.com/jeremylongshore/contributing-clanker/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/jeremylongshore/contributing-clanker/releases/tag/v0.1.2
[0.1.1]: https://github.com/jeremylongshore/contributing-clanker/releases/tag/v0.1.1
[0.1.0]: https://github.com/jeremylongshore/contributing-clanker/releases/tag/v0.1.0
