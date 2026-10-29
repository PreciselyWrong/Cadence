# Plan — Tududi partout : serveur, Android (Cadence), Linux (Tauri), sync hors ligne

## Contexte
Tududi auto-hébergé (Unraid, joignable via **Tailscale**) remplace TickTick et absorbe Cadence. Il faut :
- Android léger : l'app Cadence étendue, **toutes ses fonctionnalités** et son widget, design au style Tududi ;
- Linux léger : **Tauri 2** autour du front React, avec notifications natives ;
- **100 % des données hors ligne** (tâches comprises) et une synchro sans doublon. En conflit, fusion **champ par champ** ;
- une architecture **évolutive** : une nouvelle fonctionnalité ne doit pas demander de refaire la synchro. Phase 1 : toi seul. Phase 2 : la famille (partage).

Ce que l'exploration a montré :
- **Serveur :** il n'y a ni `updated_since`, ni idempotence, ni tombstones. Les suppressions sont physiques, l'uid est généré par le serveur (nanoid 15 caractères, unique globalement), `recurring_completions` n'a ni uid ni `updated_at`, et les occurrences récurrentes ont un `virtual_id` instable. Les habitudes sont des lignes de `tasks` (`habit_*`). Les scopes des jetons ne sont pas appliqués. Les routes `/api/v1` existent déjà.
- **Front :** il fait 335 `fetch` relatifs, avec une session cookie et du CSRF. Sa file hors ligne vit dans le service worker et rejoue les requêtes brutes, sans idempotence. Elle est inutilisable sous Tauri (pas de SW ni de Background Sync dans WebKitGTK).
- **Cadence :** les clés primaires sont déjà des UUID `String`, le domaine est du Kotlin JVM pur (`java.time`) et les versions d'objectif sont en ajout seul. Ce qui manque : `updatedAt` (sauf sur `habits`), les tombstones et la permission `INTERNET`. Le point d'injection est `CadenceApp.repository`, et l'UI réagit aux flux de révision Room. Les scripts sont Windows uniquement.

## Architecture cible

### 1. Protocole de sync générique (`/api/v1/sync`), le cœur évolutif
- **Registre d'entités** (`backend/modules/sync/registry.js`). Chaque entité synchronisable y est déclarée une seule fois :
  - modèle et champs exposés ;
  - sérialiseur ;
  - contrôle d'accès ;
  - politique de fusion : `fields-lww` (fusion champ par champ) ou `append-only` (saisies, journaux).

  Ajouter une fonctionnalité revient à ajouter une entrée au registre et une table côté client.
