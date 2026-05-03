---
name: Bug Report
about: Report a bug in contributing-clanker (the workspace, the /contribute skill, gates, or dossier system)
title: "[BUG] "
labels: bug
assignees: ""
---

## Bug description

<!-- Clear description of what's broken -->

## Where it lives

- [ ] `/contribute` skill (`~/.claude/skills/contribute/SKILL.md`)
- [ ] `@scout` or `@researcher` subagent
- [ ] Gate script (`~/.contribute-system/gates/<id>.sh`) — which one:
- [ ] `transition.sh` / `gate-runner.sh` / `researcher-build.sh`
- [ ] Dossier output (`~/.contribute-system/research/`)
- [ ] This repo's docs / CLAUDE.md / README
- [ ] Other:

## Steps to reproduce

1.
2.
3.

## Expected behavior

<!-- What should happen -->

## Actual behavior

<!-- What actually happened. Include error messages, gate verdicts, log.jsonl entries if relevant. -->

## Environment

- **OS**: <!-- e.g., Ubuntu 24.04 -->
- **bash**: `bash --version | head -1`
- **gh**: `gh --version | head -1`
- **bd**: `bd version`
- **Claude Code**: <!-- which model, fast mode? -->
- **Last researcher-build run** (if relevant): timestamp from `~/.contribute-system/log.jsonl`

## Additional context

<!-- Related candidate file, dossier path, log.jsonl excerpts -->
