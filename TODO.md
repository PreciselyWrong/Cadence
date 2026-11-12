# TODO

Décisions, références et pièges du fork : [docs/fork/DECISIONS.md](docs/fork/DECISIONS.md).

## Now

- Android : aperçus sous la description d'un projet. La description de projet n'est ni dans Room ni dans la synchro (`project`) ; à ajouter (colonne, migration, champ synchronisé) avant d'y montrer les cartes. Vérif : une adresse dans la description d'un projet montre sa carte sur le téléphone, hors ligne compris.

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
- Plugins (2026-11-12, web et Android)
  Plugins hors de l'app dans `TUDUDI_PLUGINS_DIR` (`docs/46-plugins.md`, guide `docs/fork/PLUGIN-GUIDE.md`), gérés depuis Profil › Plugins et Réglages › Plugins (Android) : ajout par adresse Git, mise à jour, suppression, réglages, entrée de barre latérale avec page. Plugin Hermes dans le dépôt séparé `cadence-plugin-hermes`. Vérif par toi : `TUDUDI_PLUGINS_DIR` sur Unraid, ajouter le plugin Hermes par son adresse Git, l'allumer avec l'adresse et le secret du webhook Hermes, créer une tâche : Hermes la reçoit ; l'entrée de menu d'un plugin de test s'ouvre sur le web et sur le téléphone ; PostgreSQL : `db:migrate` de `20261112190000-add-plugins`. Limites connues : pas d'entrée de plugin dans le mode minimal de la barre latérale web ; les POST d'une page de plugin n'ont pas de jeton dans la WebView Android ; hauteur de l'iframe web non vue dans un navigateur ; écran Android jamais lancé sur un appareil.
- Remise de tâche depuis Proches (Android seul, 2026-11-09)
  Pas de parité web : entrée inter-applications Android (`docs/42-proches-handoff.md`). Vérif : avec Proches signé sur l'émulateur ou le téléphone, accepter une proposition avec échéance ; la tâche apparaît dans Tâches avec son échéance et part à la synchro ; une seconde remise de la même proposition ne crée pas de doublon ; une autre app appelante est refusée.
- Bilan du soir sur Android (parité du web, 2026-11-04)
  écran du bilan après `evening.switchTime` (fuseau du profil), `GET /daily-plan/:date/evening`, « Reporter à demain » (annulation par retrait du plan de demain), réglage `Bilan du soir` ; contrat `docs/39-daily-brief.md` § Evening review, écarts web dans `docs/fork/WEB-UX-NOTES.md` (2026-11-04). Vérif : mêmes quatre sections et mêmes compteurs que le web pour une même journée sur le serveur de test, puis passage à 18:00 sur le téléphone.
