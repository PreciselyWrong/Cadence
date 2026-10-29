# AGENTS.md — fork Tutudi de Tududi

## Quoi

Fork personnel de [chrisvel/tududi](https://github.com/chrisvel/tududi) (origin : `PreciselyWrong/tududi`) : gestionnaire de tâches auto-hébergé (Areas > Goals > Projects > Tasks), habitudes, notes, inbox, MCP. Cible : un seul système personnel sur Android et Fedora, sans IA obligatoire, servi depuis Unraid.

Pile : React 18 + TypeScript (webpack, Tailwind, Zustand + SWR) ; Express + Sequelize ; SQLite par défaut ou PostgreSQL via `DATABASE_URL`. Dev : deux serveurs (front `:8080` proxifie `/api` vers back `:3002`) ; prod : Express sert `/dist`.

Fichiers propres au fork : `AGENTS.md`, `TODO.md`, `docs/fork/`. `CLAUDE.md` et `docs/` sont ceux de l'amont.

## Règles du fork (`CLAUDE.md`, section « This Fork (PreciselyWrong/tududi) »)

- tenir à jour la section README « 🍴 What this fork adds » et le tableau des fonctionnalités du fork dans `CLAUDE.md` à chaque changement du fork ;
- mettre à jour la page `docs/*.md` correspondante à chaque changement de comportement ;
- ajouter chaque nouvelle chaîne d'interface dans les 26 `public/locales/*/translation.json` ;
- donner à chaque migration un horodatage unique et vérifier la mise à niveau sur SQLite et PostgreSQL ;
- lancer les vérifications complètes (tests backend, tests frontend, typecheck, lint, build) avant de pousser ;
- TickTick sert de référence de comportement uniquement : jamais son code, ses ressources ni ses textes.

## Lire selon la tâche

| Tâche | Lire |
|---|---|
| Objectif du fork, décisions, pièges, références | `docs/fork/DECISIONS.md` |
| Feuille de route | `TODO.md` (`Now`, `Next`, `Ideas`) |
| Vue d'ensemble, index des docs de l'amont | `CLAUDE.md` |
| Architecture, requêtes, auth | `docs/architecture.md` |
| Nouveau module backend, repository | `docs/backend-patterns.md`, `docs/code-conventions.md` |
| Modèle, migration, SQLite/Postgres | `docs/database.md`, `docs/16-postgresql.md`, `docs/backups.md` |
| Tests | `docs/testing.md` |
| Tâches récurrentes | `docs/01-recurring-tasks-behavior.md` (avant de toucher `backend/modules/tasks/recurringTaskService.js` ou `taskScheduler.js`) |
| Habitudes (moteur Cadence) | `docs/fork/DECISIONS.md`, `docs/21-habits.md`, `backend/modules/habits/` |
| Aujourd'hui / plan du jour | `docs/02-today-page-sections.md`, `docs/20-daily-plan.md` |
| Partage, droits, groupes | `docs/08-user-management.md`, `docs/18-user-groups.md`, `docs/19-people-and-roles.md` |
| MCP | `docs/14-mcp-integration.md` |
| PR ou issue vers l'amont | `docs/MEMORY.md`, `.github/pull_request_template.md` |

## Commandes

```bash
npm install
npm run db:init            # première installation
npm start                  # front :8080 + back :3002
npm run lint               # eslint front + back
npm run format:fix         # prettier front + back
npm test                   # Jest backend
npm run backend:test:unit
npm run backend:test:integration
npm run backend:test:upgrade   # parité de schéma, fixtures legacy
npm run frontend:test      # Jest + RTL ; filtrer : npm run frontend:test -- TaskItem
npm run test:ui            # Playwright E2E
npm run build              # tsc --noEmit + webpack -> dist/
npm run pre-push           # lint-staged (eslint --fix + prettier) sur le diff indexé
npm run migration:create   # puis npm run db:migrate
npm run migration:status
```

Tests Postgres : `DATABASE_URL=... npm run backend:test:pg`. Tous les scripts : `package.json`.

## Carte

- `backend/modules/<feature>/` : `routes.js` → `repository.js` → `operations/`, `core/` (serializers, builders, parsers).
- `backend/models/`, `backend/migrations/` : schéma Sequelize ; helpers `backend/utils/migration-utils.js`.
- `backend/middleware/authorize.js` : `hasAccess(level, resourceType, getResourceUid)`, droits hérités du projet.
- `backend/modules/tasks/` : tâches, récurrence (`recurringTaskService.js`, `taskScheduler.js`).
- `backend/modules/habits/` : habitudes, remplacées par les règles de Cadence dans ce fork.
- `backend/modules/mcp/` : serveur MCP (`npm run mcp:start`).
- `frontend/components/<Feature>/` : React ; `frontend/store/useStore.ts` (Zustand) ; `frontend/utils/*Service.ts` (appels API).
- `public/locales/<lang>/` : traductions i18next (26 langues, base `en`).
- `e2e/` : Playwright ; `scripts/` : dev, Docker, versions, sauvegardes Postgres.

## ⛔ Interdits

- ⛔ Mettre du contenu propre au fork dans `CLAUDE.md` ou `docs/` hors `docs/fork/` — conflits à chaque fusion hebdomadaire de l'amont.
- ⛔ Appeler `queryInterface.createTable/addColumn/addIndex` directement dans une migration — utiliser les `safe*` de `backend/utils/migration-utils.js` : les migrations doivent être idempotentes (installs neuves créées par `sync()`) et tourner sur SQLite et Postgres.
- ⛔ `PRAGMA`, `sqlite_master`, `AUTOINCREMENT`, booléens `0`/`1` dans une nouvelle migration — Postgres ne rejoue pas ce SQL (voir `docs/database.md`).
- ⛔ Modifier une migration déjà publiée — les bases existantes ne la rejouent pas.
- ⛔ Code spécifique au moteur SQL hors `backend/utils/db-dialect.js` — un seul point de bascule SQLite/Postgres.
- ⛔ Accéder aux modèles Sequelize depuis `routes.js` — passer par le repository du module.
- ⛔ Lire les droits partagés via `Permission` seul — utiliser `permissionSources` (les droits de groupe sont dans `group_permissions`).
- ⛔ `fetch` ad hoc dans un composant — passer par `frontend/utils/*Service.ts`.
- ⛔ Tableaux de couleurs locaux — `PALETTE` de `frontend/constants/colorPalette.ts`, via `ColorPicker`.
- ⛔ Éditer `dist/` — généré par `npm run build`.
- ⛔ Corriger un bug sans test qui l'aurait détecté — exigence de `docs/testing.md`.
- ⛔ Basculer la prod vers Postgres par-dessus une base SQLite remplie — le serveur refuse ; passer par export puis import.
- ⛔ Monter `~/Dev` dans un conteneur pour lire les `TODO.md` — exposerait des secrets ; passer par Git.
- ⛔ Emojis, footer « Generated with Claude Code » ou trailer `Co-authored-by` dans une PR ou un commit destiné à l'amont — préférences du mainteneur (`docs/MEMORY.md`).

## État

Fork à jour de l'amont v1.13.1 (+ #1992, #1994). Pas encore de remote `upstream`. Prochaine étape : `Now` de `TODO.md` (fixtures dorées des habitudes depuis Cadence).
