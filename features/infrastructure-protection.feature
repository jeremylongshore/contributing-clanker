Feature: Infrastructure path protection (phase G gates)
  As Jeremy modifying upstream code
  I want the system to refuse hand-edits to vendored, generated, and CI paths
  So I don't accidentally break upstream's release tooling or auto-generated code

  Background:
    Given the local clone is at ~/000-projects/contributing-clanker/<repo-name>

  Scenario: Block diff that hand-edits vendor/ files
    Given the diff against the default branch includes a file under vendor/
    When I attempt working→submitted
    Then gate G01 must BLOCK
    And the fix_hint must mention regenerating from source

  Scenario: Warn diff that only modifies lockfiles
    Given the diff includes only package-lock.json or Cargo.lock
    When I attempt working→submitted
    Then gate G01 must WARN
    And the gate must NOT block (lockfile bumps are usually legitimate)

  Scenario: Warn touching CI workflow files
    Given the diff includes files under .github/workflows/
    When I attempt working→submitted
    Then gate G02 must WARN
    And the fix_hint must suggest opening a Design Issue first

  Scenario: Warn manual CHANGELOG edits at repos with auto-changelog
    Given the dossier has auto_changelog=true
    And the diff includes CHANGELOG.md
    When I attempt working→submitted
    Then gate G03 must WARN
    And the fix_hint must mention release tooling owns CHANGELOG generation

  Scenario: Warn manual version bumps at repos using semantic-release / changesets
    Given the dossier has auto_version=true
    And the diff modifies the version field in package.json
    When I attempt working→submitted
    Then gate G04 must WARN

  Scenario: Pass when only application code is modified
    Given the diff touches only files under src/
    When I attempt working→submitted
    Then phase G gates must PASS
