---
title: Entrées et sorties
description: Toutes les entrées et sorties de github-sts-action, avec leurs valeurs par défaut, leurs règles de validation et la requête construite à partir d'elles.
weight: 3
translationKey: github-action-reference
translationStatus: pending-review
---

Cette page constitue le contrat d'interface de l'action. Elle est vérifiée par rapport à `action.yml` et `index.js` sur chaque pull request.

## Entrées

<!-- inputs:begin -->
| Entrée | Requise | Défaut | Description |
|---|---|---|---|
| `sts-url` | Oui | aucun | URL de base de l'instance github-sts, par exemple `https://sts.example.com`. Les barres obliques finales sont supprimées. |
| `scope` | Oui | aucun | Cible de l'accès demandé, sous la forme `org/repo`. |
| `identity` | Oui | aucun | Sélecteur de politique de confiance. Correspond à `.github/sts/{app}/{identity}.sts.yaml` dans le dépôt cible. |
| `app` | Non | aucun | Nom de la GitHub App configurée sur le serveur. À omettre lorsque le serveur ne configure qu'une seule app. |
| `audience` | Non | `github-sts` | Audience OIDC demandée à GitHub Actions. Doit être identique au champ `audience:` de la politique de confiance. |
| `github-api-url` | Non | `https://api.github.com` | URL de base de l'API GitHub utilisée pour révoquer le jeton après le job. À redéfinir pour GitHub Enterprise Server, par exemple `https://github.example.com/api/v3`. Les barres obliques finales sont supprimées. |
<!-- inputs:end -->

### Validation

L'action valide chaque entrée avant d'ouvrir une connexion réseau. Un échec à ce stade définit `error-code` à `action_invalid_input`.

| Entrée | Règle |
|---|---|
| `sts-url` | S'analyse comme une URL et utilise `https:`. `http:` n'est accepté que pour `localhost`, `127.0.0.1` et `[::1]`, avec un port facultatif. |
| `github-api-url` | Même règle que `sts-url`. |
| `scope` | Correspond à `^[a-zA-Z0-9._-]+(/[a-zA-Z0-9._-]+)?$`. |
| `identity` | Correspond à `^[a-zA-Z0-9._-]+$`. |
| `app` | Correspond à `^[a-zA-Z0-9._-]+$` lorsqu'elle est définie. Une valeur vide est acceptée et signifie « valeur par défaut du serveur ». |

La règle de `scope` accepte aussi bien un `org` seul que `org/repo`. Le scope au niveau de l'organisation est rejeté par la version actuelle du serveur : un `org` seul passe donc la validation d'entrée, puis échoue avec un `bad_request` du serveur.

### Requête construite à partir des entrées

L'action envoie une seule requête au serveur :

```text
GET {sts-url}/sts/exchange?scope={scope}&identity={identity}&app={app}
Authorization: Bearer {oidc-token}
Accept: application/json
```

Le paramètre `app` est omis lorsque l'entrée est vide. Voir la [Référence de l'API]({{< relref "/reference/api" >}}) pour son traitement côté serveur.

## Sorties

<!-- outputs:begin -->
| Sortie | Définie quand | Description |
|---|---|---|
| `token` | Succès | Le jeton d'installation GitHub App limité. Masqué dans le journal avant d'être écrit. |
| `error-code` | Échec | Raison de l'échec, exploitable par une machine. Soit un `code` retourné par le serveur, soit un code préfixé par `action_` pour les échecs qui n'atteignent jamais le serveur. Voir [Référence des erreurs]({{< relref "errors" >}}). |
| `error-message` | Échec | Description lisible de l'échec. Le même texte que celui écrit dans l'annotation `::error::` de l'action. |
| `http-status` | Échec, si une réponse est arrivée | Statut HTTP de la réponse du serveur. Vide pour les échecs de validation d'entrée, d'OIDC et de connexion, puisque aucune réponse n'existe dans ces cas. |
<!-- outputs:end -->

En cas de succès, seule `token` est définie. En cas d'échec, `token` n'est pas écrite du tout et sa lecture renvoie une chaîne vide.

### Lire les sorties d'échec

L'action se termine avec le code 1 sur chaque chemin d'échec, ce qui fait échouer l'étape. Ajoutez `continue-on-error: true` à l'étape lorsque vous voulez lire `error-code` au lieu d'arrêter le job.

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

Toutes les sorties sont écrites dans `GITHUB_OUTPUT` au format à délimiteur avec une frontière aléatoire, de sorte qu'une valeur contenant des retours à la ligne ou un texte ressemblant à un délimiteur ne peut pas injecter de sorties supplémentaires.

## Permissions

| Permission | Raison |
|---|---|
| `id-token: write` | Requise. Sans elle, GitHub ne définit pas `ACTIONS_ID_TOKEN_REQUEST_TOKEN` ni `ACTIONS_ID_TOKEN_REQUEST_URL`, et l'action échoue avec `action_missing_oidc_env`. |

L'action n'a besoin d'aucune autre permission. Les permissions portées par le jeton émis proviennent de la politique de confiance, pas du workflow.
