---
title: Référence des erreurs
description: Toutes les valeurs d'error-code que l'action peut produire, leurs causes, et la façon dont les codes du serveur sont transmis.
weight: 4
translationKey: github-action-errors
translationStatus: pending-review
---

Chaque chemin d'échec écrit `error-code`, `error-message` et, lorsqu'une réponse est arrivée, `http-status`. Branchez votre logique sur `error-code` plutôt que d'analyser le texte du journal. La lecture de ces sorties exige `continue-on-error: true` sur l'étape, car l'action se termine avec le code 1 en cas d'échec.

`error-code` porte des valeurs de deux origines.

- Les codes préfixés par `action_` proviennent de l'action elle-même. Ils décrivent les échecs qui n'ont jamais atteint le serveur, ainsi que les réponses que l'action n'a pas pu interpréter.
- Toute autre valeur est le champ `code` du corps d'erreur du serveur, transmis sans modification.

## Codes de l'action

<!-- action-codes:begin -->
| `error-code` | `http-status` | Cause | Correction |
|---|---|---|---|
| `action_invalid_input` | vide | Une entrée est absente ou échoue à la validation. Levé avant tout appel réseau. | Vérifiez la valeur avec les règles décrites dans [Entrées et sorties]({{< relref "reference" >}}). |
| `action_missing_oidc_env` | vide | `ACTIONS_ID_TOKEN_REQUEST_TOKEN` ou `ACTIONS_ID_TOKEN_REQUEST_URL` n'est pas définie. | Ajoutez `permissions: id-token: write` au job. |
| `action_oidc_fetch_failed` | vide | GitHub Actions n'a pas retourné de jeton OIDC, ou a retourné un corps sans champ `value`. | Généralement transitoire. Relancez le job, puis consultez la page de statut de GitHub Actions. |
| `action_connection_failed` | statut de la dernière tentative, si une réponse a été reçue | Le serveur est resté injoignable après quatre tentatives, et le dernier corps de réponse n'était pas un objet d'erreur github-sts. | Vérifiez que `sts-url` se résout et reste joignable depuis le runner. |
| `action_invalid_response` | `200` | Le serveur a retourné un succès sans champ `token`. | Consultez les journaux du serveur. Un `200` sans jeton indique un défaut côté serveur. |
| `action_malformed_error_response` | statut de la réponse | Le serveur a retourné une erreur dont le corps ne contenait pas de champ `code` de type chaîne. | Vérifiez la version et les journaux du serveur. Le contrat d'erreur a peut-être changé. |
| `action_internal_error` | vide | Une exception inattendue dans l'action elle-même. | Lisez le journal complet de l'étape et ouvrez une issue sur l'action. |
<!-- action-codes:end -->

## Codes du serveur

Toute autre valeur d'`error-code` est le code du serveur, transmis exactement tel qu'il a été reçu. La liste faisant autorité, avec le statut HTTP associé à chaque code, se trouve dans le [tableau des erreurs de la référence de l'API]({{< relref "/reference/api" >}}#error-responses). Des codes comme `policy_denied`, `audience_mismatch`, `policy_not_found` et `replay_detected` parviennent à votre workflow sans modification.

L'action ne maintient pas de copie de cette liste. Un code ajouté par une version plus récente du serveur est transmis sans nécessiter de release de l'action.

### Comment les codes du serveur atteignent la sortie

Deux chemins écrivent un code du serveur.

1. La réponse n'est pas susceptible d'être retentée, c'est-à-dire tout statut inférieur à 500. L'action lit le corps, en extrait `code` et l'écrit directement.
2. La réponse est un 5xx et toutes les tentatives ont produit le même échec. L'action analyse alors le corps de la dernière tentative. S'il porte un `code`, cette valeur est écrite ; sinon le code devient `action_connection_failed`.

Le second chemin compte pour les 5xx déterministes. Un `502` accompagné de `upstream_error`, levé lorsque la politique de confiance accorde une permission que la GitHub App ne détient pas, est retenté quatre fois avant d'apparaître. L'étape dure alors plusieurs secondes de plus qu'un refus en `403`.

## Interpréter le message d'erreur

`error-message` est construit à partir du statut HTTP et du champ `detail` du corps de la réponse.

| Statut | Préfixe du message |
|---|---|
| `400` | `Configuration error:` |
| `401` | `OIDC token validation failed:` |
| `403` | `Trust policy denied the request:` |
| `404` | `Trust policy not found:` |
| `409` | `Token replay detected:` |
| tout autre | `STS server error (HTTP {status}):` |

Ce message s'adresse à des humains. Sa formulation n'est pas une interface stable. Branchez votre logique sur `error-code`.

## Réagir à l'échec

```yaml
      - uses: Depthmark/github-sts-action@v0.2.0
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
            "")
              echo "Token issued" ;;
            replay_detected)
              echo "Transient: another job consumed this OIDC token, re-run" ;;
            policy_denied|audience_mismatch)
              echo "::error::Trust policy rejected this workflow: ${{ steps.sts.outputs.error-message }}"
              exit 1 ;;
            *)
              echo "::error::${{ steps.sts.outputs.error-code }}: ${{ steps.sts.outputs.error-message }}"
              exit 1 ;;
          esac
```

Pour diagnostiquer un refus du côté serveur, y compris la corrélation par `trace_id`, voir [Dépannage]({{< relref "/operations/troubleshooting" >}}).
