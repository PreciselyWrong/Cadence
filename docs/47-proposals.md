# Agent proposals: a week to plan, a review to do

Status: server built on 2026-11-13 (`backend/modules/proposals/`, table `proposals`, migration `20261113160000`). Web and Android windows, the Hermes side and the Hermes plugin transport are not built yet (plan: `docs/fork/PLAN-propositions.md`).

A proposal is a request the user starts from a button (« Planifier ma semaine », « Préparer ma revue »). Cadence computes the facts with code, an agent judges them, Cadence validates the answer and the user applies the checked parts. The agent never writes to Cadence: every change goes through the existing write paths of the tasks and of the day plan.

## Rules

- **Facts are code.** Open tasks, due dates, the day plans, the calendar events of the period and the review queue are read and ranked by Cadence (`core/`). The agent receives only those facts, never the whole task list.
- **The agent judges, the user decides.** A change happens only when the user applies it. Nothing is applied on answer.
- **The answer is validated.** Unknown task uids, operations outside the list, dates outside the period, choices outside a list and duplicate entries are dropped. An answer with nothing usable left, or one that is not an object, fails the proposal (`bad_answer`).
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
      "priority": "high", "estimate_min": 30, "overdue": true, "week_of": "2026-11-16", "someday": true }
  ]
}
```

Optional keys (`project`, `priority` only for medium and high, `estimate_min`, `overdue`, `week_of`, `someday`) appear only when they have a value.

Answer (`POST /api/proposals/:uid/answer`, `answer` object):

```json
{
  "summary": "Mardi est libre ; deux retards replacés.",
  "questions": [{ "id": "q1", "text": "Tu travailles mardi ?", "choices": ["Oui", "Non"] }],
  "changes": [
    { "task_uid": "abc123", "op": "plan_day", "date": "2026-11-17", "reason": "Mardi est libre" }
  ]
}
```

Limits: summary 300 characters, 3 questions (choices up to 4), a reason 140 characters, one change per task. Operations:

| `op` | Date | Applied as |
|---|---|---|
| `plan_day` | required, in the period | Added to that day's plan without a time; due date untouched (`carryOver`) |
| `this_week` | — | `update_task { week_of: "this_week", later: false }` |
| `later` | — | `update_task { later: true }` (the `#someday` tag) |
| `due` | required, in the period | `update_task { due_date }` |
| `drop` | — | `update_task { status: "cancelled" }` (not deleted) |

### `review` (« Préparer ma revue »)

The quick review queue of at most 10 items, built on the server with the rule of `buildQuickReview` (what needs a look first: pushed-back tasks, due reviews, old tasks; then parked ideas, at least three places when there are any). **Deliberate limit: tasks only.** The review's inbox items and stalled projects are not in the queue. Their decisions are not task writes and the answer contract is keyed by `task_uid`. Extending it needs a new contract, not a new choice id.

Choices by list. `keep` writes nothing.

| List | Choices |
|---|---|
| `pushed` | `do_today`, `later`, `drop`, `keep` |
| `later` | `do_today`, `this_week`, `in_view`, `done`, `drop`, `keep` |
| `stale` | `this_week`, `in_view`, `later`, `drop`, `keep` |

Facts: `items` (to judge: `uid`, `name`, `list`, `choices`, `project?`, and a little context: `pushed_times`, `review_due` or `last_activity` day), `cached` (judgements reused: `task_uid`, `name`, `list`, `choice`, `reason`), `stamps` (task uid → `updated_at` at the time). `stamps` is stored but never sent to the agent.

If no item needs a judgement, the proposal is `ready` at once with the reused answer and no event is emitted.

Answer: `{ "summary": "...", "items": [{ "task_uid": "abc123", "choice": "in_view", "reason": "..." }] }`. Each item must be in `facts.items`, with a choice of its list.

Choices of a parked task (`later`) take it out of Later: `do_today`, `this_week` and `in_view` send `later: false`.

## Endpoints

Routes sit behind the usual auth: the session of the app, or an API key (`Authorization: Bearer`) for the agent.

| Route | Who | Effect |
|---|---|---|
| `POST /api/proposals { kind, start?, end? }` | app | Creates a `pending` proposal (201), or returns the pending one of that kind (200). Emits `proposal.requested`. A review with nothing to judge is `ready` (201). |
| `GET /api/proposals?status=` | app | Latest proposal of each kind (optionally in one status). |
| `GET /api/proposals/:uid` | app | One proposal, with its `facts`. |
| `POST /api/proposals/:uid/answer` | agent | `{ answer }` or `{ error }`. Validates, sets `ready` (or `failed` with `error`), notifies. Only from `pending`. |
| `POST /api/proposals/:uid/reply { text }` | app | Only from `ready`: stores `reply_text`, back to `pending`, emits `proposal.requested` again. |
| `POST /api/proposals/:uid/apply` | app | Only from `ready` or `applied`. Week: `{ task_uids: [...] }`, each one must have a change in the answer. Review: `{ decisions: [{ task_uid, choice }] }`, each choice must belong to the item's list. Returns `{ uid, status: "applied", results: [{ task_uid, state: "applied" \| "failed", error? }] }`. A failed change does not stop the others. |
| `POST /api/proposals/:uid/dismiss` | app | Not after apply. |

Errors: 400 for bad input, 404 for another user's or unknown proposal, 409 for a status that does not allow the action.

## The event

`proposal.requested` (plugins and webhooks, `docs/46-plugins.md`, `docs/27-webhooks.md`), `data`:

- `uid`, `kind`, `facts` (as above);
- after a reply only: `reply` (the user's text) and `previous_answer`.

The agent answers with the API key on `POST /api/proposals/:uid/answer`.

## Notifications

When the answer is accepted or refused, one in-app notification of type `proposal`, sent to no external channel:

- `ready`: « Your week is ready » / « Your review is ready » (level `success`);
- `failed`: « Your week was not prepared » / « Your review was not prepared » (level `error`).

`data`: `{ proposal_uid, kind, status }`. It reaches the apps like other notifications (the notification stream and the list).

## Storage

Table `proposals`: `uid`, `user_id`, `kind`, `status` (`pending`, `ready`, `failed`, `applied`, `dismissed`), `period_start`, `period_end` (day, week only), `facts` (JSON, with `stamps`), `answer` (JSON), `error` (short code), `reply_text`, timestamps. Index `(user_id, kind)`. Not a sync entity: proposals are read online. Model `backend/models/proposal.js`.

## Not done yet

- No database constraint on one pending proposal per kind: two requests at the same instant can both create one (the second check runs before the write).
- No MCP tools for proposals; the answer is the HTTP route.
- Questions in a week answer are shown, not answered: a reply is a new round.
