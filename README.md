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
| `token` | Short-lived GitHub App installation token scoped to the permissions in the trust policy. Empty if the exchange failed. |
| `error-code` | Set only on failure. Either the exact `code` your github-sts server returned (see [Error Reference](#error-reference)), or one of this action's own `action_`-prefixed codes for failures that never reach the server. Use this to branch on failure reason instead of parsing logs. |
| `error-message` | Set only on failure. Human-readable description — the same text sent to the `::error::` annotation. |
| `http-status` | Set only on failure, and only when a response was actually received from the STS server. Empty for input-validation, OIDC, and connection failures. |

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

### Handling Failures Programmatically

Use `continue-on-error: true` plus the `error-code` output to branch on
*why* the exchange failed, instead of treating any non-success the same way
or scraping log text — see [Error Reference](#error-reference) for the full
list of values:

```yaml
      - uses: Depthmark/github-sts-action@v0
        id: sts
        continue-on-error: true
        with:
          sts-url: ${{ vars.STS_URL }}
          scope: my-org/my-repo
          identity: ci

      - name: Handle result
        run: |
          if [ "${{ steps.sts.outcome }}" = "success" ]; then
            echo "Got a token"
          elif [ "${{ steps.sts.outputs.error-code }}" = "replay_detected" ]; then
            echo "Transient — safe to retry"
          else
            echo "::error::${{ steps.sts.outputs.error-code }}: ${{ steps.sts.outputs.error-message }}"
            exit 1
          fi
```

---

## Best Practices

### Pin to a major version tag

Reference the action by its major version tag rather than a branch. This gives you automatic patch and minor updates while avoiding unexpected breaking changes:

```yaml
- uses: Depthmark/github-sts-action@v0  # stable — tracks v0.x.x
```

For maximum reproducibility, pin to an exact commit SHA:

```yaml
- uses: Depthmark/github-sts-action@<full-commit-sha>  # v0.0.2
```

### Grant least-privilege permissions

Only request the permissions your workflow actually needs in the trust policy:

```yaml
# Good — scoped to what the job needs
permissions:
  contents: read
  pull_requests: write

# Avoid — overly broad
permissions:
  contents: write
  administration: write
  members: write
```

### Prefer exact subjects over patterns

Use `subject` (exact match) instead of `subject_pattern` (regex) whenever your workflow runs from a known, fixed ref. Exact matches eliminate the risk of unintended callers:

```yaml
# Preferred — only main branch can use this policy
subject: "repo:my-org/my-repo:ref:refs/heads/main"

# Use patterns only when multiple refs are intentional
subject_pattern: "repo:my-org/my-repo:ref:refs/heads/(main|release/.*)"
```

### Add claim constraints for defense in depth

Use `claim_pattern` to restrict tokens beyond just the subject. Constraining `job_workflow_ref` ensures only a specific workflow file can trigger the exchange:

```yaml
subject: "repo:my-org/my-repo:ref:refs/heads/main"
claim_pattern:
  job_workflow_ref: "my-org/my-repo/.github/workflows/deploy.yml@.*"
  runner_environment: "github-hosted"
```

### Set `id-token: write` at the job level

Declare the OIDC permission on the specific job that needs it, not at the workflow level. This prevents other jobs in the same workflow from requesting OIDC tokens:

```yaml
jobs:
  deploy:
    permissions:
      id-token: write    # only this job gets OIDC access
      contents: read
    steps:
      - uses: Depthmark/github-sts-action@v0
        # ...

  lint:
    permissions:
      contents: read     # no id-token — cannot call STS
    steps:
      # ...
```

### Prefer repository scope over organization scope

Repository-scoped tokens have a smaller blast radius. Only use org scope when you genuinely need cross-repository access, and pair it with the `repositories` field to limit reach:

```yaml
subject_pattern: "repo:my-org/deployer:.*"
repositories:
  - frontend
  - backend
permissions:
  contents: read
```

### Use one identity per use case

Create separate trust policies for distinct workflows rather than sharing a single broad policy. This makes it easy to audit and revoke access independently:

```
.github/sts/default/
  ci.sts.yaml          # read-only, any branch
  deploy.sts.yaml      # write, main only, constrained to deploy.yml
  release.sts.yaml     # write, release branches only
```

### Centralize `sts-url` in a GitHub Actions variable

Store the STS server URL as a [GitHub Actions variable](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/store-information-in-variables) at the organization or repository level instead of hardcoding it in every workflow:

```yaml
- uses: Depthmark/github-sts-action@v0
  with:
    sts-url: ${{ vars.STS_URL }}
    scope: my-org/my-repo
    identity: ci
```

### Limit token exposure within the job

Pass the token only to steps that need it. Avoid setting it as a job-level environment variable, which would expose it to every step including third-party actions:

```yaml
steps:
  - uses: Depthmark/github-sts-action@v0
    id: sts
    with:
      sts-url: ${{ vars.STS_URL }}
      scope: my-org/target-repo
      identity: ci

  # Good — token scoped to this step only
  - name: Push changes
    env:
      GITHUB_TOKEN: ${{ steps.sts.outputs.token }}
    run: gh repo clone my-org/target-repo
```

---

## Error Reference

Every failure sets `error-code` (see [Outputs](#outputs)) — use it to branch
programmatically instead of parsing log text. Values marked "server" are
passed straight through from your github-sts instance's own
`{"error":...,"code":...,"trace_id":...}` response (see its own API
reference for the authoritative, up-to-date list — this table mirrors it as
of this action's own testing, not the other way around). Values marked
"action" never reach the server at all.

| `error-code` | Source | HTTP | Cause | Fix |
|---|---|---|---|---|
| `action_invalid_input` | action | — | Missing/malformed `sts-url`, `scope`, `identity`, or `app` input | Check the input against `action.yml`'s format rules |
| `action_missing_oidc_env` | action | — | `id-token: write` not set in the workflow | Add `permissions: id-token: write` to your job or workflow |
| `action_oidc_fetch_failed` | action | — | Couldn't get an OIDC token from GitHub Actions itself | Usually transient — re-run; if persistent, check GitHub Actions status |
| `action_connection_failed` | action | — | Couldn't reach the STS server after 3 retries (network, or a non-github-sts error body) | Verify `sts-url` is correct and reachable from GitHub Actions runners |
| `action_invalid_response` | action | 200 | STS responded `200` but the body had no `token` | Check the STS server logs — this indicates a server-side bug |
| `action_malformed_error_response` | action | 4xx/5xx | STS returned an error whose body wasn't the expected `{"code":...}` shape | Check the STS server version/logs — its error format may have changed |
| `action_internal_error` | action | — | Unexpected exception in the action itself | Check the full log; consider filing an issue |
| `bad_request` | server | 400 | Malformed request (bad scope format, invalid JSON, unsupported org scope) | Check `scope`/`identity`/`app` formatting |
| `oidc_invalid` | server | 403 | OIDC token rejected (expired, bad signature, unknown issuer) | Verify the OIDC issuer is in the STS server's `allowed_issuers` list |
| `github_identity_invalid` | server | 403 | Missing/contradictory immutable ID claims in the OIDC token | Check the source repository's Actions OIDC settings |
| `audience_mismatch` | server | 403 | Token's `aud` doesn't match the policy's `audience:` | Pass the right `audience` input, or update the policy |
| `app_unknown` | server | 403 | `app` input doesn't match a configured app on the STS server | Check spelling, or omit when only one app is configured |
| `policy_not_found` | server | 403 | No `.sts.yaml` at `{app}/{identity}` in the target (or org policy) repo | Create `.github/sts/{app}/{identity}.sts.yaml` |
| `trust_policy_invalid` | server | 403 | The loaded policy file is malformed | Fix the policy file; see the STS server's audit log |
| `policy_denied` | server | 403 | OIDC claims don't match the trust policy | Check `subject`/`subject_pattern`/`issuer` in the `.sts.yaml` against your workflow's real OIDC claims |
| `org_policy_denied` | server | 403 | An enterprise Rego bundle denied the request after the YAML policy allowed it | Check the STS server's bundle decision audit log |
| `replay_detected` | server | 409 | Same OIDC token used twice (JTI replay prevention) | Transient — re-run the workflow to mint a fresh token |
| `upstream_error` | server | 502 | Policy fetch or GitHub token mint failed — e.g. the trust policy allows a permission the App itself doesn't have installed | Check the App's installed permissions match what the policy grants |

Server codes not listed here (`method_not_allowed`, `bundle_stale`,
`bundle_unavailable`, `bundle_evaluation_failed`, `internal_error`) are
passed through identically — `error-code` always mirrors whatever your
server returns.

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

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 24+
- [act](https://github.com/nektos/act) (optional, for running CI locally)

### Available make targets

```
make help         Show all targets
make check        Check JavaScript syntax (node --check)
make validate     Validate action.yml structure
make act-ci       Run the CI workflow locally with act
make act          Alias for act-ci
```

### Running CI locally with act

[act](https://github.com/nektos/act) lets you run GitHub Actions workflows locally using Docker. Install it, then:

```bash
make act-ci
```

This runs the CI workflow against the `ubuntu-latest` platform image. Override the image with:

```bash
make act-ci ACT_IMAGE=ghcr.io/catthehacker/ubuntu:act-22.04
```

### Release lifecycle

This project uses [Release Please](https://github.com/googleapis/release-please) with [conventional commits](https://www.conventionalcommits.org/):

1. Push conventional commits to `main` (e.g. `feat:`, `fix:`)
2. Release Please opens a release PR with changelog and version bump
3. Merge the release PR to create a GitHub Release and semver tag (e.g. `v0.0.2`)
4. The `update-major-tag` job moves the floating `v0` tag forward
5. Users reference the action as `@v0` (recommended) or `@v0.0.2` (pinned)

---

## License

[MIT](LICENSE)

