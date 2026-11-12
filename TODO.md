# TODO

Décisions, références et pièges du fork : [docs/fork/DECISIONS.md](docs/fork/DECISIONS.md).

## Now

Tout le code prévu est livré dans `main` (2026-11-01) : APK 1.7.0 et image `ghcr.io/preciselywrong/cadence:latest`. Vérifié : suites serveur ciblées sur SQLite et PostgreSQL 16, tests web, 1655 tests Android, lint, build. Reste ce qui demande ton téléphone, ton serveur, un compte externe ou ta décision.

- **À faire par toi.**
  - Installer l'APK 1.7.0 depuis NicoApps. Vérif : synchro dans les deux sens, mode avion puis retour réseau, rappel d'une tâche placée dans le plan du jour à une heure, notification d'un événement (« À la fin », « 10 min »), partage vers l'Inbox, galerie des liens (Tester, Rattacher, Reporter, Jeter), Arborescence d'un projet, Réglages › Synchronisation (appareils, conflits).
  - Vérifier sur le téléphone et le web la refonte du 2026-10-30 (détail de tâche, ajout rapide, glissements, notes, Agenda, plan du jour, Bilan, widgets ; web : panneau de tâche, Ctrl+K, barre mobile).
  - Connecteur MCP pour claude.ai (`docs/38-remote-mcp.md`) : variables sur Unraid (`TUDUDI_PUBLIC_MCP_URL`, `TUDUDI_TRUST_PROXY`, `TUDUDI_MCP_OAUTH_ALLOWED_EMAILS`), 2FA sur ton compte, tunnel, WAF et Access Cloudflare, appairage puis connecteur dans claude.ai, liste de vérifications. Les correctifs de la revue de sécurité sont à finir dans ta session MCP avant d'ouvrir le tunnel.
  - Projets TODO.md tenus dans des dépôts (`docs/35-todo-md-projects.md`) : clé de déploiement ou jeton par dépôt, variables `TUDUDI_TODO_REPOS` et `TUDUDI_TODO_REPO_<SLUG>_*` sur Unraid, webhook push (ou la passe des 5 min).
  - Synchro Google (`docs/33-google-sync.md`) : client OAuth (Calendar + Tasks API), `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` sur Unraid, 3 jours d'usage. Vérif : aucun doublon, modifs visibles des deux côtés en < 2 min.
  - Revue (`docs/34-review.md`) : 2 semaines d'usage réel, puis ajuster les seuils seulement si des faux positifs apparaissent.
  - Client Linux : `sudo dnf install desktop/src-tauri/target/release/bundle/rpm/Cadence-0.1.0-1.x86_64.rpm`, puis une touche d'ajout rapide dans les raccourcis KDE.
  - Hermès « capture » : bot Telegram chez BotFather, `TELEGRAM_BOT_TOKEN` dans `/opt/data/profiles/capture/.env` ; le classement automatique vit maintenant dans Cadence (`docs/41-auto-classify.md`) : configurer le fournisseur de Profil › Assistant IA en prod (adresse `https://api.anthropic.com/v1/`, modèle du classement `claude-haiku-5-5` dans Profil › Classement), puis supprimer le job Hermes `cadence-classify` (en pause) et le plugin `cadence-questions`. Vérif : sur 7 jours, 2 à 5 éléments classés par jour et des cartes dans « À trier » au lieu de Telegram. Enrichissement des liens : job `cadence-enrich` chaque nuit à 03:30.
  - Brancher le téléphone en ADB (aucun appareil le 2026-11-02) pour installer le build debug du jour. Vérif : ouvrir une tâche depuis le widget, aller dans Inbox puis revenir dans Tâches (rien ne se rouvre) ; long titre dans l'ajout rapide (passe à la ligne) ; « Afficher tout » sur une longue idée ; titre « Aujourd'hui ▾ » qui ouvre Listes (épinglés, domaine) ; case de la fiche pour terminer.
  - Annuler la série « 📅 Weekly Planning » (doublon de « Revue hebdo »).
  - PR à l'amont : ouvrir d'abord les issues de discussion (`docs/fork/upstream-prs/task-ics-feed.md`, `calendar-views.md`), puis envoyer les PR préparées dans `../cadence-upstream-*`.
  - Refonte TickTick, étape 4 (faite le 2026-11-01 sans voir TickTick, accès refusé) : comparer à l'écran avec TickTick 8.0.20 le calendrier de Cadence (ordre des tâches sans heure, Demain / Semaine prochaine dans l'agenda d'Aujourd'hui, dépôt au quart d'heure) et signaler les écarts.
  - Traductions : relecture par des locuteurs natifs des 22 langues hors fr/en/ja/ko (traduites automatiquement le 2026-11-01, pluriels slaves ajoutés).
