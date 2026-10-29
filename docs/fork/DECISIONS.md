# Fork Tutudi : décisions et références

Fichiers propres au fork : `AGENTS.md`, `TODO.md` et `docs/fork/`. `docs/` et `CLAUDE.md` restent ceux de l'amont, pour éviter les conflits de fusion.

## Objectif

Un seul système personnel (tâches, projets, habitudes, notes, capture) sans nouvel abonnement, utilisable sur Android et Fedora, fonctionnel sans IA. Tududi auto-hébergé sur Unraid sert de serveur ; il remplace à terme TickTick et absorbe Cadence. Chouette Cuisine reste séparé (il a son propre MCP).

## Décisions

- **Suivre l'amont.** Le fork fusionne `chrisvel/tududi` chaque semaine. Le code propre au fork vit dans ses propres modules et touche le moins possible les fichiers de l'amont. Les ajouts génériques partent en PR vers l'amont. Raison : l'amont est très actif (211 commits et 26 migrations en octobre 2026) ; de petites fusions coûtent moins qu'une grosse.
- **Habitudes : les règles de Cadence remplacent le module `habits` de l'amont.** Le serveur Tududi fait foi. Sur ce module, un conflit avec l'amont se résout en gardant la version du fork. Raison : le moteur de l'amont réinterprète le passé lorsqu'un objectif change, et il n'a ni plafond > 0, ni suivi sans objectif, ni pauses multi-jours, ni fuseau observé par saisie, ni chronos, groupes, progression ou abstinence.
- **Deux moteurs, un contrat.** Moteur JS côté serveur, domaine Kotlin de Cadence côté client (hors ligne, widget). Des fixtures dorées JSON partagées sont rejouées par Jest et par Gradle ; un écart entre les deux fait échouer les tests. Écarté : compiler le domaine Kotlin en JS (il faudrait migrer vers `kotlinx-datetime` et ajouter une chaîne de build Kotlin dans le fork).
- **Règles métier reprises de Cadence** (elles font foi, voir `Cadence/AGENTS.md`) : progression dérivée des saisies, jamais stockée ; périodes calculées, jamais réinitialisées ; objectifs et plannings versionnés ; quantités en entiers avec précision explicite ; fréquence et quantité indépendantes ; série = périodes planifiées réussies ; période en pause ou sans planning = neutre ; période en cours jamais en échec ; une saisie garde sa date civile et son fuseau observés.
- **Clients : Kotlin Multiplatform**, Android + Compose Desktop pour Linux, dans la même pile que Cadence. Le web reste le front React de Tududi.
- **Synchronisation hors ligne** : `uid` choisi par le client, clé d'idempotence, lecture incrémentale `updated_since`, saisies en ajout seul, une modification d'objectif crée une nouvelle version. Authentification par jeton Bearer existant (`tt_...`).
- **Base : PostgreSQL** (supporté par l'amont depuis la #1466) sur l'instance déjà présente sur Unraid. Tests sur SQLite et sur Postgres. Migrations via `safeAddColumns` / `safeAddIndex`.
- **TODO des dépôts** : le `TODO.md` de chaque dépôt fait foi ; Tududi l'affiche et le met à jour via Git (clone, commit/push), jamais en montant `~/Dev`. Raison : le PC est inaccessible en semaine, et monter `~/Dev` exposerait des secrets.
- **IA** : facultative et différée. Capture et opérations de base sans modèle ; Hermes enrichit en lot et passe par le MCP. Mnemoteca n'est pas une source de vérité.

## Pièges

- Le serveur refuse de démarrer sur Postgres par-dessus une base SQLite déjà remplie : la bascule passe par un export puis un import.
- `habit_streak_mode` et `habit_flexibility_mode` de l'amont sont enregistrés mais le moteur ne les lit pas.
- Fichiers à fort risque de conflit : `public/locales/`, `backend/modules/tasks/routes.js`, `backend/modules/users/service.js`, `backend/models/user.js`.
- L'amont prépare une offre hébergée payante (`billing`, `config/plans.js`) : surveiller que l'auto-hébergé ne soit pas bridé.

## Références

- Amont : https://github.com/chrisvel/tududi — fork : https://github.com/PreciselyWrong/tududi
- Module habits de l'amont : `backend/modules/habits/`, `docs/21-habits.md` ; Postgres : `docs/16-postgresql.md` ; MCP : `docs/14-mcp-integration.md`
- Cadence : `Cadence/AGENTS.md` (règles et ⛔), `Cadence/domain/src/main/kotlin/ch/nicolab/cadence/domain/`
- Branche de travail calendrier / flux ICS : `origin/claude/new-session-sgffz7`
