# AGENTS.md — Cadence

## Quoi

Cadence : un seul système personnel (tâches, projets, habitudes, notes, capture) sur le web, Android et Linux (client Tauri 2 dans `desktop/`), auto-hébergé sur Unraid et joint via Tailscale, sans IA obligatoire. Le web (donc le client Linux) et Android marchent hors ligne puis se réconcilient. Fork MIT de [chrisvel/tududi](https://github.com/chrisvel/tududi) (origin : `PreciselyWrong/cadence`) ; l'attribution et la licence de l'amont restent.

- Serveur et web : React 18 + TypeScript (webpack, Tailwind, Zustand + SWR) ; Express + Sequelize ; SQLite par défaut ou PostgreSQL via `DATABASE_URL`. Dev : deux serveurs (front `:8080` proxifie `/api` vers back `:3002`) ; prod : Express sert `/dist`.
- Android : `android/` (ex-dépôt Cadence, historique importé) : Kotlin, Compose, Room, widgets Glance ; habitudes, tâches, notes et pages de projet synchronisées hors ligne avec le serveur (`/api/v1/sync`).

Fichiers propres au fork : `AGENTS.md`, `TODO.md`, `README.md`, `docs/fork/`, `android/`, pages de comportement ajoutées dans `docs/`. Le guide de l'amont (index des docs, architecture) est dans `docs/fork/UPSTREAM-GUIDE.md`.

## Règles du fork (`docs/fork/FORK.md`)

- tenir à jour le README et le tableau des fonctionnalités du fork dans `docs/fork/FORK.md` à chaque changement du fork ;
- mettre à jour la page `docs/*.md` correspondante à chaque changement de comportement ;
- ajouter chaque nouvelle chaîne d'interface dans les 26 `public/locales/*/translation.json` ;
- donner à chaque migration un horodatage unique et vérifier la mise à niveau sur SQLite et PostgreSQL ;
- lancer les vérifications complètes (tests backend, tests frontend, typecheck, lint, build) avant de pousser ;
- tout sur `main`, un commit par étape vérifiée ; une branche seulement pour un essai risqué, supprimée une fois fusionnée ;
- parité web ↔ Android : toute fonctionnalité ajoutée d'un côté est livrée de l'autre dans la même étape, ou inscrite dans `TODO.md` (`Now`) avec la raison et la vérif attendue ; elle est synchronisée avec le serveur (`backend/modules/sync/`) quand elle porte des données ; dans le même commit, mettre à jour ce `AGENTS.md` (`Quoi`, `Carte`, `État`), `android/AGENTS.md`, `docs/fork/FORK.md` et `docs/fork/WEB-UX-NOTES.md` si l'UI web change ;
- TickTick sert de référence de comportement uniquement : jamais son code, ses ressources ni ses textes.

## Lire selon la tâche

| Tâche | Lire |
|---|---|
| Objectif, décisions, pièges, références | `docs/fork/DECISIONS.md` |
| Feuille de route | `TODO.md` (`Now`, `Next`, `Ideas`) |
| Guide de l'amont, index des docs | `docs/fork/UPSTREAM-GUIDE.md` |
| Fonctionnalités du fork, synchro amont | `docs/fork/FORK.md` |
| Décisions UX à reporter entre web et Android | `docs/fork/WEB-UX-NOTES.md` (web → Android), `docs/fork/ANDROID-UX-NOTES.md` (Android → web) |
| Clients Android/Linux, plan de synchro | `docs/fork/PLAN-clients-sync.md`, `docs/fork/CADENCE-PARITY.md` |
| Client Linux (Tauri, tray, ajout rapide) | `docs/fork/DESKTOP.md`, `desktop/AGENTS.md` |
| Notifications, heures calmes, rappels | `docs/36-notifications.md` |
| Synchronisation hors ligne (API) | `docs/30-offline-sync.md`, `backend/modules/sync/` |
| Web hors ligne (service worker, client Linux) | `docs/fork/WEB-OFFLINE.md`, `public/sw.js` |
| App Android | `android/AGENTS.md` (règles des habitudes, widget, ⛔ propres à l'app) |
| Interface web, UX à reprendre sur Android | `docs/fork/WEB-UX-NOTES.md` (journal à compléter à chaque changement d'UI web) |
| Architecture, requêtes, auth | `docs/architecture.md` |
| Nouveau module backend, repository | `docs/backend-patterns.md`, `docs/code-conventions.md` |
| Modèle, migration, SQLite/Postgres | `docs/database.md`, `docs/16-postgresql.md`, `docs/backups.md` |
| Tests | `docs/testing.md` |
| Tâches récurrentes | `docs/01-recurring-tasks-behavior.md` (avant de toucher `backend/modules/tasks/recurringTaskService.js` ou `taskScheduler.js`) |
| Habitudes | `docs/fork/DECISIONS.md`, `docs/21-habits.md` (section « Cadence habits » = contrat de synchro et d'API), `fixtures/habits/README.md`, `backend/modules/habits/`, `android/domain/` |
| Aujourd'hui / plan du jour | `docs/02-today-page-sections.md`, `docs/20-daily-plan.md` |
| Partage, droits, groupes | `docs/08-user-management.md`, `docs/18-user-groups.md`, `docs/19-people-and-roles.md` |
| File « À trier » | `docs/40-triage.md`, `backend/modules/triage/` |
| Cartes Mail de « À trier » | `docs/43-mail-triage.md`, `backend/modules/triage/mail.js` |
| Classement automatique (nouvelles tâches et notes) | `docs/41-auto-classify.md`, `backend/modules/auto-classify/` |
| Liens : capture en tâche, aperçus, pages de projet, Transformer en projet | `docs/37-links.md`, `backend/modules/links/` |
| Markdown des notes et descriptions, liens `[[…]]`, mentions, rétroliens | `docs/44-notes-links.md`, `backend/modules/content-links/` |
| Plan (outliner) des notes et descriptions | `docs/45-outliner.md`, `frontend/components/Note/editor/outline.ts` |
| Projets depuis des `TODO.md` | `docs/35-todo-md-projects.md`, `backend/modules/todo-md/` |
| MCP | `docs/14-mcp-integration.md` |
| Plugins (intégrations hors de l'app, Hermes) | `docs/46-plugins.md`, `backend/modules/plugins/` |
| MCP distant (connecteur claude.ai, OAuth, Cloudflare) | `docs/38-remote-mcp.md`, `backend/modules/oauth/` |
| PR ou issue vers l'amont | `docs/MEMORY.md`, `.github/pull_request_template.md` |

## Commandes

```bash
npm install
npm run db:init            # première installation
npm start                  # front :8080 + back :3002
npm run lint               # eslint front + back
npm run format:fix         # prettier front + back
npm test                   # Jest backend (ciblé : cd backend && npx jest -w 2 <fichier>)
npm run backend:test:unit
npm run backend:test:integration
npm run backend:test:upgrade   # parité de schéma, fixtures legacy
npm run frontend:test      # Jest + RTL ; filtrer : npm run frontend:test -- TaskItem
npm run test:ui            # Playwright E2E
npm run build              # tsc --noEmit + webpack -> dist/
npm run pre-push           # lint-staged sur le diff indexé
npm run migration:create   # puis npm run db:migrate
npm run migration:status
cd android && ./dev.sh --test   # tests du domaine Android (JDK 21 Temurin)
cd android && ./dev.sh          # build debug + installation ADB (--dummy, --plan)
```

Tests Postgres : `DATABASE_URL=... npm run backend:test:pg`. Module tâches Android : `JAVA_HOME=/usr/lib/jvm/temurin-21-jdk $JAVA_HOME/bin/java -cp gradle/wrapper/gradle-wrapper.jar org.gradle.wrapper.GradleWrapperMain :tasks:testDebugUnitTest :app:assembleDebug` depuis `android/` (le `gradlew` versionné ne marche pas sous Linux).

## Carte

- `backend/modules/<feature>/` : `routes.js` → `repository.js` → `operations/`, `core/` (serializers, builders, parsers).
- `backend/models/`, `backend/migrations/` : schéma Sequelize ; helpers `backend/utils/migration-utils.js`.
- `backend/middleware/authorize.js` : `hasAccess(level, resourceType, getResourceUid)`, droits hérités du projet.
- `backend/modules/tasks/` : tâches, récurrence (`recurringTaskService.js`, `taskScheduler.js`, `operations/moveOccurrence.js`) ; origine d'une tâche (`core/source.js` : `source`, `source_url`, héritage depuis l'Inbox) ; badge web `frontend/components/Shared/TaskSourceBadge.tsx`, `frontend/utils/taskSource.ts`.
- `backend/modules/sync/` : synchro hors ligne (registre d'entités, journal, HLC, compaction quotidienne `compaction.js`, `410 reset_required`) ; `backend/modules/habits/cadence/` : habitudes Cadence (schéma `schema.js`, moteur JS des règles, routes `/api/cadence/*`, import des anciennes) ; les écrans web des habitudes passent déjà par `/api/cadence/*` (`frontend/utils/cadenceHabitsService.ts`) ; l'ancien module des habitudes-tâches (`/api/habits`, moteur, rappels, `habitsService.ts`) est retiré ; les colonnes `tasks.habit_*` restent et les tâches `habit_mode` sont importées au démarrage puis exclues de toutes les listes de tâches. Fixtures partagées avec Android : `fixtures/habits/`.
- `backend/modules/triage/` : file « À trier » (règles dans `core/items.js` et `core/rules/`, entrée lue par `collect.js`, réglages `settings.js` gardés sous `ui_settings.brief`, contextes liés `contexts.js` (table `linked_contexts`), décisions dans la table `task_triage`, actions par les outils MCP ; cartes Mail proposées par un agent `mail.js`, `core/mail.js`, table `mail_items`, archivage Gmail optionnel `mailGateway.js`, rendez-vous accepté remis à l'agent par l'événement `mail.decided` et `report_mail_event`, `docs/43-mail-triage.md`) ; web `frontend/components/Triage/` (paquet « Trier mes mails » `MailDeck.tsx`, règles `mailDeck.ts`), Android `ui/triage/` (`MailDeckScreen.kt`, règles `triage/MailDeck.kt`).
- `backend/modules/auto-classify/` : classement automatique des nouveaux éléments (une tâche rangée sans moment garde `tasks.needs_when` et reste dans Inbox › « Tâches à classer » avec « Quand ? », `GET /tasks?type=unsorted` ; worker réveillé par le journal de synchro `worker.js`, règles pures `core/`, appel au fournisseur de l'Assistant IA `model.js`, écritures par les outils MCP `writer.js`, cartes `suggestions.js` versées dans « À trier », journal et annulation `service.js`, réglages `settings.js`, tables `auto_classify_*`) ; web `frontend/components/AutoClassify/`, Profil › Classement ; Android `tasks/autoclassify/`.
- `backend/modules/links/` : un lien vit dans une tâche ou dans les pages d'un projet (table `links`, `project_id` exigé par le code) ; capture en tâche nommée par le genre de page (`core/taskName.js`, `GET /links/lookup` « Déjà dans », `POST /links/task`), cache d'aperçus par adresse (`previews.js`, table `link_previews`), lecture des pages `jobs.js`, GitHub `core/github.js`, vérification des pages `check.js`, routes `/projects/:uid/pages` ; lignes et cartes de tâches-liens (icône et nom du site, image de la page) : web `frontend/components/Links/taskLink.ts`, `LinkMarks.tsx`, Android `links/TaskLinks.kt`, `ui/LinkMarks.kt` ; « Transformer en projet » `backend/modules/tasks/operations/toProject.js`, projets dormants `review/service.computeDormantProjects` ; web `frontend/components/Project/ProjectPages.tsx`, `Links/LinkPreviews.tsx`, panneau `Inbox/InboxItemDetail.tsx` ; Android `ui/ProjectPages.kt`, `ui/ShareSheet.kt`, `links/LinkKinds.kt` ; add-on `integrations/firefox-addon/`.
- `backend/modules/content-links/` : liens internes des notes et descriptions (`[[Titre]]`, `[[task:Nom]]`, `@[Nom](person:uid)`, chemins `/note|task|person/<uid>` ; parseur `core/parse.js`, miroir web `frontend/utils/markdownLinks.ts`), rétroliens calculés à la lecture (`GET /api/note|task|people/:uid/backlinks`, aucune table) ; web : rendu unique `frontend/components/Shared/MarkdownRenderer.tsx`, puces `ContentLinkChips.tsx`, section `Backlinks.tsx` ; édition en plan (outliner) : règles pures `frontend/components/Note/editor/outline.ts`, liaison CodeMirror `outlineEditor.ts`, repli par lecteur `outlineFolds.ts` (`docs/45-outliner.md`).
- `backend/modules/plugins/` : plugins chargés depuis `TUDUDI_PLUGINS_DIR` (manifeste et réglages purs `core/`, exécution `registry.js`, bus d'événements `eventBus.js` alimenté par `webhooks/dispatcher.js`, routes admin + `/api/plugins/:id/x/*`, table `plugins`, boutons d'en-tête `core/actions.js` sur Plan, Aujourd'hui, Inbox, projet, À trier) ; web `frontend/components/Profile/tabs/PluginsTab.tsx`, `Plugins/PluginPage.tsx` ; Android voir `android/AGENTS.md`.
- `backend/modules/mcp/` : serveur MCP (`npm run mcp:start`), servi aussi à `/mcp` ; `backend/modules/oauth/` : serveur d'autorisation OAuth intégré pour les connecteurs distants (actif si `TUDUDI_PUBLIC_MCP_URL`, fenêtre d'appairage `pairing.js` ouverte depuis Profil › MCP, `docs/38-remote-mcp.md`).
- `backend/modules/daily-plan/` : plan du jour, temps de concentration et leurs exceptions (`ui_settings.planning`, règle `slots.js` `focusBlocksOn`, partagés avec Android par `/api/v1/daily-plan/focus-blocks`).
- `backend/modules/todo-md/` : un projet suit au choix un fichier `TODO.md` (`TUDUDI_TODO_ROOT`, ou dépôt git) ; seules les tâches `code` y vont et en viennent, le fichier fait foi pour leur nom, leur note, leur case et leur projet (`policy.js`, le reste est à Cadence ; écriture atomique : ajout, case cochée) ; `scripts/todo-md-sync.sh` copie ces seuls fichiers vers le dossier monté.
- `frontend/components/Today/` : page Aujourd'hui (liste du jour + calendrier 1/3/7 jours) ; données `GET /api/daily-plan/day`, écritures `PATCH /api/daily-plan/:date` (ops, ETag, `backend/modules/daily-plan/ops.js`, membres du jour `day.js`) ; règles pures `dayModel.ts` ; ancienne page `DailyPlan/TodayPage.tsx` par `?classic=1`. Primitives `Shared/ui/Button.tsx`, `Menu.tsx`, `PageHeader.tsx`, `ListRow.tsx` (lignes à deux niveaux, `countsLine` sans zéro), `Segmented.tsx`, `SearchField.tsx` : toutes les pages du bureau les utilisent (`docs/fork/DESIGN-TOKENS.md`) ; une seule fiche de tâche flottante sur toutes les pages (`Task/TaskPane.tsx`, `?task=`) ; barre latérale en îlot sombre (`.sidebar-island`).
- Plan web : boîte « À planifier » `frontend/components/Upcoming/ToPlanBox.tsx`, règle `toPlan` (`horizons.ts`) ; couleurs des pastilles de la fiche `frontend/components/Task/chipTones.ts` ; `PATCH /task` `unplan: true` → `backend/modules/daily-plan/service.js` `takeTaskOffPlansFrom` ; bande « En retard » : menu « Replanifier ▾ », règle « Étaler sur 7 jours » `Upcoming/spreadOverdue.ts` (cas partagés avec Android `fixtures/plan/`), boutons du lieu de plugin `overdue`.
- Android Planifier (ex « À venir ») : `android/tasks/.../ui/PlanTab.kt`, règles pures `planning/PlanBoard.kt` (membres des jours, horizons, écritures du plan), plans des 14 jours gardés dans `PlanSlotsStore`.
- `frontend/components/<Feature>/` : React ; `frontend/store/useStore.ts` (Zustand) ; `frontend/utils/*Service.ts` (appels API).
- `public/locales/<lang>/` : traductions i18next (26 langues, base `en`).
- `integrations/firefox-addon/` : add-on Firefox (jeton d'API) : la page devient une tâche ; « Envoyer au projet » (onglet ou groupe d'onglets), « Ouvrir le projet » (ses pages dans un groupe d'onglets).
- `desktop/` : client Linux Tauri 2 (`src-tauri/`, coque mince autour du serveur ; `docs/fork/DESKTOP.md`).
- `public/sw.js` + `public/offline-core.js` : web hors ligne (coquille pré-cachée, réponses en cache + écritures en attente, file rejouée avec l'heure d'édition `X-Cadence-Offline-Clock`, `backend/middleware/offlineReplay.js`) ; page `frontend/utils/offlineService.ts`, pastille `frontend/components/Offline/` ; `docs/fork/WEB-OFFLINE.md`.
- `android/` : `domain/` (règles des habitudes, Kotlin pur), `data/`, `tasks/` (tâches synchronisées), `app/`.
- Remise de tâche depuis Proches (Android seul) : `android/tasks/.../handoff/`, contrat et sécurité dans `docs/42-proches-handoff.md`.
- Android `tasks/ui/LinkedText.kt` : liens ouvrables dans les titres et notes de tâches et les titres de notes, avec édition explicite.
- `e2e/` : Playwright ; `scripts/` : dev, Docker, versions, sauvegardes Postgres.

## ⛔ Interdits

- ⛔ Renommer les identifiants techniques hérités (`TUDUDI_*`, noms de base, cookies, clés de stockage, préfixe `tt_`) — casse les déploiements existants et chaque fusion de l'amont ; seul le nom affiché devient Cadence.
- ⛔ Retirer `LICENSE` ou la mention de l'amont — licence MIT de tududi.
- ⛔ Appeler `queryInterface.createTable/addColumn/addIndex` directement dans une migration — utiliser les `safe*` de `backend/utils/migration-utils.js` : les migrations doivent être idempotentes (installs neuves créées par `sync()`) et tourner sur SQLite et Postgres.
- ⛔ `PRAGMA`, `sqlite_master`, `AUTOINCREMENT`, booléens `0`/`1` dans une nouvelle migration — Postgres ne rejoue pas ce SQL (voir `docs/database.md`).
- ⛔ Modifier une migration déjà publiée — les bases existantes ne la rejouent pas.
- ⛔ Code spécifique au moteur SQL hors `backend/utils/db-dialect.js` — un seul point de bascule SQLite/Postgres.
- ⛔ Accéder aux modèles Sequelize depuis `routes.js` — passer par le repository du module.
- ⛔ Lire les droits partagés via `Permission` seul — utiliser `permissionSources` (les droits de groupe sont dans `group_permissions`).
- ⛔ `fetch` ad hoc dans un composant — passer par `frontend/utils/*Service.ts`.
- ⛔ Tableaux de couleurs locaux — `PALETTE` de `frontend/constants/colorPalette.ts`, via `ColorPicker`.
- ⛔ Livrer une fonctionnalité sur le web seul ou sur Android seul sans l'équivalent de l'autre côté ni entrée dans `TODO.md` — Cadence est un seul système ; les deux clients doivent rester équivalents et ce fichier à jour.
- ⛔ Lancer `npm`, ou `git` hors clone/pull demandé par un admin, pour un plugin ; activer un plugin cloné sans qu'un admin l'ait allumé ; ou activer les plugins en mode hébergé — du code exécuté dans le serveur.
- ⛔ Éditer `dist/` — généré par `npm run build`.
- ⛔ Corriger un bug sans test qui l'aurait détecté — exigence de `docs/testing.md`.
- ⛔ Lancer toute la suite Jest d'un coup — elle a saturé la mémoire de la machine ; cibler les fichiers avec `-w 2`.
- ⛔ Basculer la prod vers Postgres par-dessus une base SQLite remplie — le serveur refuse ; passer par export puis import.
- ⛔ Monter `~/Dev` dans un conteneur pour lire les `TODO.md` — exposerait des secrets ; passer par un dossier dédié (`scripts/todo-md-sync.sh`) ou par Git.
- ⛔ Écrire une référence privée dans un fichier versionné (chemins personnels, noms d'hôtes ou adresses internes, e-mails, identifiants, noms de dépôts privés) — le dépôt est public ; garder ces valeurs dans `.env` ou la base, et utiliser des exemples génériques.
- ⛔ Emojis, footer « Generated with Claude Code » ou trailer `Co-authored-by` dans une PR ou un commit destiné à l'amont — préférences du mainteneur (`docs/MEMORY.md`).

## État

Monorepo Cadence (web, serveur, Android, Linux) sur `main`, poussé, à jour de l'amont v1.14.0 (`eda9aa60`) ; tout `TODO.md` livré le 2026-11-01 sauf la refonte TickTick ; pas encore de remote `upstream` local. Serveur vérifié sur SQLite et PostgreSQL 16 (`docs/16-postgresql.md`). Android 1.28.0 (versionCode 90, style du bureau repris : cases rondes, étiquettes par usage, « Tâches à classer » limitée à cinq ; 1.27.1 : agendas réglés par une seule liste partagée par Réglages › Agendas et la feuille « Affichage » de l'Agenda (`settings/CalendarChoices.kt`), engrenage des Réglages sur chaque onglet ; 1.27.0 : Planifier rattrape le web : carte d'un jour envoyée vers un horizon sans perdre son échéance, bande « Plus tard » sous les jours, « Ajouter » de l'Inbox sans échéance, Échues « Replanifier ▾ » avec « Étaler sur 7 jours » (`fixtures/plan/spread-overdue.json`) et boutons des plugins `overdue` ; 1.26.0 : plus d'onglet Boîte : l'Inbox est la section de Planifier, idées décidées sur place ; 1.25.0 : horizons dans le choix de date, « À planifier » sous l'Inbox de Planifier (règle `PlanBoard.toSchedule`), pastilles de la fiche colorées par valeur ; 1.24.0 : liens visuels : icône et nom du site à la place de l'adresse, image de la page sur les lignes de tâches et les pages de projet, `links/TaskLinks.kt`, `ui/LinkMarks.kt` ; 1.23.1 : vrais favicons sur la pastille d'origine, lus par le serveur `/api/links/favicon` (web aussi) ; 1.23.0 : notifications d'agents regroupées par agent, deux canaux selon le niveau, retirées quand lues ailleurs (`notification_read`) ; 1.22.0 : « Répondre » en texte libre sur les notifications d'agents, réponses d'« À trier » vers `/triage/answers` (Room v23), Réglages › Agents retiré ; 1.21.0 : résumé du jour retiré de l'app (Ma journée, bilan du soir, voix Piper, Room v22) : Hermes le rédige dans la Boîte des agents ; bandeau du dernier message non lu d'un agent en haut des écrans ; 1.20.0 : notifications instantanées des agents : flux du serveur tenu par un service au premier plan, toucher qui ouvre la page du plugin ; 1.19.0 : signature du résumé et profil brouillons de l'agent retirés, comme sur le web ; 1.18.0 : notes et descriptions en plan (barre au-dessus du clavier : retrait, déplacement, repli, zoom, case, puce → tâche liée ; replis par appareil, case liée à la tâche), barre de mise en forme complète, choix `@` (personnes lues en ligne) et `[[`, cibles inconnues créées depuis leur puce ; 1.17.0 : carte Mail d'« À trier » ; 1.16.0 : Planifier en une colonne (Inbox, Échues, 14 jours, Horizons, `month_of` en Room v18), plan du jour sans toucher l'échéance, « Masquer les terminées », Aujourd'hui rangé à la poignée, frise de Ma journée déplaçable, Markdown, puces de liens et rétroliens, badge d'origine (Room v19), lien seul dans l'ajout rapide, tâches TODO.md modifiables ; 1.15.2 : lien Gmail ouvert sur le mail dans le navigateur (site mobile) ; 1.15.1 : lien Gmail : recherche copiée puis Gmail ouvert ; 1.15.0 : remise de tâches depuis Proches ; 1.14.6 : « + » des widgets qui ouvre le clavier ; 1.14.5 : liens suivis d’un caractère invisible reconnus ; 1.14.4 : adresses à tiret typographique reconnues ; 1.14.3 : liens ouvrables dans les titres et notes de tâches et les titres de notes ; 1.14.2 : « Quand ? » dans « Tâches à classer », « À trier (N) » dans l'Inbox, liens à revoir, notifications de classement à jour ; 1.14.1 : bandeau de la dernière erreur d'IA ; 1.14.0 : classement automatique : cartes d'« À trier », notifications à boutons, mention et Réglages › Organisation › Classement ; 1.13.0 : fiche de partage, tri unique de l'Inbox, liens À voir / Archivé ; 1.12.5 : liens seulement par « Ajouter aux liens », tâche de l'Agenda qui s'ouvre ; bannière de projet, Room tâches v15 ; 1.12.0 : Ma journée, À trier, habitudes au prorata, liens par thèmes ; un projet peut suivre un `TODO.md` choisi, verrou par tâche, Room tâches v16 ; 1.11.2 : résumé : Priorités du jour, charge jour + soir en heures, « Autre date », échéance unique ; 1.11.1 : bilan du soir : « … » Demain / Choisir une date / Plus tard / Abandonner, avis « Pas utile » ; 1.11.0 : bilan du soir, voix Piper seule, Room tâches v13 ; 1.10.1 : APK publié en arm64 seul ; 1.10.0 : voix Piper sur le téléphone pour le résumé ; 1.9.2 : notes dans la page projet ; 1.9.1 : ajout rapide des widgets = saisie complète de l'app ; 1.9.0 : résumé du jour et Room tâches v12 ; 1.8.2 : « Cocher une fois passé » par agenda ; 1.8.1 : rappels qui sonnent en veille ; 1.8.0 : passe de soustraction : titre-sélecteur de listes, Aujourd'hui sans cartes, une couleur par ligne, fiche terminée par sa case ; web à reprendre, `TODO.md` › Next ; plages protégées et exceptions partagées avec le web ; épure web et Android, Room tâches v11 : conflits, appels différés, `review_at` des liens) publié sur NicoApps : tâches, habitudes, revue, objectifs, rappels, liens et tags imbriqués synchronisés, hors ligne complet avec conflits, notifications des tâches à heure fixe et des événements d'agenda ; migrations Room testées sous Robolectric, synchro hors ligne vérifiée sur l'émulateur `nico35` (rien d'essayé sur le téléphone). Épinglés en tête : bloc ouvert en haut de la barre latérale web, en tête du sélecteur de listes de Tâches sur Android (titre « Aujourd'hui ▾ ») (étiquettes épinglées : web seulement, `TODO.md`). Client Linux livré (raccourci par le portail Wayland). Le `gradlew` d'`android/` est exécutable dans l'arbre de travail (mode non commité) : le piège Linux d'`android/AGENTS.md` est à revérifier. Classement automatique des nouveaux éléments dans le serveur le 2026-11-07 (`docs/41-auto-classify.md`), à la place du job Hermes `cadence-classify`. Revue UX du 2026-11-06 livrée (`docs/40-triage.md`, `docs/37-links.md`, `docs/39-daily-brief.md`). Remise de tâches depuis Proches sur Android (2026-11-09, `docs/42-proches-handoff.md`, vérif sur téléphone à faire). Web et client Linux hors ligne par le service worker (2026-11-12, `docs/fork/WEB-OFFLINE.md`, vérif dans le client à faire). Icône de la source sur les tâches (2026-11-12, `docs/00-tasks-behavior.md`) et lien seul dans la saisie (Boîte de réception / Tâche / Liens / Note), web et Android (1.16.0, vérif sur le téléphone à faire). Cartes Mail dans « À trier » (serveur, web et Android 1.17.0 le 2026-11-12, `docs/43-mail-triage.md`). Refonte des liens fusionnée sur `main` (`docs/fork/PLAN-links.md`, 2026-11-12) : plus de bibliothèque de liens ; une adresse devient une tâche nommée par le genre de page, ou une page d'un projet ; aperçus par adresse, « Transformer en projet », projets dormants, reprise des anciens liens par migration ; Android Room v20 (vérif sur téléphone à faire). Refonte des liens (`docs/fork/PLAN-links.md`, 2026-11-12) : plus de bibliothèque de liens ; une adresse devient une tâche nommée par le genre de page, ou une page d'un projet ; aperçus par adresse, « Transformer en projet », projets dormants, reprise des anciens liens par migration ; Android Room v21. Résumé du jour retiré du serveur et du web le 2026-11-12 (`docs/39-daily-brief.md`, remplacé par les messages des agents Hermes) : ses règles, contextes liés et réglages servent « À trier » (Profil › À trier) ; colonnes et tables laissées inutilisées (`docs/database.md`). Page Inbox du web retirée le 2026-11-13 : l'Inbox vit dans la colonne de Plan (panneau d'idée sur place `Inbox/InboxIdeaSheet.tsx`, actions `Inbox/useInboxIdeaActions.tsx`, « À trier » et « Trier » dans l'en-tête), `/inbox` mène à Plan sauf `?triage=1`. « Trier mes mails » en paquet de cartes plein écran dans « À trier » (2026-11-13, web et Android, `docs/43-mail-triage.md`) : conseil de l'agent en gros bouton, annulation, clavier et glissements, décision `event` (rendez-vous) remise à Hermes ; côté Hermes construit le même jour (dépôt Hermes : cartes proposées à 6 h 30, rendez-vous créés par capgw `mail_events_sync` sans IA ; plugin 2.5.0 : « Discuter »), à déployer. Prochaine étape : `Now` de `TODO.md`.