- Un lien seul dans l'ajout rapide Android (livré le 2026-11-12)
  Une adresse seule (avec `#étiquettes`, `+projet`) propose Inbox (d'office) · Tâche · Liens · Note ; Tâche prend le titre de la page, l'adresse en note et en origine ; Liens la garde tout de suite avec « Annuler » ; « Dans les liens » d'emblée sous une tâche ou une note dont l'adresse est déjà gardée ; chaînes mortes retirées. Vérif sur le téléphone : coller `https://exemple.org/page #lecture`, choisir Liens : le lien apparaît dans Liens avec l'étiquette, rien dans l'Inbox ; ajouter un mot : Liens disparaît ; tuer l'app pendant l'« Annuler » d'une décision de l'Inbox : la décision reste.
- Aujourd'hui sur Android : glisser-déposer pour ranger (livré le 2026-11-12)
  Poignée à droite des tâches sans heure (glisser vertical, sans conflit avec les balayages) ; l'ordre est celui du plan du jour (`reorder` / `add` avant une ligne), comme le web ; Monter et Descendre aussi. Vérif : sur le téléphone, ranger trois tâches au doigt sans déclencher de balayage ; l'ordre se retrouve sur le web.
- Android : planifier sans toucher l'échéance (livré le 2026-11-12)
  Reporter, Plus tard, Placer et le tri des échues de Ma journée écrivent le plan (`planning/PlanEdits.kt`, appels différés `PATCH /api/v1/daily-plan/:date`), hook serveur `leaveOnMove` supprimé. Vérif : sur le téléphone, « Reporter » garde l'échéance et la tâche apparaît demain ; « Plus tard » ne vide plus l'échéance.
- Frise du jour déplaçable sur Android (livré le 2026-11-12)
  Ma journée : les créneaux du plan d'aujourd'hui sont sur la frise ; appui long puis glisser = déplacer, par le bord droit = étirer, au quart d'heure (`slot`, `resize`). Les événements de l'appareil restent en lecture (Android n'écrit jamais dans l'agenda). Vérif : sur le téléphone, étirer une tâche ; sa durée se retrouve sur le web.
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
  - [x] Android : badge de source sur la ligne et la fiche, champs `source`/`source_url` dans Room (v19) ; une idée qui n'est qu'une adresse donne `link`. Vérif sur le téléphone : une tâche synchronisée avec `source: gmail` affiche le « M » et ouvre le message.

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
- [x] Android : Planifier (Inbox, Échues, 14 jours, Horizons), « Masquer les terminées » (Aujourd'hui, Planifier) et `tasks.month_of` (Room v18, synchro)
  Une colonne au lieu du tableau, feuille « Planifier » à l'appui long, pas de calendrier à droite. Vérif sur le téléphone : une tâche mise dans « Ce mois-ci » sur le web apparaît dans le même horizon, et inversement ; « Ajouter » d'un jour la prévoit ce jour sans échéance.
- [x] Tâches venues d'un TODO.md : se comportent comme de vraies tâches, sur le web et sur Android
- [x] Style des apps de référence repris sur tout le desktop, pas seulement Aujourd'hui
- [ ] Android : reprendre les décisions du style bureau (2026-11-12)
  Raison : web d'abord ; détail dans `docs/fork/WEB-UX-NOTES.md` (entrée du 2026-11-12, « À reprendre sur Android »). Étiquettes : épinglées puis les plus utilisées ; Projets : statut seulement hors « actif », tâches ouvertes à droite, tri par dernière activité ; Liens : « Ajouter une note » dans le ⋯ ; Inbox : « Tâches à classer » limitée à cinq lignes puis « Tout afficher » ; page projet : avancement en une ligne de texte ; ligne et carte de tâche uniques (case ronde, rouge seulement pour la haute priorité, échéance en pastille « Aujourd'hui / Demain / date », ⋯ au clic droit ou sur la ligne sélectionnée), en-têtes et états vides des pages comme le web. Vérif : mêmes listes sur le téléphone que sur le web avec la même base.
- [ ] Android : horizon « Semaine prochaine » et envoi vers un horizon depuis Jours (2026-11-12)
  Raison : web d'abord ; détail dans `docs/fork/WEB-UX-NOTES.md` (entrée « Planifier : envoyer vers un horizon depuis Jours »). Vérif : une tâche mise dans « Semaine prochaine » sur le web apparaît dans le même horizon sur le téléphone, et inversement ; une carte envoyée depuis un jour garde son échéance et se retire du jour.
- [x] Cases `- [ ]` écrites dans une note : deviennent des tâches liées à la note
- [x] Notes et descriptions éditées en plan (outliner) : puces, Tab avec enfants, repli, zoom, puce → tâche liée (web)
- [x] Android : notes et descriptions en plan (outliner), repli, zoom, puce → tâche liée, case qui suit la tâche
- [ ] Android : Inbox de Planifier à reprendre avec Planifier : « + » crée une tâche, tâches à classer listées avant les idées et glissables sur un jour
  Raison : web d'abord (2026-11-12). Vérif : une tâche ajoutée par le « + » de l'Inbox apparaît dans « Tâches à classer » sur le téléphone.

## Note de l'ajout rapide Android : focus et fermeture [cadence:c7e743d5-3c37-4ee1-812c-f2e134017ddc]

Branche `fix/note-quickadd-focus-c7e743d5`.

- [x] La fiche d'ajout se retire (animation `sheetState.hide()`) avant l'ouverture de l'éditeur de note.
- [x] L'éditeur place le clavier dans le contenu quand la note a déjà un titre (`NoteFocus`, test `NoteFocusTest`), puis ouvre le clavier.
- [ ] Vérifier sur le téléphone (aucun appareil, émulateur bloqué le 2026-11-05) : Tâches › + › Note, titre, Valider → la fiche disparaît, le curseur et le clavier sont dans le contenu.
- [x] Android : Markdown des notes et descriptions (tableaux, cases, code), puces `[[Titre]]`, `[[task:Nom]]`, `@[Nom](person:uid)` et chemins `/note|task/<uid>`, section Rétroliens des notes et des tâches (en ligne)
  Vérif sur le téléphone : une note web avec ces liens se lit pareil, toucher une puce ouvre la note ou la tâche ; une tâche citée dans une note montre la note dans « Rétroliens ».
- [x] Android : création d'une cible inconnue depuis sa puce, choix `@` des personnes, barre de mise en forme complète (lien, code, tableau), rétroliens d'une personne
  Rétroliens d'une personne : web seulement (pas de fiche de personne sur Android, `docs/44-notes-links.md`).

## Next

- Add-on Firefox Cadence signé en non listé (web-ext sign --channel=unlisted, clés AMO dans .env, gecko.id fixe, script publish.ps1 -Sign) pour une installation permanente sans le site de Mozilla.

- Cartes « Mail » dans « À trier » (web et Android)
  Spec : `docs/43-mail-triage.md`. L'agent de tri des mails propose par MCP (`propose_mail`) les fils qui demandent une action ; on décide dans « À trier » : Tâche, Répondre (brouillon dans Gmail), Plus tard, Ignorer, archivage Gmail optionnel par l'outil Gmail restreint. Pas de corps de mail stocké, pas d'envoi. Serveur fait le 2026-11-12 (table `mail_items`, outils MCP, `POST /triage/mail/:uid/decide`, passerelle Gmail `TUDUDI_GMAIL_MCP_*` avec le jeton d'archivage de l'outil Gmail 1.3.0 ; pas d'entité de synchro : file « À trier » + appels différés comme les autres cartes). Web fait le 2026-11-12 (`frontend/components/Triage/MailCard.tsx`). Android fait le 2026-11-12 (1.17.0, `ui/triage/MailCards.kt`). Reste : redéployer l'outil Gmail avec `--archive-token-file`, consigne de l'agent dans Hermes (lire `list_mail_cards`, puis `propose_mail` / `resolve_mail`). Vérif : voir « Checks once built » de la spec.
