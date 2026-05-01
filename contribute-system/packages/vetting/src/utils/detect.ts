/**
 * Project Type Detection
 *
 * Detects project type, package manager, and available commands.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { ProjectDetection } from '../types';

interface PackageJson {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
}

export async function detectProject(workDir: string): Promise<ProjectDetection> {
  // Check for various project files
  const hasPackageJson = existsSync(join(workDir, 'package.json'));
  const hasPackageLock = existsSync(join(workDir, 'package-lock.json'));
  const hasYarnLock = existsSync(join(workDir, 'yarn.lock'));
  const hasPnpmLock = existsSync(join(workDir, 'pnpm-lock.yaml'));
  const hasBunLock = existsSync(join(workDir, 'bun.lockb'));
  const hasRequirements = existsSync(join(workDir, 'requirements.txt'));
  const hasPyproject = existsSync(join(workDir, 'pyproject.toml'));
  const hasCargoToml = existsSync(join(workDir, 'Cargo.toml'));
  const hasGoMod = existsSync(join(workDir, 'go.mod'));
  const hasPomXml = existsSync(join(workDir, 'pom.xml'));
  const hasBuildGradle = existsSync(join(workDir, 'build.gradle')) || existsSync(join(workDir, 'build.gradle.kts'));
  const hasGemfile = existsSync(join(workDir, 'Gemfile'));

  // Determine project type
  let type: ProjectDetection['type'] = 'unknown';
  let packageManager: ProjectDetection['packageManager'];
  let installCommand: string | undefined;
  let buildCommand: string | undefined;
  let testCommand: string | undefined;
  let lintCommand: string | undefined;

  if (hasPackageJson) {
    type = 'node';
    const pkg = JSON.parse(readFileSync(join(workDir, 'package.json'), 'utf-8')) as PackageJson;

    // Detect package manager
    if (hasBunLock) {
      packageManager = 'bun';
      installCommand = 'bun install';
    } else if (hasPnpmLock) {
      packageManager = 'pnpm';
      installCommand = 'pnpm install';
    } else if (hasYarnLock) {
      packageManager = 'yarn';
      installCommand = 'yarn install';
    } else {
      packageManager = 'npm';
      installCommand = 'npm install';
    }

    // Detect available scripts
    const scripts = pkg.scripts || {};
    if (scripts.build) buildCommand = `${packageManager} run build`;
    if (scripts.test) testCommand = `${packageManager} run test`;
    if (scripts.lint) lintCommand = `${packageManager} run lint`;
    else if (scripts['lint:check']) lintCommand = `${packageManager} run lint:check`;

  } else if (hasCargoToml) {
    type = 'rust';
    packageManager = 'cargo';
    installCommand = 'cargo build';
    buildCommand = 'cargo build --release';
    testCommand = 'cargo test';
    lintCommand = 'cargo clippy -- -D warnings';

  } else if (hasGoMod) {
    type = 'go';
    packageManager = 'go';
    installCommand = 'go mod download';
    buildCommand = 'go build ./...';
    testCommand = 'go test ./...';
    lintCommand = 'golangci-lint run';

  } else if (hasPyproject) {
    type = 'python';
    packageManager = 'poetry';
    installCommand = 'poetry install';
    buildCommand = 'poetry build';
    testCommand = 'poetry run pytest';
    lintCommand = 'poetry run ruff check .';

  } else if (hasRequirements) {
    type = 'python';
    packageManager = 'pip';
    installCommand = 'pip install -r requirements.txt';
    testCommand = 'pytest';
    lintCommand = 'ruff check . || flake8 .';

  } else if (hasPomXml) {
    type = 'java';
    packageManager = 'maven';
    installCommand = 'mvn install -DskipTests';
    buildCommand = 'mvn package -DskipTests';
    testCommand = 'mvn test';
    lintCommand = 'mvn checkstyle:check';

  } else if (hasBuildGradle) {
    type = 'java';
    packageManager = 'gradle';
    installCommand = './gradlew build -x test';
    buildCommand = './gradlew build -x test';
    testCommand = './gradlew test';
    lintCommand = './gradlew check';

  } else if (hasGemfile) {
    type = 'ruby';
    packageManager = 'bundler';
    installCommand = 'bundle install';
    testCommand = 'bundle exec rspec';
    lintCommand = 'bundle exec rubocop';
  }

  return {
    type,
    packageManager,
    hasTests: !!testCommand,
    hasLint: !!lintCommand,
    hasBuild: !!buildCommand,
    testCommand,
    lintCommand,
    buildCommand,
    installCommand
  };
}

export function getDefaultStages(detection: ProjectDetection): string[] {
  const stages = ['clone', 'detect'];

  if (detection.installCommand) stages.push('install');
  if (detection.buildCommand) stages.push('build');
  if (detection.lintCommand) stages.push('lint');
  if (detection.testCommand) stages.push('test');

  stages.push('security', 'bundle');

  return stages;
}
