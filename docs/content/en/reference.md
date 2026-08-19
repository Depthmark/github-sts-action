---
title: Inputs and Outputs
description: Every input and output of github-sts-action, with defaults, validation rules, and the request the action builds from them.
weight: 3
translationKey: github-action-reference
---

This page is the interface contract for the action. It is checked against `action.yml` and `index.js` on every pull request.

## Inputs

<!-- inputs:begin -->
| Input | Required | Default | Description |
|---|---|---|---|
| `sts-url` | Yes | none | Base URL of the github-sts instance, for example `https://sts.example.com`. Trailing slashes are stripped. |
| `scope` | Yes | none | Target of the requested access, as `org/repo`. |
| `identity` | Yes | none | Trust policy selector. Resolves to `.github/sts/{app}/{identity}.sts.yaml` in the target repository. |
| `app` | No | none | GitHub App name configured on the server. Omit when the server has a single app configured. |
| `audience` | No | `github-sts` | OIDC audience requested from GitHub Actions. Must equal the `audience:` field of the trust policy. |
| `github-api-url` | No | `https://api.github.com` | GitHub API base URL used to revoke the token after the job. Override for GitHub Enterprise Server, for example `https://github.example.com/api/v3`. Trailing slashes are stripped. |
<!-- inputs:end -->

### Validation

The action validates every input before it opens a network connection. A failure here sets `error-code` to `action_invalid_input`.

| Input | Rule |
|---|---|
| `sts-url` | Parses as a URL and uses `https:`. `http:` is accepted only for `localhost`, `127.0.0.1`, and `[::1]`, with an optional port. |
| `github-api-url` | Same rule as `sts-url`. |
| `scope` | Matches `^[a-zA-Z0-9._-]+(/[a-zA-Z0-9._-]+)?$`. |
| `identity` | Matches `^[a-zA-Z0-9._-]+$`. |
| `app` | Matches `^[a-zA-Z0-9._-]+$` when set. An empty value is accepted and means "server default". |

The `scope` rule accepts a bare `org` as well as `org/repo`. Organization-level scope is rejected by the current server release, so a bare `org` passes input validation and then fails with a `bad_request` from the server.

### Request built from the inputs

The action sends one request to the server:

```text
GET {sts-url}/sts/exchange?scope={scope}&identity={identity}&app={app}
Authorization: Bearer {oidc-token}
Accept: application/json
```

The `app` parameter is omitted when the input is empty. See the [API Reference]({{< relref "/reference/api" >}}) for what the server does with it.

## Outputs

<!-- outputs:begin -->
| Output | Set when | Description |
|---|---|---|
| `token` | Success | The scoped GitHub App installation token. Masked in the log before it is written. |
| `error-code` | Failure | Machine-readable failure reason. Either a `code` returned by the server, or an `action_`-prefixed code for failures that never reach the server. See [Error Reference]({{< relref "errors" >}}). |
| `error-message` | Failure | Human-readable description of the failure. The same text the action writes to its `::error::` annotation. |
| `http-status` | Failure, when a response arrived | HTTP status of the server response. Empty for input validation, OIDC, and connection failures, because no response exists in those cases. |
<!-- outputs:end -->

On success only `token` is set. On failure `token` is not written at all, and reading it yields an empty string.

### Reading the failure outputs

The action exits with status 1 on every failure path, which fails the step. Add `continue-on-error: true` to the step when you want to read `error-code` instead of stopping the job.

```yaml
      - uses: Depthmark/github-sts-action@v0.2.0
        id: sts
        continue-on-error: true
        with:
          sts-url: ${{ vars.STS_URL }}
          audience: https://sts.example.com
          scope: my-org/my-repo
          identity: ci

      - name: Report
        if: steps.sts.outcome == 'failure'
        run: |
          echo "::error::${{ steps.sts.outputs.error-code }}: ${{ steps.sts.outputs.error-message }}"
```

All outputs are written to `GITHUB_OUTPUT` using the heredoc delimiter format with a random boundary, so a value containing newlines or delimiter-like text cannot inject additional outputs.

## Permissions

| Permission | Why |
|---|---|
| `id-token: write` | Required. Without it GitHub does not set `ACTIONS_ID_TOKEN_REQUEST_TOKEN` and `ACTIONS_ID_TOKEN_REQUEST_URL`, and the action fails with `action_missing_oidc_env`. |

The action needs no other permission. The permissions carried by the issued token come from the trust policy, not from the workflow.
