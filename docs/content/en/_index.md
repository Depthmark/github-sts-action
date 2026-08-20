---
title: GitHub Action
description: Exchange a GitHub Actions OIDC token for a scoped, short-lived GitHub App installation token, and revoke it when the job ends.
weight: 2
translationKey: github-action
aliases:
  - /integrations/use-github-action/
---

[github-sts-action](https://github.com/Depthmark/github-sts-action) runs inside a GitHub Actions job. It requests the job's OIDC identity token, sends it to a github-sts server, and returns the scoped GitHub App installation token that the server mints. When the job finishes, the action revokes the token.

The workflow stores no personal access token and no GitHub App private key. The only permission it needs is `id-token: write`.

{{< cards >}}
{{< card link="quickstart" title="Quickstart" icon="play" subtitle="Exchange your first token in an existing workflow" >}}
{{< card link="workflow-usage" title="Workflow Usage" icon="template" subtitle="Cross-repository access, multiple apps, custom audiences, failure handling" >}}
{{< card link="reference" title="Inputs and Outputs" icon="terminal" subtitle="Every input and output, with defaults and validation rules" >}}
{{< card link="errors" title="Error Reference" icon="exclamation-circle" subtitle="Every error-code value, its cause, and its fix" >}}
{{< card link="job-lifecycle" title="Job Lifecycle" icon="refresh" subtitle="What the action does at each phase, including retries and revocation" >}}
{{< card link="versioning" title="Versioning" icon="tag" subtitle="Version pinning, release process, and supported combinations" >}}
{{< /cards >}}

## Where this documentation ends

This section documents the action itself: its inputs, outputs, errors, job lifecycle, and versioning.

Server behavior lives elsewhere in this site. Trust policy fields and evaluation are described in [Trust Policies]({{< relref "/concepts/trust-policies" >}}), the exchange endpoint in the [API Reference]({{< relref "/reference/api" >}}), and server deployment in [Deploy with Helm]({{< relref "/integrations/deploy-with-helm" >}}).
