# Documentation Contract

Version: 1.1.0
Last updated: 2026-08-18

Synchronized from: Depthmark/github-sts v1.1.0
Synchronized on: 2026-08-18

This contract defines the shared documentation standards for the github-sts ecosystem:
**github-sts**, **github-sts-helm**, and **github-sts-action**.

## Repository Roles

| Repository | Owns | Links to the central integration site for |
|---|---|---|
| `Depthmark/github-sts` | Server API, configuration, trust-policy contract, OIDC validation, security model, compatibility matrix, and end-to-end guides | Helm value details and Action implementation details |
| `Depthmark/github-sts-helm` | Helm chart values, rendered Kubernetes resources, chart upgrade notes, OCI package installation, and chart release notes | Server behavior, trust-policy semantics, and complete Action integration |
| `Depthmark/github-sts-action` | Action inputs and outputs, job lifecycle, Action errors, workflow usage, Action versioning, and Action release notes | Server behavior, policy semantics, and Helm deployment |

## Common Structure

Every repository uses the same content conventions: bilingual `content/en` and
`content/fr` trees, the same front matter, and the same page naming. The
surrounding structure depends on the repository's role.

`Depthmark/github-sts` is the **site repository**. It owns the Hugo
configuration, the theme, the layouts, and the deployment workflow, and it is
the only repository that publishes a GitHub Pages site.

```
docs/
  content/
    en/
    fr/
  layouts/
  static/
  scripts/
  documentation-contract.md
  hugo.yaml
  go.mod
.github/workflows/
  docs-check.yml
  sync-french-docs.yml
  deploy-github-page.yml
```

`Depthmark/github-sts-helm` and `Depthmark/github-sts-action` are **satellite
repositories**. They own content only, published as a Hugo module that the site
repository imports. A satellite repository carries no `hugo.yaml`, no theme, and
no deployment workflow: adding Hugo configuration to a satellite would merge
into the site's own configuration and is not permitted.

```
docs/
  content/
    en/
    fr/
  scripts/
  documentation-contract.md
  go.mod
.github/workflows/
  docs-check.yml
```

## Publishing

Satellite content reaches the published site as a Hugo module import, declared
in the site repository's `docs/hugo.yaml` and mounted into the section that owns
it.

```yaml
module:
  imports:
    - path: github.com/Depthmark/github-sts-action/docs
      mounts:
        - source: content/en
          target: content/integrations/github-action
          lang: en
        - source: content/fr
          target: content/integrations/github-action
          lang: fr
```

The following rules apply to every satellite import.

1. **Pin every import.** The version is resolved through the Go module proxy and
   recorded in `docs/go.mod` and `docs/go.sum`. A build is reproducible and
   cannot pick up unreviewed content.
2. **Never import a mutable reference.** A branch, including a default branch, is
   not a valid import target. Import a release tag, or a commit SHA when a
   satellite has no matching tag.
3. **Never fetch content another way.** Remote Markdown pulled at build time,
   iframes, and scraping a repository's pages are not permitted, because none of
   them are pinned or reviewable.
4. **Advance the pin explicitly.** Publishing a satellite documentation change
   takes two merges: one in the satellite, and one in the site repository that
   moves the pin forward. That second merge is the review gate.
5. **Cross-link with `relref`.** Satellite content uses `relref` for links to
   pages the site owns. Those links resolve at site build time, which is also
   what proves the satellite is still consistent with the site.

A satellite repository verifies its own content by building it inside a checkout
of the site repository with a local module replacement, rather than by building
a site of its own.

## Language Policy

- **English** is the source language for all documentation.
- **French** is the required translated language.
- English is published at the default path (no prefix).
- French is published under the `/fr/` prefix.
- Use Hugo `translationKey` front matter so the language switcher opens the equivalent page.

## Protected Terminology

The following terms must use consistent translations. The authoritative glossary lives in `docs/scripts/translate-glossary.json`.

