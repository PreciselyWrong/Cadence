# Objectifs

Un objectif dit pourquoi un groupe de projets et de tâches existe : un résultat visé pour un mois, un trimestre, une saison ou une année, avec des résultats clés mesurables et, à côté, une liste d'envies sans échéance. Cette page couvre les objectifs, les résultats clés, la progression, le prochain pas, la liste d'envies, et leur vie sur web et Android.

![Page Objectifs](images/web/goals.png)

## Les trois niveaux de l'écran

```
Objectifs (un résultat à atteindre)         
  ├── Résultats clés (un seul niveau)
  ├── Projets liés
  └── Tâches liées directement
Liste d'envies (Avoir / Être / Faire)       pas de date, jamais dans Aujourd'hui
```

Un objectif est **indépendant des zones** : on peut lier un projet à un objectif quelle que soit sa zone. Un objectif a un **horizon** (Mois, Trimestre, Saison, Année), un **statut** (Actif, Atteint, En pause, Abandonné) et peut avoir une **date cible**.

## Créer et modifier un objectif

**Web**
- Page **Objectifs** : bouton **Nouvel objectif** ; ou le **+** à côté de « Objectifs » dans la barre latérale ; ou **Ajouter un objectif** depuis la page d'une zone (la zone est pré-remplie).
- Le formulaire demande le titre (obligatoire), le « pourquoi » (facultatif, affiché en italique), l'horizon, le statut, la date cible et la zone (facultative).
- Modifier : le crayon sur la carte ou sur la page de l'objectif. Supprimer : la corbeille, avec une confirmation qui précise que les projets liés seront détachés.

**Android** : **Tâches › Objectifs**, juste après Projets, et la carte Objectifs du Bilan. Un toucher sur un objectif ouvre sa feuille : prochain pas et **Créer une tâche** d'abord, puis nom, note (le « pourquoi », vide pour l'effacer), type (pour une envie), état, et **Supprimer** avec **Annuler** pendant cinq secondes. La création d'objectifs et de résultats clés se fait sur le web ; l'édition (nom, note, état, suppression) marche sur le téléphone, hors ligne comprise.

**Statuts** : tout statut peut passer à tout autre (Actif vers Atteint, En pause, Abandonné, et retour). Sur la liste d'envies, les libellés sont Actif, **Réalisée** (atteint), En pause, **Abandonnée**.

## L'écran Objectifs

Un seul écran qui défile, identique sur web (`/goals`) et Android :

1. **Recherche** (« Chercher un objectif ou une envie ») sur le titre et le « pourquoi », sans casse ni accents. Un objectif reste visible s'il correspond (avec tous ses résultats clés) ou si un de ses résultats clés correspond (seuls ceux-là restent) ; les groupes qui contiennent un résultat s'ouvrent seuls. « Rien ne correspond. » s'affiche sinon, avec « Effacer la recherche ».
2. **Objectifs actifs**, la date cible la plus proche d'abord, puis les autres, puis par titre (tri français : « Écrire » se range avec les E). Chaque carte : titre, pourcentage, horizon et date cible, une fine barre de progression, le **prochain pas**, puis ses résultats clés en lignes courtes (« titre ... 3/10 », une coche quand tout est fait).
3. **En pause, atteints ou abandonnés** : repliés.
4. **Liste d'envies** : Avoir, Être, Faire repliés avec leur nombre, puis **Réalisées**.

Les résultats clés ne sont jamais listés seuls. La barre de progression montre les tâches et projets terminés ; un trait montre le temps écoulé entre la création et la date cible.

## Résultats clés

Un objectif qui a un parent est un **résultat clé** de cet objectif ; l'arbre n'a qu'**un seul niveau**.

- Sur la page d'un objectif, une section **Résultats clés** liste ses résultats (chacun avec sa propre progression « N sur M faits ») et un champ discret **Ajouter un résultat clé** ; la page d'un résultat clé renvoie vers son objectif.
- La page Objectifs et la barre latérale ne montrent que les objectifs.
- **Règles** : le parent doit être un de vos objectifs et ne pas être lui-même un résultat clé ; un objectif qui a des résultats clés ne peut pas devenir un résultat clé ; un objectif ne peut pas être son propre parent ; un résultat clé n'est jamais dans la liste d'envies. Toute violation est refusée.
- **Lier du travail** : les projets et les tâches se lient à un résultat clé comme à n'importe quel objectif ; les sélecteurs l'affichent comme « Objectif › Résultat clé ».
- **Supprimer un objectif supprime ses résultats clés** ; le lien objectif des projets et tâches concernés est effacé (ils ne sont pas supprimés).

## La progression

La progression est la **part d'éléments terminés** parmi les projets liés (terminés) et les tâches liées (terminées ou archivées, sans sous-tâches). Les éléments abandonnés ne comptent pas.

