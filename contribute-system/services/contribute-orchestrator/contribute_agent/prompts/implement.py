"""Implementation prompt template."""

IMPLEMENT_PROMPT = """Implement a fix for this bounty:

Issue: {issue_url}
Repository: {repo}

## Guidelines from Analysis
{guidelines}

## Implementation Plan
{plan}

## Style Rules
{style_rules}

## Commands to Run
- Lint: {lint_command}
- Test: {test_command}

## Known Gotchas for This Repo
{gotchas}

## Requirements

1. **Follow CONTRIBUTING.md exactly**
   - Match commit message format
   - Follow code style requirements
   - Include required sections in PR

2. **Match maintainer's coding style**
   - Use the same patterns seen in recent PRs
   - Follow naming conventions
   - Match comment style

3. **Write tests if project has them**
   - Add unit tests for new functionality
   - Ensure existing tests pass

4. **Keep changes MINIMAL**
   - Only change what's necessary
   - No drive-by cleanups or refactoring
   - One PR = One issue

5. **Quality checks**
   - Run lint before committing
   - Run tests before PR
   - Self-review the diff

Implement the fix and prepare it for PR submission. Return:
{{
    "branch_name": "<descriptive branch name>",
    "files_changed": [<list of changed files>],
    "commit_message": "<properly formatted commit>",
    "pr_title": "<PR title matching format>",
    "pr_body": "<full PR description>",
    "tests_added": [<list of test files>],
    "lint_passed": <boolean>,
    "tests_passed": <boolean>
}}
"""
