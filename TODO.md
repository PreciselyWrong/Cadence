# TODO

Décisions, références et pièges du fork : [docs/fork/DECISIONS.md](docs/fork/DECISIONS.md).

## Now

- Refonte façon TickTick, étape 2 : ajout rapide en langage naturel. Prompt de reprise et liste du reste : [docs/fork/PROMPT-suite-ticktick.md](docs/fork/PROMPT-suite-ticktick.md). Vérif : « Appeler Paul demain 15h #perso !1 ^Maison » surligne 4 éléments et crée la tâche complète.

## Next

- Refonte TickTick, étapes 3 à 5 : gestes sur les lignes, type de vue par vue, écarts calendrier (détail dans le prompt de reprise).
- Fixtures dorées des habitudes : extraire des tests `domain/` de Cadence des cas JSON (versions d'objectif et de planning + saisies + pauses → statut de chaque période, séries, statistiques). Vérif : les tests Kotlin de Cadence passent sur ces fixtures.
- Module habits Cadence côté serveur : schéma, moteur JS, migration des habitudes Tududi existantes en version 1. Vérif : Jest vert sur toutes les fixtures, SQLite et Postgres.
  - Combler les manques de l'amont : versions d'objectif (le passé n'est pas réinterprété), `AT_MOST` > 0 et `TRACK_ONLY`, minimum vs idéal, fréquence + quantité combinées, pauses multi-jours avec motif et reprise anticipée, fuseau observé par saisie, `startsOn`, quantités entières à précision explicite, groupes à plages libres (chevauchement, passage de minuit), chronos, progression de cible, profils d'abstinence, stats 30 jours avec confiance.
  - Garder de l'amont : score de force, note par check-in, présence dans Aujourd'hui/Plan, outils MCP.
- API de synchronisation hors ligne ([plan](docs/fork/PLAN-clients-sync.md), § 1 ; [doc](docs/30-offline-sync.md)). Fait : registre, journal, snapshot, pull, push idempotent, fusion par champ, tags, occurrences récurrentes, QR de connexion. Reste (relecture Codex du 2026-10-29) :
  - Concurrence : sérialiser lecture/fusion/écriture par ligne ; sur Postgres, un curseur peut sauter une entrée non commitée (publier le journal dans l'ordre des commits ou borner le curseur) ; dédoublonnage atomique des occurrences.
  - Horloge serveur perdue au redémarrage : restaurer un plancher depuis les `field_clocks` persistés.
  - Suppression d'un tag en SQL brut (`tagsRepository.deleteWithAssociations`) : ne rejournalise pas les tâches ni les tags enfants.
  - Compaction du journal, entités habitudes.
- UI web habitudes : créer, versionner, mettre en pause et saisir depuis le navigateur.
- App Android depuis le dépôt Cadence (Kotlin, Compose) : toutes les fonctionnalités de Cadence reprises ([liste de parité](docs/fork/CADENCE-PARITY.md)), design au style Tududi ; tâches + habitudes, domaine Cadence en local (Room), file hors ligne, widget Glance, alarmes inexactes, Health Connect. Vérif : mode avion puis retour réseau, serveur à jour sans doublon.
- Import des données Cadence vers Tududi. Vérif : séries et stats identiques avant et après.
- Client Linux Tauri 2 autour du front React : notifications natives, barre système, ajout rapide global, SQLite hors ligne. Vérif : RAM au repos < 100 Mo, notification reçue app fermée dans la barre.
- Passer la production sur le Postgres d'Unraid (export puis import) et lancer les tests sur Postgres.
- Ajouter le remote `upstream` (`chrisvel/tududi`) et fusionner chaque semaine. Proposer en PR les ajouts génériques (vues calendrier, flux ICS de la branche `claude/new-session-sgffz7`).
- TODO.md des dépôts dans Tududi, édition live des deux côtés : un conteneur clone depuis Gitea/GitHub, lit `Now`/`Next`/`Ideas` ; une modification dans Tududi est commitée et poussée, un push dans le dépôt est relu (webhook). Les conflits sont signalés sans écrire. Vérif : une modif de chaque côté apparaît de l'autre sans perte.

## Ideas

- Capture Android : partage vers l'inbox en moins d'une seconde, puis galerie des découvertes (aperçu OpenGraph, README GitHub) avec décision rapide : tester, rattacher, reporter, jeter.
- Enrichissement déterministe sans IA (OpenGraph, README, étoiles), puis Hermes en lot différé (résumé, projet, doublons, résurgence).
- Migration TickTick via son MCP, une fois les rappels prouvés pendant quelques semaines.
- Vues outliner et galerie dans les clients.