- **Journal de changements** `sync_changes`, le curseur. Chaque ligne porte un `seq` monotone, `user_id`, `entity`, `uid`, `op` (upsert/delete), les champs changés et une `scope_key`, réservée à la phase 2 pour les projets partagés. Le curseur est le `seq`, jamais `updated_at` (pour éviter les décalages d'horloge). Les suppressions y laissent un tombstone, sans soft-delete à ajouter partout. Il est alimenté par les hooks Sequelize `afterCreate`, `afterUpdate` et `afterDestroy` des modèles du registre. Ainsi, le web, le MCP, Telegram, CalDAV et l'import y écrivent aussi.
- **`GET /sync/pull?cursor=&limit=`**, paginé. Il renvoie les changements, le nouveau curseur et `schema_version`. Au premier pull, c'est un instantané paginé.
- **`POST /sync/push`**, par lots d'opérations `{op_id, entity, uid, base_version?, fields:{name:{value, hlc}}}`.
  - **Idempotence :** la table `sync_ops` contient `op_id` (clé unique) et la réponse mémorisée. Un rejeu renvoie le même résultat.
  - **Uid choisi par le client :** le format est validé (UUID ou nanoid). Une collision avec un autre utilisateur donne un 409. Pour le même utilisateur, c'est une mise à jour.
  - **Fusion champ par champ :** une colonne JSON `field_clocks` est ajoutée aux tables synchronisées, avec un HLC par champ. Le HLC le plus récent gagne. La valeur perdante est inscrite dans `sync_conflicts`, visible dans l'UI et non bloquante.
- **Opérations sémantiques** pour ce qui ne se fusionne pas champ par champ. Par exemple, `task.complete_occurrence {task_uid, occurrence_date}` est idempotent sur le couple (tâche, date). Deux appareils hors ligne ne font donc pas avancer deux fois une tâche récurrente. Il faut pour ça ajouter `uid` et `updated_at` à `recurring_completions`.
- **Compatibilité future :** `GET /sync/meta` liste les entités, leurs versions de schéma et les capacités (feature flags).
  - Un client ignore une entité inconnue et conserve les champs inconnus dans `extras` JSON, qu'il renvoie tels quels.
  - Le serveur accepte les clients en retard d'une version de schéma.
- **Appareils :** la table `sync_devices` liste chaque appareil, avec son jeton, sa date de dernière synchro et les types de notification qu'il gère lui-même. Un jeton `tt_` par appareil, créé depuis le web avec un QR code et révocable.
- **Contrat partagé** dans `shared/sync-contract/` : schémas JSON des payloads et fixtures de scénarios (hors ligne, rejeu, conflit, suppression). Ils sont rejoués par Jest serveur, par les tests du front et par Gradle (Android).

### 2. Moteur d'habitudes Cadence : un contrat, deux moteurs
- **Fixtures dorées.** Un exporteur de tests Kotlin dans Cadence produit des JSON : versions d'objectif et de planning, saisies, pauses et chronos, puis les statuts de période, les séries et les stats attendus. Cadence fait foi sur les règles. Un script les copie dans Tududi (`shared/cadence-engine/fixtures/`), avec un fichier de hachage vérifié par Jest.
- **Moteur JS partagé** `shared/cadence-engine/`, en JS + JSDoc, sans dépendance. Il est utilisé par le backend et par le front, donc aussi sous Tauri. Il remplace `backend/modules/habits/habitEngine.js`.
- **Schéma serveur dédié.** Les habitudes sortent de `tasks` vers les tables :
  - `habits`, `habit_goal_versions`, `habit_schedule_versions` ;
  - `habit_entries` (avec `local_date` et `observed_zone`), `habit_pauses`, `habit_timers`, `habit_groups` ;
  - `habit_quick_values`, `habit_reminders` ;
  - `abstinence_logs`, `alcohol_consumptions`, `health_connect_imports`.

  Toutes ces tables sont identifiées par UUID et toutes sont déclarées dans le registre de sync. Les habitudes Tududi existantes sont migrées en version 1. On garde de l'amont le score de force, la note par saisie, la présence dans Aujourd'hui et Plan, et les outils MCP.

### 3. Front React local-first, commun au web, à la PWA et à Tauri
- **Couche `frontend/data/`** : un réplica local, une file d'opérations (outbox) et un moteur de sync qui implémente le protocole. Elle s'appuie sur des **adaptateurs de plateforme** :
  - stockage : IndexedDB dans le navigateur, `tauri-plugin-sql` (SQLite) sous Tauri ;
  - HTTP : `fetch` dans le navigateur, `tauri-plugin-http` sous Tauri, qui évite le CORS et les cookies tiers ;
  - notifications : Web Push dans le navigateur, natives sous Tauri ;
  - identifiants : cookie de session dans le navigateur, jeton Bearer dans le trousseau sous Tauri.
- **Migration progressive des `*Service.ts`**, domaine par domaine : tâches, projets, areas, tags, inbox, notes, habitudes. Les lectures passent par le réplica et les écritures par l'outbox. Le reste reste en ligne, avec un état « hors ligne indisponible » explicite. La file brute du service worker est retirée une fois les domaines couverts.
- **UI web des habitudes** : parité complète avec Cadence, cochée dans `docs/fork/CADENCE-PARITY.md`.

### 4. Android : dépôt Cadence étendu
- **Nouveau module `:sync`.** Il contient le client HTTP (OkHttp et kotlinx-serialization, déjà présent), l'outbox Room, le moteur pull/push et WorkManager (synchro périodique, au retour du réseau et à l'ouverture).
- **Branchement sur les écritures.** On extrait une interface du `CadenceRepository`. Chaque écriture enregistre l'opération dans l'outbox, dans la même transaction Room. L'UI et le widget n'ont rien à changer, puisqu'ils suivent déjà les révisions de la base.
- **Room 23 → 24.** On ajoute `updatedAt`, `fieldClocks`, `extras` et les tombstones, plus les tables tâches, projets, areas, tags et inbox.
- **Nouveaux écrans tâches** (Aujourd'hui fusionné avec les habitudes, Inbox, projets, ajout rapide en langage naturel). La refonte au style Tududi garde le contrat `WidgetRenderStyle`. Un widget tâches est ajouté sur le même moteur de rendu.
- **Notifications et Health Connect.** Les rappels restent locaux (alarmes inexactes). L'appareil se déclare « gère les rappels » pour que le serveur ne les envoie pas aussi en push, ce qui évite les doublons. Health Connect est conservé, et ses imports sont synchronisés pour la déduplication.
- **Réglages.** On saisit l'URL Tailscale du serveur et on scanne le jeton en QR code. Le jeton est stocké via Android Keystore. On ajoute la permission `INTERNET`.
- **Scripts Linux.** On écrit `dev.sh` et `publish.sh` à côté des `.ps1`, avec le JDK et le SDK lus dans l'environnement.

### 5. Linux : Tauri 2 (`desktop/` dans le dépôt Tududi)
- **Le Rust reste un shell fin :**
  - icône dans la barre système ;
  - lancement au démarrage ;
  - raccourci global pour l'ajout rapide ;
  - notifications natives programmées côté Rust, pour qu'elles sonnent même fenêtre fermée ;
  - jeton dans le trousseau via Secret Service ;
  - SQLite via plugin.
- **Front à adapter :**
  - build de production obligatoire (`NODE_ENV=production`, pas de `eval`, CSP stricte) ;
  - `withBasePath` accepte une base absolue (`frontend/config/paths.ts:68`) ;
  - corriger les appels en dur (`Register.tsx`, `BackupRestore.tsx`, `NotificationsTab.tsx`, `OIDCProviderButtons.tsx`, `taskFeedService.ts`, `SignInLinkModal.tsx`) ;
  - traductions embarquées.
- **Paquets** : AppImage et RPM. Cible de vérification : moins de 100 Mo de RAM au repos.

## Étapes (chaque étape se termine par des tests verts et un commit)
0. **Ménage.** Résoudre la fusion en cours (`CLAUDE.md`, `TodayPage.tsx`), puis commiter `DECISIONS.md`, `TODO.md` et `CADENCE-PARITY.md`. Ajouter `dev.sh` à Cadence. → vérif : `git status` propre ; `./gradlew :domain:test` vert sous Fedora.
1. **Fixtures dorées et moteur JS partagé.** → vérif : Gradle et Jest verts sur les mêmes fixtures ; une règle modifiée d'un seul côté fait échouer les tests.
2. **Serveur habitudes Cadence** : schéma, API, MCP, migration des anciennes habitudes, Swagger. → vérif : Jest vert sur SQLite et Postgres ; cases « Serveur » cochées dans la liste de parité.
3. **Protocole de sync** : registre, `sync_changes`, `sync_ops`, `field_clocks`, `complete_occurrence`, appareils et jetons QR. → vérif : un même push envoyé deux fois donne une seule ligne ; deux appareils modifiant des champs différents gardent les deux modifications ; une suppression se propage ; une tâche récurrente complétée hors ligne sur deux appareils n'avance qu'une fois.
4. **Front local-first** et parité habitudes web. → vérif : en mode avion dans Chromium, on crée, modifie et complète des tâches et des habitudes ; au retour du réseau, le serveur est à jour sans doublon ; Playwright E2E vert.
5. **Android** : `:sync`, tâches, refonte, widgets, rappels, import des données Cadence. → vérif : mode avion, puis 50 opérations, puis retour du réseau, et le serveur est identique ; séries et stats identiques avant et après l'import ; widget à jour en moins d'une seconde après une synchro.
6. **Linux Tauri.** → vérif : notification reçue avec la fenêtre fermée ; hors ligne complet ; RAM au repos sous 100 Mo.
7. **Production.** Passage au Postgres d'Unraid, sauvegardes, déclaration des appareils. → vérif : `npm run backend:test:pg` vert ; restauration testée.
8. **Phase 2 (famille).** On filtre le pull par `scope_key` des projets partagés, avec les droits vérifiés au push, et on ajoute la colonne `scope_key` aux entités. → vérif : un membre en lecture seule ne peut pas pousser sur un projet partagé.

## Fonctionnalités futures : ce qui reste stable
- Une nouvelle entité demande une entrée de registre, une migration et un mapping client. Le protocole, le curseur, l'outbox et la fusion ne bougent pas.
- Une nouvelle règle métier demande une fixture dorée, d'abord rouge des deux côtés.
- Un nouveau client (iOS, Windows, macOS) : Tauri couvre déjà Windows et macOS avec le même code. Pour iOS, il suffit d'implémenter le contrat de sync.
- Les PR à l'amont : le protocole de sync, l'uid choisi par le client et l'idempotence sont génériques et proposables.

## Fichiers critiques
- Serveur :
  - `backend/modules/sync/` (nouveau) ;
  - `backend/modules/habits/` (remplacé) ;
  - `backend/models/task.js` et `recurringCompletion.js` ;
  - `backend/modules/tasks/operations/recurring.js` ;
  - `backend/middleware/auth.js` ;
  - `backend/utils/migration-utils.js` (à réutiliser).
- Partagé : `shared/cadence-engine/`, `shared/sync-contract/`.
- Front : `frontend/data/` (nouveau), `frontend/utils/*Service.ts`, `frontend/config/paths.ts`, `public/sw.js`, `webpack.config.js`.
- Cadence :
  - `data/.../CadenceDatabase.kt` et `CadenceRepository.kt` ;
  - `CadenceApp.kt` ;
  - nouveau module `:sync` ;
  - `app/.../widget/` ;
  - `domain/src/test/` (exporteur de fixtures).
- Linux : `desktop/src-tauri/` (nouveau).

## Exécution
- Je planifie et je relis. L'implémentation est déléguée par étape, avec un brief précis : AGY pour la partie mécanique, Codex pour la sync et les fusions.
- TDD à chaque comportement.
- Jest toujours lancé en ciblé avec `-w 2`, jamais sur toute la suite d'un coup (mémoire de la machine).
- Un commit par étape validée.
