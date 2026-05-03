Feature: Discovery and claim safety (phase A gates)
  As Jeremy contributing to upstream OSS
  I want the system to refuse claims on issues that are already taken or shipped
  So I don't waste maintainer time or claim-jump real human work

  Background:
    Given the dossier system has been built for the target repo
    And the candidate file lives at ~/.contribute-system/candidates/<owner>__<repo>__issue<N>.md

  Scenario: Block claim on an already-assigned issue
    Given an issue assigned to "unKnownNG"
    When I attempt the shortlist→claimed transition
    Then gate A01 must BLOCK
    And the fix_hint must mention waiting for the assignee or coordinating in a comment

  Scenario: Block claim on an issue already shipped via merged PR
    Given a merged PR exists with body "Closes #N"
    When I attempt the shortlist→claimed transition
    Then gate A02 must BLOCK
    And the fix_hint must mention picking a different candidate

  Scenario: Block claim on a closed-not-planned issue
    Given the issue's state is CLOSED with reason NOT_PLANNED
    When I attempt the shortlist→claimed transition
    Then gate A05 must BLOCK
    And the candidate's status should remain unchanged

  Scenario: Allow claim on a free, open, unshipped issue
    Given the issue is OPEN
    And no PR closes it
    And no maintainer has assigned it
    When I attempt the shortlist→claimed transition
    Then all phase A gates must PASS or SKIP
    And the candidate's status field must update to "claimed"

  Scenario: Skip etiquette gate at repos that don't require comment-first
    Given the dossier has etiquette_comment_required=false
    When I attempt the claimed→working transition
    Then gate A06 must SKIP

  Scenario: Block working without etiquette comment when repo requires it
    Given the dossier has etiquette_comment_required=true
    And the user has not yet commented on the issue with a claim phrase
    When I attempt the claimed→working transition
    Then gate A06 must BLOCK
    And the fix_hint must direct the user to post a claim comment first
