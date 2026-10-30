# Fork Tutudi : décisions et références

Fichiers propres au fork : `AGENTS.md`, `TODO.md` et `docs/fork/`. `docs/` et `CLAUDE.md` restent ceux de l'amont, pour éviter les conflits de fusion.

## Objectif

Un seul système personnel (tâches, projets, habitudes, notes, capture) sans nouvel abonnement, utilisable sur Android et Fedora, fonctionnel sans IA. Tududi auto-hébergé sur Unraid sert de serveur ; il remplace à terme TickTick et absorbe Cadence. Chouette Cuisine reste séparé (il a son propre MCP).

## Décisions

- **Suivre l'amont.** Le fork fusionne `chrisvel/tududi` chaque semaine. Le code propre au fork vit dans ses propres modules et touche le moins possible les fichiers de l'amont. Les ajouts génériques partent en PR vers l'amont. Raison : l'amont est très actif (211 commits et 26 migrations en octobre 2026) ; de petites fusions coûtent moins qu'une grosse.
- **Habitudes : les règles de Cadence remplacent le module `habits` de l'amont.** Le serveur Tududi fait foi. Sur ce module, un conflit avec l'amont se résout en gardant la version du fork. Raison : le moteur de l'amont réinterprète le passé lorsqu'un objectif change, et il n'a ni plafond > 0, ni suivi sans objectif, ni pauses multi-jours, ni fuseau observé par saisie, ni chronos, groupes, progression ou abstinence.
- **Deux moteurs, un contrat.** Moteur JS côté serveur, domaine Kotlin de Cadence côté client (hors ligne, widget). Des fixtures dorées JSON partagées sont rejouées par Jest et par Gradle ; un écart entre les deux fait échouer les tests. Écarté : compiler le domaine Kotlin en JS (il faudrait migrer vers `kotlinx-datetime` et ajouter une chaîne de build Kotlin dans le fork).
- **Règles métier reprises de Cadence** (elles font foi, voir `Cadence/AGENTS.md`) : progression dérivée des saisies, jamais stockée ; périodes calculées, jamais réinitialisées ; objectifs et plannings versionnés ; quantités en entiers avec précision explicite ; fréquence et quantité indépendantes ; série = périodes planifiées réussies ; période en pause ou sans planning = neutre ; période en cours jamais en échec ; une saisie garde sa date civile et son fuseau observés.
- **Refonte UI façon TickTick, sur place.** Le front de l'amont est modifié directement (choix du 2026-10-29) ; les conflits de fusion sur ces écrans sont acceptés. Réglage `ui_settings.appearance.density` : `minimal` (défaut, façon TickTick) ou `dense` (l'affichage de l'amont, toutes les fonctionnalités visibles). Le mode minimal masque, il ne supprime rien.
- **Clients légers (choix du 2026-10-29)** : Android = l'app Cadence étendue (Kotlin, Compose, Room, widget Glance), domaine et fonctionnalités repris en entier, design refait au style Tududi. Linux = Tauri 2 (Rust) autour du front React de Tududi : notifications natives, barre système, ajout rapide global, SQLite local hors ligne ; habitudes via le moteur JS du serveur partagé en package. Web = le même front React. Écartés : Compose Desktop (JVM, 150-300 Mo de RAM), cœur Rust partagé via UniFFI (réécriture du domaine Cadence, widget toujours en Kotlin), Flutter (même raison).
- **Synchronisation hors ligne (choix du 2026-10-29)** : protocole générique `/api/v1/sync` piloté par un registre d'entités ; curseur = `seq` d'un journal `sync_changes` alimenté par les hooks Sequelize (jamais `updated_at`, tombstones dans le journal) ; `uid` choisi par le client ; idempotence par `op_id` (`sync_ops`) ; fusion champ par champ par HLC (`field_clocks`), valeur perdante gardée dans `sync_conflicts` ; saisies en ajout seul ; opérations sémantiques pour la récurrence (`task.complete_occurrence`, idempotent sur tâche + date) ; champs inconnus conservés par les clients (`extras`). Jeton `tt_` par appareil (`sync_devices`), accès via Tailscale. Partage familial (phase 2) via `scope_key`. Plan : [PLAN-clients-sync.md](PLAN-clients-sync.md).
- **Base : PostgreSQL** (supporté par l'amont depuis la #1466) sur l'instance déjà présente sur Unraid. Tests sur SQLite et sur Postgres. Migrations via `safeAddColumns` / `safeAddIndex`.
- **TODO des dépôts** : le `TODO.md` de chaque dépôt fait foi ; Tududi l'affiche et le met à jour via Git (clone, commit/push), jamais en montant `~/Dev`. Raison : le PC est inaccessible en semaine, et monter `~/Dev` exposerait des secrets.
- **IA** : facultative et différée. Capture et opérations de base sans modèle ; Hermes enrichit en lot et passe par le MCP. Mnemoteca n'est pas une source de vérité.
- **Google Tasks : une liste par projet**, la liste par défaut = tâches sans projet. Supprimer une liste dans Google délie les tâches au lieu de les supprimer. Tâches récurrentes : seule la prochaine occurrence part chez Google. Supprimer l'événement d'une tâche dans Google retire la date ; supprimer une tâche Google supprime la tâche. Conflit : la modification la plus récente gagne (hash des champs synchronisés des deux côtés).
- **Agenda : synchro Google par l'API v3, pas par CalDAV.** Raison : le CalDAV de Google ne gère pas les VTODO et exige OAuth2 ; les flux ICS sont à sens unique et Google ne les relit que toutes les 8 à 24 h.

## Pièges

- Le serveur refuse de démarrer sur Postgres par-dessus une base SQLite déjà remplie : la bascule passe par un export puis un import.
- `habit_streak_mode` et `habit_flexibility_mode` de l'amont sont enregistrés mais le moteur ne les lit pas.
- App OAuth Google en mode « Test » : le refresh token expire après 7 jours. La passer en « Production » (non vérifiée, usage perso : écran d'avertissement à accepter une fois).
- Fichiers à fort risque de conflit : `public/locales/`, `backend/modules/tasks/routes.js`, `backend/modules/users/service.js`, `backend/models/user.js`.
- L'amont prépare une offre hébergée payante (`billing`, `config/plans.js`) : surveiller que l'auto-hébergé ne soit pas bridé.

## Références

- Amont : https://github.com/chrisvel/tududi — fork : https://github.com/PreciselyWrong/tududi
- Module habits de l'amont : `backend/modules/habits/`, `docs/21-habits.md` ; Postgres : `docs/16-postgresql.md` ; MCP : `docs/14-mcp-integration.md`
- Cadence : `Cadence/AGENTS.md` (règles et ⛔), `Cadence/domain/src/main/kotlin/ch/nicolab/cadence/domain/`
- Branche de travail calendrier / flux ICS : `origin/claude/new-session-sgffz7`
