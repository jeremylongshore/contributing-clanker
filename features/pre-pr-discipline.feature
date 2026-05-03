Feature: Pre-PR discipline (phase B gates)
  As Jeremy preparing a contribution before submission
  I want the system to enforce per-repo conventions about branches, commits, and scope
  So my PR doesn't get rejected for mechanical violations the maintainer has documented

  Background:
    Given the local clone is at ~/000-projects/contributing-clanker/<repo-name>
    And the dossier captures the repo's branch convention and commit format

  Scenario: Block when current branch violates the dossier's branch_convention regex
    Given the dossier has branch_convention "^(feat|fix|chore)/.+"
    And the current branch is "random-thing"
    When I attempt working→submitted
    Then gate B02 must BLOCK
    And the fix_hint must include the regex and the current branch name

  Scenario: Block when DCO is required and a commit lacks Signed-off-by
    Given the dossier has dco_required=true
    And the most recent commit body lacks "Signed-off-by:"
    When I attempt working→submitted
    Then gate B05 must BLOCK
    And the fix_hint must mention git commit --amend -s

  Scenario: Block when Conventional Commits is required and a subject doesn't match
    Given the dossier has conventional_commits=true
    And the commit subject is "fixed stuff"
    When I attempt working→submitted
    Then gate B06 must BLOCK

  Scenario: Warn when local clone is more than 100 commits behind upstream
    Given origin/main has advanced by 150 commits since the local clone branched
    When I attempt claimed→working
    Then gate B03 must WARN
    And the fix_hint must mention rebasing on origin/main

  Scenario: Block when local check command exists but no recent green run is recorded
    Given the dossier has local_check_command "make test"
    And no check-run evidence file exists for this branch
    When I attempt working→submitted
    Then gate B14 must BLOCK
    And the fix_hint must include the command to run
