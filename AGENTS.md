# AGENTS.md — Cadence

## Quoi

Cadence : un seul système personnel (tâches, projets, habitudes, notes, capture) sur le web, Android et bientôt Linux, auto-hébergé sur Unraid et joint via Tailscale, sans IA obligatoire. Fork MIT de [chrisvel/tududi](https://github.com/chrisvel/tududi) (origin : `PreciselyWrong/cadence`) ; l'attribution et la licence de l'amont restent.

- Serveur et web : React 18 + TypeScript (webpack, Tailwind, Zustand + SWR) ; Express + Sequelize ; SQLite par défaut ou PostgreSQL via `DATABASE_URL`. Dev : deux serveurs (front `:8080` proxifie `/api` vers back `:3002`) ; prod : Express sert `/dist`.
- Android : `android/` (ex-dépôt Cadence, historique importé) : Kotlin, Compose, Room, widgets Glance ; habitudes locales et tâches synchronisées hors ligne avec le serveur (`/api/v1/sync`).

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
| Clients Android/Linux, plan de synchro | `docs/fork/PLAN-clients-sync.md`, `docs/fork/CADENCE-PARITY.md` |
| Synchronisation hors ligne (API) | `docs/30-offline-sync.md`, `backend/modules/sync/` |
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
| Projets depuis des `TODO.md` | `docs/35-todo-md-projects.md`, `backend/modules/todo-md/` |
| MCP | `docs/14-mcp-integration.md` |
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
- `backend/modules/tasks/` : tâches, récurrence (`recurringTaskService.js`, `taskScheduler.js`, `operations/moveOccurrence.js`).
- `backend/modules/sync/` : synchro hors ligne (registre d'entités, journal, HLC) ; `backend/modules/habits/cadence/` : habitudes Cadence (schéma `schema.js`, moteur JS des règles, routes `/api/cadence/*`, import des anciennes) ; les écrans web des habitudes passent déjà par `/api/cadence/*` (`frontend/utils/cadenceHabitsService.ts`) ; le reste de `habits/` et `frontend/utils/habitsService.ts` sont l'ancien module (tâches `habit_*`), toujours en place, à retirer (voir `TODO.md`). Fixtures partagées avec Android : `fixtures/habits/`.
- `backend/modules/mcp/` : serveur MCP (`npm run mcp:start`).
- `backend/modules/todo-md/` : projets miroirs de fichiers `TODO.md` (`TUDUDI_TODO_ROOT`) ; le fichier fait foi, écriture atomique (ajout, case cochée) uniquement.
- `frontend/components/<Feature>/` : React ; `frontend/store/useStore.ts` (Zustand) ; `frontend/utils/*Service.ts` (appels API).
- `public/locales/<lang>/` : traductions i18next (26 langues, base `en`).
- `android/` : `domain/` (règles des habitudes, Kotlin pur), `data/`, `tasks/` (tâches synchronisées), `app/`.
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
- ⛔ Éditer `dist/` — généré par `npm run build`.
- ⛔ Corriger un bug sans test qui l'aurait détecté — exigence de `docs/testing.md`.
- ⛔ Lancer toute la suite Jest d'un coup — elle a saturé la mémoire de la machine ; cibler les fichiers avec `-w 2`.
- ⛔ Basculer la prod vers Postgres par-dessus une base SQLite remplie — le serveur refuse ; passer par export puis import.
- ⛔ Monter `~/Dev` dans un conteneur pour lire les `TODO.md` — exposerait des secrets ; passer par Git.
- ⛔ Emojis, footer « Generated with Claude Code » ou trailer `Co-authored-by` dans une PR ou un commit destiné à l'amont — préférences du mainteneur (`docs/MEMORY.md`).

## État

Monorepo Cadence (web, serveur, Android) sur `main`, à jour de l'amont v1.14.0 ; pas encore de remote `upstream` local. Android : tâches synchronisées, widgets et rappels vérifiés sur émulateur ; synchro des habitudes Android ↔ serveur décrite comme livrée dans `docs/fork/FORK.md` mais encore listée dans `Now` de `TODO.md` (à réconcilier). Le `gradlew` d'`android/` est exécutable dans l'arbre de travail (mode non commité) : le piège Linux d'`android/AGENTS.md` est à revérifier. Prochaine étape : `Now` de `TODO.md`.
