---
title: Versionnement
description: Comment épingler l'action, comment les releases sont produites, et où sont publiées les combinaisons de versions prises en charge.
weight: 6
translationKey: github-action-versioning
translationStatus: pending-review
---

## Choisir une référence

| Référence | Exemple | À utiliser quand |
|---|---|---|
| Tag de version complet | `@v0.2.0` | Choix par défaut. Vous validez chaque mise à jour explicitement. |
| Tag de version majeure | `@v0` | Vous voulez les correctifs et les versions mineures sans une pull request par release. |
| SHA de commit | `@11e9b4095d2f3033d0ee7e82bb9ac6a7bcbc9b48` | Vous exigez une référence qui ne peut pas être déplacée. |
| Branche | `@main` | Jamais dans un workflow de production. |

`@main` est une cible mouvante que toute personne disposant d'un accès en écriture peut modifier. L'action émet des identifiants : traitez-la comme n'importe quelle autre dépendance privilégiée et épinglez-la.

Tant que la version majeure vaut `0`, une rupture de compatibilité incrémente la version mineure et non la majeure. `@v0` peut donc franchir une rupture de compatibilité. Épinglez un tag de version complet ou un SHA de commit si vous devez l'exclure.

Lorsque vous épinglez un SHA, notez la version correspondante dans un commentaire de fin de ligne, afin que la personne suivante sache où elle se trouve.

```yaml
      - uses: Depthmark/github-sts-action@11e9b4095d2f3033d0ee7e82bb9ac6a7bcbc9b48 # v0.2.0
```

## Comment les releases sont produites

Le dépôt utilise [Release Please](https://github.com/googleapis/release-please) avec les [commits conventionnels](https://www.conventionalcommits.org/).

1. Les commits arrivent sur `main` avec un préfixe conventionnel, par exemple `feat:` ou `fix:`.
2. Release Please maintient une pull request de release portant le changement de version et l'entrée de changelog.
3. Fusionner cette pull request crée la release GitHub et le tag de version, par exemple `v0.2.0`.
4. Un job suivant déplace de force le tag de version majeure, `v0`, sur la nouvelle release.
5. Le même job déplace le tag `docs/v0.2.0` qui publie cette documentation.

Le workflow de release s'authentifie avec cette action plutôt qu'avec un identifiant stocké. Voir l'exemple concret dans [Utilisation dans un workflow]({{< relref "workflow-usage" >}}).

## Quelle version du serveur utiliser

L'échange passe par `GET /sts/exchange`, dont les paramètres et la forme de réponse sont stables. Un serveur plus récent peut ajouter des paramètres facultatifs et de nouveaux codes d'erreur sans release de l'action, puisque l'action transmet les codes inconnus sans modification.

Les combinaisons vérifiées de versions du serveur, du chart Helm et de l'action sont publiées dans [Compatibilité]({{< relref "/integrations/compatibility" >}}). Consultez cette page avant de mettre à jour un composant isolément.

## Comment cette documentation est publiée

Les pages de cette section résident dans le dépôt de l'action, sous `docs/content/`, et sont intégrées à ce site sous forme de [module Hugo](https://gohugo.io/hugo-modules/) épinglé à une version publiée. La construction du site résout cette version via le proxy de modules Go : une construction de la documentation est donc reproductible et ne récupère jamais de contenu non relu depuis une branche par défaut.

Publier une modification de documentation demande donc deux fusions : une dans le dépôt de l'action, et une dans le dépôt du site qui fait avancer la version épinglée.
