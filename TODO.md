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
  - Hermès « capture » : bot Telegram chez BotFather, `TELEGRAM_BOT_TOKEN` dans `/opt/data/profiles/capture/.env` ; classement automatique en pause (`hermes -p capture cron resume b8875182300b` pour le relancer). Enrichissement des liens : job `cadence-enrich` chaque nuit à 03:30.
  - Brancher le téléphone en ADB (aucun appareil le 2026-11-02) pour installer le build debug du jour. Vérif : ouvrir une tâche depuis le widget, aller dans Inbox puis revenir dans Tâches (rien ne se rouvre) ; long titre dans l'ajout rapide (passe à la ligne) ; « Afficher tout » sur une longue idée ; titre « Aujourd'hui ▾ » qui ouvre Listes (épinglés, domaine) ; case de la fiche pour terminer.
  - Annuler la série « 📅 Weekly Planning » (doublon de « Revue hebdo »).
  - PR à l'amont : ouvrir d'abord les issues de discussion (`docs/fork/upstream-prs/task-ics-feed.md`, `calendar-views.md`), puis envoyer les PR préparées dans `../cadence-upstream-*`.
  - Refonte TickTick, étape 4 (faite le 2026-11-01 sans voir TickTick, accès refusé) : comparer à l'écran avec TickTick 8.0.20 le calendrier de Cadence (ordre des tâches sans heure, Demain / Semaine prochaine dans l'agenda d'Aujourd'hui, dépôt au quart d'heure) et signaler les écarts.
  - Traductions : relecture par des locuteurs natifs des 22 langues hors fr/en/ja/ko (traduites automatiquement le 2026-11-01, pluriels slaves ajoutés).
- Bilan du soir sur Android (parité du web, 2026-11-04)
  écran du bilan après `evening.switchTime` (fuseau du profil), `GET /daily-plan/:date/evening`, « Reporter à demain » (annulation par retrait du plan de demain), réglage `Bilan du soir` ; contrat `docs/39-daily-brief.md` § Evening review, écarts web dans `docs/fork/WEB-UX-NOTES.md` (2026-11-04). Vérif : mêmes quatre sections et mêmes compteurs que le web pour une même journée sur le serveur de test, puis passage à 18:00 sur le téléphone.
- Aujourd'hui sur Android : glisser-déposer pour ranger
  Web : glisser une ligne. Android : seulement Monter et Descendre dans le menu, car le glissé entre en conflit avec le balayage des lignes et ne peut pas se vérifier ici (téléphone en `unauthorized` sur ADB, émulateur en panne). Vérif : sur le téléphone, ranger trois tâches au doigt sans déclencher de balayage ; l'ordre se retrouve sur le web.
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

## Next

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