- Web et client Linux hors ligne (2026-11-12, branche `claude/web-offline-9292b2`)
  Parité : Android est déjà hors ligne (Room + `/api/v1/sync`) ; le web le devient par son service worker (`docs/fork/WEB-OFFLINE.md`). Vérifié sous Chromium et WebKitGTK contre un serveur de test. Vérif à faire par toi après fusion et déploiement : dans le client Linux, ouvrir Aujourd'hui et un projet, couper le serveur (ou Tailscale), relancer la fenêtre, créer et renommer une tâche (pastille « Hors ligne · 2 en attente »), rallumer : les deux arrivent sur le serveur et le téléphone, sans doublon.
- Remise de tâche depuis Proches (Android seul, 2026-11-09)
  Pas de parité web : entrée inter-applications Android (`docs/42-proches-handoff.md`). Vérif : avec Proches signé sur l'émulateur ou le téléphone, accepter une proposition avec échéance ; la tâche apparaît dans Tâches avec son échéance et part à la synchro ; une seconde remise de la même proposition ne crée pas de doublon ; une autre app appelante est refusée.
- Bilan du soir sur Android (parité du web, 2026-11-04)
  écran du bilan après `evening.switchTime` (fuseau du profil), `GET /daily-plan/:date/evening`, « Reporter à demain » (annulation par retrait du plan de demain), réglage `Bilan du soir` ; contrat `docs/39-daily-brief.md` § Evening review, écarts web dans `docs/fork/WEB-UX-NOTES.md` (2026-11-04). Vérif : mêmes quatre sections et mêmes compteurs que le web pour une même journée sur le serveur de test, puis passage à 18:00 sur le téléphone.
- Aujourd'hui sur Android : glisser-déposer pour ranger
  Web : glisser une ligne. Android : seulement Monter et Descendre dans le menu, car le glissé entre en conflit avec le balayage des lignes et ne peut pas se vérifier ici (téléphone en `unauthorized` sur ADB, émulateur en panne). Vérif : sur le téléphone, ranger trois tâches au doigt sans déclencher de balayage ; l'ordre se retrouve sur le web.
- Android : planifier sans toucher l'échéance (livré le 2026-11-12)
  Reporter, Plus tard, Placer et le tri des échues de Ma journée écrivent le plan (`planning/PlanEdits.kt`, appels différés `PATCH /api/v1/daily-plan/:date`), hook serveur `leaveOnMove` supprimé. Vérif : sur le téléphone, « Reporter » garde l'échéance et la tâche apparaît demain ; « Plus tard » ne vide plus l'échéance.
- Frise du jour déplaçable sur Android
  Web : déplacer et étirer les tâches à heure et les événements d'un agenda en deux sens. Android : la frise de Ma journée reste en lecture. Vérif : sur le téléphone, étirer une tâche ; sa durée se retrouve sur le web.
- Revue UX du 2026-11-06, à vérifier par toi
  Ma journée et la frise sur le téléphone en noir pur ; une carte d'habitude à moitié faite ; « À trier » sur tes vraies tâches ; importer ton `bookmarks.html` depuis `/links` ; clic gauche sur l'icône dans le panneau KDE après avoir installé le RPM ; charger `integrations/firefox-addon/` dans `about:debugging`. La signature Mozilla de l'add-on demande tes clés AMO.
- **Quand le besoin se montre.**
  - Parité, venus de l'amont et web seulement : quitter un partage, choisir qui reprend les tâches d'un membre retiré ; Android n'a pas d'écran de partage.
  - Fixtures dorées des habitudes : compléter (abstinence, alcool, aperçus, questions apprises, semaine) quand le web en a besoin.
  - Étiquettes épinglées sur Android : le web les montre dans « Épinglés », Android non, car `pinned` des étiquettes n'est pas gardé dans Room (colonne et migration à ajouter). Vérif : une étiquette épinglée sur le web apparaît sous « Épinglés » dans Listes.
  - Fiche d'événement ICS sur Android : Android n'a pas d'agendas abonnés (ICS), seulement ceux de l'appareil.
  - « Cocher une fois passé » par agenda : Android seulement, car le web n'a pas d'événements cochables. À reprendre si le web en gagne. Vérif : un événement terminé d'un agenda réglé apparaît fait.
