Feature: Communication and tone discipline (phase D gates)
  As Jeremy posting issues, comments, or reviews
  I want the system to refuse AI-shaped patterns that maintainers consistently flag
  So my contributions don't get auto-closed under upstream AI policies

  Scenario: Block opening an issue with AI-shaped body patterns
    Given the issue body contains 2 or more of: "I noticed", "It appears", "based on my analysis"
    When I attempt open-issue
    Then gate D02 must BLOCK
    And the fix_hint must instruct the user to rewrite in their own voice

  Scenario: Block submitting an AI-generated PR review on someone else's PR
    Given the review draft contains any AI-shaped phrase
    When I attempt submit-review
    Then gate D03 must BLOCK with stricter threshold than D02

  Scenario: Warn reopening a maintainer-closed PR
    Given gh pr view shows state=CLOSED with closedAt non-null
    When I attempt reopen
    Then gate D05 must WARN
    And the fix_hint must suggest a fresh PR if substantial changes were made

  Scenario: Skip reopen gate when the PR is open
    Given gh pr view shows state=OPEN
    When I attempt reopen
    Then gate D05 must SKIP
