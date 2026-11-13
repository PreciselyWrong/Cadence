# Agent proposals: a week to plan, a review to do

Status: contract v2 (2026-11-13): headline and subtitle, goals, areas and projects in the facts, the user picks any operation per task on apply. Server: `backend/modules/proposals/` (table `proposals`, migration `20261113160000`). Hermes plugin 3.2.0 (`lib/proposals.js`, skill `planificateur`). The web and Android sheets are being reworked against this contract (sections Clients below describe the previous window until then). Plan: `docs/fork/PLAN-propositions.md`.

A proposal is a request the user starts from a button (« Planifier ma semaine », « Préparer ma revue »). Cadence computes the facts with code, an agent judges them, Cadence validates the answer and the user applies the checked parts. The agent never writes to Cadence: every change goes through the existing write paths of the tasks and of the day plan.

## Rules

- **Facts are code.** Open tasks, due dates, the day plans, the calendar events of the period and the review queue are read and ranked by Cadence (`core/`). The agent receives only those facts, never the whole task list.
- **The agent judges, the user decides.** A change happens only when the user applies it. Nothing is applied on answer.
- **The answer is validated.** Unknown task uids, operations outside the list, dates outside the period, choices outside a list and duplicate entries are dropped. An answer without a headline, or one that is not an object, fails the proposal (`bad_answer`).
- **The user decides, per task.** The agent proposes; on apply the user may take any operation the list offers for any task of the facts, or keep it (see Apply).
- **One pending proposal per kind.** A second request while one is pending returns the pending one, without a new event.
- **Timeout.** A pending proposal not answered within 10 minutes (`PENDING_TIMEOUT_MINUTES`, `service.js`) becomes `failed` with `error: 'timeout'`. It is marked on the next read or request (`GET`, `GET /proposals`, a new `POST`, a late answer), so a new `POST` asks again and emits a new `proposal.requested`. A late answer gets 409. A reply restarts the clock.
- **Reuse.** A review item the agent already judged is not sent again while the task has not changed (`updated_at`, same value as at the judgement) and its choice still exists for its list.
- **Private to the user.** A user sees only their own proposals (other users get 404).

## Kinds

### `week` (« Planifier ma semaine »)

`POST /api/proposals { "kind": "week", "start"?, "end"? }`. The period defaults to today and six days after; it is at most 14 days, `end` not before `start`.