- Refonte Inbox + Liens (revue du 2026-11-07, web et Android)
  Principe : l'Inbox est le seul endroit où l'on trie ; un lien est une idée avec un aperçu ; la page Liens est la bibliothèque de ce qu'on a gardé.
  - [x] 1. Plus d'enregistrement silencieux dans Liens (`settleInboxItem` retiré le 2026-11-07 ; l'add-on Firefox reste un « Ajouter aux liens » explicite) ; web : la saisie d'un lien seul propose Boîte de réception / Tâche / Liens / Note (2026-11-12).
  - [x] 2. Un seul panneau de tri web pour toute idée (aperçu, étiquettes, projet, Tâche / Liens / Note / Supprimer) ; tâche née d'un lien : adresse en note, « Dans les liens » sous sa description ; `LinkTriageActions`, `LinkSorter` et les décisions Garder / À tester / Rattacher / Plus tard retirés.
  - [x] 3. Statuts `new` (À voir) et `dropped` (Archivé), « Plus tard » = `review_at` (migration `20261107120000-links-two-statuses`) ; synchro et MCP (`create_link` avec projet et source, `process_inbox_item` avec `link_uid`).
  - [x] 4. Page Liens web : liste par défaut, recherche / étiquette / projet / Archivés, ⋯ Modifier / Créer une tâche / Archiver / Supprimer.
  - [x] Android : `Now` › « Un lien seul dans l'ajout rapide Android » (2026-11-12). Vérif sur le téléphone : partager une adresse, lui mettre une étiquette et un projet, en faire une tâche en moins de 4 touchers.
- [x] Web : reprendre la passe de soustraction Android du 2026-11-02 (`docs/fork/ANDROID-UX-NOTES.md`)
  Bureau livré le 2026-11-12 (`docs/fork/WEB-UX-NOTES.md`) ; reste à vérifier à 390 px.
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
  revue rapide une idée à la fois (le tri des liens est commun depuis la refonte Inbox + Liens). Vérif : mêmes gestes sur le web à 390 px et en bureau. Sans équivalent web (par nature) : widgets, Health Connect, agendas de l'appareil.
- `docs/fork/CADENCE-PARITY.md`
  aucune case cochée sur 64 ; le remettre à jour ou le remplacer par ces deux entrées.

## Ideas
