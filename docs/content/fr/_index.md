---
title: GitHub Action
description: Échangez un jeton OIDC GitHub Actions contre un jeton d'installation GitHub App limité et temporaire, révoqué à la fin du job.
weight: 2
translationKey: github-action
translationStatus: pending-review
aliases:
  - /fr/integrations/use-github-action/
---

[github-sts-action](https://github.com/Depthmark/github-sts-action) s'exécute dans un job GitHub Actions. L'action demande le jeton d'identité OIDC du job, l'envoie à un serveur github-sts, puis retourne le jeton d'installation GitHub App limité que le serveur émet. À la fin du job, l'action révoque ce jeton.

Le workflow ne stocke aucun jeton d'accès personnel ni clé privée de GitHub App. La seule permission nécessaire est `id-token: write`.

{{< cards >}}
{{< card link="quickstart" title="Démarrage rapide" icon="play" subtitle="Réalisez votre premier échange de jeton dans un workflow existant" >}}
{{< card link="workflow-usage" title="Utilisation dans un workflow" icon="template" subtitle="Accès inter-dépôts, plusieurs apps, audiences personnalisées, gestion des échecs" >}}
{{< card link="reference" title="Entrées et sorties" icon="terminal" subtitle="Toutes les entrées et sorties, avec leurs valeurs par défaut et règles de validation" >}}
{{< card link="errors" title="Référence des erreurs" icon="exclamation-circle" subtitle="Chaque valeur d'error-code, sa cause et sa correction" >}}
{{< card link="job-lifecycle" title="Cycle de vie du job" icon="refresh" subtitle="Ce que fait l'action à chaque étape, y compris les reprises et la révocation" >}}
{{< card link="versioning" title="Versionnement" icon="tag" subtitle="Épinglage de version, processus de release et combinaisons prises en charge" >}}
{{< /cards >}}

## Limites de cette documentation

Cette section documente l'action elle-même : ses entrées, ses sorties, ses erreurs, son cycle de vie et son versionnement.

Le comportement du serveur est documenté ailleurs sur ce site. Les champs des politiques de confiance et leur évaluation sont décrits dans [Politiques de confiance]({{< relref "/concepts/trust-policies" >}}), le point d'entrée d'échange dans la [Référence de l'API]({{< relref "/reference/api" >}}), et le déploiement du serveur dans [Déployer avec Helm]({{< relref "/integrations/deploy-with-helm" >}}).