Tasks sent: open tasks that are overdue, due in the period, planned in the period, decided for this week (`week_of` = this week's first day) or in view. Never recurring tasks, subtasks, closed or habit tasks. Overdue first, then by due date, at most 40. Calendar events come from the calendars shown on the agenda (`calendar-feeds`, the same reading as the agenda). Load is the sum of the planned durations of a day.

Facts sent in `proposal.requested` (`data.facts`):

```json
{
  "period": { "start": "2026-11-16", "end": "2026-11-22" },
  "today": "2026-11-16",
  "days": [
    { "date": "2026-11-17", "events": [{ "title": "Dentiste", "start": "...", "end": "..." }],
      "planned": ["abc123"], "load_minutes": 45 }
  ],
  "tasks": [
    { "uid": "abc123", "name": "Valider le devis", "due": "2026-11-17", "project": "Cuisine",
      "priority": "high", "estimate_min": 30, "overdue": true, "week_of": "2026-11-16", "someday": true,
      "goal": "Rénover la cuisine", "area": "Maison" }
  ],
  "goals": [{ "uid": "g1", "title": "Courir un semi", "due": "2027-03-01", "progress": 40 }],
  "areas": ["Maison", "Santé"],
  "projects": [{ "name": "Cuisine", "area": "Maison" }]
}
```

Optional keys (`project`, `priority` only for medium and high, `estimate_min`, `overdue`, `week_of`, `someday`, `goal`, `area`, and on a goal `due` and `progress`) appear only when they have a value. The context keys (`goals`, `areas`, `projects`) are described in « Context » below.

Answer (`POST /api/proposals/:uid/answer`, `answer` object, contract v2):

```json
{
  "headline": "Mardi est libre ; deux retards replacés.",
  "subtitle": "Je garde le devis pour mardi, il bloque la commande.",
  "questions": [{ "id": "q1", "text": "Tu travailles mardi ?", "choices": ["Oui", "Non"] }],
  "changes": [
    { "task_uid": "abc123", "op": "plan_day", "date": "2026-11-17", "reason": "Mardi est libre" }
  ]
}
```

- `headline`: required, 60 characters at most (cut beyond); a short calm line.
- `subtitle`: optional, 160 characters at most, one sentence.
- A legacy answer with only `summary` is accepted: the summary becomes the subtitle and the headline is « Ta semaine ». Nothing else is derived from it: a legacy answer with changes but no summary is refused (`bad_answer`).
- `questions`: 3 at most, 4 choices each. `changes`: one per task; a reason 100 characters at most (week).

Operations the agent may propose:

| `op` | Date | Applied as |
|---|---|---|
| `plan_day` | required, in the period | Added to that day's plan without a time; due date untouched (`carryOver`) |
| `this_week` | — | `update_task { week_of: "this_week", later: false }` |
| `later` | — | `update_task { later: true }` (the `#someday` tag) |
| `due` | required, in the period | `update_task { due_date }` |
| `drop` | — | `update_task { status: "cancelled" }` (not deleted) |

### Apply (week)

`POST /api/proposals/:uid/apply { "decisions": [{ "task_uid", "op", "date"? }] }`. The user may pick, for any task of `facts.tasks`, any of `plan_day`, `this_week`, `later`, `due`, `drop` or `keep` (`keep`: nothing, and no result line). The operation can differ from the agent's. `date` is required for `plan_day` and `due` and must fall in `period.start` to `period.end` + 30 days. A task not in `facts.tasks` is refused with 400 (`Task … is not in this proposal`), as is a task decided twice, an unknown operation or a date out of the window. The legacy body `{ "task_uids": [...] }` still works: each uid takes the agent's operation (a uid the agent did not propose is 400).

### Send with notes (week)

The week sheet sends with `POST /api/proposals/:uid/send { "decisions": [...], "notes": [{ "task_uid", "text" }] }`. Both lists may be empty, not both.

- A task with a note must not have a decision: a task in both is 400. A note text is trimmed and 1 to 500 characters; a note on a task outside `facts.tasks` is 400, as is a note list that is not a list.
- `decisions` are checked and applied exactly as in Apply, through the same write paths; the response carries the same `results`.
- Without notes, the send is an apply: status `applied`, response `{ uid, status: "applied", results }`.
- With notes, the other decisions are applied now and the proposal goes back to `pending` for a second pass (`round` + 1). The facts are restricted to the noted tasks (period, days, goals, areas and projects kept; `days[].planned` only lists noted tasks). The stored answer is cleared, and `facts.round` and `facts.notes` are kept. Response `{ uid, status: "pending", round, results }`, `round` being the new pass (2 after the first send).
- The event `proposal.requested` carries `facts` (restricted), `round` (2 for the second pass), `notes` (trimmed) and `previous_answer: { changes }`, the earlier changes of the noted tasks only. The agent's answer is validated against the restricted facts: a change on another task is dropped.
- When answered, the proposal is `ready` again, with the round-2 answer only; the sheet shows only the noted tasks, and a send of their decisions applies them. The pending timeout and the one-pending-per-kind rule still apply.
- A second send with notes increments `round` again; the same restriction applies to the current facts.
- Only week proposals: `send` on a review is 400. Review keeps `/apply`.

Storage: `facts.round` (integer, 1 at creation) and `facts.notes`, in the existing `facts` JSON, no new column. Both are bookkeeping: `agentFacts` removes them from the facts the agent reads, and `GET` returns them at the top level as `round` and `notes`.

### `review` (« Préparer ma revue »)

The quick review queue of at most 10 items, built on the server with the rule of `buildQuickReview` (what needs a look first: pushed-back tasks, due reviews, old tasks; then parked ideas, at least three places when there are any). **Deliberate limit: tasks only.** The review's inbox items and stalled projects are not in the queue. Their decisions are not task writes and the answer contract is keyed by `task_uid`. Extending it needs a new contract, not a new choice id.

Choices by list. `keep` writes nothing.

| List | Choices |
|---|---|
| `pushed` | `do_today`, `later`, `drop`, `keep` |
| `later` | `do_today`, `this_week`, `in_view`, `done`, `drop`, `keep` |
| `stale` | `this_week`, `in_view`, `later`, `drop`, `keep` |

Facts: `items` (to judge: `uid`, `name`, `list`, `choices`, `project?`, and a little context: `pushed_times`, `review_due` or `last_activity` day), `cached` (judgements reused: `task_uid`, `name`, `list`, `choice`, `reason`), `stamps` (task uid → `updated_at` at the time). `stamps` is stored but never sent to the agent. The context (`goals`, `areas`, `projects`, see below) is sent too.

If no item needs a judgement, the proposal is `ready` at once with the reused answer and no event is emitted.

Answer: `{ "headline": "...", "subtitle"?: "...", "items": [{ "task_uid": "abc123", "choice": "in_view", "reason": "..." }] }`, the headline and subtitle as for a week (a legacy `summary` maps to the subtitle, the headline is « Ta revue »). Each item must be in `facts.items`, with a choice of its list; a reason 140 characters at most.

Choices of a parked task (`later`) take it out of Later: `do_today`, `this_week` and `in_view` send `later: false`.

## Endpoints

Routes sit behind the usual auth: the session of the app, or an API key (`Authorization: Bearer`) for the agent.

| Route | Who | Effect |
|---|---|---|
| `POST /api/proposals { kind, start?, end? }` | app | Creates a `pending` proposal (201), or returns the pending one of that kind (200). Emits `proposal.requested`. A review with nothing to judge is `ready` (201). |
| `GET /api/proposals?status=&kind=` | app | Latest proposal of each kind (optionally in one status, or one kind: `week`, `review`, `career`). A career answer lists each item with its `decision`, and the proposal has `decisions`. |
| `GET /api/proposals/:uid` | app | One proposal, with its `facts`. |
| `POST /api/proposals/:uid/answer` | agent | `{ answer }` or `{ error }`. Validates, sets `ready` (or `failed` with `error`), notifies. Only from `pending`. |
| `POST /api/proposals/:uid/reply { text }` | app | Only from `ready`: stores `reply_text`, back to `pending`, emits `proposal.requested` again. |
| `POST /api/proposals/:uid/send { decisions, notes }` | app | Week only, only from `ready`. Applies the decisions; with notes, sends the noted tasks back for a second pass (`pending`, next `round`). See Send with notes. |
| `POST /api/proposals/:uid/apply` | app | Only from `ready` or `applied`. Week: `{ decisions: [{ task_uid, op, date? }] }`, see Apply (legacy `{ task_uids }` still accepted). Review: `{ decisions: [{ task_uid, choice }] }`, each choice must belong to the item's list. Returns `{ uid, status: "applied", results: [{ task_uid, state: "applied" \| "failed", error? }] }`, one line per change applied (not per `keep`). A failed change does not stop the others. |
| `POST /api/proposals/:uid/dismiss` | app | Not after apply. |
| `POST /api/proposals/:uid/apply` (career) | app | Only from `ready`. Body `{ decisions: [{ kind, id, op, note?, due_date? }] }`, see Career. Returns `{ uid, status, results: [{ kind, id, state: "applied" \| "already_decided" \| "failed", task_uid?, error? }] }`. |

Errors: 400 for bad input, 404 for another user's or unknown proposal, 409 for a status that does not allow the action.

## The event

`proposal.requested` (plugins and webhooks, `docs/46-plugins.md`, `docs/27-webhooks.md`), `data`:

- `uid`, `kind`, `facts` (as above);
- after a reply only: `reply` (the user's text) and `previous_answer`;
- on every request: `round` (1, or the second pass of Send with notes) and `notes` (`[]` unless a second pass). A second pass also carries the restricted `facts` and `previous_answer: { changes }`.

The agent answers with the API key on `POST /api/proposals/:uid/answer`.

## Context

Computed by code on every week and review (`backend/modules/proposals/core/context.js`, read by `service.js` `userContext`), capped, so the agent can justify its choices without reading the account:

- `goals`: active Cadence goals (objectives and key results), the earliest due date first, 8 at most: `{ uid, title, due?, progress? }`, `progress` being the goal's own percent when it has linked items.
- `areas`: names of the areas the user can see, 10 at most.
- `projects`: active projects only (`not_started`, `in_progress`, `planned`, `waiting`; not paused, done, cancelled or archived), the most recently touched first, 15 at most: `{ name, area? }`.
- No free text about the user. Who the user is comes from the planner's own memory (Hermes, `memoire_chercher`), not from a Cadence setting.

Each week task may carry `goal` (the title of its goal) and `area` (its own area, else its goal's, else its project's) when linked.

## Notifications

When the answer is accepted or refused, one in-app notification of type `proposal`, sent to the desktop and mobile streams:

- `ready`: title « Ta semaine est prête » or « Ta revue est prête », message = the headline, level `success`;
- `failed`: « Ta semaine n’a pas pu être préparée » or « Ta revue n’a pas pu être préparée », no message, level `error`.

`data`: `{ proposal_uid, kind, status }`. It reaches the apps like other notifications (the notification stream and the list).

## Storage

Table `proposals`: `uid`, `user_id`, `kind`, `status` (`pending`, `ready`, `failed`, `applied`, `dismissed`), `period_start`, `period_end` (day, week only), `facts` (JSON, with `stamps`, and for week `round` and `notes`), `answer` (JSON), `error` (short code), `reply_text`, timestamps. Index `(user_id, kind)`. Not a sync entity: proposals are read online. Model `backend/models/proposal.js`.

## Career (« Point emploi »)

Kind `career`. The agent creates the proposal ready-made, through the MCP tool `propose_career`: Cadence computes no facts, so there is no pending state and no `proposal.requested` event. The tool is open to the same API key as `propose_mail`. Code: `backend/modules/proposals/career.js` (service), `core/career.js` (checks, pure), `backend/modules/mcp/tools/careerTools.js` (tool).

Input (`propose_career`):

- `headline` (required, 60 characters), `subtitle` (160);
- `stats`: `[{ label (20), value (12) }]`, 4 at most;
- `followups`: `[{ id, title (120), company?, applied_at?, note? (140), draft_url?, source_url? }]`, 10 at most. `draft_url` must be `https://mail.google.com/`;
- `offers`: `[{ id, title (120), company (120), location?, rate? (60), url, expires?, fit (200), source? ('jobseeka' or 'agent') }]`, 15 at most. `url` must be https;
- `tasks`: `[{ id, name (200), note?, due_date? }]`, 8 at most.

`id` is the agent's own, letters, digits, `_` or `-`, 1 to 64 characters. Dates are `YYYY-MM-DD`. Texts are cut to their limits. Entries with a bad id, a missing required field or an https address that is not https are dropped, a repeated id keeps its first entry, an invalid optional date or source is dropped alone. Refused (400): no headline, or no valid follow-up, offer or task.

A new career proposal dismisses the ready one, so one payload is decided at a time. It is stored `ready`, with the payload as facts and as answer, and notifies (desktop and mobile): title = the headline, message = the subtitle.

Apply, `POST /api/proposals/:uid/apply { decisions }`. Each decision names an item of the payload:

| Item | Operations | Effect |
|---|---|---|
| `offer` | `apply`, `skip`, `later` | `apply` creates the task « Postuler : <title> — <company> », due at `expires` (or in 3 days if it is past), its note is the fit, its source link the offer `url`. |
| `followup` | `done`, `task`, `later` | `task` creates « Relancer <company> » due today, with the draft in its note. `done` only records it. |
| `task` | `create`, `skip`, with `due_date?` | `create` creates the task (name, note, the decision's date or the item's). |

- `apply`, `done`, `task`, `create` and `skip` are final: an item settled once answers `already_decided` and creates nothing. `later` keeps the item open.
- Partial apply is allowed. The proposal stays `ready` until every item has a final decision, then `applied`.
- A failed task is reported as `failed` and not recorded; the others still run.
- Decisions are kept in `facts.decisions` (each with its `task_uid` when one was created) and shown on the answer.
- Each apply that records something emits `proposal.decided` with `data: { uid, kind: "career", decisions }`: the decisions of that call, notes included. The notes are the user's words, to be treated as data.

Tasks are created through the `create_task` tool with `source: "mcp"`: `agent` is not a task source, and adding one would touch the web and Android badges.

## Clients › Web

Online only, like the Android client: nothing is kept offline. `frontend/utils/proposalsService.ts` (the routes above), `frontend/components/Proposals/`: `ProposalButton.tsx` (header button), `useProposal.ts` (the latest proposal of a kind, polled every 5 s only while pending), `ProposalSheet.tsx` (the week's sheet), `DecisionMenu.tsx` (the choices of a row), `weekDecisions.ts` (pure rules: decisions, groups, apply body, days), `ProposalHost.tsx` (mounted in `Layout.tsx`, opens `?proposal=<uid>` like `?task=`), `proposalLinks.ts` (the param and `PROPOSAL_CHANGED_EVENT`).

- **Button**: « Planifier ma semaine » in the header of Aujourd'hui and of Planifier (`UpcomingBoard.tsx`). Idle, then « En préparation… » (disabled, spinner), then « Ta semaine est prête », which opens the sheet by `?proposal=`. A failure seen on the page shows a toast with « Réessayer » (`showUndoToast`, with its own label). « Préparer ma revue » sits in the Review header; when ready, its button starts the quick review.
- **Notification**: the bell routes a `proposal` notification (`data.proposal_uid`) to the sheet; a review one goes to `/review`, a career one (`data.kind` = `career`) to `/career`.
- **Sheet**: a dialog (bottom sheet with a grab bar under 640 px, centred card above), enter and leave motion off under `prefers-reduced-motion`. Header: the period as a small pill, `answer.headline` as the title (normal title size), `answer.subtitle` muted under it; an older answer with only `summary` shows « Ta semaine » with the summary as the subtitle, as the server and Android read it. Questions: one soft block, each question with a row of compact chips (a choice sends `reply` with `Q: … R: …`, then waits again).
- **Rows**: the task name (from `facts.tasks`), its goal tag (else its area), the agent's reason in small muted text, and on the right one decision chip showing the current decision, the agent's by default (« Lun. 16 », « Auj. », « Cette semaine », « Plus tard », « Tel quel », « Abandonner », « Échéance … » for an agent `due`). The chip opens `DecisionMenu.tsx`: day chips of the period from today on (`plannableDays`), « Cette semaine », « Plus tard », « Garder tel quel », « Abandonner », « Autre date… » (a date field from today to the period's end + 30 days, sent as `plan_day`, as Android). A changed row tints its chip, shows « Modifié » and an undo button back to the suggestion. Rows are grouped by their CURRENT decision (days, « Cette semaine », « Plus tard », « À abandonner », « Tel quel »; `groupByDecision` in `weekDecisions.ts`, pure) and glide to their new group (FLIP, 240 ms, none under reduced motion); the row keeps the focus.
- **Remarques**: each row has a « Remarque » icon button (`data-note-trigger`) that opens one line under the row (`data-note-editor`, 500 characters, autofocus). Escape or Enter collapses it and gives the focus back to the button; an empty remark is no remark. A noted row shows « À revoir », its decision chip becomes « À revoir avec ta remarque » (the decision is not applied and not undoable there), and it stays in its group. The footer then shows « Envoyer » (primary) with the caption « N appliquées · M renvoyées » (N = decisions to apply, M = remarks), not « Appliquer (N) ». « Envoyer » calls `sendProposal` (`POST /api/proposals/:uid/send`, `{ decisions, notes: [{ task_uid, text }] }`, `notesToSend` in `weekDecisions.ts`), closes the sheet with the toast « M tâches renvoyées, je te préviens quand c’est prêt », and the header button goes back to « En préparation… » through `PROPOSAL_CHANGED_EVENT`.
- **Keys**: arrows move between rows, Enter on a row opens its menu (arrows, digits 1–9 for a day, Escape back to the row), a digit on a row plans it on that day of the period, Enter elsewhere applies, Escape closes the menu then the sheet, Ctrl+Enter sends a reply being written.
- **Footer**: « Ignorer » (quiet, dismisses), « Répondre » (secondary, opens the reply field), « Appliquer (N) » (primary, N = the decisions other than `keep`). Apply sends `{ decisions: [{ task_uid, op, date? }] }` (`decisionsToApply`, `keep` left out), then shows the per-task results and closes when all went through. Closing with the cross or the backdrop keeps the proposal ready.
- **Refresh**: after an apply or a dismissal, `PROPOSAL_CHANGED_EVENT` makes Aujourd'hui and Planifier re-read their day and plan, and every proposal button re-read its state.
- **Review**: the quick review reads the judgements of a ready (or partly applied) review. Each judged task shows the agent's choice as a primary button « Valider : … » with its reason under the card; Enter validates it. The choice maps to the option of the row (`OPTION_KEYS` in `ReviewPage.tsx`; `keep` is « Keep parked » in Later); the other options stay. The validation calls `POST …/apply` with `decisions`. Without a ready review, the quick review is unchanged.
- **Rail**: Review is on the default minimal rail (`minimalSidebar.ts`); a saved layout keeps its place.

### Carrière (web)

Page `/career` (`frontend/components/Career/CareerPage.tsx`, pure rules `careerModel.ts`), rail entry « Carrière » (briefcase) on the default minimal rail, after Review. Service: `listCareerProposals` (`GET /api/proposals?kind=career&status=ready`) and `applyCareerDecisions` (`POST …/apply`, a result `failed` is an error, `already_decided` is not) in `proposalsService.ts`. Online only.

- **Header**: « Carrière » and « mis à jour à 9 h 15 » (the proposal's `created_at`), then the answer's headline and subtitle, then up to 4 stat tiles (label, value). The newest ready proposal is shown (`latestProposal`).
- **Relances**: title · company, « postulé il y a 3 semaines » (`applied_at`, `Intl.RelativeTimeFormat`), the note; « Ouvrir le brouillon » (`draft_url`, new tab, decides nothing), « Créer la tâche » (`task`), « Fait » (`done`), « Plus tard » (`later`). The title links to `source_url`.
- **Offres à décider**: one card each: the title linked to `url`, company, location · rate · « expire dans N jours » (« expirée » once past), the agent's `fit`; « Postuler » (the page's one primary button), « Passer », « Plus tard », « Remarque » (one inline line, 500 characters, Enter or Escape closes it). A non-blank remark goes with the next decision of that card as `note`.
- **Tâches proposées**: rows with a round mark, name, due date and note; « Ajouter » (`create`, with the item's `due_date`), « Passer » (`skip`).
- **Decisions**: each tap applies that one decision at once, optimistically: the item leaves its section for « Décidé (N) », collapsed, each row with its title and a state label (« Postulé », « Passée », « Plus tard », « Faite », « Tâche créée », « Ajoutée », « Écartée »), no undo. A failed apply puts the item back and shows a toast; a write queued offline stays decided. Decisions already in `decisions` start in « Décidé ». `later` is decided for the page, though the server keeps the item open.
- **Empty**: « Rien de neuf aujourd’hui » without a ready proposal; « Tout est décidé pour aujourd’hui » once every item is decided.
- **Links**: only http and https addresses become links (`safeUrl`); anything else shows as text.

## Clients › Android

Online only, like the mail deck: nothing is kept in Room. `tasks/.../proposals/` (`ProposalsClient` for the routes above, `ProposalRepository` for the last proposal of each kind, the open sheet and the tab a notification asks for, `ProposalModel.kt` for the pure rules). Offline, the actions say « Hors ligne » and keep nothing.

- **Button**: « Planifier ma semaine » at the top of Planifier and Aujourd'hui; « Préparer ma revue » in the quick review card. Idle, then « En préparation… » (reads `GET /api/proposals` every 5 s while it is shown), then « … est prête ». A failed proposal goes back to idle.
- **Notification**: a `proposal` notification from the stream (`data.proposal_uid`, `data.status`) is posted on the calm channel « Agents · infos » with Android's own wording (the agent is not named). Ready week: tap opens the sheet. Failed week: tap opens Planifier. Review: tap opens Bilan.
- **Sheet** (`ui/proposals/ProposalSheet.kt`, a bottom sheet over any tab): the headline (`answer.headline`, « Ta semaine » for an older answer) and the subtitle (`answer.subtitle`, or the older `summary`), the period as a pill, the questions as chips (a choice sends `POST …/reply` with the question and the choice). The changes are grouped by their current decision: days, « Cette semaine », « Plus tard », due dates, « Abandonner », « Garder tel quel ». Each row shows the task name, its goal or area tag, the reason, and a trailing decision chip (the agent's operation by default, e.g. « lun. 16 »). A tap opens the choices of that task: each day of the period, « Cette semaine », « Plus tard », « Garder tel quel », « Abandonner », « Autre date » (date picker, sent as `plan_day`). A changed row shows « modifié » and « Rétablir ». « Appliquer (N) » sends `POST …/apply` with `{ decisions: [{ task_uid, op, date? }] }` for every decision other than `keep`. « Répondre » sends a reply; « Ignorer » dismisses (`POST …/dismiss`). Closing the sheet without applying keeps the proposal ready.
- **Remarques** (Android 1.31.0): each row has a « Remarque » icon button; a tap opens an inline field under the row (500 characters at most). A row with a note shows « À revoir » instead of its decision chip and is not applied. With notes, the footer shows « Envoyer » and the caption « N appliquées · M renvoyées » (N = decisions other than keep and other than noted rows). « Envoyer » sends `POST …/send` with `{ decisions: [{ task_uid, op, date? }], notes: [{ task_uid, text }] }` (`Proposals.sendBody`): the noted rows and the keeps are left out of `decisions`. Afterwards the sheet closes, « M tâches renvoyées » is shown, and the button is back to « En préparation… » (the proposal is pending again). The notes are reset by a reply, as the choices are. The server route `POST …/send` is not in `backend/modules/proposals/routes.js` yet: until it exists, « Envoyer » fails with an error.
- **Pure rules** in `ProposalModel.kt`: the decision of a task (the agent's, unless the user chose another; a choice equal to the agent's is dropped, so the row is not « modifié »), the sections by decision, the menu options of a period, the apply body, and the count of decisions other than `keep`. Choices live in the sheet and are reset by a reply.
- **Review**: once the review is ready, each judged task shows the agent's choice first, filled, with its reason under the title; one tap on it applies that single decision (`POST …/apply` with `decisions`), then the quick review moves on.

### Carrière (Android)

Read-only list of the career proposals the agent prepared (`kind: career`, server side in the career contract). Online only; nothing kept on the phone.

- **Entry**: a « Carrière » panel in Bilan, under « Revue ». Notification `proposal` with `data.kind` = `career` (ready or failed) opens the screen (`ProposalNotifications.ROUTE_CAREER` → `ProposalTab.CAREER`, which switches to Bilan).
- **Read**: `GET /api/proposals?kind=career&status=ready` (`ProposalsClient.listCareer`), newest ready proposal (`CareerModel.newestReady`).
- **Screen** (`tasks/.../ui/proposals/CareerScreen.kt`): header with the answer's headline (or « Carrière ») and subtitle; stat tiles; sections « Relances », « Offres à décider », « Tâches proposées », then « Décidé (N) » collapsed. Empty: « Rien de neuf aujourd'hui ». Offline: « Hors ligne », actions off.
- **Decisions**: one per tap, `POST …/apply` with `decisions: [{ kind, id, op, note?, due_date? }]` (`CareerModel.applyBody`, `CareerDecision.of` keeps only the ops of each kind: offer `apply|skip|later`, followup `done|later|task`, task `create|skip`). The list is read again after each decision. A remark on an offer is trimmed, 500 characters at most, and sent with its decision.
- **Links**: an offer opens its `url`, a followup its `draft_url` (Ouvrir le brouillon); only http and https open (`CareerModel.safeUrl`), through the app's URI handler.
- **Pure rules** in `proposals/CareerModel.kt` (tests in `CareerModelTest.kt`): open items are those without a decision; decided items keep their title and op; stats accept numbers or strings.

## Not done yet

- The web rail entry `career` is not in `MINIMAL_RAIL_KEYS` (`backend/modules/users/validation.js`): a place chosen for it in Profile › Sidebar is dropped on save and the default (rail) comes back.

- No database constraint on one pending proposal per kind: two requests at the same instant can both create one (the second check runs before the write).
- No MCP tools for proposals; the answer is the HTTP route.
- Questions in a week answer are shown, not answered: a reply is a new round.
- Android notifications: `notifyOutcome` sends `sources: []`, and the notification stream only publishes `desktop` or `mobile` sources (`backend/utils/notificationStream.js`), so the phone never receives « Ta semaine est prête ». It needs `sources: ['mobile', 'desktop']` in `notifyOutcome`; not changed in the Android work.
