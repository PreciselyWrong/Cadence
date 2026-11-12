# Triage queue ("À trier")

A queue of proposals on open tasks, one at a time, each with its reason in one line. The user validates, corrects, keeps the task as it is, or skips. Nothing changes without that tap.

## Rules that never change

- **At most one proposal per task.** A simple, clear task gets none.
- **Code first.** Duplicates, dates, recurrence and postponements are deduced by code (`modules/triage/core/items.js`, on the brief's rules). A model only judges what code cannot (see Assistant).
- **Read before proposing.** A recurring task repeats by design and two dated tasks on different days are different tasks: neither is reported. When two tasks may be the same, the card says what tells them apart (dates, project), never "is X a duplicate of X".
- **Settled until it changes.** A task kept or treated leaves the queue until one of its name, note, due date, status, project, tags or recurrence changes (`core/fingerprint.js`, table `task_triage`).
- A task mirroring a `TODO.md` file is the file's business and is left out.

## What the rules propose

| Type | Action | When |
|---|---|---|
| `duplicate` | `cancel` | Same name as a task closed in `thresholds.closedLookbackDays`, or close to it (`duplicateSimilarity`), or same name as another open task, unless recurring or dated on different days |
| `deadline_in_note` | `set_due` | The note cites a date ahead, earlier than the due date |
| `postponed` | `cancel` | Pushed back at least `thresholds.postponements` times recently |
| `conflict`, `event_in_work_hours` | question | An event: only the user knows. Answered through `POST /daily-plan/:date/brief/answers`; the context silences it |

`alerts.disabled` applies to these types. These questions no longer appear in the brief, whose `anticipate[].question` is always `null`.

## Assistant

Optional, off by default: Profile › Daily brief (web), Réglages › Résumé (Android), `ui_settings.brief.triage` `{ enabled, dailyLimit }` (default 20, 1 to 200). The provider is Profile › AI Assistant.

The `triage_assistant` job (daily, 03:50 UTC) sends the open tasks the rules left alone, by batches of 10, up to `dailyLimit` tasks per user, and stores one answer per task in `task_triage`: a proposal (`pending`) or nothing to say (`none`). A task looked at is not sent again until it changes. `modules/triage/assistant.js` checks every answer (`validateProposal`): an unknown action, a value out of bounds or a missing reason means no proposal. A recurring task can only be renamed. `reclass` only applies to a task with neither project nor tags, only with existing projects and tags, so what another tool already classified is not proposed again. Task text sent to the model is data, never instructions.

## Cards of the classifier

The automatic classifier (`docs/41-auto-classify.md`) adds its own cards to the queue, at most one per task, note or link: `type: classify` (action `classify`: project, tags and priority it was unsure about) and `type: link_duplicate` (action `resolve_duplicate`). They carry `source: classify`, `task_uid` when the item is a task, and their options in `payload` (`suggestion_uid`, `entity`, `item_uid`, `title`, …). They are answered through `POST /auto-classify/suggestions/:uid/apply` or `/dismiss`, not `/triage/apply`. While the classifier is enabled the assistant no longer proposes `reclass`.

## Links to review

A link still to read whose review day (`review_at`) has come is a card `type: link_review` (`action: review_link`, `source: links`, `payload: { link_uid, title, url, review_at }`), until the user decides: `POST /triage/links/:uid/review` with `{ decision: keep | archive | later }` (keep clears the day, archive sets `dropped`, later sets today + 30 days).

## Slots proposed by agents

The MCP tool `propose_link_slot` (`link_uids`, `title`, `reason`, `date`, `start_minute?`, `duration_minutes?`) stores a proposal for related links: the only planning an AI may suggest. It appears in the queue as a `link_slot` item (`action: accept_slot`, details: the links). `POST /triage/slots/:id/accept` creates the task, with the addresses in its note, and places it in that day's plan; `POST /triage/slots/:id/refuse` forgets it. Nothing happens before that tap. A slot whose day has passed is no longer shown.

## Mail cards (planned)

Mail that asks for an action, proposed by the mail-sorting agent and decided here: `docs/43-mail-triage.md` (spec, not built).

## Actions

`rename` (`{ name }`), `split` (`{ subtasks: [names] }`), `set_due` (`{ due_date }`), `done`, `cancel`, `delete`, `reclass` (`{ project_id?, area_uid?, tags? }`), `to_note`, `to_project`, `to_habit`. Every action runs through the MCP tools (`modules/triage/actions.js`), which hold the rules of each write. A conversion creates the new thing first, then deletes the task; it keeps the note (and the tags, for a note or a project) but not the due date or the comments.

Before writing anything, `delete` and the conversions refuse a task the user does not own (403), a task that follows a `TODO.md` file, a recurring task, and, for a conversion, a task with subtasks (400). The tools' other refusals also answer 4xx, so the Android queue does not send a refused order again. `idempotency_key` is taken before the work starts and freed if the action fails: an order resent during its first run does nothing.

## API

All under `/api` and `/api/v1`.

| Route | |
|---|---|
| `GET /triage` | `{ items, tasks, count }`; each item: `key`, `type`, `source`, `task_uid`, `action`, `payload`, `reason`, `details`, `question` |
| `POST /triage/keep` | `{ task_uid }` |
| `POST /triage/apply` | `{ task_uid, action, payload?, idempotency_key? }`; the same key does nothing twice |
| `POST /triage/links/:uid/review` | `{ decision: keep \| archive \| later }` |

## Clients

- **Android**: entry "À trier (n)" at the top of Ma journée, `ui/triage/`. The last queue is kept for offline reading (`BriefStore`). A gesture removes the card at once and leaves after the 4.5 s undo window, through the deferred calls.
- **Web**: `/triage`, with the same entry on the Ma journée page and « À trier (n) » in the Inbox header. **Supprimer** waits for the undo window (`deferredDelete`); other gestures are sent at once. A card settled elsewhere (409) leaves with « Déjà traité ailleurs. ».
- Both clients enter « À trier » from the Inbox when it holds cards.
