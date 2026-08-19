---
title: Démarrage rapide
description: Ajoutez l'action à un workflow existant et réalisez votre premier échange d'un jeton OIDC contre un jeton d'installation limité.
weight: 1
translationKey: github-action-quickstart
translationStatus: pending-review
---

Cette page part d'un workflow sans aucune identification et lui donne un jeton d'installation GitHub App limité.

**Public :** une personne qui maintient un workflow GitHub Actions.

**Objectif :** échanger le jeton OIDC du job contre un jeton d'installation, puis l'utiliser dans une étape suivante.

## Prérequis

1. Un serveur github-sts accessible. Voir [Déployer avec Helm]({{< relref "/integrations/deploy-with-helm" >}}) si vous n'en avez pas encore.
2. Une GitHub App installée sur le dépôt cible et configurée sur ce serveur.
3. Une politique de confiance dans le dépôt cible, à l'emplacement `.github/sts/{app}/{identity}.sts.yaml`. Voir [Politiques de confiance]({{< relref "/concepts/trust-policies" >}}) pour la référence complète des champs.

Une politique minimale pour l'exemple ci-dessous, enregistrée dans le dépôt cible sous `.github/sts/default/ci.sts.yaml` :

```yaml
issuer: https://token.actions.githubusercontent.com
audience: https://sts.example.com
subject: repo:my-org/my-source-repo:ref:refs/heads/main
permissions:
  contents: read
```

## Étapes

### 1. Accorder la permission OIDC au job

L'action lit `ACTIONS_ID_TOKEN_REQUEST_TOKEN` et `ACTIONS_ID_TOKEN_REQUEST_URL`. GitHub ne définit ces variables que si le job déclare `id-token: write`.

Déclarez cette permission sur le job, et non sur le workflow, afin que les autres jobs du même fichier ne puissent pas demander de jeton OIDC.

### 2. Ajouter l'étape d'échange

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

La valeur de `audience` doit être identique au champ `audience:` de la politique de confiance. Le serveur rejette l'échange avec `audience_mismatch` lorsque les deux diffèrent.

La valeur de `identity` sélectionne le fichier de politique. `identity: ci` sans entrée `app` charge `ci.sts.yaml` depuis le répertoire de l'app que le serveur considère comme sa valeur par défaut.

### 3. Utiliser le jeton

Lisez le jeton depuis la sortie `token` de l'étape et transmettez-le uniquement aux étapes qui en ont besoin.

```yaml
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          repository: my-org/my-target-repo
          token: ${{ steps.sts.outputs.token }}
```

## Résultat attendu

L'étape d'échange réussit et journalise trois éléments :

```text
Token SHA-256: 9f2c...
Token issued for scope=my-org/my-target-repo identity=ci app=default
```

Le résumé du job reçoit un tableau indiquant le scope, l'identité, l'app et les permissions accordées par le serveur :

| Champ | Valeur |
|---|---|
| Scope | `my-org/my-target-repo` |
| Identity | `ci` |
| App | `default` |
| Permissions | `contents: read` |

Une étape post-job s'exécute quel que soit le résultat du job et journalise `Token revoked successfully.`

## Vérification

- Le jeton n'apparaît jamais dans le journal. L'action lui applique `::add-mask::` avant d'écrire la moindre sortie. La ligne `Token SHA-256` permet de corréler un jeton entre plusieurs journaux sans l'exposer.
- Dépliez le groupe replié `OIDC Token Claims` dans le journal pour voir les claims évaluées par le serveur. Comparez `sub`, `iss` et `aud` à la politique de confiance lorsque l'échange est refusé.
- Confirmez la révocation dans l'étape post-job. `Token revoked successfully.` signifie que GitHub a répondu HTTP 204 à `DELETE /installation/token`.

## Limites

- Le scope au niveau de l'organisation est rejeté par la version actuelle du serveur. Passez `org/repo`, et non `org`. La validation de l'action accepte les deux formes, donc cet échec se manifeste par un `bad_request` du serveur plutôt que par une erreur d'entrée.
- Les jetons d'installation expirent une heure après leur émission. Un job dont la durée dépasse cette heure nécessite un second échange.
- La révocation fonctionne au mieux. Si la requête de révocation échoue, l'action journalise un avertissement et le job réussit malgré tout. Le jeton reste alors valide jusqu'à son expiration.

## Suite

- [Utilisation dans un workflow]({{< relref "workflow-usage" >}}) pour l'accès inter-dépôts, plusieurs apps et la gestion des échecs
- [Entrées et sorties]({{< relref "reference" >}}) pour l'interface complète
- [Référence des erreurs]({{< relref "errors" >}}) lorsque l'échange échoue
