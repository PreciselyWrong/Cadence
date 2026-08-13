# AGENTS.md

## Quoi
Cadence est une application Android locale de suivi d'habitudes, destinée à une saisie quotidienne très rapide.
Le widget compact et l'Activity de saisie rapide sont les surfaces principales.
Aucun compte, serveur, tracker marketing, publicité ou accès réseau applicatif.

## Commandes
| But | Commande |
|---|---|
| Tests domaine | `$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'; .\gradlew.bat :domain:test` |
| Build debug | `$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'; .\gradlew.bat :app:assembleDebug` |
| Préparer le développement | `.\dev.ps1 -Plan -NonInteractive` |
| Lancer sur un appareil ADB | `.\dev.ps1 -NonInteractive` |
| Préparer une publication | `.\publish.ps1 -Plan -NonInteractive` |

## Carte
`domain/` — calculs temporels et règles métier Kotlin sans Android.
`data/` — persistance locale, préférences et sauvegardes.
`app/` — UI Compose, widget Glance, rappels et assemblage.

## Décisions
- Min SDK 26, compilation et cible API 36.
- Une entrée garde la date civile et le fuseau observés lors de sa saisie.
- Les changements d'objectif ou de période prennent effet à la période suivante.
- Les rappels utilisent des alarmes inexactes sans permission spéciale.
- Le widget Halo est la première variante d'un système de rendu extensible.
- Plus Jakarta Sans est embarquée localement; aucune police n'est téléchargée à l'exécution.
- `app-release/version.json` est l'unique source de version lue par le build Android.

## ⛔ Interdits
- ⛔ Stocker une progression courante — elle doit être dérivée des entrées horodatées.
- ⛔ Réinitialiser ou supprimer des entrées à une frontière de période — les périodes sont calculées.
- ⛔ Réinterpréter l'historique après une édition — objectifs et plannings sont versionnés.
- ⛔ Utiliser `Double` pour les quantités persistées — les montants utilisent un entier et une précision explicite.
- ⛔ Confondre fréquence et quantité — ce sont deux contraintes indépendantes.
- ⛔ Ajouter des emoji — l'interface, le widget, les notifications et les données utilisent des icônes vectorielles.
- ⛔ Ajouter une permission réseau — le produit fonctionne entièrement hors ligne.
- ⛔ Ajouter une alarme exacte — le choix produit est une alarme inexacte sans accès système spécial.
- ⛔ Ajouter une dépendance ou une architecture par anticipation — chaque abstraction doit servir une tranche active.
- ⛔ Écrire un correctif métier sans test rouge préalable — la logique temporelle suit TDD.
- ⛔ Modifier la version directement dans Gradle — elle provient de `app-release/version.json`.
- ⛔ Arrêter le lancement dev sans appareil — démarrer un AVD disponible et attendre `sys.boot_completed`.
- ⛔ Considérer la gestion des habitudes complète sans édition, pause, archive, duplication, réordonnancement et suppression accessibles — un modèle persistant seul ne constitue pas une option utilisateur.

## Pièges
- Le dépôt est initialement vide et Java n'est pas dans le PATH; utiliser le JDK embarqué d'Android Studio.
- Glance produit des RemoteViews; les anneaux déterminés doivent être rendus comme images.

## État
MVP local compilable : Room, saisie rapide, statistiques de période et widget Glance.
Prochaines tranches : rappels conditionnels, sauvegarde JSON et statistiques historiques.
