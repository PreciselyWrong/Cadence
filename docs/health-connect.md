# Terrain - Synchroniser les activités sportives via Health Connect

Document de préparation. Aucune ligne de production n'est écrite : il fixe le modèle, les
frontières de modules, l'ordre des tranches et les points qui demandent un arbitrage.

## Ce que fait la tranche

Une habitude peut déclarer une **règle de correspondance**. Quand Health Connect expose une
séance d'exercice qui satisfait la règle, sa durée devient une saisie Cadence, sans effacer
ni remplacer le chronomètre et la saisie manuelle qui continuent de fonctionner.

## Dépendance et disponibilité

| Point | Choix |
|---|---|
| Bibliothèque | `androidx.health.connect:connect-client` (une entrée `libs.versions.toml`, module `app` uniquement) |
| minSdk | 26 tenu : le client compile dès 26, mais sous Android 14 il exige l'APK Health Connect installé |
| Détection | `HealthConnectClient.getSdkStatus()` - `SDK_UNAVAILABLE`, `PROVIDER_UPDATE_REQUIRED`, `SDK_AVAILABLE` |
| Réseau | aucun : Health Connect est un fournisseur local sur l'appareil |

Absence du fournisseur = la fonction ne s'affiche pas. Elle ne doit jamais bloquer un écran
existant ni faire échouer une saisie.

## Permissions

- `android.permission.health.READ_EXERCISE` déclarée dans le manifeste.
- Rationale obligatoire : activité répondant à `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE`,
  et `activity-alias` `VIEW_PERMISSION_USAGE` / catégorie `HEALTH_PERMISSIONS` pour API 34+.
- `<queries><package android:name="com.google.android.apps.healthdata" /></queries>`.
- Demande via `PermissionController.createRequestPermissionResultContract()`, jamais au démarrage :
  au moment où l'utilisateur crée sa première règle.
- Refus = état affiché et réversible, pas une boîte de dialogue qui revient.

Deux permissions restent volontairement **hors** de cette tranche, à rediscuter seulement si un
besoin réel apparaît : `READ_HEALTH_DATA_IN_BACKGROUND` (lecture hors premier plan) et
`READ_HEALTH_DATA_HISTORY` (données de plus de 30 jours).

## Modèle

### Domaine (`domain/`, sans Android)

```
HealthMatchRule(
    habitId: String,
    exerciseTypes: Set<Int>,      // constantes ExerciseSessionRecord, stockées en entier
    sourcePackages: Set<String>,  // vide = toutes les sources acceptées
    enabled: Boolean,
)
```

