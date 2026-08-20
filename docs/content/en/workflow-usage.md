---
title: Workflow Usage
description: Patterns for using the action across repositories, with several GitHub Apps, and when the exchange fails.
weight: 2
translationKey: github-action-workflow-usage
---

Each pattern below assumes the prerequisites from the [Quickstart]({{< relref "quickstart" >}}): a reachable server, an installed GitHub App, and a trust policy in the target repository.

## Access another repository

This is the case the action exists for. The workflow runs in one repository and needs write access to another, without a personal access token.

The trust policy lives in the target repository and names the source workflow. The `scope` input names the target.

```yaml
jobs:
  sync:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
    steps:
      - uses: Depthmark/github-sts-action@v0.2.0
        id: sts
        with:
          sts-url: ${{ vars.STS_URL }}
          audience: https://sts.example.com
          scope: other-org/private-repo
          identity: sync-bot

      - name: Clone the target
        env:
          GH_TOKEN: ${{ steps.sts.outputs.token }}
        run: gh repo clone other-org/private-repo
```

Organization-level scope is not supported by the current server release. To reach several repositories, run one exchange per target repository.

## Select a GitHub App

When the server has more than one app configured, name the one to use. The `app` input also selects the policy directory, so `app: deploy-bot` with `identity: deploy` loads `.github/sts/deploy-bot/deploy.sts.yaml`.

```yaml
      - uses: Depthmark/github-sts-action@v0.2.0
        id: sts
        with:
          sts-url: ${{ vars.STS_URL }}
          audience: https://sts.example.com
          scope: my-org/my-repo
          identity: deploy
          app: deploy-bot
```

Omit `app` when the server has a single app. A name that the server does not know fails with `app_unknown`.

## Set the audience explicitly

The `audience` input defaults to `github-sts`. Set it explicitly so the workflow states the value it depends on, and so a change to the trust policy's `audience:` field produces an obvious diff on both sides.

```yaml
      - uses: Depthmark/github-sts-action@v0.2.0
        id: sts
        with:
          sts-url: ${{ vars.STS_URL }}
          audience: https://sts.example.com
          scope: my-org/my-repo
          identity: ci
```

A mismatch between this value and the policy fails with `audience_mismatch`, never with a partially granted token.

## Centralize the server URL

Store the server URL in a GitHub Actions variable at the organization or repository level rather than repeating it in every workflow. Moving the server later then touches one setting instead of every workflow file.

```yaml
        with:
          sts-url: ${{ vars.STS_URL }}
```

The URL is not a secret. It appears in the log on connection failures, which is intentional and makes those failures diagnosable.

## Keep the token inside the steps that need it

Pass the token through a step-level `env` block. A job-level `env` block would expose it to every step in the job, including third-party actions.

```yaml
      # Scoped to this step only
      - name: Push changes
        env:
          GH_TOKEN: ${{ steps.sts.outputs.token }}
        run: gh pr create --fill
```

## Grant the OIDC permission per job

Declare `id-token: write` on the job that performs the exchange. A workflow-level declaration gives every job the ability to request OIDC tokens, including jobs that only run linters.

```yaml
permissions: {}

jobs:
  deploy:
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: Depthmark/github-sts-action@v0.2.0
        # ...

  lint:
    permissions:
      contents: read
    steps:
      # This job cannot request an OIDC token.
```

## Use one identity per purpose

Create a separate trust policy per workflow rather than one broad policy shared by several. Separate policies can be revoked and audited independently, and each one grants only the permissions its workflow needs.

```text
.github/sts/default/
  ci.sts.yaml          read-only
  deploy.sts.yaml      write, main branch only
  release.sts.yaml     write, release workflow only
```

See [Policy Recipes]({{< relref "/concepts/policy-recipes" >}}) for the policy side of this split.

## Handle a failed exchange

By default a failed exchange fails the step and stops the job, which is usually what you want. When the workflow needs to react to the reason instead, set `continue-on-error: true` and read `error-code`.

```yaml
      - uses: Depthmark/github-sts-action@v0.2.0
        id: sts
        continue-on-error: true
        with:
          sts-url: ${{ vars.STS_URL }}
          audience: https://sts.example.com
          scope: my-org/my-repo
          identity: ci

      - name: Fall back to read-only mode
        if: steps.sts.outcome == 'failure'
        run: echo "Continuing without elevated access: ${{ steps.sts.outputs.error-code }}"
```

The full list of values, and which ones are worth retrying, is in the [Error Reference]({{< relref "errors" >}}).

## A worked example: this action's own release workflow

The action's release workflow uses the action to authenticate itself. It exchanges its OIDC token for a `depthmark-release-bot` installation token, then pushes the moved major version tag with that token.

```yaml
    permissions:
      contents: write
      id-token: write
    steps:
      - name: Exchange OIDC token for a release-bot token
        id: sts
        uses: Depthmark/github-sts-action@v0.2.0
        with:
          sts-url: https://sts.example.com
          scope: my-org/my-repo
          identity: release
          app: depthmark-release-bot

      - name: Checkout
        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          fetch-depth: 0
          token: ${{ steps.sts.outputs.token }}
```

The matching policy accepts tokens minted only for that one workflow file on the default branch, and binds the source and target repositories by their immutable numeric IDs. No personal access token exists in the repository. The published policy is [`release.sts.yaml`](https://github.com/Depthmark/github-sts-action/blob/main/.github/sts/depthmark-release-bot/release.sts.yaml).
