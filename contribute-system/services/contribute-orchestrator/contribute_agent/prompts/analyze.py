"""Analysis prompt template."""

ANALYZE_PROMPT = """Analyze this GitHub issue for a bounty opportunity:

Issue URL: {issue_url}
Repository: {repo}

Please perform a comprehensive analysis:

1. **Issue Understanding**
   - Read the issue description and ALL comments
   - Identify the core problem being reported
   - Note any acceptance criteria mentioned

2. **Repository Analysis**
   - Check the CONTRIBUTING.md guidelines
   - Analyze the codebase structure relevant to this issue
   - Identify the tech stack and relevant files

3. **Complexity Assessment**
   - Estimate complexity on a scale of 1-10
   - Estimate time to complete
   - Identify any potential blockers

4. **Competition Check**
   - Look for any competing PRs or claimants
   - Check if anyone has commented claiming the issue

5. **Style Analysis**
   - Summarize the maintainer's coding style from recent merged PRs
   - Note commit message format preferences
   - Identify any project-specific patterns

Return as JSON:
{{
    "issue_summary": "<2-3 sentence summary>",
    "requirements": [<list of requirements>],
    "complexity": <1-10>,
    "estimated_hours": <number>,
    "relevant_files": [<list of file paths>],
    "tech_stack": [<list of technologies>],
    "guidelines": "<summary of CONTRIBUTING.md>",
    "style_notes": "<maintainer style observations>",
    "blockers": [<potential issues>]
}}
"""
