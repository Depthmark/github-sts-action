---
title: Versioning
description: How to pin the action, how releases are produced, and where the supported version combinations are published.
weight: 6
translationKey: github-action-versioning
---

## Choose a reference

| Reference | Example | Use when |
|---|---|---|
| Full version tag | `@v0.2.0` | Default choice. You review upgrades explicitly. |
| Major version tag | `@v0` | You want patch and minor updates without a pull request per release. |
| Commit SHA | `@11e9b4095d2f3033d0ee7e82bb9ac6a7bcbc9b48` | You require a reference that cannot be moved. |
| Branch | `@main` | Never in a production workflow. |

`@main` is a moving target that anyone with write access can change. The action mints credentials, so treat it the way you treat any other privileged dependency and pin it.

While the major version is `0`, a breaking change increments the minor version rather than the major. `@v0` can therefore move across a breaking change. Pin to a full version tag or a commit SHA if you need to rule that out.

When pinning to a SHA, record the version it corresponds to in a trailing comment so the next reader can tell what they are on.

```yaml
      - uses: Depthmark/github-sts-action@11e9b4095d2f3033d0ee7e82bb9ac6a7bcbc9b48 # v0.2.0
```

## How releases are produced

The repository uses [Release Please](https://github.com/googleapis/release-please) with [conventional commits](https://www.conventionalcommits.org/).

1. Commits land on `main` with a conventional prefix, such as `feat:` or `fix:`.
2. Release Please maintains a release pull request carrying the version bump and the changelog entry.
3. Merging that pull request creates the GitHub release and the version tag, for example `v0.2.0`.
4. A follow-up job force-moves the major version tag, `v0`, onto the new release.
5. The same job moves the `docs/v0.2.0` tag that publishes this documentation.

The release workflow authenticates with this action rather than with a stored credential. See the worked example in [Workflow Usage]({{< relref "workflow-usage" >}}).

## Which server release to run against

The exchange uses `GET /sts/exchange`, whose parameters and response shape are stable. A newer server can add optional parameters and new error codes without an action release, because the action forwards unknown codes unchanged.

Verified combinations of server, Helm chart, and action releases are published in [Compatibility]({{< relref "/integrations/compatibility" >}}). Check that page before upgrading one component on its own.

## How this documentation is published

The pages in this section live in the action's repository, under `docs/content/`, and are pulled into this site as a [Hugo module](https://gohugo.io/hugo-modules/) pinned to a released version. The site build resolves that version through the Go module proxy, so a documentation build is reproducible and never picks up unreviewed content from a default branch.

Publishing a documentation change therefore takes two merges: one in the action repository, and one in the site repository that moves the pinned version forward.
