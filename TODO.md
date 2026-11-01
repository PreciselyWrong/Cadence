# TODO

Décisions, références et pièges du fork : [docs/fork/DECISIONS.md](docs/fork/DECISIONS.md).

## Now

Tout le code prévu est livré dans `main` et poussé ; APK 1.6.8 et image `ghcr.io/preciselywrong/cadence:latest` publiés. Vérifié : suites serveur sur SQLite et sur PostgreSQL 16 (podman local, migrations du jour rejouées), tests web, tests Android dont les migrations Room sous Robolectric. Reste ce qui demande l'usage réel, ton téléphone ou ton serveur.

- **À faire par toi.**
  - Installer l'APK 1.6.7 (versionCode 40) depuis NicoApps et mettre à jour le conteneur sur Unraid (`docker pull ghcr.io/preciselywrong/cadence:latest` puis redémarrer). Vérif : synchro dans les deux sens par Tailscale, rappels, « Plus tard », heures calmes, widgets, revue, Stash ; 1.6.5 : mode avion puis retour réseau (ligne « Hors ligne · N en attente » puis synchro seule), notification d'une tâche à heure fixe et d'un événement d'agenda, tri des liens dans la Boîte (balayage, « À tester », « Trier les liens »), ajout rapide en chaîne.
  - Synchro Google (`docs/33-google-sync.md`) : créer le client OAuth (Calendar + Tasks API, app « En production »), `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` sur Unraid, connecter, 3 jours d'usage mixte. Vérif : aucun doublon, modifs visibles des deux côtés en < 2 min.
  - Revue (`docs/34-review.md`) : 2 semaines d'usage réel, puis ajuster seuils (3 reports en 30 j, « jour arrivé ou lendemain », 90 j « Ancien », 30 j « projet stagnant ») seulement si des faux positifs apparaissent.
  - Production sur le Postgres d'Unraid : export puis import (⛔ jamais par-dessus une base SQLite remplie). Le code est vérifié sur PostgreSQL 16 en local.
  - Client Linux : choisir une touche pour l'ajout rapide dans les raccourcis KDE (le portail Wayland la propose ; Ctrl+Alt+Space est déjà pris par Claude), installer le RPM `desktop/src-tauri/target/release/bundle/rpm/`.
- **Petits restes, à faire quand le besoin se montre.**
  - Android : choix « Session courte » de la revue (Android n'a pas de plan du jour).
  - Parité, Android : liens `tel:` / `mailto:` dans les notes, tâches et descriptions d'événement (web : `docs/fork/WEB-UX-NOTES.md`, 2026-11-01). Vérif : un numéro `079 123 45 67` dans une note s'appelle d'un tap, une date ne devient pas un lien.
  - Parité 1.6.5, web : liste des conflits et page Synchronisation (Android seul) ; mode « Trier les liens » sur le web (un lien à la fois, « Passer » ; les quatre décisions sont faites, voir `docs/fork/ANDROID-UX-NOTES.md`) ; option « description sous le titre » des lignes de tâches. Vérif : un lien trié sur le web quitte l'inbox du téléphone.
  - Parité 1.6.5, Android : zone `~` ; écritures d'habitudes en attente non comptées dans « N en attente ».
  - Parité, venus de l'amont (`eda9aa60`) et web seulement : quitter un partage, choisir qui reprend les tâches d'un membre retiré ; Android n'a pas d'écran de partage, à faire quand il en aura un.
  - Traductions automatiques des 22 langues hors fr/en/ja/ko : non relues (ja et ko relues le 2026-11-01 ; 33 clés présentes en ja/ko et absentes d'en, dont `dailyPlan.tips.missed` et `subscription.trialBanner` utilisées).
  - Fixtures dorées des habitudes : compléter (abstinence, alcool, aperçus, questions apprises, semaine) quand le web en a besoin.
- Android : reprendre la passe « UI épurée » du web du 2026-11-01 (`docs/fork/WEB-UX-NOTES.md`, mêmes règles) : aucune couleur d'alerte ni « il y a N jours » pour une échéance passée, pas de citation par défaut, pas de section membres pour un projet personnel, pas de badge « 0 », tiroir en une seule liste défilante. Raison : changements faits côté web seul. Vérif : écrans Aujourd'hui, détail de tâche, projet et habitudes sur l'émulateur.
- Hors périmètre volontaire : limite de projets actifs (compteur seulement). V/E/M/D abandonné le 2026-11-01 : le planificateur Hermès arbitre ; les 24 tags sont supprimés, valeurs et grille archivées dans la note Cadence « Archive V/E/M/D » et `~/Documents/cadence-archives/`.

## Next

- UI web épurée, suite (cap : Things 3, TickTick, Todoist ; journal `docs/fork/WEB-UX-NOTES.md`, passe du 2026-11-01 faite : rail, Aujourd'hui, Boîte, échéances, page projet, débordements 375-1920 px) : en-tête de Projets (7 contrôles : recherche, cartes/liste, tri, réglages, « … », nouveau ; tri et réglages à ranger dans « … »), cartes de projet (statut « En cours » et « 0/1 0 % » sur chaque carte), en-tête d'Aujourd'hui (Tout placer, Clore la journée, « … », Calendrier), mode Dense non revu. Vérif : mêmes mesures de débordement, chaque contrôle a un effet visible.
- Vérifier la refonte du 2026-10-30 (main `6ddf3a86`, vérifiée par build, tests et émulateur) sur le vrai téléphone et le web : Android (détail de tâche, ajout rapide en langage naturel, glissements, notes éditables + vignettes, Agenda, planification du jour, Bilan, widgets) et web (jetons Android, panneau de tâche en ligne, Ctrl+K, planification, barre mobile, fr complet). Restes : APK à publier sur NicoApps (`android/publish.ps1` + CHANGELOG), TODO.md côté Android (planification auto, déplacement et ajout dans un projet fichier non bloqués), traductions automatiques des 24 autres langues à relire.
- Refonte TickTick, étape 4 : comparer avec TickTick 8.0.20 lancé en local, écran par écran, lister et corriger les écarts du calendrier (les étapes 1 à 3 et 5 sont dans `main`). À trancher : réordonner les tâches sans heure et retirer du plan en déplaçant la date depuis l'agenda (retirés de l'ancien Aujourd'hui).
- Proposer en PR à l'amont les ajouts génériques déjà prêts (voir la ligne suivante).
- Fusionner l'amont (`chrisvel/tududi`) chaque semaine (dernière synchro : `eda9aa60`, v1.14.0). Proposer en PR les ajouts génériques (vues calendrier, flux ICS de la branche `claude/new-session-sgffz7`).
- TODO.md des dépôts dans Tududi, édition live des deux côtés : un conteneur clone depuis Gitea/GitHub, lit `Now`/`Next`/`Ideas` ; une modification dans Tududi est commitée et poussée, un push dans le dépôt est relu (webhook). Les conflits sont signalés sans écrire. Vérif : une modif de chaque côté apparaît de l'autre sans perte.

## Ideas

- Capture Android : partage vers l'inbox en moins d'une seconde, puis galerie des découvertes (aperçu OpenGraph, README GitHub) avec décision rapide : tester, rattacher, reporter, jeter.
- Enrichissement déterministe sans IA (OpenGraph, README, étoiles), puis Hermes en lot différé (résumé, projet, doublons, résurgence).
- Vues outliner et galerie dans les clients.
