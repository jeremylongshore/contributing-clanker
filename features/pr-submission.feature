Feature: PR submission quality (phase C gates)
  As Jeremy opening a PR or flipping draft to ready-for-review
  I want the system to enforce the upstream's PR template, evidence requirements, and CI signals
  So maintainers see a complete, reviewable PR that respects their stated process

  Background:
    Given the candidate has a pr_number set after PR creation
    And the dossier captures the upstream's draft-first preference and required PR sections

  Scenario: Block opening a non-draft PR at a draft-first repo
    Given the dossier has draft_first=true
    And the candidate has draft=false
    When I attempt the open-pr action
    Then gate C01 must BLOCK
    And the fix_hint must mention --draft

  Scenario: Block PR body missing a required section
    Given the dossier has pr_template_required_sections [Problem, Changes, "How tested", "Agent context"]
    And the PR body draft has only ## Problem and ## Changes
    When I attempt open-pr
    Then gate C03 must BLOCK
    And the fix_hint must list the missing section names

  Scenario: Block UI changes lacking screenshots
    Given the diff touches a .tsx file
    And the PR body has no image markdown or "screenshot" mention
    When I attempt open-pr
    Then gate C04 must BLOCK

  Scenario: Block PR body lacking test evidence
    Given the diff is non-trivial
    And the PR body has no fenced code block containing test runner output
    When I attempt open-pr
    Then gate C05 must BLOCK
    And the fix_hint must instruct the user to paste local test output

  Scenario: Block flipping to ready-for-review while CI checks are failing
    Given gh pr checks reports any check with bucket=fail
    When I attempt flip-to-ready
    Then gate C12 must BLOCK
    And the reason must list the failing check names

  Scenario: Warn flipping to ready while required review bots have not yet engaged
    Given the dossier review_bots includes "greptile-apps"
    And greptile-apps has not yet appeared in the PR's reviewers list
    When I attempt flip-to-ready
    Then gate C13 must WARN

  Scenario: Block self-merging your own PR
    Given gh pr view reports the PR author equals the current gh user
    When I attempt the merge action
    Then gate C16 must BLOCK
    And the fix_hint must mention waiting for a maintainer
