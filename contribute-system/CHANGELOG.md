# Changelog

All notable changes to the bounty-system will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-02-03

### Breaking Changes

- **Database schema v10**: Consolidated 28 fragmented tables into 2 main tables
  - `repos`: Now 70 columns (merged repo_profiles, repo_metrics, repo_reputation, cla_status, repo_blocklist)
  - `issues_index`: Now 36 columns (added validation fields)
  - Migration automatically moves data from old tables
  - Old tables retained for reference but no longer used

### Added

- **competition command**: Monitor competing PRs with risk scoring
  - `bounty competition check <id>` - Check competition on engagement
  - `bounty competition watch <id>` - Start monitoring for changes
  - `bounty competition list` - List all monitored engagements
  - Risk thresholds: LOW (0-20), MODERATE (21-40), HIGH (41-60), CRITICAL (61+)

- **text command**: AI pattern detection and style matching
  - `bounty text lint --repo <repo> --in <file>` - Check for AI-ish patterns
  - `bounty text rewrite --repo <repo> --in <file>` - Rewrite to match repo style

- **Hunt validation persistence**: Validation results now saved to database
  - Tracks `validated_at`, `live_state`, `competing_prs`, `days_since_activity`
  - Discovers and caches CONTRIBUTING.md URLs in repos table

- **CONTRIBUTING.md links in Slack**: Hunt summaries now include links to CONTRIBUTING.md

### Changed

- **EV scoring**: Disabled time-based opportunity cost by default
  - New `includeTimeCost` parameter (default: false)
  - User decides if bounty worth their time, not the algorithm
  - Set to true to restore old behavior with hourly rate penalties

### Fixed

- Hunt no longer shows PRs (only issues)
- Max-age filter now uses 14 days default (was 90)
- Validation updates correct table (issues_index, not bounties)

## [0.1.0] - 2026-01-30

### Added

- Initial release with 18 operator-grade features
- Core commands: list, show, create, claim, unclaim
- Work session recording with asciinema + GCS upload
- GitHub integration for issue sync
- Slack webhook notifications
- EV scoring with win probability calculation
- Buy box rules for go/no-go decisions
- Database schema v1-v9 with migrations
