# TODO

Décisions, références et pièges du fork : [docs/fork/DECISIONS.md](docs/fork/DECISIONS.md).

## Now

Tout le code prévu est livré dans `main` et poussé ; APK 1.6.1 et image `ghcr.io/preciselywrong/cadence:latest` publiés. Vérifié : suites serveur sur SQLite et sur PostgreSQL 16 (podman local, migrations du jour rejouées), tests web, tests Android dont les migrations Room sous Robolectric. Reste ce qui demande l'usage réel, ton téléphone ou ton serveur.

- **À faire par toi.**
  - Installer l'APK 1.6.1 (versionCode 33) depuis NicoApps et mettre à jour le conteneur sur Unraid (`docker pull ghcr.io/preciselywrong/cadence:latest` puis redémarrer). Vérif : synchro dans les deux sens par Tailscale, rappels, « Plus tard », heures calmes, widgets, revue, Stash.
  - Synchro Google (`docs/33-google-sync.md`) : créer le client OAuth (Calendar + Tasks API, app « En production »), `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` sur Unraid, connecter, 3 jours d'usage mixte. Vérif : aucun doublon, modifs visibles des deux côtés en < 2 min.
  - Revue (`docs/34-review.md`) : 2 semaines d'usage réel, puis ajuster seuils (3 reports en 30 j, « jour arrivé ou lendemain », 90 j « Ancien », 30 j « projet stagnant ») seulement si des faux positifs apparaissent.
  - Production sur le Postgres d'Unraid : export puis import (⛔ jamais par-dessus une base SQLite remplie). Le code est vérifié sur PostgreSQL 16 en local.
  - Client Linux : choisir une touche pour l'ajout rapide dans les raccourcis KDE (le portail Wayland la propose ; Ctrl+Alt+Space est déjà pris par Claude), installer le RPM `desktop/src-tauri/target/release/bundle/rpm/`.
- **Petits restes, à faire quand le besoin se montre.**
  - Android : éditer icônes et parents (sous-projets, tags) — web seulement ; choix « Session courte » de la revue (Android n'a pas de plan du jour) ; habitudes « N fois par semaine » absentes de l'Agenda.
  - Serveur : rappels d'habitudes envoyés par le téléphone seulement ; avec plusieurs processus serveur, une création incomplète (sans nom) qui croise une autre création du même uid est refusée au lieu d'être fusionnée ; défaut ancien `habitReminders` dans `users.notification_preferences` sur les bases mises à niveau (sans effet).
  - Traductions automatiques des 24 langues hors fr/en : non relues (surtout ja, ko).
  - Fixtures dorées des habitudes : compléter (abstinence, alcool, aperçus, questions apprises, semaine) quand le web en a besoin.
- Hors périmètre volontaire : limite de projets actifs (compteur seulement). V/E/M/D abandonné le 2026-11-01 : le planificateur Hermès arbitre ; les 24 tags sont supprimés, valeurs et grille archivées dans la note Cadence « Archive V/E/M/D » et `~/Documents/cadence-archives/`.

## Next

- UI web épurée (cap : Things 3, TickTick, Todoist ; journal pour Android dans `docs/fork/WEB-UX-NOTES.md`) : boutons sans effet du rail (trois points, icônes de gauche), revue d'encombrement écran par écran. Vérif : aucun débordement horizontal de 375 à 1920 px.
- Android, reste de la refonte (`android/docs/REDESIGN.md`) : widget combiné (couleur libre, aperçu dans la config, filtres projets/#tags, ouverture du détail, rafraîchissement sur changement d'agenda, petits widgets), Agenda : habitudes, plateau « À planifier » et glisser-déposer, flèches ; toggle « muet pendant les pauses » ; rail projet sur `TaskRow` ; `QuickEntryActivity` ancien style ; traductions automatiques des 24 autres langues à relire ; date ISO dans l'éditeur de saisie d'habitude.
- Vérifier la refonte du 2026-10-30 (main `6ddf3a86`, vérifiée par build, tests et émulateur) sur le vrai téléphone et le web : Android (détail de tâche, ajout rapide en langage naturel, glissements, notes éditables + vignettes, Agenda, planification du jour, Bilan, widgets) et web (jetons Android, panneau de tâche en ligne, Ctrl+K, planification, barre mobile, fr complet). Restes : APK à publier sur NicoApps (`android/publish.ps1` + CHANGELOG), TODO.md côté Android (planification auto, déplacement et ajout dans un projet fichier non bloqués), traductions automatiques des 24 autres langues à relire, date ISO dans l'éditeur de saisie d'habitude, `QuickEntryActivity` ancien style.
- Refonte TickTick, étape 4 : comparer avec TickTick 8.0.20 lancé en local, écran par écran, lister et corriger les écarts du calendrier (les étapes 1 à 3 et 5 sont dans `main`). À trancher : réordonner les tâches sans heure et retirer du plan en déplaçant la date depuis l'agenda (retirés de l'ancien Aujourd'hui).
- Proposer en PR à l'amont les ajouts génériques déjà prêts (voir la ligne suivante).
- Fusionner l'amont (`chrisvel/tududi`) chaque semaine (dernière synchro : `f04288d`, v1.14.0). Proposer en PR les ajouts génériques (vues calendrier, flux ICS de la branche `claude/new-session-sgffz7`).
- TODO.md des dépôts dans Tududi, édition live des deux côtés : un conteneur clone depuis Gitea/GitHub, lit `Now`/`Next`/`Ideas` ; une modification dans Tududi est commitée et poussée, un push dans le dépôt est relu (webhook). Les conflits sont signalés sans écrire. Vérif : une modif de chaque côté apparaît de l'autre sans perte.

## Ideas

- Capture Android : partage vers l'inbox en moins d'une seconde, puis galerie des découvertes (aperçu OpenGraph, README GitHub) avec décision rapide : tester, rattacher, reporter, jeter.
- Enrichissement déterministe sans IA (OpenGraph, README, étoiles), puis Hermes en lot différé (résumé, projet, doublons, résurgence).
- Migration TickTick via son MCP, une fois les rappels prouvés pendant quelques semaines.
- Vues outliner et galerie dans les clients.
