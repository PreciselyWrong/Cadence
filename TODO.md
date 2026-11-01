# TODO

Décisions, références et pièges du fork : [docs/fork/DECISIONS.md](docs/fork/DECISIONS.md).

## Now

Le reste est livré dans `main` (14 commits d'avance sur `origin/main`, non poussés) et vérifié par tests, build et émulateur ; ci-dessous, ce qui demande l'usage réel, le téléphone, le serveur ou du code.

- **À faire par toi.**
  - Synchro Google (`docs/33-google-sync.md`) : créer le client OAuth (Calendar + Tasks API, app « En production »), `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` sur Unraid, connecter, 3 jours d'usage mixte. Vérif : aucun doublon, modifs visibles des deux côtés en < 2 min.
  - Revue (`docs/34-review.md`) : 2 semaines d'usage réel, puis ajuster le seuil (3 reports en 30 j), « jour arrivé ou lendemain », 90 jours « Ancien », 30 jours « projet stagnant », seulement si des faux positifs apparaissent.
  - Installer l'APK 1.6.0 (versionCode 32) sur le vrai téléphone, joindre le vrai serveur par Tailscale. Vérif : sync dans les deux sens, rappels, snooze, heures calmes, widgets ; APK à publier sur NicoApps (`android/publish.ps1`).
  - Passer la production sur le Postgres d'Unraid (export puis import) et lancer `DATABASE_URL=... npm run backend:test:pg`. Vérif : les branches Postgres de la synchro (ordre du journal, compaction) et des migrations n'ont jamais tourné ; `backend:test:upgrade` vert sur les deux moteurs.
- **Parité Android restante** (règle du fork : à livrer ou à garder ici).
  - `reminder_sent_at` hors du format de synchro : entrée du registre serveur (`backend/modules/sync/`) puis colonne Android.
  - Icônes dans les lignes de tâches et le `ProjectDropdown` ; édition des icônes et des parents (sous-projets, tags) sur Android.
  - Onglet À venir et widgets n'étendent pas les occurrences récurrentes (l'Agenda le fait) ; filtre par zone absent des onglets Étiquettes et Terminées ; choix « Session courte » de la revue ; cibles de glissement du tiroir : sans objet sur téléphone.
  - Tests instrumentés des migrations Room 5→6, 6→7, 7→8 : non lancés (l'émulateur plante sur cette machine, code 139). Vérif : un émulateur ou un appareil qui les exécute.
- **Client Linux (`desktop/`, `docs/fork/DESKTOP.md`).** Le raccourci global ne part pas sous Wayland (lier `cadence-desktop --quick` dans KDE) ; captures livrées au moins une fois (la synchro `push` donnerait exactement une fois) ; le clic sur une notification n'ouvre pas l'app ; démarrage automatique non empaqueté. Vérif : RAM au repos < 100 Mo, notification reçue app fermée.
- **Web, restes.** Avertissement `<form>` imbriqué dans Réglages ; défilement du tableau des notifications sur téléphone ; objectifs absents de Ctrl+K ; 162 clés FR manquantes (admin, connexion) ; habitudes absentes du calendrier (l'option « Afficher les habitudes » ne fait rien) ; rappels d'habitudes côté serveur absents (téléphone seulement).
- **Revue web, restes de code.** Rangée de décision en Dense ; e2e Playwright du parcours de revue (reprise après 4 décisions, Plus tard → réactivation, date de réexamen) ; tests d'acceptation manquants (récurrence + Google sans faux report, tâche partagée sans fuite, plusieurs milliers de tâches : temps de `/api/review*`).
- **Fixtures dorées des habitudes** : à compléter des règles pas encore reprises côté JS (statistiques d'abstinence et d'alcool, aperçus, questions apprises, semaine) quand le web en a besoin.
- Hors périmètre volontaire : scores V/E/M/D (échelles à définir ; en attendant, tags imbriqués `V/3`) et limite de projets actifs (compteur seulement).

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
