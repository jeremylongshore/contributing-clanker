# Contributing to contributing-clanker

This is a single-user personal workspace + a Claude Code skill — there's no expectation of external contribution. But if you've found a bug, an improvement idea, or want to fork it for your own use, here's the convention.

## What this project is

The contributing-clanker is a tool for making AI-assisted upstream OSS contributions land cleanly. The repo holds clones of upstream projects we contribute to. The actual workflow lives in the `/contribute` Claude Code skill at `~/.claude/skills/contribute/`. The runtime state (gates, dossiers, candidates, log) lives at `~/.contribute-system/`.

This repo is not the skill or the runtime — it's the workspace. See [README.md](README.md) for the full architecture.

## How to suggest a change

1. **Open an issue first.** Describe the problem, your suggested approach, and what you've already tried. Use the bug or feature template at `.github/ISSUE_TEMPLATE/`.
2. **Wait for a response.** This is a single-user project — turnaround may be slow.
3. **If we agree on the approach**, fork, branch, implement, open a PR.

## Pull request guidelines

- Fork the repo, branch off `master` as `feat/<short-description>` or `fix/<short>`.
- Use [Conventional Commits](https://www.conventionalcommits.org/) — `feat(scope): subject`, `fix:`, `chore:`, `docs:`. Lowercase, no period.
- Keep PRs focused. One feature or one fix per PR.
- Include test evidence in the PR body when changing the gate-runner, transition.sh, or any gate script.
- Don't add `Co-Authored-By:` trailers for AI assistance — say so in the PR body instead.
- Don't bump the version manually; release tooling handles it.

## What this repo is not

- Not a tracker. State lives in markdown candidate files at `~/.contribute-system/candidates/`, not in this repo.
- Not a portfolio. Per-clone notes are about working in those clones, not advertising work.
- Not a bounty board. There are no payouts. We help maintainers; we don't charge them.

## Style

- Bash scripts (gates, transition.sh, gate-runner.sh): pure POSIX-ish bash, use `/usr/bin/<tool>` for absolute paths to bypass shell aliases, source `lib/preamble.sh` first in every gate.
- Markdown: dossiers and candidates use YAML frontmatter for queryable fields, body sections for human-readable content.
- No interactive prompts in scripts (this is a non-interactive agent host) — always pass `-y`, `-f`, or `--yes` flags.

## Reporting security issues

See [SECURITY.md](SECURITY.md). Don't open public issues for vulnerabilities.

## License

By contributing you agree your contribution is licensed under the [MIT License](LICENSE).
