# Automatic classification

New tasks, notes and links get their **empty** fields filled by the server, after a grace period that leaves time to file them yourself. Code decides everything except one judgement: the model picks among existing projects, domains and tags. When it is unsure, a card in the triage queue (`docs/40-triage.md`) asks you. It replaces the external `cadence_classify.py` script that ran in Hermes every 3 minutes and asked its questions over Telegram.

**Related:** [Triage queue](40-triage.md), [Links](37-links.md), [Offline sync](30-offline-sync.md), [Notifications](36-notifications.md)

Code: `backend/modules/auto-classify/` (`core/` pure rules, `worker.js`, `model.js`, `writer.js`, `suggestions.js`, `service.js`, `settings.js`), models `backend/models/auto_classify.js`. Web: `frontend/components/AutoClassify/`, Profile › Classement (`frontend/components/Profile/tabs/ClassifyTab.tsx`). Android: `android/tasks/.../autoclassify/`, `ui/autoclassify/`, `ui/triage/AutoClassifyCards.kt`, Réglages › Organisation › Classement.

## What is filled

| Item | Fields | Rule |
|---|---|---|
| Task | a project **or** a domain (never both; a precise project wins over a domain), 0 to 3 tags, a duration (5 to 720 min) | only when the project and the domain are both empty, the task has no tag, no duration |
| Note | a project, 0 to 3 tags | only empty fields |
| Link | 0 to 3 tags, a summary in the note, `Résumé auto : ` + 1 or 2 sentences (220 characters at most by default) | the summary only when the note is empty and the page was read (`fetch_status` `done`), with text, and is not an error or sign-in page (`core/summary.js`); the classifier waits for the page up to `fetch_wait_minutes` |
| Task priority | 1 or 2, **never written**: only proposed on a card, only when the task is at 0 | 0 is both the default and "low", so only a raise means something |

Never touched: closed tasks (done, archived, cancelled), recurring tasks and their occurrences, habits, subtasks, tasks imported from a `TODO.md` (`source_key`), items of a `TODO.md` project or of a project done, cancelled or archived, dropped links. Never placed: the state tags `someday`, `today`, `ticktick`, `urgent`, `🔎focus_mois`, `🔍focus_trimestre` (the default of `excluded_tags`).

Items that existed before the classifier was installed are never classified: there is no backlog pass.

## « Quand ? »

The classifier files, it never decides when. A task it gives a project or a domain (written directly or through **Apply** on a card) gets `tasks.needs_when = true`, unless it is a subtask, recurring or `#someday`. Such a task stays in Inbox › **Tâches à classer** (web and Android, `GET /tasks?type=unsorted`) with a **Quand ?** row: **Cette semaine**, **Une date**, **Plus tard**, **Sans date**. Any moment settles it, on whatever path it is written (a `beforeSave` hook on `Task`): a due date, `week_of`, `in_view_at`, `defer_until`, `later`, or closing the task; **Sans date** sends `needs_when: false` and keeps the task where it was filed. Undoing the classification clears it. `needs_when` is a synced task field. The migration flags the tasks already filed without a moment.

**Who is in « Tâches à classer »** (`case 'unsorted'` in `backend/modules/tasks/queries/query-builders.js`): open top-level tasks, not recurring, not `#someday`, not deferred past now, with no due date and not in view, either filed nowhere (no project, no domain) or waiting for **Quand ?**, and with no moment that still holds:

- `week_of` of this week or a later one keeps a task out; a past week decides nothing, so the task comes back.
- `month_of` of next month or later keeps it out. A month is a horizon, not a day: from the 1st of its month a task of that month comes back to be planned, and stays until it gets a day (plan line or due date), a week, is parked or is done. A past month brings it back likewise.
- A daily-plan line of the user on today or a later day is a moment decided: the task stays out. A line on a past day is not: a task planned yesterday and not done comes back.

Android applies the same rules (`TaskViews.unsorted`, plan lines from the day plans it keeps, `ServerPlan.plannedFrom`); its Today widget's Inbox scope does not read the plan.

## Duplicate links

