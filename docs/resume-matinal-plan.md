# Résumé matinal — audit et plan (phase 0)

Statut : proposition à valider. Aucune implémentation avant validation.
Ce document ne contient aucune valeur d'une installation précise : les exemples sont fictifs et se saisissent dans l'interface.

## En bref

- Cadence a déjà un **Daily Brief** (IA seule, à la demande, une case par utilisateur) et un **plan du jour** (`daily_plans`, une ligne par jour, avec déjà le bilan du soir `ai_wrap_up`). Le résumé matinal **étend les deux** au lieu de créer une entité parallèle.
- Le calendrier est déjà lu côté serveur (`calendar-feeds` fusionne flux ICS et Google). **Gmail n'est lu nulle part**, ni dans Cadence ni par l'agent Hermes observé.
- Les jobs passent par `taskScheduler.js` (node-cron, verrou `withJobLock`). Le résumé s'y ajoute comme le `daily_summary` des webhooks, à l'heure locale de chaque utilisateur.
- Trois ajouts de schéma : des colonnes du résumé sur `daily_plans`, une table `brief_proposals` (journal et propositions), une table `linked_contexts` (contexte lié). Le reste vit dans `ui_settings`.
- Hermes expose une API HTTP `/v1/runs` adaptée (statut, événements, approbation, idempotence). Aucun changement d'Hermes n'est nécessaire si Cadence reste le seul client Gmail.

## 1. Inventaire des features existantes

