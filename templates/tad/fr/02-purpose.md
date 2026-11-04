# Objet, périmètre et références {#ch-purpose}

## Objet du document {#purpose}

<!-- tad:pending purpose.object -->

## Périmètre {#scope}

<!-- tad:pending purpose.scope -->

## Références documentaires {#references}

<!-- tad:pending purpose.references -->

## Méthode d'élaboration {#method}

<!-- tad:if source.local -->
Le présent document décrit l'architecture **telle qu'elle est mise en œuvre** dans le projet Salesforce DX de {{cfg:client.name}}, état au {{cfg:document.date}}. Il a été établi à partir des sources de métadonnées du projet.
<!-- tad:else -->
Le présent document décrit l'architecture **telle qu'elle est mise en œuvre** dans l'organisation Salesforce de {{cfg:client.name}} ({{cfg:document.environment}}), état au {{cfg:document.date}}. Il a été établi à partir des métadonnées de l'organisation, récupérées en lecture seule.
<!-- tad:endif -->
<!-- tad:if cfg.inputs.specs -->
<!-- tad:if cfg.integrator.name -->
Il s'appuie également sur les éléments fournis par {{cfg:client.name}} et {{cfg:integrator.name}}.
<!-- tad:else -->
Il s'appuie également sur les éléments fournis par {{cfg:client.name}}.
<!-- tad:endif -->
<!-- tad:endif -->

<!-- tad:if cfg.scope.include -->
- Les inventaires et décomptes portent sur les composants du périmètre du projet (voir le contrôle du document) ; les objets standard et les paramètres globaux de l'organisation sont partagés avec le reste de l'organisation. Ils excluent les composants fournis par les packages ou livrés par Salesforce.
<!-- tad:else -->
- Les inventaires et décomptes portent sur les composants réalisés pour {{cfg:client.name}}. Ils excluent les composants fournis par les packages ou livrés par Salesforce.
<!-- tad:endif -->
- Chaque affirmation s'appuie sur les métadonnées, sur un document fourni par le projet, ou est explicitement signalée comme à confirmer.
- Les paramètres d'authentification (identifiants, secrets, certificats) et les données métier ne sont jamais reproduits.

<!-- tad:if facts.exclusions.applied -->
Les composants suivants existent dans l'organisation mais ne font pas partie de l'architecture décrite :

@@ANNEX:exclusions@@
<!-- tad:endif -->

## Conventions de lecture {#conventions}

- Les noms techniques (objets, champs, classes, Flows, composants) sont écrits en police à chasse fixe, par exemple `Account`. Les libellés métier sont écrits entre guillemets, par exemple « Client ».
- Les termes Salesforce d'usage courant (Lead, Queue, Record Type, Permission Set, Named Credential…) sont conservés en anglais.
- Les schémas utilisent un code couleur commun :

@@ANNEX:legend@@
