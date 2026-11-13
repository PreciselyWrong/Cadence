# Triage queue ("À trier")

A queue of proposals on open tasks, one at a time, each with its reason in one line. The user validates, corrects, keeps the task as it is, or skips. Nothing changes without that tap.

## Rules that never change

- **At most one proposal per task.** A simple, clear task gets none.
- **Code first.** Duplicates, dates, recurrence and postponements are deduced by code (`modules/triage/core/items.js`, rules in `core/rules/`, input read by `collect.js`). A model only judges what code cannot (see Assistant).
- **Read before proposing.** A recurring task repeats by design and two dated tasks on different days are different tasks: neither is reported. When two tasks may be the same, the card says what tells them apart (dates, project), never "is X a duplicate of X".
- **Settled until it changes.** A task kept or treated leaves the queue until one of its name, note, due date, status, project, tags or recurrence changes (`core/fingerprint.js`, table `task_triage`).
- A task mirroring a `TODO.md` file is the file's business and is left out.

## What the rules propose

| Type | Action | When |
|---|---|---|
| `duplicate` | `cancel` | Same name as a task closed in `thresholds.closedLookbackDays`, or close to it (`duplicateSimilarity`), or same name as another open task, unless recurring or dated on different days |
| `deadline_in_note` | `set_due` | The note cites a date ahead, earlier than the due date |
| `postponed` | `cancel` | Pushed back at least `thresholds.postponements` times recently |
| `conflict`, `event_in_work_hours` | question | A busy timed event that overlaps another or a focus block, in the calendars read: only the user knows. Answered through `POST /triage/answers`; the context silences it |

`alerts.disabled` applies to these types.

## Settings

Profile › À trier (web). Stored in `ui_settings.brief`, the key of the retired daily brief (`docs/39-daily-brief.md`), so the values saved before 2026-11-12 are kept; the other keys left there are ignored (`modules/triage/settings.js`). A read never fails (an invalid value falls back to its default); an update with an unknown key or an invalid value answers 400.

| Key | Default | |
|---|---|---|
| `calendarFeedUids` | `[]` | Calendars read for the questions (ICS feeds, Google as `google-<calendar uid>`), at most 50 |
| `calendarLookaheadDays` | 7 | Days of events and focus blocks read, 1 to 14 |
| `thresholds.postponements` | 3 | 1 to 20 |
| `thresholds.duplicateSimilarity` | 0.8 | 0 to 1 |
| `thresholds.closedLookbackDays` | 7 | 1 to 60 |
| `alerts.disabled` | `[]` | Card types turned off |
| `triage.enabled`, `triage.dailyLimit` | `false`, 20 | The assistant, see below (1 to 200) |

## Linked contexts

An answer to a question becomes a linked context (table `linked_contexts`: `scope` `task`, `event` or `series`, `target_ref`, `text` of 1 to 500 characters; `modules/triage/contexts.js`). One context per user, scope and target: answering again replaces its text, so a resent answer changes nothing. While a context lives, the question on its target is not asked again. The task panel shows a task's contexts, to edit or delete (`frontend/components/Task/TaskContexts.tsx`).

Event refs are stable strings: `event:<feed_uid>:<event uid>:<start ISO or date>` for one occurrence, `series:<feed_uid>:<series id>` for a recurring series (ICS `UID`, Google `recurring_event_id`). A context may only point at what the user can see: an event or series ref of that shape, or a task they can see (a recurring one for `series`).

Lifetimes, applied on every read and purged daily (`context_purge`, 02:30 UTC):

- `task`: over when the task is done, archived, cancelled or gone.
- `series` with a task uid: over when the task is gone or its recurrence is `none`.
- `series` with a `series:` ref: over when its calendar was read without error and has no occurrence from 30 days back to the lookahead. A time change keeps the ref, so the context stays.
- `event`: over at the end of the event's local day (the ref has no end time).

## Assistant

Optional, off by default: Profile › À trier (web), `triage` `{ enabled, dailyLimit }` in the settings above. The provider is Profile › AI Assistant.