`exerciseTypes` reste un `Set<Int>` : le domaine n'importe pas Health Connect, et l'app fait la
correspondance entier → libellé français (⛔ afficher un nom d'énumération).
Une règle vide sur les deux axes ne correspond à rien - elle ne vaut pas « tout accepter ».

Fonction pure à tester en premier :
`HealthMatchRule.matches(exerciseType: Int, sourcePackage: String): Boolean`.

### Import

```
ImportedSession(
    externalId: String,   // metadata.id de l'enregistrement
    exerciseType: Int,
    sourcePackage: String,
    startedAt: Instant,
    zoneOffset: ZoneOffset?,
    durationSeconds: Long,
)
```

`HealthImportPlan` (domaine, pur) transforme une liste d'`ImportedSession` + les règles +
les `externalId` déjà connus en une liste d'écritures. Toute la logique fine - doublons,
fuseaux, date civile, séance à cheval sur minuit - se teste ici sans appareil.

### Persistance (`data/`)

- Nouvelle table `health_match_rules` (`habitId` clé primaire, `FOREIGN KEY … ON DELETE CASCADE`,
  types et paquets sérialisés en texte séparé par virgules).
- `habit_entries` **n'évolue pas** : les colonnes `source` et `sessionId` existent déjà.
  - `source = "HEALTH_CONNECT"`
  - `sessionId = "hc:<metadata.id>"`, index unique côté requête pour le test d'existence.
- Un jeton de synchronisation (`Changes API`) va en DataStore, pas en base : c'est un état de
  transport, pas une donnée utilisateur.
- Migration **16** (la 15 est déjà prise par la découpe en emplacements du widget).

## Déduplication

Trois collisions distinctes, trois réponses :

1. **Même séance réimportée** → `sessionId` déjà présent, l'import ne réécrit pas.
2. **Séance corrigée dans l'app source** → même `metadata.id`, `version` supérieure : la saisie
   existante est mise à jour, jamais dupliquée.
3. **Chronomètre Cadence + séance importée pour la même sortie** → aucun rapprochement
   automatique. La saisie importée s'ajoute, son origine est visible, et l'utilisateur supprime
   celle qu'il ne veut pas. Deviner un recouvrement temporel produirait des pertes silencieuses.

Une saisie importée corrigée à la main devient une saisie manuelle et cesse d'être réécrite par
un import ultérieur (elle garde son `sessionId`, sa `source` passe à `MANUAL`).

## Fuseaux

La date civile d'une saisie importée vient de `startTime` + `startZoneOffset` de la séance,
pas du fuseau courant du téléphone : une course faite en voyage reste au jour où elle a eu lieu.
Quand l'offset est absent, on retombe sur le fuseau de l'appareil et c'est ce fuseau qui est
enregistré dans `observedZoneId`.

## Déclenchement

Synchronisation au premier plan uniquement, sans permission supplémentaire ni alarme exacte :

- ouverture de l'application,
- retour au premier plan,
- action manuelle « Synchroniser maintenant » dans les réglages de la règle.

Incrémental via `getChangesToken` / `getChanges`. Jeton expiré ou absent → relecture de la
fenêtre des 30 derniers jours, la déduplication rend l'opération sans risque.

## Interface

1. **Réglages de l'habitude** - section `Import automatique` : activer, choisir les types
   d'exercice, choisir les sources (liste des paquets réellement vus dans les données, plus
   « Toutes »), désactiver sans perdre l'historique importé.
2. **Origine d'une durée** - chaque saisie affiche son origine : nom de l'app source,
   chronomètre, ou saisie manuelle. Icône vectorielle + libellé, pas d'emoji.
3. **États** - fournisseur absent, permission refusée, aucune règle, dernière synchronisation.

Tout passe par `Space`, `Radius`, `Size`, la palette Cadence et `strings.xml`.

## Sauvegarde

Les règles sont de la configuration : elles sont exportées.
Aucun jeton, aucun identifiant de compte, aucune donnée de santé brute n'entre dans la sauvegarde.
Les saisies importées s'exportent comme les autres, avec leur `source` et leur `sessionId` -
une restauration sur un appareil sans Health Connect les garde donc lisibles et modifiables.

## Ordre des tranches

1. `HealthMatchRule` + `HealthImportPlan` et leurs tests domaine - rouge d'abord.
2. Table `health_match_rules`, migration 16, schéma exporté, accès dépôt.
3. Client Health Connect : disponibilité, permissions, lecture, jeton de changements.
4. Écriture des saisies importées et mise à jour incrémentale.
5. Interface : règle par habitude, origine des durées, états d'erreur.
6. Sauvegarde/restauration des règles.

Les étapes 1 et 2 ne touchent aucun fichier du chantier widget en cours.

## Vérification attendue (reprise du TODO)

- permission refusée puis accordée plus tard
- fournisseur Health Connect absent ou à mettre à jour
- source déconnectée entre deux synchronisations
- import différé de plusieurs jours
- doublons : même séance vue deux fois, séance modifiée dans l'app source
- correction manuelle d'une saisie importée
- séance à cheval sur minuit, séance faite dans un autre fuseau
- sauvegarde puis restauration sans données de santé

## À arbitrer

- **Recouvrement chronomètre / import** : la proposition ci-dessus n'en fait rien d'automatique.
  Un rapprochement par fenêtre temporelle est possible mais supprime des saisies sans le dire.
- **Historique au premier branchement** : importer les 30 derniers jours d'un coup, ou ne prendre
  que les séances postérieures à la création de la règle.
- **Habitudes non-durée** : une séance peut aussi valider une habitude binaire ou compter pour 1.
  Cette version n'importe que la durée, conformément au TODO.
