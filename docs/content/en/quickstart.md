---
title: Quickstart
description: Add the action to an existing workflow and exchange your first OIDC token for a scoped installation token.
weight: 1
translationKey: github-action-quickstart
---

This page takes a workflow that has no credentials and gives it a scoped GitHub App installation token.

**Audience:** a developer who maintains a GitHub Actions workflow.

**Goal:** exchange the job's OIDC token for an installation token and use it in a later step.

## Prerequisites

1. A reachable github-sts server. See [Deploy with Helm]({{< relref "/integrations/deploy-with-helm" >}}) if you do not have one yet.
2. A GitHub App installed on the target repository, configured on that server.
3. A trust policy in the target repository at `.github/sts/{app}/{identity}.sts.yaml`. See [Trust Policies]({{< relref "/concepts/trust-policies" >}}) for the full field reference.

A minimal policy for the example below, stored in the target repository as `.github/sts/default/ci.sts.yaml`:

```yaml
issuer: https://token.actions.githubusercontent.com
audience: https://sts.example.com
subject: repo:my-org/my-source-repo:ref:refs/heads/main
permissions:
  contents: read
```

## Steps

### 1. Grant the job the OIDC permission

The action reads `ACTIONS_ID_TOKEN_REQUEST_TOKEN` and `ACTIONS_ID_TOKEN_REQUEST_URL`. GitHub only sets those variables when the job declares `id-token: write`.

Declare it on the job, not on the workflow, so other jobs in the same file cannot request OIDC tokens.

### 2. Add the exchange step

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
      id-token: write
      contents: read
    steps:
      - uses: Depthmark/github-sts-action@v0.2.0
        id: sts
        with:
          sts-url: https://sts.example.com
          audience: https://sts.example.com
          scope: my-org/my-target-repo
          identity: ci
```

The `audience` value must equal the `audience:` field in the trust policy. The server rejects the exchange with `audience_mismatch` when the two differ.

The `identity` value selects the policy file. `identity: ci` with no `app` input loads `ci.sts.yaml` from the app directory that the server treats as its default.

### 3. Use the token

Read the token from the step's `token` output, and pass it only to the steps that need it.

```yaml
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          repository: my-org/my-target-repo
          token: ${{ steps.sts.outputs.token }}
```

## Expected result

The exchange step succeeds and logs three things:

```text
Token SHA-256: 9f2c...
Token issued for scope=my-org/my-target-repo identity=ci app=default
```

The job summary gains a table naming the scope, identity, app, and the permissions the server granted:

| Field | Value |
|---|---|
| Scope | `my-org/my-target-repo` |
| Identity | `ci` |
| App | `default` |
| Permissions | `contents: read` |

A post-job step runs after every job outcome and logs `Token revoked successfully.`

## Verification

- The token never appears in the log. The action calls `::add-mask::` on it before writing any output. The `Token SHA-256` line lets you correlate a token across logs without exposing it.
- Expand the collapsed `OIDC Token Claims` group in the log to see the claims the server evaluated. Compare `sub`, `iss`, and `aud` against the trust policy when the exchange is denied.
- Confirm revocation in the post-job step. `Token revoked successfully.` means GitHub returned HTTP 204 for `DELETE /installation/token`.

## Limitations

- Organization-level scope is rejected by the current server release. Pass `org/repo`, not `org`. The action's own validation accepts both shapes, so this failure surfaces as a `bad_request` from the server rather than an input error.
- Installation tokens expire one hour after they are minted. A job that runs longer than that needs a second exchange.
- Revocation is best effort. If the revocation request fails, the action logs a warning and the job still succeeds. The token then remains valid until it expires.

## Next

- [Workflow Usage]({{< relref "workflow-usage" >}}) for cross-repository access, multiple apps, and failure handling
- [Inputs and Outputs]({{< relref "reference" >}}) for the complete interface
- [Error Reference]({{< relref "errors" >}}) when the exchange fails