| Cas | Résultat |
|---|---|
| Rien n'est lié | Pas de pourcentage (« Rien de lié ») |
| 3 tâches liées, 1 terminée | 1 sur 3, 33 % |
| Un objectif avec deux résultats clés | Il compte ses propres éléments **plus** ceux de ses résultats clés |
| Un élément abandonné ou annulé | Pas compté |

## Le prochain pas

Chaque objectif actif montre une tâche : parmi les tâches ouvertes de premier niveau liées à l'objectif (et à ses résultats clés), celle dont l'échéance est la plus proche, puis la plus ancienne, puis par nom. Elle s'affiche avec une case qui la **termine**. Sans tâche liée, **Ajouter un prochain pas** ouvre la saisie rapide liée à l'objectif. Android applique la même règle en local.

## Lier un projet ou une tâche

- **Projet** : dans le formulaire du projet, section **Objectif** (choisissez un objectif, « Aucun objectif » ou **Entretien**). Un projet est dans l'un de trois états : lié à un objectif, d'**entretien** (il fait tourner quelque chose sans viser un but), ou non lié. Depuis la page d'une zone, un projet non lié a un bouton **lier...**.
- **Tâche** : sur la fiche de la tâche, carte **Objectif** (liste cherchable ; la croix retire le lien). Une tâche et son projet ont chacun leur lien : l'objectif du projet n'est **pas hérité** par la tâche.
- Supprimer un objectif détache ses projets sans les supprimer.

## La page d'un objectif

`/goal/<identifiant>-<titre>`. Un bandeau (titre, pourquoi, statut, horizon, date cible, zone liée, nombres de tâches et de projets, crayon et corbeille), puis deux colonnes : les **projets** liés (nom, statut, bordure colorée) et les **tâches** liées directement (actives d'abord, **Terminées (n)** repliées).

Une date cible fait apparaître l'objectif comme un losange sur la **Roadmap** quand la date tombe dans le trimestre affiché (objectifs actifs et atteints seulement).

## Liste d'envies

Une envie est un objectif **sans plan** : aucune date n'est demandée, elle n'apparaît **jamais** dans Aujourd'hui, le plan du jour ni la barre latérale. Elle est rangée par type : **Avoir**, **Être**, **Faire**. Pour sortir un objectif de la liste, retirez son type.

- **Ouvertes et réalisées** : une envie active ou en pause est *ouverte* et reste dans son groupe ; une envie atteinte ou abandonnée passe dans **Réalisées** (repliée). Un toucher sur la case d'une envie la marque **réalisée**, avec **Annuler** (retour à actif).
- **Ajouter** : un champ au bas de chaque groupe ouvert (« Ajouter une envie à `<groupe>` », « + Ajouter ») sur le web ; le bouton **+** de l'écran Objectifs sur Android (nom et groupe, la feuille reste ouverte pour la suivante). Android crée l'envie hors ligne, par la file d'envoi.
- **Créer une tâche** : bouton sur chaque envie ouverte (et dans sa feuille sur Android) : ouvre la saisie rapide sur Tâche, pré-remplie avec le nom de l'envie. La tâche créée est **liée** à l'envie et peut recevoir un projet comme n'importe quelle tâche. **L'envie reste dans la liste** (c'est le rêve, la tâche est son prochain pas) ; sa ligne montre ce prochain pas, ou « Tâches liées : N ».

## Hors ligne et appareils

Les objectifs sont synchronisés comme l'entité `goal` (avec le lien `goal_uid` sur les tâches et les projets) : modifications, créations d'envies et suppressions fonctionnent hors ligne sur Android et sont envoyées au retour du réseau. Si un objectif est modifié des deux côtés, la fusion se fait champ par champ ; les conflits restent visibles dans Réglages › Synchronisation ([Hors-ligne et synchronisation](Hors-ligne-et-synchronisation)).

## Cas limites

- Nombre d'objectifs actifs d'une zone : au-delà de **5**, la page de la zone affiche un avertissement (une invitation à la sobriété, pas une limite).
- Un objectif supprimé : une confirmation prévient que les projets liés deviennent non liés ; il n'y a pas d'annulation côté web, alors que sur Android l'annulation dure cinq secondes.
- La barre n'inclut pas les sous-tâches (une tâche avec sous-tâches compte pour une seule).
- Un résultat clé garde son propre pourcentage ; celui de l'objectif ne se confond pas avec la moyenne des résultats.

## Pour aller plus loin

- [Système d'objectifs (doc)](https://github.com/PreciselyWrong/cadence/blob/main/docs/12-goals-system.md), [Roadmap (doc)](https://github.com/PreciselyWrong/cadence/blob/main/docs/31-roadmap.md)
- Pages du wiki : [Projets et domaines](Projets-et-domaines), [Revue, bilan et focus](Revue-bilan-et-focus), [Android](Android), [Intégrations, MCP et plugins](Integrations-MCP-et-plugins) (outils `list_goals`, `create_goal`, `update_goal`, `delete_goal`)