| English | French | Notes |
|---|---|---|
| `github-sts` | `github-sts` | Never translate the project name |
| `OIDC` | `OIDC` | Never translate |
| `GitHub App` | `GitHub App` | Never translate |
| `GitHub Actions` | `GitHub Actions` | Never translate |
| `trust policy` | `politique de confiance` | |
| `audience` | `audience` | Keep English; it's an OIDC concept |
| `issuer` | `émetteur` | |
| `least privilege` | `privilège minimal` | |
| `replay` | `rejeu` | |
| `JWKS` | `JWKS` | Never translate |
| `JWT` | `JWT` | Never translate |
| `Rego` | `Rego` | Never translate |
| `bundle` | `bundle` | Keep English in Rego context |
| `token exchange` | `échange de jeton` | |
| `installation token` | `jeton d'installation` | |
| `subject` (literal claim key, e.g. `subject:` in a trust policy) | `subject` | Never translate as a YAML/JWT key; `subject` as prose may still read naturally in French |
| `subject_pattern` (literal claim key) | `subject_pattern` | Never translate |
| `audience` (literal claim key, e.g. `audience:`) | `audience` | Never translate as a YAML/JWT key |
| `issuer` (literal claim key, e.g. `issuer:`) | `issuer` | Never translate as a YAML/JWT key; `issuer` as prose translates to `émetteur` |

## Writing Style

- **Task-first:** Lead with what the user wants to accomplish.
- **Concise:** Each sentence should carry weight.
- **Active voice:** "The server validates the token" not "The token is validated by the server."
- **Security-first:** Explain the security implication of every configuration choice.
- **Stable headings:** Heading text becomes anchors. Do not rename casually.
- **Examples before references:** Show a working example before a full reference table.

## Example Rules

All documentation examples must follow these rules:

1. **Fake credentials only:** Use fictional IDs, domains, tokens (e.g., `123456`, `myorg`, `stsexample.com`, `ghs_xxxxxxxxxxxxxxxxxxxx`).
2. **Explicit audiences:** Every OIDC token request example must use `core.getIDToken('https://sts.example.com')`, never the repo URL default.
3. **Pinned versions:** Use specific tag or commit SHA (e.g., `@v0.1.0`), never `@main`.
4. **Least-privilege permissions:** Grant only the minimum permissions the example requires.
5. **Immutable identity:** Use `subject` (exact match) whenever possible, not `subject_pattern`.
6. **No organization scope** unless the current server release supports it (current: not supported).

## Validation Rules

Every documentation pull request must pass:

1. **Local build:** the site build succeeds without warnings (Hugo Extended). In
   the site repository that is `task docs:build`. In a satellite it is the same
   build run against a checkout of the site repository with the satellite
   replaced locally.
2. **Bilingual parity:** the repository's documentation check reports zero
   translation parity errors.
3. **Rendered link check:** All internal links, anchors, and images resolve in the Hugo build.
4. **Secret scanning:** No real private keys, tokens, passwords, or production endpoints.
5. **Integration example checks:** Helm chart and Action versions referenced in examples match the compatibility matrix.

## Release Rules

1. Update release notes (auto-generated by release-please).
2. Update the compatibility matrix in `integrations/compatibility.md`.
3. Update versioned links in integration examples.
4. For a satellite release, advance the module pin in the site repository.
5. Merge documentation updates with, or before, the release publication.
6. Trigger a documentation deployment after the release is available.

## Synchronization

This contract is the authoritative version in `Depthmark/github-sts/docs/documentation-contract.md`. It is copied to:

- `Depthmark/github-sts-helm/docs/documentation-contract.md`
- `Depthmark/github-sts-action/docs/documentation-contract.md`

Copies must record the source contract version and the synchronization date:

```markdown
Synchronized from: Depthmark/github-sts v{version}
Synchronized on: {date}
```
