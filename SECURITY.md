# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest  | Yes       |
| < latest | Best effort |

## Reporting a vulnerability

**Please do NOT open public issues for security concerns.**

Email **security@intentsolutions.io** with:

- Type of issue (e.g., credential leak, command injection, prompt injection)
- Full path of related source files
- Location of the affected code (commit hash + path:line if known)
- Any special configuration required to reproduce
- Step-by-step reproduction
- Proof-of-concept (if possible)
- Impact assessment

### Response timeline

| Stage | Target |
|-------|--------|
| Acknowledgment | 24 hours |
| Initial assessment | 48 hours |
| Status update | 5 business days |
| Resolution | depends on severity |

### Severity (CVSS-aligned)

| Severity | CVSS | Examples | Target resolution |
|----------|------|---------|-------------------|
| Critical | 9.0–10.0 | Remote code execution, credential theft | 24 hours |
| High     | 7.0–8.9 | Privilege escalation, data exposure | 7 days |
| Medium   | 4.0–6.9 | XSS, denial of service | 30 days |
| Low      | 0.1–3.9 | Information disclosure, minor issues | 90 days |

## Where security matters in this system

The contributing-clanker is a contribution-safety tool. Security-relevant surfaces:

- **`gh` CLI calls** — every gate that talks to GitHub. Token scopes matter.
- **Gate scripts** — pre-existing or contributed gates run with the user's privileges. A malicious gate could exfiltrate. Treat gate scripts like any other dependency.
- **Dossier YAML** — frontmatter is parsed by gates. Malformed dossiers should fail-closed (gate runner already does this).
- **Override mechanism** — `transition.sh --override-gate <ID> "reason"` bypasses BLOCK gates. Reasons are logged. Don't use override to defeat security gates without an audit trail.
- **`@scout` and `@researcher` subagents** — they call `gh` and `curl`. Network egress.

## Best practices

- Never hardcode credentials or secrets in this repo (or anywhere)
- Use SOPS for any sensitive config (see `.sops.yaml`, `secrets.example.yaml`)
- Review gate scripts before installing them — they run with your shell privileges
- Keep `gh` token scopes minimal (`repo`, `read:user`, `read:org`)

## Contact

- **Security reports**: security@intentsolutions.io
- **General**: jeremy@intentsolutions.io