| Feature                       | Données                                                                                                                                                                                                                                      | Backend et API                                                                                                                                                                                | Écrans                                                                                                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Daily Brief (IA, amont)       | `users.ai_daily_brief` (JSON), `users.ai_daily_brief_date` ; `today_settings.showDailyBrief`                                                                                                                                                 | `backend/modules/ai-assistant/` (`generateDailyBrief`), `GET/POST /api/ai-assistant/daily-brief`                                                                                              | `frontend/components/Insights/DailyBriefPage.tsx` (`/insights/daily-brief`), `frontend/components/AI/DailyAssistant.tsx` ; doc `docs/13-ai-assistant.md`                                       |
| Plan du jour                  | `daily_plans` (`plan_date`, `started_at`, `ai_wrap_up`), `daily_plan_items`                                                                                                                                                                  | `backend/modules/daily-plan/` (`service.js`, `slots.js`, `ranking.js`, `ai.js`), `GET /api/daily-plan`, `/candidates`, `PUT /:date`, `/:date/start`, `/:date/carry-over`, `/:date/ai/wrap-up` | `frontend/components/DailyPlan/TodayPage.tsx`, `DayTimeline.tsx`, `CapacityMeter.tsx`, `WrapUpCard.tsx` ; Android `tasks/.../ui/TodayTab.kt`, `TodayPlanning.kt` ; doc `docs/20-daily-plan.md` |
| Plages protégées (focus time) | `ui_settings.planning.focusBlocks` (`days`, `start`, `end`, `label`), `focusExceptions`, `dayHours`                                                                                                                                          | `daily-plan/service.js` (`getFocusBlocks`, `getDayHours`), `slots.js` `focusBlocksOn`, `GET/PUT /api/daily-plan/focus-blocks`, `/api/v1/daily-plan/focus-blocks`, `/hours`                    | `DailyPlan/FocusBlocksDialog.tsx` ; Android `planning/FocusRepository.kt`, `PlanningSettingsPage.kt`                                                                                           |
| Capacité                      | capacité du jour calculée côté web (`CapacityMeter.tsx`, `planUtils.ts`) ; capacité de semaine `review/week/capacity`                                                                                                                        | `backend/modules/review/`                                                                                                                                                                     | `Review/WeekStep.tsx`                                                                                                                                                                          |
| Sessions de concentration     | `focus_sessions`                                                                                                                                                                                                                             | `backend/modules/focus-sessions/`                                                                                                                                                             | Insights ; doc `docs/30-focus-sessions.md`                                                                                                                                                     |
| Champs de tâche               | `due_date`, `defer_until`, `week_of`, `review_on`, `in_view_at`, `pinned_at`, `estimated_minutes`, `priority`, `status` (0–6), `completed_at`, `parent_task_id`, `note` ; « plus tard » = étiquette `#someday` posée par `PATCH later: true` | `backend/models/task.js`, `review/fields.js`                                                                                                                                                  | toutes les listes                                                                                                                                                                              |
| Reports                       | dérivés de `task_events` (`due_date_changed`), fenêtre 30 jours, seuil « fréquent » 3                                                                                                                                                        | `review/postponements.js`, `GET /api/task/:uid/postponements`                                                                                                                                 | `Review/PostponementHistory.tsx` ; doc `docs/34-review.md`                                                                                                                                     |
| Historique de tâche           | `task_events` (`event_type`, `old_value`, `new_value`, `source`)                                                                                                                                                                             | `tasks/taskEventService.js`, `GET /api/task/:uid/timeline`                                                                                                                                    | `Task/TaskTimeline.tsx`                                                                                                                                                                        |
| Relations                     | `task_relations` : `blocks`, `blocked_by`, `related_to`, `duplicates`, `duplicated_by`                                                                                                                                                       | `tasks/relations/`, `GET/POST/DELETE /api/task/:uid/relations`                                                                                                                                | détail de tâche                                                                                                                                                                                |
| Récurrences                   | tâche mère (`recurrence_*`, `recurring_parent_id` nul), occurrences virtuelles, `recurring_completions`                                                                                                                                      | `tasks/recurringTaskService.js`, `operations/recurring.js`, `moveOccurrence.js`                                                                                                               | doc `docs/01-recurring-tasks-behavior.md`                                                                                                                                                      |
| Commentaires, notes           | `comments` (tâche), `notes`                                                                                                                                                                                                                  | `modules/comments/`, `modules/notes/`                                                                                                                                                         | `Task/TaskComments.tsx`, `Notes.tsx`                                                                                                                                                           |
| Personnes                     | `people`                                                                                                                                                                                                                                     | `modules/people/`, `/api/people`                                                                                                                                                              | `People/` ; doc `docs/19-people-and-roles.md`                                                                                                                                                  |
| Habitudes                     | `cadence_habits`                                                                                                                                                                                                                             | `habits/cadence/`, `/api/cadence/*`                                                                                                                                                           | `Habits/` ; Android `HabitsTodayScreen.kt`                                                                                                                                                     |
| Inbox                         | `inbox_items`                                                                                                                                                                                                                                | `modules/inbox/` (`nlpParsers.js`), `/api/inbox`                                                                                                                                              | `Inbox/` ; Android `InboxScreen.kt`                                                                                                                                                            |
| Revue                         | revues quotidienne et hebdomadaire                                                                                                                                                                                                           | `modules/review/`                                                                                                                                                                             | `Review/` ; Android `ReviewScreen.kt`                                                                                                                                                          |
| Notifications                 | `notifications` (types, `deliver_after`), `users.quiet_hours`                                                                                                                                                                                | `modules/notifications/`, `push/`, `utils/quietHours.js`                                                                                                                                      | Android : canaux locaux (`TaskReminderScheduler`, `EventReminderScheduler`)                                                                                                                    |
| Résumés programmés            | résumé Telegram (`task_summary_enabled`, `task_summary_frequency`), webhook `daily_summary` à l'heure locale                                                                                                                                 | `tasks/taskSummaryService.js`, `webhooks/summary.js`                                                                                                                                          | Profil › Telegram, Webhooks                                                                                                                                                                    |
| Calendrier serveur            | `calendar_feeds` (ICS, URL chiffrée), `google_accounts`, `google_calendars` (`show_on_calendar`, `sync_mode`), `google_events`                                                                                                               | `calendar-feeds/service.js` (`eventsForRangeOfDays`, fusion Google), `google-sync/`                                                                                                           | Profil › Calendriers                                                                                                                                                                           |
| Calendrier Android            | lecture seule de l'appareil (`CalendarContract`), « Cocher une fois passé » par agenda                                                                                                                                                       | `calendar/.../AndroidCalendarSource.kt`, `EventSelection.kt`                                                                                                                                  | `AgendaScreen.kt`, `CalendarsPage.kt`                                                                                                                                                          |
| LLM                           | fournisseur compatible OpenAI par utilisateur (clé chiffrée), désactivé par défaut (`features.ai_assistant_enabled`)                                                                                                                         | `ai-assistant/service.js` (`getOpenAIClient`, `callWithFallback`)                                                                                                                             | Profil › Assistant IA                                                                                                                                                                          |
| Secrets                       | `shared/crypto/secretCipher.js` (AES-256-GCM, clé dérivée de `TUDUDI_SESSION_SECRET` ou `TUDUDI_OIDC_SECRET_ENCRYPTION_KEY`) ; masquage « 4 derniers caractères »                                                                            | utilisé par IA, Google, flux ICS, Apprise, webhooks                                                                                                                                           | —                                                                                                                                                                                              |
| Synchro hors ligne            | registre `sync/registry.js` (8 entités + habitudes), outbox Room, appels différés (`DeferredCallEntity`)                                                                                                                                     | `/api/v1/sync/*`                                                                                                                                                                              | Android `SyncEngine.kt`, `RoomSyncStore.kt`                                                                                                                                                    |
| Fichiers                      | `TUDUDI_UPLOAD_PATH`                                                                                                                                                                                                                         | servi statiquement                                                                                                                                                                            | —                                                                                                                                                                                              |
| Audio, TTS, lecteur           | **absents** (web et Android)                                                                                                                                                                                                                 | —                                                                                                                                                                                             | —                                                                                                                                                                                              |
| Gmail                         | **absent**                                                                                                                                                                                                                                   | —                                                                                                                                                                                             | —                                                                                                                                                                                              |

