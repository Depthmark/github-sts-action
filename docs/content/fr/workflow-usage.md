---
title: Utilisation dans un workflow
description: Modèles d'utilisation de l'action entre dépôts, avec plusieurs GitHub Apps, et lorsque l'échange échoue.
weight: 2
translationKey: github-action-workflow-usage
translationStatus: pending-review
---

Chaque modèle ci-dessous suppose les prérequis du [Démarrage rapide]({{< relref "quickstart" >}}) : un serveur accessible, une GitHub App installée et une politique de confiance dans le dépôt cible.

## Accéder à un autre dépôt

C'est le cas d'usage pour lequel l'action existe. Le workflow s'exécute dans un dépôt et doit écrire dans un autre, sans jeton d'accès personnel.

La politique de confiance réside dans le dépôt cible et désigne le workflow source. L'entrée `scope` désigne la cible.

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

Le scope au niveau de l'organisation n'est pas pris en charge par la version actuelle du serveur. Pour atteindre plusieurs dépôts, réalisez un échange par dépôt cible.

## Choisir une GitHub App

Lorsque le serveur configure plusieurs apps, indiquez celle à utiliser. L'entrée `app` sélectionne aussi le répertoire de politiques : `app: deploy-bot` avec `identity: deploy` charge `.github/sts/deploy-bot/deploy.sts.yaml`.

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

Omettez `app` lorsque le serveur ne configure qu'une seule app. Un nom inconnu du serveur échoue avec `app_unknown`.

## Définir l'audience explicitement

L'entrée `audience` vaut `github-sts` par défaut. Définissez-la explicitement pour que le workflow énonce la valeur dont il dépend, et pour qu'une modification du champ `audience:` de la politique de confiance produise un diff visible des deux côtés.

```yaml
      - uses: Depthmark/github-sts-action@v0.2.0
        id: sts
        with:
          sts-url: ${{ vars.STS_URL }}
          audience: https://sts.example.com
          scope: my-org/my-repo
          identity: ci
```

Un écart entre cette valeur et la politique échoue avec `audience_mismatch`, jamais avec un jeton partiellement accordé.

## Centraliser l'URL du serveur

Enregistrez l'URL du serveur dans une variable GitHub Actions au niveau de l'organisation ou du dépôt plutôt que de la répéter dans chaque workflow. Déplacer le serveur plus tard ne touche alors qu'un seul réglage au lieu de chaque fichier de workflow.

```yaml
        with:
          sts-url: ${{ vars.STS_URL }}
```

Cette URL n'est pas un secret. Elle apparaît dans le journal lors des échecs de connexion, ce qui est intentionnel et rend ces échecs diagnosticables.

## Garder le jeton dans les seules étapes qui en ont besoin

Transmettez le jeton par un bloc `env` au niveau de l'étape. Un bloc `env` au niveau du job l'exposerait à toutes les étapes du job, y compris aux actions tierces.

```yaml
      # Limité à cette étape uniquement
      - name: Push changes
        env:
          GH_TOKEN: ${{ steps.sts.outputs.token }}
        run: gh pr create --fill
```

## Accorder la permission OIDC job par job

Déclarez `id-token: write` sur le job qui réalise l'échange. Une déclaration au niveau du workflow donne à chaque job la capacité de demander un jeton OIDC, y compris aux jobs qui n'exécutent que des linters.

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
      # Ce job ne peut pas demander de jeton OIDC.
```

## Une identité par usage

Créez une politique de confiance par workflow plutôt qu'une politique large partagée par plusieurs. Des politiques distinctes se révoquent et s'auditent indépendamment, et chacune n'accorde que les permissions dont son workflow a besoin.

```text
.github/sts/default/
  ci.sts.yaml          lecture seule
  deploy.sts.yaml      écriture, branche main uniquement
  release.sts.yaml     écriture, workflow de release uniquement
```

Voir [Recettes de politiques]({{< relref "/concepts/policy-recipes" >}}) pour le versant politique de cette séparation.

## Gérer un échange en échec

Par défaut, un échange en échec fait échouer l'étape et arrête le job, ce qui correspond généralement au comportement souhaité. Lorsque le workflow doit plutôt réagir à la raison de l'échec, définissez `continue-on-error: true` et lisez `error-code`.

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

La liste complète des valeurs, et celles qui méritent une nouvelle tentative, se trouve dans la [Référence des erreurs]({{< relref "errors" >}}).

## Un exemple concret : le workflow de release de l'action

Le workflow de release de l'action utilise l'action pour s'authentifier lui-même. Il échange son jeton OIDC contre un jeton d'installation `depthmark-release-bot`, puis pousse le tag de version majeure déplacé avec ce jeton.

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

La politique correspondante n'accepte que les jetons émis pour ce seul fichier de workflow sur la branche par défaut, et lie les dépôts source et cible par leurs identifiants numériques immuables. Aucun jeton d'accès personnel n'existe dans le dépôt. La politique publiée est [`release.sts.yaml`](https://github.com/Depthmark/github-sts-action/blob/main/.github/sts/depthmark-release-bot/release.sts.yaml).
