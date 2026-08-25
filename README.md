# GitHub STS Action

[![CI](https://github.com/Depthmark/github-sts-action/actions/workflows/ci.yml/badge.svg)](https://github.com/Depthmark/github-sts-action/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Depthmark/github-sts-action?sort=semver)](https://github.com/Depthmark/github-sts-action/releases)
[![Marketplace](https://img.shields.io/badge/Marketplace-GitHub%20STS-blue?logo=githubactions&logoColor=white)](https://github.com/marketplace/actions/github-sts-provider)
[![Documentation](https://img.shields.io/badge/Documentation-github--sts-8A2BE2?logo=readthedocs&logoColor=white)](https://depthmark.github.io/github-sts/integrations/use-github-action/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Exchange your workflow's OIDC identity token for a scoped, short-lived GitHub App installation token, issued by a self-hosted [github-sts](https://github.com/Depthmark/github-sts) server and revoked when the job ends.

```text
OIDC token  ->  github-sts  ->  scoped installation token  ->  revoked at job end
```

- **No stored credentials.** No personal access token and no GitHub App private key. The only permission the job needs is `id-token: write`.
- **Permissions live in the target repository.** A trust policy there decides which workflow gets what, not the calling workflow.
- **Short blast radius.** The token is masked in logs, expires within an hour, and is revoked in a post-job step on success, failure, and cancellation.

## Prerequisites

1. A reachable **github-sts server**. See [Deploy with Helm](https://depthmark.github.io/github-sts/integrations/deploy-with-helm/).
2. A **GitHub App** installed on the target repository and configured on that server.
3. A **trust policy** in the target repository. See [Trust Policies](https://depthmark.github.io/github-sts/concepts/trust-policies/).

## Quickstart

This gives a workflow that stores no credentials a scoped installation token for another repository.

### 1. Add a trust policy to the target repository

Create `.github/sts/default/ci.sts.yaml`. This file grants the access, and it lives with the repository being accessed.

```yaml
issuer: https://token.actions.githubusercontent.com
audience: https://sts.example.com
subject: repo:my-org/my-source-repo:ref:refs/heads/main
permissions:
  contents: read
```

`audience` is mandatory and must match the `audience` input below exactly. `subject` is the OIDC `sub` claim of the workflow you are authorizing.

### 2. Exchange the token in the source workflow

```yaml
name: Deploy

on:
  push:
    branches: [main]

permissions: {}

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write   # required, or there is no OIDC token to exchange
      contents: read
    steps:
      - uses: Depthmark/github-sts-action@v0.3.0
        id: sts
        with:
          sts-url: https://sts.example.com
          audience: https://sts.example.com   # must equal `audience:` in the policy
          scope: my-org/my-target-repo
          identity: ci

      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0
        with:
          repository: my-org/my-target-repo
          token: ${{ steps.sts.outputs.token }}
```

`identity: ci` with no `app` input loads `ci.sts.yaml` from the server's default app directory.

> [!TIP]
> Declare `id-token: write` on the job, not the workflow, so unrelated jobs cannot mint OIDC tokens. Pass the token through a step-level `env:` block, never a job-level one.

### 3. Expected result

The step logs the token's SHA-256 digest, never the token itself.

```text
Token SHA-256: 9f2c...
Token issued for scope=my-org/my-target-repo identity=ci app=default
```

The job summary gains a table naming the scope, identity, app, and the permissions the server granted.

### 4. Verification

- The token never appears in the log. The action calls `::add-mask::` before writing any output.
- Expand the collapsed `OIDC Token Claims` group to see the `sub`, `iss`, and `aud` values the server evaluated. Compare them against the trust policy when an exchange is denied.
- After the job finishes, whatever its outcome, the post-job step logs `Token revoked successfully.`

### Known limitations

- Organization-level scope is rejected by current server releases. Pass `org/repo` and run one exchange per target repository.
- Installation tokens expire one hour after they are minted. A job that runs longer needs a second exchange.
- Revocation is best effort. A failed revocation logs a warning, the job still succeeds, and the token stays valid until it expires.

[Workflow Usage](https://depthmark.github.io/github-sts/integrations/github-action/workflow-usage/) covers cross-repository access, multiple GitHub Apps, custom audiences, and failure fallbacks.

## Inputs

<!-- inputs:begin -->
| Input | Required | Default | Description |
|---|---|---|---|
| `sts-url` | Yes | none | Base URL of your github-sts instance, for example `https://sts.example.com`. Trailing slashes are stripped. |
| `scope` | Yes | none | Target of the requested access, as `org/repo`. Organization-level scope is not supported by current server releases. |
| `identity` | Yes | none | Trust policy selector. Resolves to `.github/sts/{app}/{identity}.sts.yaml` in the target repository. |
| `app` | No | server default | GitHub App name configured on the server. Omit when the server has a single app. |
| `audience` | No | `github-sts` | OIDC audience requested from GitHub Actions. Must equal the policy's `audience:` field. Set it explicitly. |
| `github-api-url` | No | `https://api.github.com` | GitHub API base URL used to revoke the token. Override for GitHub Enterprise Server, for example `https://github.example.com/api/v3`. |
<!-- inputs:end -->

Every input is validated before any network call. `sts-url` and `github-api-url` must be HTTPS, with HTTP allowed only for loopback addresses. `scope`, `identity`, and `app` are matched against strict allowlists. A failure here never leaves the runner and sets `error-code` to `action_invalid_input`.

A bare `org` passes the action's own validation and is then rejected by the server with `bad_request`.

## Outputs

<!-- outputs:begin -->
| Output | Set when | Description |
|---|---|---|
| `token` | Success | The scoped GitHub App installation token. Masked in the log before it is written. |
| `error-code` | Failure | Machine-readable failure reason. Either a code from the server, or an `action_`-prefixed code for a failure that never reached it. |
| `error-message` | Failure | Human-readable description. The same text as the step's `::error::` annotation. Its wording is not a stable interface. |
| `http-status` | Failure, when a response arrived | HTTP status of the server response. Empty for input, OIDC, and connection failures. |
<!-- outputs:end -->

## Handling failures

A failed exchange fails the step. To react to the reason instead, set `continue-on-error: true` and branch on `error-code`. Never branch on log text.

```yaml
      - uses: Depthmark/github-sts-action@v0.3.0
        id: sts
        continue-on-error: true
        with:
          sts-url: ${{ vars.STS_URL }}
          audience: https://sts.example.com
          scope: my-org/my-repo
          identity: ci

      - name: Handle the result
        run: |
          case "${{ steps.sts.outputs.error-code }}" in
            "")               echo "Token issued" ;;
            replay_detected)  echo "Transient, re-run to mint a fresh OIDC token" ;;
            *)                echo "::error::${{ steps.sts.outputs.error-code }}: ${{ steps.sts.outputs.error-message }}"; exit 1 ;;
          esac
```

The action owns these codes, for failures that never reach the server.

| `error-code` | Cause |
|---|---|
| `action_invalid_input` | An input is missing or fails validation. |
| `action_missing_oidc_env` | `id-token: write` is not set on the job. |
| `action_oidc_fetch_failed` | GitHub Actions did not return an OIDC token. Usually transient. |
| `action_connection_failed` | The server was unreachable after four attempts. |
| `action_invalid_response` | The server returned `200` with no token. |
| `action_malformed_error_response` | The server's error body had no `code` field. |
| `action_internal_error` | An unexpected exception inside the action. |

Every other value is your server's own `code`, forwarded unchanged. That includes `policy_denied`, `audience_mismatch`, `policy_not_found`, `app_unknown`, and `upstream_error`, so a code added by a newer server release needs no action release. The full table of causes and fixes is the [Error Reference](https://depthmark.github.io/github-sts/integrations/github-action/errors/).

## Security

- **Token masking.** `::add-mask::` is applied before the token is written anywhere. Only its SHA-256 digest is logged.
- **Automatic revocation.** `DELETE /installation/token` runs in a post-job step on success, failure, and cancellation.
- **Short lifetime.** Installation tokens expire within one hour regardless of revocation.
- **Least privilege.** Permissions come from the trust policy in the target repository, not from the workflow.
- **No stored secrets.** The action uses native OIDC federation. No personal access token and no GitHub App private key appear in the workflow.
- **Replay prevention.** The server rejects a reused OIDC token with `replay_detected`.
- **Zero dependencies.** Node.js built-ins only, no `node_modules`, and no supply chain to audit.
- **Injection-safe outputs.** Outputs use random heredoc delimiters. Every untrusted string is sanitized before it reaches an `::error::` command.

The trust boundaries and identity flow behind these are described in the [Security Model](https://depthmark.github.io/github-sts/concepts/security-model/).

## Versioning

| Reference | Example | Use when |
|---|---|---|
| Full version tag | `@v0.3.0` | Default. You review upgrades explicitly. |
| Major version tag | `@v0` | You want patch and minor updates without a pull request per release. |
| Commit SHA | `@<full-sha> # v0.3.0` | You require a reference that cannot be moved. |
| Branch | `@main` | Never. This action mints credentials, so pin it. |

While the major version is `0`, a breaking change increments the minor version, so `@v0` can move across one. Verified server, chart, and action combinations are published in [Compatibility](https://depthmark.github.io/github-sts/integrations/compatibility/).

## Documentation

| Page | What it covers |
|---|---|
| [Quickstart](https://depthmark.github.io/github-sts/integrations/github-action/quickstart/) | First exchange, expected output, and how to verify it |
| [Workflow Usage](https://depthmark.github.io/github-sts/integrations/github-action/workflow-usage/) | Cross-repository access, multiple apps, audiences, failure handling |
| [Inputs and Outputs](https://depthmark.github.io/github-sts/integrations/github-action/reference/) | Complete interface, validation rules, and the request built from it |
| [Error Reference](https://depthmark.github.io/github-sts/integrations/github-action/errors/) | Every `error-code`, its cause, and its fix |
| [Job Lifecycle](https://depthmark.github.io/github-sts/integrations/github-action/job-lifecycle/) | Each phase, retry behavior, masking, and revocation |
| [Versioning](https://depthmark.github.io/github-sts/integrations/github-action/versioning/) | Pinning, release process, supported combinations |

Server-side documentation: [Trust Policies](https://depthmark.github.io/github-sts/concepts/trust-policies/), [Policy Recipes](https://depthmark.github.io/github-sts/concepts/policy-recipes/), [API Reference](https://depthmark.github.io/github-sts/reference/api/), and [Troubleshooting](https://depthmark.github.io/github-sts/operations/troubleshooting/).

## Development

Requires [Node.js](https://nodejs.org/) 24 or later, and [act](https://github.com/nektos/act) to run CI locally.

```
make help         Show all targets
make check        Check JavaScript syntax (node --check)
make validate     Validate action.yml structure
make docs-check   Check README and docs against action.yml and index.js
make act-ci       Run the CI workflow locally with act
```

`make docs-check` is the guard against interface drift. It verifies that the input and output tables in this README and in `docs/content/{en,fr}/reference.md` name exactly the keys in `action.yml`, that the `action_` codes in `errors.md` match `index.js`, and that every English page has a French counterpart. Edit `action.yml` and the check reports which tables to update.

Documentation for this action lives in `docs/content/` and is published as a Hugo module into the [github-sts site](https://depthmark.github.io/github-sts/). Releases use [Release Please](https://github.com/googleapis/release-please) with [conventional commits](https://www.conventionalcommits.org/).

## License

[MIT](LICENSE)