Pièges relevés : « Focus » désigne trois choses (plages protégées, puce de portée `ui_settings.focus`, sessions de minuteur) ; le Daily Brief amont n'a qu'une case par utilisateur, sans historique ; `users.telegram_bot_token` est stocké et renvoyé en clair (hors périmètre, voir questions).

## 2. Besoins : réutiliser, étendre ou créer

| Besoin                                     | Décision                                                                                                                          | Justification                                                                                                                                                                                                                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Entité du résumé par jour                  | **Étendre** `daily_plans` : colonnes `brief` (JSON), `brief_version`, `brief_status`, `brief_generated_at`                        | `daily_plans` est déjà « la journée » (une ligne par utilisateur et par date, bilan du soir `ai_wrap_up`). `users.ai_daily_brief` examiné : une seule case, pas d'historique ni de statut, insuffisant.                                                                        |
| Page du résumé                             | **Étendre** `/insights/daily-brief` (`DailyBriefPage`, `DailyAssistant`) et la carte du Today (`showDailyBrief`)                  | Même nom et même place ; le rendu passe au nouveau JSON. Sans LLM, la page s'affiche (aujourd'hui elle exige l'IA).                                                                                                                                                            |
| Moteur sans IA                             | **Créer** `backend/modules/daily-plan/brief/` (collecte, règles, script audio)                                                    | Aucun moteur déterministe n'existe ; il vit dans le module du plan du jour et réutilise `getCandidates`, `slots.js`, `postponements.js`, `eventsForRangeOfDays`.                                                                                                               |
| Rédaction et arbitrage LLM                 | **Réutiliser** le fournisseur de l'Assistant IA (`getOpenAIClient`, `callWithFallback`)                                           | Déjà configurable dans l'UI, clé chiffrée.                                                                                                                                                                                                                                     |
| Calendrier lu                              | **Réutiliser** `calendar-feeds/service.js` ; **étendre** `google_calendars` et `calendar_feeds` d'un drapeau « lu par le résumé » | Le service fusionne déjà ICS et Google côté serveur.                                                                                                                                                                                                                           |
| Horaires de travail                        | **Réutiliser** les plages protégées (un bloc étiqueté par plage de travail, jours et heures)                                      | Même structure (jours, début, fin, étiquette), déjà partagée avec Android, déjà soustraite de la capacité. Le télétravail partiel sans créneau devient une note de charge par jour dans les réglages du résumé.                                                                |
| Capacité du soir                           | **Étendre** `ui_settings.planning` : fenêtre du soir et minutes utiles par jour                                                   | Calculée moins les plages protégées et les événements de la fenêtre ; affichée comme hypothèse.                                                                                                                                                                                |
| Reports, « 3 reports »                     | **Réutiliser** `review/postponements.js` (seuil 3 déjà en place)                                                                  | Rien à créer.                                                                                                                                                                                                                                                                  |
| Doublons                                   | **Réutiliser** `task_relations` (`duplicates`) pour l'action « marquer en doublon » ; détection en code                           | Exact : nom normalisé ; probable : similarité de jetons, seuil réglable.                                                                                                                                                                                                       |
| Limite écrite dans une note                | **Réutiliser** `chrono-node` (déjà en dépendance, locale française)                                                               | Une date extraite de la note prime sur `due_date`, présentée comme question.                                                                                                                                                                                                   |
| Actions « C'est fait », déplacer           | **Réutiliser** les écritures de tâche existantes (web : services ; Android : outbox Room)                                         | Hors ligne et annulation déjà gérés (snackbar d'annulation Android, `TasksCommon.kt`).                                                                                                                                                                                         |
| « Plus tard », abandonner                  | **Réutiliser** `PATCH later: true` et `status` annulé                                                                             | —                                                                                                                                                                                                                                                                              |
| Journal des décisions, propositions de tri | **Créer** la table `brief_proposals`                                                                                              | Examinés : `task_events` (changements effectués, pas propositions refusées), `notifications` (pas de décision), livraisons de webhooks (envoi sortant sans résultat). Aucun ne garde proposition, décision, motif et état d'exécution. Une seule table couvre résumé et mails. |
| Contexte lié                               | **Créer** la table `linked_contexts`                                                                                              | Examinés : `note` et `comments` de tâche. Ils ne couvrent que les tâches ; les événements et séries d'agenda n'ont pas d'entité Cadence, et ni l'un ni l'autre n'a de fin de vie.                                                                                              |
| Retour « utile / bruit »                   | **Réutiliser** `brief_proposals` (type `feedback`) ; règles dans les réglages                                                     | Pas de table de plus.                                                                                                                                                                                                                                                          |
| Gmail                                      | **Créer** un lecteur Gmail dans `google-sync/` (même compte OAuth, portée ajoutée)                                                | Aucun accès existant ; réutilise `google_accounts` et son chiffrement.                                                                                                                                                                                                         |
| Connecteur Hermes                          | **Créer** `backend/modules/agents/` (client `/v1/runs`)                                                                           | Examinés : MCP (`/mcp`, entrant), webhooks (sortant sans résultat), Telegram. Aucun ne suit une demande et récupère son résultat.                                                                                                                                              |
| Audio                                      | **Créer** le client Piper et le stockage des fichiers (`TUDUDI_UPLOAD_PATH/briefs/`)                                              | Rien d'audio n'existe.                                                                                                                                                                                                                                                         |
| Lecteur Android                            | **Créer** un écran poussé depuis le Today (précédent : la revue, poussée depuis le Bilan) et un service Media3                    | Pas de 6e onglet (règle des cinq cibles égales). Aucune bibliothèque média installée.                                                                                                                                                                                          |
| Notification « résumé prêt »               | **Réutiliser** les canaux locaux Android (pas de push serveur vers Android aujourd'hui)                                           | Postée par le worker de synchro quand il récupère le résumé.                                                                                                                                                                                                                   |
| Bilan du soir                              | **Réutiliser** `ai_wrap_up` et `WrapUpCard`                                                                                       | Option 6.                                                                                                                                                                                                                                                                      |
| Envoi Telegram                             | **Réutiliser** `telegram/` et le mécanisme de `taskSummaryService`                                                                | Option 6.                                                                                                                                                                                                                                                                      |
| Écran d'état                               | **Créer** une section en tête de l'onglet Résumé                                                                                  | Aucune page d'état d'intégrations n'existe.                                                                                                                                                                                                                                    |

## 3. Accès à Google Calendar et à Gmail

**Calendrier, aujourd'hui :**

- Google Calendar par OAuth (`google-sync/`) : lecture et écriture, portée `calendar` complète, client OAuth fourni par `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` (variables d'environnement), jetons chiffrés dans `google_accounts`.
- Flux ICS (`calendar-feeds/`) : URL secrète saisie dans l'UI, chiffrée, aucun client OAuth requis. Lecture seule.
- Android lit les agendas de l'appareil, sans le serveur.

**Proposition calendrier :** le résumé lit `eventsForRangeOfDays`, filtré par un drapeau « lu par le résumé » posé dans Profil › Calendriers sur chaque agenda Google ou flux ICS. La voie la plus simple, sans abonnement ni client OAuth : l'adresse ICS secrète de chaque agenda.

**Gmail, aujourd'hui :** aucun accès, ni dans Cadence, ni dans l'agent Hermes observé.

**Proposition Gmail :** Cadence devient le seul client Gmail, sur le compte Google déjà connecté, avec une portée ajoutée à la demande :

- `gmail.readonly` pour les réponses attendues et la lecture des fils (phase 1) ;
- `gmail.modify` seulement si le tri est activé (phase 5) : retirer le libellé `INBOX`, créer et lire les brouillons.

Droits et pièges :

- Aucune portée Google ne limite aux brouillons : `gmail.compose` et `gmail.modify` autorisent aussi l'envoi. L'interdiction d'envoyer se garantit donc dans le code : le client n'expose pas d'appel `send`, un test le vérifie.
- `gmail.readonly` et `gmail.modify` sont des portées restreintes. Pour un usage personnel, le client OAuth reste non vérifié, avec un avertissement à la connexion. En statut « Testing », les jetons de rafraîchissement expirent après 7 jours : il faut passer le client en production. À confirmer dans la documentation Google avant la phase 1.
- Le client OAuth vient aujourd'hui de variables d'environnement. Pour respecter « tout dans l'UI », proposition : l'administrateur saisit l'identifiant et le secret dans Admin, chiffrés. Les variables existantes restent la valeur de repli de l'amont.
- Un compte non connecté ou sans portée Gmail fait disparaître la section « Réponses attendues », avec la mention « source non lue ». Aucune déduction.

« Réponse attendue » se calcule en code : dernier message du fil venant d'un tiers, compte en `To`, pas de `List-Unsubscribe` ni d'expéditeur automatique, dans une fenêtre réglable, compte non exclu. Chaque fil retenu est relu en entier (`threads.get`).

## 4. Planifier un job serveur

- Ajouter une fréquence `daily_brief` (toutes les 5 minutes) dans la table des fréquences de `backend/modules/tasks/taskScheduler.js`, sous `withJobLock('task-scheduler:daily_brief')`.
- Le job parcourt les utilisateurs dont le résumé est activé, convertit l'heure dans leur `users.timezone`, et génère si l'heure réglée est passée, si le jour est actif et si aucun résumé n'existe pour la date. C'est le motif de `webhooks/summary.js` (`summary_hour`).
- Idempotence : un résumé existant n'est jamais réécrit par le job ; seul le bouton « Régénérer » crée une nouvelle version.
- Purges (contexte expiré, journal, audio) : une fréquence quotidienne existante (02:00 ou 03:00).
- Désactivé en test, comme les autres jobs. Le fuseau vient du profil ; par défaut `UTC`, à régler dans Profil › Général.

## 5. Schéma et synchronisation Android

Migrations (toutes avec `safe*` de `migration-utils.js`, testées SQLite et PostgreSQL, sauvegarde `docs/backups.md` avant, `down` documenté) :

1. `daily_plans` : `brief` (JSON), `brief_version` (entier), `brief_status` (`pending`, `ready`, `partial`, `failed`), `brief_generated_at`. Le job crée la ligne du jour avec `findOrCreatePlan` ; `started_at` reste nul, donc le plan n'est pas « commencé ». À vérifier : aucun écran ne traite une ligne vide comme un plan ouvert.
2. `brief_proposals` : `uid`, `user_id`, `brief_date`, `kind` (`move`, `tonight`, `anticipate`, `question`, `mail`, `feedback`), `target_type`, `target_ref`, `proposal` (JSON sans corps de mail), `fingerprint` (pour « ne revient pas à l'identique »), `decision` (`pending`, `accepted`, `refused`, `ignored`), `reason`, `rule`, `agent`, `execution_status`, `execution_ref` (brouillon, tâche créée), `idempotency_key` (unique), `decided_at`, `created_at`. Purge après la durée réglée (90 jours par défaut).
3. `linked_contexts` : `uid`, `user_id`, `scope` (`task`, `event`, `series`), `target_ref`, `text` (court, borné), `created_at`, `updated_at`. Fins de vie :
    - `task` : uid de tâche ; supprimé quand la tâche est fermée ;
    - `event` : clé `iCalUID` + début d'origine ; supprimé après la fin de l'événement ;
    - `series` : `iCalUID` de l'événement récurrent, ou uid de la tâche mère récurrente ; supprimé quand la série n'existe plus (plus d'occurrence trouvée, ou `recurrence_type` remis à `none`). L'`iCalUID` survit à un changement d'horaire.
      Le moteur filtre à la lecture ; la purge quotidienne nettoie.

Synchro Android :

- Le résumé est produit par le serveur et lu seulement : pas d'entité de synchro. Android le lit par `GET /api/v1/daily-plan/:date/brief`, comme les plages protégées, le met en cache (table Room `briefs`, base `tududi.db` v12, migration testée sous Robolectric) et télécharge l'audio dans les fichiers de l'app.
- Les actions sur tâches passent par l'outbox existante : hors ligne et conflits déjà gérés. Une tâche cochée ailleurs se reflète par la synchro des tâches ; le résumé affiche l'état courant de la tâche, pas une copie.
- Réponses, décisions et retours partent par la file d'appels différés existante (`DeferredCallEntity`), rejouée à la reconnexion. Clé d'idempotence générée sur le téléphone.
- Contexte d'un événement sur Android : la colonne `UID_2445` de `CalendarContract` donne l'`iCalUID`, ce qui relie l'événement de l'appareil à celui du serveur.
- `SCHEMA_VERSION` de la synchro ne change pas.

## 6. Piper

- Moteur : `OHF-Voice/piper1-gpl` (GPL-3.0), `pip install piper-tts[http]`, `python -m piper.http_server`. Endpoint `POST /synthesize` (`text`, `voice`, `speaker_id`, `length_scale` pour la vitesse), `GET /voices`. Sortie WAV seulement. Hors réseau une fois les voix téléchargées.
- Licence : processus séparé appelé par HTTP, donc pas de mélange avec le MIT de Cadence. Pas d'image officielle du serveur HTTP : proposition d'un Dockerfile minimal dans `docker/piper/`, documenté, à lancer à côté de Cadence.
- Silences et format : Cadence synthétise chapitre par chapitre, puis `ffmpeg` concatène avec des silences et encode en **MP3** (lu partout : navigateurs, Media3, Bluetooth ; Opus dans Safari non vérifié). `ffmpeg` s'ajoute à l'image Alpine de Cadence (`apk add ffmpeg`, nouvelle dépendance système justifiée). Les débuts de chapitres sont gardés en métadonnées pour le saut.
- Prononciation : remplacements de texte du dictionnaire avant synthèse ; les blocs de phonèmes `[[ … ]]` existent en ligne de commande, pas confirmés sur l'API HTTP.
- Voix françaises du catalogue `rhasspy/piper-voices` (`fr_FR`, pas de `fr_BE` ni `fr_CH`) :

| Voix     | Qualité     | Voix                    | Licence des données |
| -------- | ----------- | ----------------------- | ------------------- |
| siwis    | low, medium | 1, féminine             | CC BY 4.0           |
| upmc     | medium      | 2 (féminine, masculine) | CC BY-SA 4.0        |
| mls      | medium      | 125                     | CC BY 4.0           |
| mls_1840 | low         | 1                       | CC BY 4.0           |
| gilles   | low         | 1, masculine            | CC0                 |
| tom      | medium      | 1, masculine            | AGPL-3.0            |

Toutes conviennent à un usage personnel. La voix nommée dans la demande n'existe pas dans ce catalogue. La plus proche d'une voix féminine naturelle est `siwis` medium.

- Temps attendu : facteur temps réel publié de 0,1 à 0,2 sur un processeur x86 de bureau, soit **10 à 20 s pour 90 s d'audio**, plus 1 à 2 s d'encodage. **Pas de mesure faite** : Piper n'est pas installé sur le serveur et l'installer aurait modifié le serveur. Mesure prévue au premier commit de la phase 4.
- Repli : si Piper échoue, `audio_status = failed`, la page s'affiche, Android lit le script avec `TextToSpeech` (plateforme, sans dépendance).

## 7. Hermes, fonctionnement constaté

Constat générique, en lecture seule (liste des conteneurs, processus, code source de l'image, noms des fichiers de profil, deux requêtes `GET` de santé et une `GET` refusée sans jeton). Aucun fichier de secrets, aucune variable d'environnement, aucune configuration n'a été lu en entier ni modifié.

**Interfaces :**

- Une passerelle par profil (un « agent » = un profil : personnalité, modèle, outils, compétences, mémoire). Plusieurs profils servis par une passerelle multiplexée.
- Canaux de messagerie (Telegram, etc.), tableau de bord web, et un **serveur d'API compatible OpenAI** : `/v1/chat/completions`, `/v1/responses`, `/v1/models`, `/v1/capabilities`, `/api/sessions`, `/api/jobs`, et surtout **`/v1/runs`**.
- Profil choisi par préfixe d'URL `/p/<profil>/…` ; un profil non servi répond 404.
- Authentification : jeton porteur (`Authorization: Bearer`), propre au profil. Sans jeton : 401.

**Circulation d'une demande :**

- `POST /v1/runs` (`input`, `session_id` facultatif, en-tête `Idempotency-Key`) crée une exécution ; une même clé renvoie l'exécution existante.
- `GET /v1/runs/{id}` donne le statut : `queued`, `running`, `waiting_for_approval`, puis terminal `completed`, `failed`, `cancelled`, `interrupted`. `GET /v1/runs/{id}/events` suit les événements.
- Contrôle : `/approval`, `/clarify`, `/steer`, `/stop`.
- Délégation interne : un agent peut confier une sous-tâche à un autre profil (extension de délégation par profils). Tâches planifiées par profil, dont des scripts sans IA.

**Validations :**

- Une action d'outil sensible met l'exécution en `waiting_for_approval` ; la réponse est `once`, `session`, `always` ou `deny`.
- Sur la messagerie, des boutons rappellent un script sans IA.

**Lecture des mails :**

- Aucun connecteur Gmail actif.
- Un profil de tri porte une compétence de brouillons qui décrit le contrat : lire le fil exact, ne jamais envoyer, filtrer les opérations dans la couche d'outils, ne pas écraser un brouillon humain, relire après écriture, chercher le résultat après un délai dépassé avant de recréer, traiter le contenu reçu comme donnée.

**Conséquence pour Cadence :**

- Le connecteur appelle `/v1/runs` avec un jeton saisi dans l'UI, un profil par type de demande, une clé d'idempotence par proposition, et suit le statut par interrogation (pas de port entrant vers Cadence).
- Cadence envoie des extraits de mails comme **données** délimitées et reçoit une proposition JSON validée par un schéma. L'agent n'a besoin d'aucun outil Gmail : c'est Cadence qui crée le brouillon après mon accord. Aucun changement d'Hermes n'est donc requis.
- Si une exécution passe en `waiting_for_approval`, Cadence ne l'approuve jamais seule : la carte affiche « l'agent demande une autorisation », avec « Refuser » (`deny`).
- Écart à trancher : le contrat de brouillons observé prévoit que l'agent détienne lui-même l'accès Gmail. Ce plan propose l'inverse (question 2).

## 8. Réglages : variables, écran, défaut

Tout est vide ou désactivé par défaut. Les secrets sont masqués, chiffrés par `secretCipher`, jamais renvoyés en clair. Aucune variable d'environnement nouvelle.

| Variable                                                                     | Écran                                      | Défaut                                   |
| ---------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------- |
| Résumé activé                                                                | Profil › Résumé                            | non                                      |
| Heure de génération, jours actifs                                            | Profil › Résumé                            | 07:00, aucun jour                        |
| Fuseau                                                                       | Profil › Général (existant)                | `UTC`                                    |
| Sections affichées et ordre                                                  | Profil › Résumé                            | les 8 sections, ordre de la demande      |
| Horizon de la timeline                                                       | Profil › Résumé                            | 3 jours                                  |
| Agendas lus, horizon de lecture                                              | Profil › Calendriers (drapeau par agenda)  | aucun, 7 jours                           |
| Comptes Gmail lus, comptes exclus, fenêtre des réponses                      | Profil › Résumé › Sources                  | aucun, 14 jours                          |
| Horaires de travail                                                          | Plan du jour › Plages protégées (existant) | aucun                                    |
| Note de charge par jour (télétravail partiel…)                               | Profil › Planification                     | vide                                     |
| Fenêtre et minutes utiles du soir, par jour                                  | Profil › Planification                     | vide (section « Ce soir » sans capacité) |
| Ordre des priorités                                                          | Profil › Résumé › Arbitrage                | ordre de la demande                      |
| Seuils : reports, similarité des doublons, nombre de propositions            | Profil › Résumé › Arbitrage                | 3, 0,8, 3                                |
| Durées : journal, audio, contexte                                            | Profil › Résumé › Conservation             | 90 j, 7 j, fin de vie de la cible        |
| Types d'alerte et règles de bruit                                            | Profil › Résumé › Alertes                  | tous actifs, aucune règle                |
| Ton, signature, instructions permanentes                                     | Profil › Résumé › Rédaction                | neutre, vide, vide                       |
| LLM et fournisseur                                                           | Profil › Assistant IA (existant)           | désactivé                                |
| Adresse de Piper, voix, vitesse, extrait                                     | Profil › Résumé › Voix                     | vide, aucune, 1,0                        |
| Dictionnaire de prononciation                                                | Profil › Résumé › Voix                     | vide                                     |
| Hermes : adresse, jeton (secret), délai, test                                | Profil › Agents                            | vide, 120 s                              |
| Agents : profil par type de demande                                          | Profil › Agents                            | aucun                                    |
| Règles de tri (expéditeur, libellé, type, instruction ; `proposer` ou `off`) | Profil › Agents › Tri                      | aucune                                   |
| Client OAuth Google (identifiant, secret)                                    | Admin › Intégrations                       | vide (repli : variables existantes)      |
| Options : notification, bilan du soir, Telegram, Sonos, hebdo                | Profil › Résumé › Options                  | toutes désactivées                       |
| Notification « résumé prêt » sur Android                                     | Android › Réglages › Notifications         | non                                      |

Écran d'état, en tête de Profil › Résumé : chaque source (agendas, Gmail, Cadence), LLM, Piper, Hermes, avec « configuré, manquant, fonctionne » et la dernière erreur. Boutons de test : Piper (extrait), Hermes (`/health` puis `/v1/models` authentifié), Gmail (profil du compte).

Android : le résumé, la lecture et la notification se règlent sur Android ; le reste se règle sur le web, comme le profil aujourd'hui (lu seul depuis `/api/v1/profile`).

## 9. Découpage en commits

Un commit par étape vérifiée, sur `main`, sans pousser.

**Phase 1 :**

1. Migration et modèle `daily_plans.brief*` ; route `GET /api/daily-plan/:date/brief`.
2. Collecte : tâches, calendrier filtré, tâches closes sur 7 jours avec notes.
3. Règles : timeline, charge, conflits avec les horaires, doublons, dates candidates, limites de note.
4. Job planifié et bouton « Régénérer » ; rédaction LLM optionnelle.
5. Lecteur Gmail en lecture seule ; section « Réponses attendues ».

**Phase 2 :** 6. Page web, carte Today, actions avec annulation. 7. Android : cache Room, écran, actions par outbox et appels différés.

**Phase 3 :** 8. `brief_proposals` (journal, purge) et `linked_contexts` (fins de vie) ; questions Oui, Non, texte. 9. Édition des contextes depuis la tâche et l'événement, web et Android.

**Phase 4 :** 10. Script audio, client Piper, `ffmpeg`, stockage et purge ; lecture web. 11. Android : Media3, lecture en arrière-plan, chapitres ; repli `TextToSpeech`.

**Phase 5 :** 12. Connecteur Hermes et onglet Agents. 13. Tri proposé, exécution après accord, annulation, test « jamais d'envoi ».

**Phase 6 :** 14. Options : notification, bilan du soir, Telegram ; points d'extension Sonos et hebdomadaire.

Chaque commit met à jour `docs/fork/FORK.md`, la page `docs/*.md` du comportement, les 26 fichiers de traduction, `AGENTS.md`, `android/AGENTS.md` et `docs/fork/WEB-UX-NOTES.md` selon les règles du fork.

## 10. Risques

| Risque                                                           | Parade                                                                                                                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Divergence avec l'amont sur `ai-assistant` et `DailyBriefPage`   | Code nouveau dans `daily-plan/brief/` ; modifications minimales des fichiers de l'amont                                                                            |
| Injection dans un mail ou un événement                           | Données délimitées, sortie de l'agent validée par schéma, destinataires et actions jamais tirés du texte, échappement à l'affichage, test avec une consigne cachée |
| Envoi accidentel                                                 | Aucun appel `send` dans le client ; test qui échoue si un chemin d'envoi apparaît                                                                                  |
| Jetons Gmail expirant au bout de 7 jours (client en « Testing ») | Client en production non vérifié ; état visible dans l'écran d'état                                                                                                |
| Double exécution (double clic, reprise hors ligne)               | Clé d'idempotence unique par proposition, côté Cadence et côté Hermes                                                                                              |
| Archivage sans tâche                                             | Archivage seulement après confirmation de création ; sinon le mail reste dans l'inbox                                                                              |
| Annulation d'une tâche modifiée entre-temps                      | Annulation refusée si la tâche a changé depuis sa création (horloge de champs)                                                                                     |
| Ligne `daily_plans` créée par le job                             | Vérifier les écrans et `postponements.js` : seuls les plans commencés ou avec éléments comptent                                                                    |
| Lecture en arrière-plan sur Android (batterie, autorisations)    | Service Media3 de premier plan, test sur l'émulateur puis le téléphone                                                                                             |
| Données de production                                            | Développement sur base de test et fixtures fictives ; aucune lecture ni écriture de la base de production                                                          |
| Fuseau `UTC` par défaut                                          | Écran d'état signale un fuseau non réglé                                                                                                                           |

## 11. Questions

1. **Daily Brief de l'amont :** je remplace son rendu par le nouveau résumé sur la même page (`/insights/daily-brief`) et la carte du Today, en gardant son fournisseur LLM. D'accord ? Sinon, deux résumés coexisteraient.
2. **Gmail :** Cadence est le seul client Gmail (lecture, puis brouillons et archivage après accord) et l'agent Hermes ne fait que rédiger et proposer. D'accord ? L'autre voie donnerait l'accès Gmail à l'agent, ce qui demande un connecteur dans Hermes.
3. **Horaires de travail :** je les saisis comme plages protégées étiquetées, déjà soustraites de la capacité et partagées avec Android. D'accord ?
4. **Client OAuth Google dans l'UI d'administration**, en plus des variables existantes. D'accord ?
5. **Hors périmètre :** le jeton du bot Telegram est stocké et renvoyé en clair. Je l'inscris dans `TODO.md` ?