The `triage_assistant` job (daily, 03:50 UTC) sends the open tasks the rules left alone, by batches of 10, up to `dailyLimit` tasks per user, and stores one answer per task in `task_triage`: a proposal (`pending`) or nothing to say (`none`). A task looked at is not sent again until it changes. `modules/triage/assistant.js` checks every answer (`validateProposal`): an unknown action, a value out of bounds or a missing reason means no proposal. A recurring task can only be renamed. `reclass` only applies to a task with neither project nor tags, only with existing projects and tags, so what another tool already classified is not proposed again. Task text sent to the model is data, never instructions.

## Cards of the classifier

The automatic classifier (`docs/41-auto-classify.md`) adds its own cards to the queue, at most one per task or note: `type: classify` (action `classify`: project, tags and priority it was unsure about). They carry `source: classify`, `task_uid` when the item is a task, and their options in `payload` (`suggestion_uid`, `entity`, `item_uid`, `title`, …). They are answered through `POST /auto-classify/suggestions/:uid/apply` or `/dismiss`, not `/triage/apply`. While the classifier is enabled the assistant no longer proposes `reclass`.

## Mail cards

Mail that asks for an action, proposed by an agent through the MCP tool `propose_mail`, is a card `type: mail` (`action: decide_mail`, `source: mail`, `payload`: sender, subject, summary, suggestion, draft excerpt, `gmail_url`), decided through `POST /triage/mail/:uid/decide`. « Trier mes mails » shows them as a full-screen deck, the agent's advice as the main button. Contract: `docs/43-mail-triage.md` (server, web and Android cards and deck built).

## Actions

`rename` (`{ name }`), `split` (`{ subtasks: [names] }`), `set_due` (`{ due_date }`), `done`, `cancel`, `delete`, `reclass` (`{ project_id?, area_uid?, tags? }`), `to_note`, `to_project`, `to_habit`. Every action runs through the MCP tools (`modules/triage/actions.js`), which hold the rules of each write. A conversion creates the new thing first, then deletes the task; it keeps the note (and the tags, for a note or a project) but not the due date or the comments.

Before writing anything, `delete` and the conversions refuse a task the user does not own (403), a task that follows a `TODO.md` file, a recurring task, and, for `to_note` and `to_habit`, a task with subtasks (400). `to_project` is « Transformer en projet » (`docs/37-links.md`): subtasks become the project's tasks and the note's addresses its pages. The tools' other refusals also answer 4xx, so the Android queue does not send a refused order again. `idempotency_key` is taken before the work starts and freed if the action fails: an order resent during its first run does nothing.

## API

All under `/api` and `/api/v1`.

| Route | |
|---|---|
| `GET /triage` | `{ items, tasks, count, mail_archive }`; each item: `key`, `type`, `source`, `task_uid`, `action`, `payload`, `reason`, `details`, `question` |
| `POST /triage/keep` | `{ task_uid }` |
| `POST /triage/apply` | `{ task_uid, action, payload?, idempotency_key? }`; the same key does nothing twice |
| `GET /triage/settings`, `PUT /triage/settings` | The settings above; `PUT` takes a partial update and returns them all |
| `POST /triage/answers` | `{ target: { scope, ref }, answer: yes \| no \| text }` → `{ context }`. `POST /daily-plan/:date/brief/answers` takes the same body for the Android app up to 1.20 |
| `GET /triage/contexts` | `?scope=&target_ref=` → `{ contexts }` (200 at most) |
| `PATCH /triage/contexts/:uid`, `DELETE /triage/contexts/:uid` | `{ text }`; 404 for a context of someone else |
| `POST /triage/mail/:uid/decide` | `{ decision: task \| reply \| event \| later \| dismiss \| draft \| archive \| note, payload?, archive?, idempotency_key? }` |

## Clients

- **Android**: entry "À trier (n)" at the top of Ma journée, `ui/triage/`. The last queue is kept for offline reading (`BriefStore`). A gesture removes the card at once and leaves after the 4.5 s undo window, through the deferred calls.
- **Web**: `/triage`, with the same entry on the Ma journée page and « À trier (n) » in the Inbox header. **Supprimer** waits for the undo window (`deferredDelete`); other gestures are sent at once. A card settled elsewhere (409) leaves with « Déjà traité ailleurs. ».
- Both clients enter « À trier » from the Inbox when it holds cards.