- Hors périmètre volontaire
  limite de projets actifs (compteur seulement). V/E/M/D abandonné le 2026-11-01 : le planificateur Hermès arbitre ; valeurs et grille archivées dans la note Cadence « Archive V/E/M/D » et `~/Documents/cadence-archives/`.

- [x] Icône de la source sur les tâches (M de Gmail, etc.) : web fait (badge sur Aujourd'hui, Planifier, la ligne et la fiche ; un clic ouvre le lien ; champs `source` / `source_url` côté serveur, MCP, Inbox, sync et sauvegarde ; `docs/00-tasks-behavior.md`). Vérif : une tâche créée par MCP avec `source: gmail` et un lien montre le « M » et ouvre le message.
  - Android : badge de source + champs `source`/`source_url` dans Room (reporté : `android/` tenu par un autre agent ; vérif : une tâche synchronisée avec `source: gmail` affiche le « M » et ouvre le message).

## Retours en direct (refonte desktop, 2026-11-12)

- [x] Notifications Tauri lisibles sur Fedora
- [x] Rien n'apparaît au survol ; le détail s'ouvre au clic
- [x] Clic sur un bloc ou un événement du calendrier : ouvre la tâche ou l'événement
- [x] Détail de tâche dans un panneau sous la page, pas à droite
- [x] Épinglés en tuiles (icône + nom) au-dessus du mini-calendrier
- [x] Bouton « Calendrier » visible quand le calendrier est caché
- [x] Calendrier sur 1, 3 ou 7 jours, flèches ‹ › pour changer de jour
- [x] Mode sombre retravaillé (anthracite bleuté, blocs nets)
- [x] Réordonner la liste du jour décale aussi les créneaux du calendrier (Sunsama)
- [x] « 7 prochains jours » renommé « Planifier » : colonne Inbox, jours en tableau, calendrier à droite réglable (1/3/7 jours)
- [x] Planifier, mode Horizons : Cette semaine, Ce mois-ci, Mois prochain, Un jour (façon Akiflow)
- [ ] Android : reprendre Planifier (Inbox + jours + calendrier), les Horizons et « Masquer les terminées » ; `tasks.month_of` à ajouter dans Room et la synchro
  Raison : desktop d'abord (choix du 2026-11-12) ; le serveur synchronise déjà `month_of`. Vérif : une tâche glissée dans « Ce mois-ci » sur le web apparaît dans le même horizon sur le téléphone, et inversement ; Room migrée sous Robolectric.
- [x] Tâches venues d'un TODO.md : se comportent comme de vraies tâches, sur le web et sur Android
- [ ] Style des apps de référence repris sur tout le desktop, pas seulement Aujourd'hui
- [ ] Cases `- [ ]` écrites dans une note : deviennent des tâches liées à la note
- [ ] Android : Inbox de Planifier à reprendre avec Planifier : « + » crée une tâche, tâches à classer listées avant les idées et glissables sur un jour
  Raison : web d'abord (2026-11-12). Vérif : une tâche ajoutée par le « + » de l'Inbox apparaît dans « Tâches à classer » sur le téléphone.

## Note de l'ajout rapide Android : focus et fermeture [cadence:c7e743d5-3c37-4ee1-812c-f2e134017ddc]

Branche `fix/note-quickadd-focus-c7e743d5`.

- [x] La fiche d'ajout se retire (animation `sheetState.hide()`) avant l'ouverture de l'éditeur de note.
- [x] L'éditeur place le clavier dans le contenu quand la note a déjà un titre (`NoteFocus`, test `NoteFocusTest`), puis ouvre le clavier.
- [ ] Vérifier sur le téléphone (aucun appareil, émulateur bloqué le 2026-11-05) : Tâches › + › Note, titre, Valider → la fiche disparaît, le curseur et le clavier sont dans le contenu.

## Next

- Cartes « Mail » dans « À trier » (web et Android)
  Spec : `docs/43-mail-triage.md`. L'agent de tri des mails propose par MCP (`propose_mail`) les fils qui demandent une action ; on décide dans « À trier » : Tâche, Répondre (brouillon dans Gmail), Plus tard, Ignorer, archivage Gmail optionnel par l'outil Gmail restreint. Pas de corps de mail stocké, pas d'envoi. Étapes : serveur (table `mail_items`, entité de synchro, outils MCP, route), carte web, carte Android + Room, consigne de l'agent dans Hermes. Vérif : voir « Checks once built » de la spec.
- Web : reprendre la passe de soustraction Android du 2026-11-02 (`docs/fork/ANDROID-UX-NOTES.md`)
  Aujourd'hui sans bannière ni jauge sauf journée pleine, fin de journée en ligne après les tâches, un seul signal couleur par ligne, deux gestes par idée dans la Boîte, fiche terminée par sa case, Projets et Étiquettes en lignes sans « 0 », surfaces neutres. Vérif : captures avant/après à 390 px et en bureau.
- Résumé matinal
  plan validé le 2026-11-04 (`docs/resume-matinal-plan.md`), phases 1 à 6 à suivre ; l'outil Gmail restreint d'Hermes (`integrations/hermes-gmail/`) est le prérequis de la phase 5.
- Résumé du jour, retours du 2026-11-04 sur le téléphone (1.10.1) :
  - Voix : la lecture de secours (`TextToSpeech` du système) doit pouvoir être Piper : proposer de télécharger une voix Piper à la demande depuis le bouton « Écouter », au lieu de lire avec la voix du téléphone. Vérif : sans voix installée, « Écouter » propose Siwis ou Tom, la télécharge, puis lit le résumé avec elle.
  - Retour au toucher : un bouton touché (cercle « C'est fait », pastille de date, Oui / Non / Préciser, Utile / Bruit) ne change rien à l'écran ; la ligne reste identique. Il faut un retour immédiat : état pressé, ligne cochée ou barrée, carte qui se replie, snackbar d'annulation. Vérif : chaque geste change visiblement la ligne en moins de 100 ms.
  - Notification de lecture : la barre du lecteur s'affiche sous les boutons de navigation Android. La placer au-dessus (insets de navigation, `WindowInsets.navigationBars`). Vérif : avec la navigation à 3 boutons et par gestes, la barre reste entièrement visible.
  - Le soir : le résumé du matin reste affiché toute la journée, alors qu'il arbitre la matinée. Le soir, montrer un autre résumé, le bilan du soir de la phase 6 (`ai_wrap_up` existant, `WrapUpCard`) : ce qui a été fait, ce qui glisse à demain, la soirée restante. À définir : l'heure de bascule (réglage), et si le bilan se génère lui aussi par le moteur sans IA. Vérif : après l'heure de bascule, la carte d'Aujourd'hui et l'écran ouvrent le bilan du soir ; le résumé du matin reste consultable.
- Sécurité : `users.telegram_bot_token` est stocké en clair et renvoyé en entier au navigateur
  (`backend/models/user.js`, `PROFILE_UPDATE_ATTRIBUTES` de `users/repository.js`). Le chiffrer avec `secretCipher` (migration des valeurs existantes) et ne renvoyer que les 4 derniers caractères, comme `ai_api_key`. Vérif : la colonne commence par `enc:v1:`, `GET /api/profile` ne contient plus le jeton, le bot Telegram répond toujours.
- PostgreSQL : `npm run db:migrate` après `db-prepare.js` voit 204 migrations en attente
  (umzug n'en lit que 21 dans `SequelizeMeta`) et rejoue d'anciennes migrations qui contiennent des `PRAGMA` (`safeRemoveColumn`, `safeChangeColumn` de `migration-utils.js`). Antérieur au résumé du jour (ses 4 migrations passent sur PG 16, rejouées deux fois). Aucun test ne lance les migrations sur PG. Vérif : base PG vide → `db-prepare.js` → `db:migrate` deux fois sans erreur, `migration:status` à jour.
- Fusionner l'amont (`chrisvel/tududi`) chaque semaine
  (dernière synchro : `eda9aa60`, v1.14.0 ; vérifié le 2026-11-01 : rien de neuf).
- Parité web → Android (inventaire du 2026-11-04 ; absent du code Android)
  (1) « Nouvelle note » depuis la page projet ; (2) commentaires de tâche ; (3) pièces jointes tâche et projet ; (4) relations entre tâches ; (5) personne assignée ; (6) vues enregistrées ; (7) Kanban, chronologie, calendrier de projet ; (8) modèles de projet ; (9) partage public de note ; (10) agendas ICS/CalDAV abonnés. Chaque point porte des données : passer par `backend/modules/sync/`. Vérif par point : créé sur le web, visible et modifiable hors ligne sur Android, retour sur le web.
- Parité Android → web
  triage des liens (Tester, Rattacher, Reporter, Jeter) sur la carte de l'Inbox, recherche des liens, revue rapide une idée à la fois. Vérif : mêmes gestes sur le web à 390 px et en bureau. Sans équivalent web (par nature) : widgets, Health Connect, agendas de l'appareil.
- `docs/fork/CADENCE-PARITY.md`
  aucune case cochée sur 64 ; le remettre à jour ou le remplacer par ces deux entrées.

## Ideas
