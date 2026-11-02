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
  - Brancher le téléphone en ADB (aucun appareil le 2026-11-02) pour installer le build debug du jour. Vérif : ouvrir une tâche depuis le widget, aller dans Inbox puis revenir dans Tâches (rien ne se rouvre) ; long titre dans l'ajout rapide (passe à la ligne) ; « Afficher tout » sur une longue idée ; pastilles « Épinglés » en haut de Tâches.
  - Annuler la série « 📅 Weekly Planning » (doublon de « Revue hebdo »).
  - PR à l'amont : ouvrir d'abord les issues de discussion (`docs/fork/upstream-prs/task-ics-feed.md`, `calendar-views.md`), puis envoyer les PR préparées dans `../cadence-upstream-*`.
  - Refonte TickTick, étape 4 (faite le 2026-11-01 sans voir TickTick, accès refusé) : comparer à l'écran avec TickTick 8.0.20 le calendrier de Cadence (ordre des tâches sans heure, Demain / Semaine prochaine dans l'agenda d'Aujourd'hui, dépôt au quart d'heure) et signaler les écarts.
  - Traductions : relecture par des locuteurs natifs des 22 langues hors fr/en/ja/ko (traduites automatiquement le 2026-11-01, pluriels slaves ajoutés).
- **Quand le besoin se montre.**
  - Parité, venus de l'amont et web seulement : quitter un partage, choisir qui reprend les tâches d'un membre retiré ; Android n'a pas d'écran de partage.
  - Fixtures dorées des habitudes : compléter (abstinence, alcool, aperçus, questions apprises, semaine) quand le web en a besoin.
  - Étiquettes épinglées sur Android : le web les montre dans « Épinglés », Android non, car `pinned` des étiquettes n'est pas gardé dans Room (colonne et migration à ajouter). Vérif : une étiquette épinglée sur le web apparaît en pastille en haut de Tâches.
  - Fiche d'événement ICS sur Android : Android n'a pas d'agendas abonnés (ICS), seulement ceux de l'appareil.
- Hors périmètre volontaire : limite de projets actifs (compteur seulement). V/E/M/D abandonné le 2026-11-01 : le planificateur Hermès arbitre ; valeurs et grille archivées dans la note Cadence « Archive V/E/M/D » et `~/Documents/cadence-archives/`.

## Next

- Fusionner l'amont (`chrisvel/tududi`) chaque semaine (dernière synchro : `eda9aa60`, v1.14.0 ; vérifié le 2026-11-01 : rien de neuf).

## Ideas