Found by code, without the model (`core/duplicates.js`): the same address under another spelling (scheme, `www.`, tracking parameters, trailing slash), the same GitHub, GitLab, Codeberg or Bitbucket repository, the same YouTube video, or the same title (8 characters at least) on the same site. Only an **older** link counts as the original. The new link gets a card, nothing is dropped automatically, and the model is not asked about it.

## How it runs

1. **Trigger: the sync journal.** Every write path (web, Android sync, MCP, Telegram, imports) appends to `sync_changes`. A hook on its commit wakes the worker, which reads the journal from its cursor (`settings` key `auto_classify_journal_cursor`) and queues each new task, note or link (created in the last 2 days, after `auto_classify_since`) in `auto_classify_items`, due at creation + `grace_seconds`. No polling: the next due item sets the only timer.
2. **Preparation** (code): the item is read again; ineligible or already filled items are skipped; a link still `pending` waits (state `waiting`; its read wakes it through the journal); a duplicate becomes a card.
3. **Model call**: batches of `batch_size` items, through the provider of Profile › AI Assistant (OpenAI-compatible; Anthropic's endpoint works), with the classifier's own `model` if set. The answer is a strict JSON Schema whose enums are the item uids of the batch, the uids of open projects and domains and the names of tags (minus excluded ones): the model cannot invent one. The catalog (domains, projects with description and 4 open tasks each, tags with their use count) is cached `context_cache_minutes` per user. The system prompt says item and page text is data, never instructions. Anthropic's OpenAI-compatible endpoint has no prompt caching and ignores `reasoning_effort`.
4. **Validation** (`core/validate.js`): a known uid or tag, a field still empty, a confidence at or above its threshold (`project` 0.8, `tags` 0.8, `duration` 0.6). Between `ask` (0.4) and the threshold, the field goes on a card instead. A priority goes on a card at `priority` (0.8) or above. Anything else is dropped; `null` is a normal answer.
5. **Write**: the item is read again just before; if anything changed since step 2 (`core/fingerprint.js`) nothing is written (state `changed`). Writes go through the MCP tools (`update_task`, `update_note`, `update_link`), so the devices get them through the journal like any edit. Each written item gets one row in `auto_classify_changes`: pass (`run_id`), before, after, confidences, what was asked, and the item's state after the write.
6. **Failure**: a failed call or write is tried again after 1, 2, 4… minutes (60 at most), up to `max_attempts`; then the item is `failed`. Without an AI provider the items are `skipped` (`AI_NOT_CONFIGURED`); duplicate cards still work. The error kept on the item reads `status or code: message` (`401: invalid x-api-key`).
7. **Errors shown**: Profile › Classement and Android Réglages › Classement show a red banner with the newest API error until a later call succeeds, and the number of items `failed` or skipped for want of a provider, with **Réessayer**: they go back to the queue with their attempts reset.

In **dry run** mode (`mode: dry_run`) steps 1 to 4 run, the change rows are written with `dry_run: true`, and nothing else: no write, no card.

## Cards

One card per item, ever (`auto_classify_suggestions`, unique per item), shown in the triage queue as `type: classify` or `type: link_duplicate`, expired after `suggestion_ttl_days`, or as soon as it no longer asks anything: its item gone or closed, or every row it asks filled by hand (a duplicate card: either link archived). Applying a card only writes fields still empty, so a project or priority set by hand meanwhile is never overwritten. No limit per day by default (`daily_suggestion_limit`, 0 = none).

- **Classify**: up to three rows, each only when in doubt. *Project*: 1 to 3 projects, the domain (tasks), *New project* (name and domain proposed by the model, editable, created only on your tap), *Other…* (any project), *None*. *Tags*: the doubtful tags to tick, plus at most one *new tag*, unticked. *Priority*. Buttons: *Apply* (the best answers are preselected), *Accept all* (best project or domain, every tag offered, the priority; never a new project or tag), *None* (dismiss).
- **Duplicate link**: *Archive the new one* (« Archiver le nouveau »), *Merge into the old one* (its tags and note added, then the new one dropped), *Keep the new one* (the old one dropped), *Keep both*.
- **Android notifications**: after each sync, one notification per new card, quiet hours respected, off with `notify: false`. Buttons: *Accept all* / *None* / *Open* for a classify card, *Drop* / *Merge* / *Open* for a duplicate. Answers go through the deferred-call queue (offline safe).

## Marks and undo

A task, note or link shows **"Classé automatiquement · Annuler"** while it is exactly as the classifier left it: any edit removes the mark, and the undo with it (409). Undo puts back the `before` of the change. Profile › Classement lists the recent passes and undoes one change or a whole pass; a pass undone in part reports the changes refused.

## Settings

`ui_settings.classify`, edited in Profile › Classement (web) and Réglages › Organisation › Classement (Android). Each value: the user's, else `CADENCE_CLASSIFY_<NAME>` in the server's environment (`CADENCE_CLASSIFY_THRESHOLD_<NAME>` for thresholds, a comma list for `EXCLUDED_TAGS`), else the default. Out of bounds values are ignored (and refused with 400 from a client).

| Setting | Default | Bounds |
|---|---|---|
| `enabled` | `true` | |
| `mode` | `write` | `write`, `dry_run` |
| `notify` | `true` | Android notifications |
| `model` | `''` (the AI Assistant's model) | |
| `reasoning_effort` | `''` (not sent) | `minimal`, `low`, `medium`, `high` |
| `batch_size` | 12 | 1–50 |
| `grace_seconds` | 90 | 0–3600 |
| `fetch_wait_minutes` | 60 | 0–1440 |
| `max_attempts` | 5 | 1–20 |
| `context_cache_minutes` | 30 | 0–1440 |
| `suggestion_ttl_days` | 7 | 1–365 |
| `daily_suggestion_limit` | 0 (none) | 0–1000 |
| `log_retention_days` | 180 | 1–3650 |
| `max_tags` | 3 | 0–10 |
| `summary_max_chars` | 220 | 40–1000 |
| `max_tokens` | 2000 | 200–16000 |
| `thresholds` | `project` 0.8, `tags` 0.8, `duration` 0.6, `priority` 0.8, `ask` 0.4 | 0–1; `ask` never above `project` or `tags` |
| `excluded_tags` | the state tags | |

While the classifier is enabled, the triage assistant no longer proposes `reclass` (filing is the classifier's job).

## API

All under `/api` and `/api/v1`.

| Route | |
|---|---|
| `GET /auto-classify/settings` | `{ settings, defaults, ai_configured, health: { last_error: { message, at } \| null, retryable } }` |
| `POST /auto-classify/retry` | puts the `failed` items, and those skipped with `AI_NOT_CONFIGURED`, back in the queue; `{ requeued }` |
| `PUT /auto-classify/settings` | partial settings; 400 when a value is invalid |
| `GET /auto-classify/suggestions` | pending cards `{ suggestions: [{ uid, kind, entity, item_uid, payload, created_at, expires_at }] }` (also in `GET /triage`) |
| `POST /auto-classify/suggestions/:uid/apply` | `{ choice }`: `'all'`, `'none'`, `{ project: { type: project \| area \| new_project \| none, … }, tags, new_tag, priority }`, or `{ action }` for a duplicate (`drop_new`, `merge`, `keep_new`, `keep_both`); 409 once decided |
| `POST /auto-classify/suggestions/:uid/dismiss` | *None* |
| `GET /auto-classify/marks` | active marks, of one item with `?entity=&uid=`, else of the last 30 days |
| `POST /auto-classify/changes/:id/undo` | 409 when the item changed since |
| `GET /auto-classify/runs` | the last 30 passes with their changes and what can still be undone |
| `POST /auto-classify/runs/:runId/undo` | `{ undone, refused }` |
| `POST /auto-classify/dry-run` | `{ days }` (1–30): classifies the items created in those days without writing; `{ run_id, considered, results }` |

## Housekeeping

Every 6 hours: pending cards past their date expire, queue rows older than 30 days go, change rows older than `log_retention_days` go.
