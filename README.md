# github-sts-action

Exchange a GitHub Actions OIDC identity token for a **scoped, short-lived GitHub App installation token** via a self-hosted [github-sts](https://github.com/Depthmark/github-sts) service.

The token is automatically **revoked** when the job completes.

---

## How It Works

```
┌──────────────────┐     1. OIDC token      ┌──────────────────┐
│  GitHub Actions   │ ────────────────────▶  │  github-sts      │
│  (workflow job)   │                        │  (STS server)    │
│                   │  ◀──────────────────── │                  │
│                   │  2. Installation token │                  │
└──────────────────┘                        └──────────────────┘
         │                                           │
         │  3. Use token                             │  Validates OIDC
         ▼                                           │  Evaluates trust policy
┌──────────────────┐                                 │  Issues scoped token
│  GitHub API      │                                 │
│  (target repo)   │  ◀─────────────────────────────┘
└──────────────────┘
```

1. The action requests an OIDC token from GitHub Actions with a configurable audience
2. The OIDC token is sent to your github-sts server, which validates the token, evaluates the trust policy, and returns a scoped GitHub App installation token
3. The installation token is used for authenticated API calls against the target repository/organization
4. When the job ends, the token is automatically revoked

---

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `sts-url` | **Yes** | — | Base URL of your github-sts instance (e.g. `https://github-sts.example.com`) |
| `scope` | **Yes** | — | Target repository (`org/repo`) or organization (`org`) |
| `identity` | **Yes** | — | Trust policy identity name (maps to `.github/sts/{app}/{identity}.sts.yaml`) |
| `app` | No | *(server default)* | GitHub App name configured on the STS server. Required if multiple apps are configured |
| `audience` | No | `github-sts` | OIDC audience to request when fetching the identity token |

## Outputs

| Output | Description |
|---|---|
| `token` | Short-lived GitHub App installation token scoped to the permissions in the trust policy |

---

## Prerequisites

### 1. Deploy github-sts

Deploy the [github-sts](https://github.com/Depthmark/github-sts) server and configure it to accept GitHub Actions OIDC tokens. A Helm chart is available at [github-sts-helm](https://github.com/Depthmark/github-sts-helm) for Kubernetes deployments.

```yaml
# github-sts config
oidc:
  allowed_issuers:
    - "https://token.actions.githubusercontent.com"
```

### 2. Create a Trust Policy

In the **target repository**, create a trust policy file at `.github/sts/{app}/{identity}.sts.yaml`:

```yaml
# .github/sts/default/ci.sts.yaml
issuer: https://token.actions.githubusercontent.com
subject: repo:my-org/my-source-repo:ref:refs/heads/main
permissions:
  contents: read
  pull_requests: write
```

The policy controls:
- **`issuer`** — Must match the OIDC token's `iss` claim exactly
- **`subject`** — Exact match on the `sub` claim (e.g. `repo:org/repo:ref:refs/heads/main`)
- **`subject_pattern`** *(alternative)* — Regex pattern for the `sub` claim (e.g. `repo:org/repo:.*`)
- **`claim_pattern`** *(optional)* — Additional claim regex patterns (e.g. match on `email`, custom claims)
- **`permissions`** — GitHub App permissions to grant (`read`, `write`, or `admin`)

### 3. Set Workflow Permissions

The calling workflow **must** have `id-token: write` permission to request OIDC tokens:

```yaml
permissions:
  id-token: write
```

---

## Usage

### Basic Example

```yaml
name: Deploy

on:
  push:
    branches: [main]

permissions:
  id-token: write  # Required for OIDC token

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: Depthmark/github-sts-action@main
        id: sts
        with:
          sts-url: https://github-sts.example.com
          scope: my-org/my-target-repo
          identity: ci

      - uses: actions/checkout@v4
        with:
          repository: my-org/my-target-repo
          token: ${{ steps.sts.outputs.token }}
```

### Cross-Repository Access

```yaml
jobs:
  sync:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
    steps:
      - uses: Depthmark/github-sts-action@main
        id: sts
        with:
          sts-url: https://github-sts.example.com
          scope: other-org/private-repo
          identity: sync-bot

      - name: Clone and sync
        env:
          GITHUB_TOKEN: ${{ steps.sts.outputs.token }}
        run: |
          gh repo clone other-org/private-repo
```

### Multiple Apps

If your STS server has multiple GitHub Apps configured, specify which one to use:

```yaml
      - uses: Depthmark/github-sts-action@main
        id: sts
        with:
          sts-url: https://github-sts.example.com
          scope: my-org/my-repo
          identity: deploy
          app: deploy-bot
```

### Custom Audience

```yaml
      - uses: Depthmark/github-sts-action@main
        id: sts
        with:
          sts-url: https://github-sts.example.com
          scope: my-org/my-repo
          identity: ci
          audience: my-custom-audience
```

### Trust Policy with Regex Patterns

Allow any branch from a specific repository:

```yaml
# .github/sts/default/ci.sts.yaml
issuer: https://token.actions.githubusercontent.com
subject_pattern: "repo:my-org/my-source-repo:.*"
permissions:
  contents: read
```

Match on additional claims:

```yaml
# .github/sts/default/deploy.sts.yaml
issuer: https://token.actions.githubusercontent.com
subject_pattern: "repo:my-org/my-source-repo:ref:refs/heads/main"
claim_pattern:
  runner_environment: "github-hosted"
  job_workflow_ref: "my-org/my-source-repo/.github/workflows/deploy.yml@.*"
permissions:
  contents: write
  deployments: write
```

---

## Error Reference

The action provides clear, actionable error messages for every failure mode:

| HTTP Status | Error | Cause | Fix |
|---|---|---|---|
| — | `Missing OIDC environment variables` | `id-token: write` not set in workflow | Add `permissions: id-token: write` to your job or workflow |
| 400 | `Configuration error` | Invalid or missing `app` parameter | Check the `app` input matches a configured app on the STS server |
| 401 | `OIDC token validation failed` | Token expired, malformed, wrong issuer, or bad signature | Verify the OIDC issuer is in the STS server's `allowed_issuers` list |
| 403 | `Trust policy denied the request` | OIDC claims don't match the trust policy | Check `subject`/`subject_pattern` and `issuer` in the `.sts.yaml` file match your workflow's OIDC claims |
| 404 | `Trust policy not found` | No policy file at the expected path | Create `.github/sts/{app}/{identity}.sts.yaml` in the target repository |
| 409 | `Token replay detected` | Same OIDC token used twice (JTI replay prevention) | This is a transient issue — re-run the workflow to get a fresh token |
| 500 | `STS server error` | Internal server error (retried automatically) | Check the STS server logs for details |
| Network | `Failed to connect to STS` | Cannot reach the STS server (retried automatically) | Verify `sts-url` is correct and the server is accessible from GitHub Actions runners |

---

## Job Summary

The action writes a summary to the GitHub Actions job summary on every run.

**On success:**

> ## ✅ GitHub STS Token Exchange
>
> | Field | Value |
> |---|---|
> | Scope | `my-org/my-repo` |
> | Identity | `ci` |
> | App | `default` |
> | Permissions | `contents: read`, `pull_requests: write` |

**On failure:**

> ## ❌ GitHub STS Token Exchange Failed
>
> | Field | Value |
> |---|---|
> | Scope | `my-org/my-repo` |
> | Identity | `ci` |
> | Error | Trust policy denied the request |
>
> **Details:** OIDC token claims do not satisfy the trust policy

---

## Security

- **Token masking** — The installation token is masked in all workflow logs using `::add-mask::`
- **Automatic revocation** — Tokens are revoked via `DELETE /installation/token` when the job completes (success, failure, or cancellation)
- **Short-lived tokens** — GitHub App installation tokens expire after 1 hour by default
- **Least privilege** — Permissions are defined in the trust policy, not the workflow
- **No secrets required** — Uses GitHub Actions native OIDC federation; no PATs or app credentials in the workflow
- **JTI replay prevention** — The STS server prevents OIDC tokens from being reused
- **OIDC claims logged safely** — Token claims are logged in a collapsed group for debugging; token values are never logged
- **Zero dependencies** — No `node_modules`; uses only Node.js built-ins, eliminating supply-chain risk
- **HTTPS enforced** — Both `sts-url` and `github-api-url` must use HTTPS (HTTP allowed only for localhost)
- **Input validation** — `scope`, `identity`, and `app` are validated against strict allowlists before any network call
- **Injection-safe outputs** — `GITHUB_OUTPUT` and `GITHUB_STATE` use the multiline delimiter format with random boundaries, preventing value injection
- **Workflow command sanitization** — All untrusted strings are sanitized before interpolation into `::error::` / `::warning::` log commands

---

## License

[MIT](LICENSE)

