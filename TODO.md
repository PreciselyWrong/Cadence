# TODO

Décisions, références et pièges du fork : [docs/fork/DECISIONS.md](docs/fork/DECISIONS.md).

## Now

- Fixtures dorées des habitudes : extraire des tests `domain/` de Cadence des cas JSON (versions d'objectif et de planning + saisies + pauses → statut de chaque période, séries, statistiques). Vérif : les tests Kotlin de Cadence passent sur ces fixtures.

## Next

- Module habits Cadence côté serveur : schéma, moteur JS, migration des habitudes Tududi existantes en version 1. Vérif : Jest vert sur toutes les fixtures, SQLite et Postgres.
  - Combler les manques de l'amont : versions d'objectif (le passé n'est pas réinterprété), `AT_MOST` > 0 et `TRACK_ONLY`, minimum vs idéal, fréquence + quantité combinées, pauses multi-jours avec motif et reprise anticipée, fuseau observé par saisie, `startsOn`, quantités entières à précision explicite, groupes à plages libres (chevauchement, passage de minuit), chronos, progression de cible, profils d'abstinence, stats 30 jours avec confiance.
  - Garder de l'amont : score de force, note par check-in, présence dans Aujourd'hui/Plan, outils MCP.
- API de synchronisation hors ligne : `uid` choisi par le client, clé d'idempotence, lecture incrémentale `updated_since`. MCP habits mis à jour. Vérif : une saisie envoyée deux fois = une seule entrée. Proposer ces trois ajouts en PR à l'amont.
- UI web habitudes : créer, versionner, mettre en pause et saisir depuis le navigateur.
- App Android KMP (Kotlin, Compose) : tâches + habitudes, domaine Cadence en local (Room), file hors ligne, widget Glance, alarmes inexactes, Health Connect. Vérif : mode avion puis retour réseau, serveur à jour sans doublon.
- Import des données Cadence vers Tududi. Vérif : séries et stats identiques avant et après.
- Cible Linux Compose Desktop : mêmes écrans sur Fedora.
- Passer la production sur le Postgres d'Unraid (export puis import) et lancer les tests sur Postgres.
- Ajouter le remote `upstream` (`chrisvel/tududi`) et fusionner chaque semaine. Proposer en PR les ajouts génériques (vues calendrier, flux ICS de la branche `claude/new-session-sgffz7`).

## Ideas

- Capture Android : partage vers l'inbox en moins d'une seconde, puis galerie des découvertes (aperçu OpenGraph, README GitHub) avec décision rapide : tester, rattacher, reporter, jeter.
- Enrichissement déterministe sans IA (OpenGraph, README, étoiles), puis Hermes en lot différé (résumé, projet, doublons, résurgence).
- TODO.md des dépôts affichés dans Tududi via un conteneur qui clone depuis Gitea/GitHub, lit `Now`/`Next`/`Ideas`, commit/push, et signale les conflits sans écrire.
- Migration TickTick via son MCP, une fois les rappels prouvés pendant quelques semaines.
- Vues outliner et galerie dans les clients.
- À décider : l'app vit-elle dans le dépôt Cadence transformé (historique et design system conservés, recommandé) ou dans un nouveau dépôt ?
