# Mail cards in "À trier"

Status: contract v2 (choices, draft, archive, note, action report) built on the server on 2026-11-13, then in the web and Android decks the same day; see « Contract v2 » and « Trier mes mails » deck. Server built on 2026-11-12 (`backend/modules/triage/mail.js`, MCP tools, route, Gmail gateway); web card built the same day (`frontend/components/Triage/MailCard.tsx`); Android card the same day (1.17.0, `android/tasks/.../ui/triage/MailCards.kt`). « Trier mes mails » deck and the appointment decision (`event`) on 2026-11-13, server, web and Android; the Hermes side was built the same day (see Hermes contract), not yet deployed. Tracked in `TODO.md` › Next.

Mail that asks something of the user shows up as cards in the triage queue (`docs/40-triage.md`), next to the other proposals. The user decides there in one gesture. Cadence is not a mail client: it never shows a full message, never sends, and only touches Gmail to archive a thread when the user asks for it.

## Why this shape

- The mail-sorting agent already reads Gmail and prepares reply drafts through the restricted Gmail tool (`integrations/hermes-gmail/`). What is missing is a place to decide, and chat is a poor one.
- A real client (IMAP, threads, HTML rendering, sending, attachments) would take months, stay worse than Gmail, and put untrusted HTML and mail tokens inside Cadence.
- Cadence already has the queue, its gestures on web and Android, offline reading and the MCP write path. Mail cards reuse all of it.

## Rules

- **The agent proposes, the user decides.** A card changes nothing until the user taps it, like every triage card.
- **Only mail that needs an action.** The agent sends a card for a thread that asks for a reply, a task or a decision. Newsletters, notifications and receipts never become cards.
- **One card per thread.** Keyed on `(user, account, thread_id)`. A new message on a thread already pending updates its card; a thread already decided gets a new card only if a new message arrives after the decision.
- **No mail body in Cadence.** A card holds the sender, the subject, the date, a one-line summary written by the agent, the start of the mail (v2 `excerpt`) and, when there is one, the start of the prepared draft and the draft the agent asks Cadence to keep for Gmail (v2 `draft`, the agent's own text). Never the body of a message.
- **Untrusted text.** Sender, subject, summary and draft excerpt are shown as plain text: no Markdown, no links. Control characters and the characters that reorder or hide text (bidi controls, zero-width) are dropped when stored. The only link is `gmail_url`, accepted only when it starts with `https://mail.google.com/`.
- **Gmail writes stay narrow.** Cadence makes no Gmail write itself on a card decision. The legacy `archive` flag archives a thread through the restricted Gmail tool's `archive_thread`, only if that tool is configured (see Gmail gateway). The v2 draft and archive decisions only record a request: Hermes carries it out through its own Gmail gateway and reports back (`report_mail_action`). Sending always happens in Gmail, by the user.
- **Short retention.** A decided card is deleted 30 days after its decision (daily compaction).

## Card

Triage item `type: mail`, `source: mail`, `action: decide_mail`, `payload`:

| Field | |
|---|---|
| `mail_uid` | Cadence id of the card |
| `account` | Account key of the Gmail tool (no address) |
| `from_name`, `from_address` | Sender |
| `subject` | Subject line |
| `received_at` | Last message of the thread, ISO 8601 |
| `summary` | What the mail asks, one line, at most 200 characters |
| `suggestion` | `{ kind: task \| reply \| read \| event, task_name?, due_date?, project_uid?, event? }`; `event` (kind `event` only): `{ title, start, end, all_day, location? }`, `start` a day `YYYY-MM-DD` (all day) or an ISO 8601 time with its offset, `end` of the same kind and after `start` |
| `draft_excerpt` | First 280 characters of the prepared draft, if any |
| `gmail_url` | Opens the thread (or the draft) in Gmail |

`reason` (shown on the card) is the summary.

## Decisions

`POST /triage/mail/:uid/decide` with `{ decision, payload?, archive?, idempotency_key? }`:

| Decision | Effect |
|---|---|
| `task` | Creates a task through the MCP tools: name and date from `payload` (prefilled from `suggestion`), note with the summary and `gmail_url`, source `gmail` with the Gmail address as `source_url` (the source badge). Card done. |
| `reply` | The client opens `gmail_url` (the draft when there is one). Card done: sent at once on the web card, after the undo window in the deck. |
| `event` | An appointment for the agent to put in the user's Google Calendar: `payload` may correct `title`, `start`, `end`, `location` (a new `start` without `end` drops the old end), the rest comes from `suggestion.event`; title defaults to the subject. Refused (400, card kept) without any start. Stored on the card as `event: { title, start, end, all_day, location?, state: requested }`. Cadence never writes to the calendar itself: the agent does (see Hermes contract). Card done. |
| `later` | Card hidden until `payload.until` (default tomorrow 08:00, profile time zone). |
| `dismiss` | Card done. |

`archive: true` (offered on `task`, `reply`, `event` and `dismiss`, off by default) archives the thread in Gmail after the decision is stored. If the archive fails, the decision stays and the client shows « Pas archivé dans Gmail ». The same `idempotency_key` does nothing twice, as for `/triage/apply`.

## Agent side (MCP)

| Tool | |
|---|---|
| `propose_mail` | `account`, `thread_id`, `from_name`, `from_address`, `subject`, `received_at`, `summary`, `suggestion`, `draft_excerpt?`, `gmail_url`, and in v2 `options?`, `recommended?`, `draft?`, `excerpt?` (see « Contract v2 »). Creates or updates the card of the thread (rules above). Refuses a summary over 200 characters, a `gmail_url` outside Gmail, or an impossible date (`2026-02-31`). |
| `resolve_mail` | `account`, `thread_id`. Closes a waiting card (pending or put off) when the agent sees the thread handled in Gmail (answered, archived by hand). |
| `list_mail_cards` | Pending and recently decided cards, with their `decision` and `event`, so the agent does not propose a thread twice, learns from dismissals and finds the appointments still `requested`. |
| `report_mail_event` | `account`, `thread_id`, `state: created \| failed`, `url?` (only `https://calendar.google.com/…` or `https://www.google.com/calendar/…`), `error?` (200 characters). Records what came of an accepted appointment on its card. Refused on a card not decided as `event`. |
| `report_mail_action` | `account`, `thread_id`, `type: draft \| archive`, `ok`, `draft_url?`, `error?` (a code). Records what came of a requested draft or archive (v2, see « Contract v2 »). |

Every decision (not a replay of the same order) is also sent as the webhook and plugin event `mail.decided` (`docs/27-webhooks.md`), `data.mail`: `mail_uid`, `account`, `thread_id`, `subject`, `decision`, `task_uid`, `event`, `later_until`.

## Hermes contract

Built on 2026-11-13 in the Hermes repository and the Hermes plugin 2.5.0; still to deploy.

- **Propose.** The mail agent's 6:30 summary job proposes each mail to decide through `propose_mail` (through capgw, which only lets the card fields and a Gmail link through), with `suggestion: { kind: "event", event: { title, start, end?, location? } }` when a mail sets a meeting. When a thread is settled in the agent's own chat, it calls `resolve_mail`.
- **Create the accepted appointments, without AI.** Every 10 minutes a script-only job calls capgw's `mail_events_sync`: capgw reads the cards through `list_mail_cards`, and for each card decided `event` whose `event.state` is `requested`, creates the event in the primary Google Calendar from Cadence's data (never from an agent's arguments), once (private property `cadenceMail = <account>:<thread_id>`), then calls `report_mail_event` (`created` with the link, or `failed` for an unreadable date). Google unreachable or not yet authorized: the card stays `requested` for the next run. Agents never get `report_mail_event`. Needs the Google scope `calendar.events` on capgw's token.
- **`mail.decided`** stays available to webhooks and plugins; the Hermes plugin does not need it.
- **Chat on a card.** « Discuter » opens the plugin page with `?view=chat&mail=<mail_uid>`. The page reads the card from `GET /api/triage` (item `mail:<mail_uid>`), opens a new conversation with the profile of its setting `mailAgent`, and passes the card as data only.

## Storage and offline

- Table `mail_items`: `uid`, `user_id`, `account`, `thread_id`, the card fields, `status` (`pending`, `later`, `done`), `later_until`, `decision` (`task`, `reply`, `event`, `later`, `dismiss`, or `resolved` by the agent), `decided_at`, `decide_key`, `task_uid`, `archived_at`, `event` (JSON, the accepted appointment and its `state`, migration `20261113120000`), timestamps. Unique `(user_id, account, thread_id)`. Migration through the `safe*` helpers, checked on SQLite and PostgreSQL.
- Not a sync entity: like every triage card, the card comes with `GET /triage` (kept for offline reading on Android) and the decision is a REST call with an `idempotency_key`, replayed by the deferred calls. A decision made on both clients keeps the first one: the card is taken (status `deciding`) before the work, so two orders never both run; another decision answers 409 « Déjà traité ailleurs. », the same one is answered as done (`replayed: true`). A failed decision gives the card back and frees its key; a card left `deciding` by a crash is free again after 5 minutes. The last key stays on the card, even when a new message reopens it, so an old order resent later does not settle the new message.
- Cards are listed newest first, with no cap: the agent only proposes what asks for an action.
- `GET /triage` carries `mail_archive: true` when the Gmail gateway is set, so the clients show the archive option.

## Clients

- **Web** (`frontend/components/Triage/MailCard.tsx`): subject as title, sender and date, summary, draft excerpt, all as plain text; buttons **Tâche** (a form with the suggested name and due date, so 2 taps), **Répondre** (a link that opens `gmail_url` in a new tab, only when it is a Gmail address, and settles the card), **Plus tard**, **Ignorer**; the main button is Répondre when the agent suggests a reply, Tâche otherwise. « Archiver dans Gmail » (a check box, off) only when `mail_archive` is true; it is never sent with Plus tard, and « Pas archivé dans Gmail » shows when the archive failed. « À trier (n) » counts the cards.
- **Android** (1.17.0, `triage/MailCard.kt`, `ui/triage/MailCards.kt`): the same card and gestures; Tâche opens a sheet with the name and due date; **Répondre** opens the thread at once through `CadenceUriHandler` (Gmail's mobile site, as for the Gmail links of 1.15.2). Every decision leaves after the 4.5 s undo window through the deferred calls (key `triage-mail:<uid>`, one `idempotency_key` per gesture), so it is replayed offline and refused once (409) if the web decided first.

## « Trier mes mails » deck

A button « Trier mes mails (n) » at the top of « À trier » (only when there are mail cards) opens the mail cards as a full-screen deck, one card at a time: sender and date, subject, the agent's summary, the appointment when there is one, the draft excerpt.

- **Main button = the agent's advice**, done in one tap (rules in `frontend/components/Triage/mailDeck.ts` and `android/.../triage/MailDeck.kt`, same tests): `task` (or no advice) creates the suggested task (name, due date) at once; `reply` opens the thread in Gmail and decides `reply`; `read` opens it in Gmail and decides `dismiss`; `event` (with a start) decides `event`. An address outside Gmail is never opened: the advice falls back to the task.
- **Secondary buttons**: « Modifier la tâche » (or « Tâche ») opens the task form, « Répondre » (when the advice is not a reply), « Plus tard », « Ignorer »; then « Ouvrir le mail » (Gmail, same link as the cards), « Discuter » (only when the Hermes plugin has a page, see Hermes contract), « Passer » (the card goes to the end of the deck), « Archiver dans Gmail » when the gateway is set.
- **After each decision** the card leaves with a short animation (none with reduced motion) and the next comes in; the last decision waits before it is sent, so « Annuler » brings that card back first. Web: held until the next decision, 5 s, or closing the deck; Android: the triage undo window (4.5 s, deferred calls, works offline). A decision that fails puts its card back; one settled elsewhere (409) is dropped with « Déjà traité ailleurs. ».
- **End**: « Tout est trié » and a button back to « À trier ».
- **Web keys**: Entrée or → follows the advice, ← puts off, ↓ skips, Ctrl/⌘+Z undoes, Échap closes (or closes the task form); keys are ignored while typing in the form. The deck is a modal dialog; the page under it is not rendered.
- **Web deck v2** (2026-11-13, `frontend/components/Triage/MailDeck.tsx`, rules `deckButtons` and `deckProgress` in `mailDeck.ts`): progress « 4 / 17 » with a thin bar (cards decided since the deck opened). The card shows `action_error` on top (« Le brouillon n’a pas pu être préparé (code) »), sender · date, subject, summary, the excerpt as plain text (folded after 420 characters or 7 lines under « Lire le mail »), « Ouvrir dans Gmail », then the draft body quoted. One row of 2 to 5 big buttons from `options` in their order (Brouillon, Répondre, Tâche, Agenda, Plus tard, Archiver, Ignorer, with their icons; Tâche shows the task name, Agenda the time); `recommended` is framed and tinted, with no advice sentence, and none is highlighted without it. Répondre (`reply`, only from an older card) opens Gmail, as does Ignorer on a `read` card without excerpt (shown as « Lire »); a `reply` option outside Gmail and an `event` without start are dropped. Below, quiet: « Répondre par un mot » (a field, Entrée or « Envoyer » sends `note`, the card leaves with « Renvoyé au Trieur »), « Discuter » (Hermes plugin), « Passer », « Annuler ». Footer status: « Brouillon en préparation dans Gmail », « Archivage demandé », and the earlier ones. Keys: Entrée or → = `recommended` (nothing without it), 1–5 = that button, ← = `later`, ↓ = pass, Ctrl/⌘+Z = undo, Échap closes the note field, then the deck. « Archiver dans Gmail » (the `archive` flag) shows only on a card without an Archiver choice, and is sent only with `task`, `reply`, `event` and `dismiss`. A card without `options` (kept from before) gets today's advice first, then Tâche, Répondre, Plus tard, Ignorer. The task form (« Modifier la tâche ») is gone from the deck; it stays on the « À trier » card.
- **Android gestures**: swipe right follows the advice, left puts off (TalkBack has both as custom actions); back closes the deck.
- **Android deck v2** (1.31.0, `ui/triage/MailDeckScreen.kt`, rules in `triage/MailDeck.kt`, tests `MailDeckTest`): a card with `options` shows them in one row of 2 to 5 big buttons (Brouillon, Répondre, Tâche, Agenda, Plus tard, Archiver, Ignorer); `recommended` is framed and tinted and answers the right swipe. Only Répondre opens Gmail; draft and archive send their decision and say so in a snackbar. The excerpt is readable on the card (« Lire le mail »), the draft body is quoted, `action_error` shows on top. « Répondre par un mot » sends `note` (1 to 500 characters, the card leaves); « Annuler » undoes the last decision while its 4.5 s window is open. Progress « n / N » counts the cards decided since the deck opened. A card without `options` keeps the 1.17 buttons. The `archive` flag is sent only with `task`, `reply`, `event` and `dismiss` (the server refuses it elsewhere). The web deck v2 is built (above).

## Contract v2

Built on the server on 2026-11-13 (`backend/modules/triage/mail.js`, `core/mail.js`, MCP `mailTools.js`, migration `20261113170000`); web and Android still to build, see « Clients ». Everything is additive: a card proposed without the new fields and the existing decisions behave as before.

**The user swipes through the whole inbox.** Per mail the agent offers 2 to 5 decisions, recommends one, and the user picks: the recommended one is highlighted, archiving happens only when the user presses Archive, a draft is created in the background, and a free-text answer goes back to the agent.

### Choices (`propose_mail`)

| Field | |
|---|---|
| `options` | 2 to 5 of `draft \| task \| event \| later \| archive \| dismiss`, distinct, in display order. `reply` is not offered. |
| `recommended` | One of `options`. Optional (no highlight without it). |
| `draft` | `{ body }`, 1 to 4000 characters of plain text. Required with the `draft` option, refused without it. |
| `excerpt` | Start of the mail, plain text, at most 1500 characters (refused above). Shown on the card so the user reads it without leaving Cadence. |

Without `options`, the choices come from the old `suggestion` and are stored the same way: `task` → `task, later, dismiss` (recommended `task`); `reply` → `reply, task, later, dismiss` (recommended `reply`); `read` → `dismiss, task, later` (recommended `dismiss`); `event` → `event, task, later, dismiss` (recommended `event`); no suggestion → `task, later, dismiss`. The `reply` value comes only from this derivation, never from input.

Text is cleaned as before (control and invisible characters dropped). The draft body keeps its line breaks.

### Decisions (`POST /triage/mail/:uid/decide`)

| Decision | Effect |
|---|---|
| `draft` | Card done, `action: { type: draft, state: requested }`. Refused (400) when the card has no draft body. Cadence does not call Gmail: Hermes creates the draft from `draft.body`. |
| `archive` | Card done, `action: { type: archive, state: requested }`. Cadence does not call Gmail: Hermes archives the thread. Refused with the `archive` flag (400). |
| `note` | `payload.text`, 1 to 500 characters (400 otherwise). Card state `reviewing`: hidden from the deck, `note: { text }` kept on the card, `mail.decided` emitted with the note in `data.mail.note`. A decision on a card waiting for the agent answers 409. |

The existing decisions are unchanged, and the legacy `archive: true` flag is still accepted. Every new decision keeps the rules of the other decisions: one order at a time, `idempotency_key`, 409 when settled elsewhere, the event in `mail.decided`. A decision that settles the card (any but `later` and `note`) clears a failed action left on it; `draft` and `archive` set their own.

### Reporting the action (`report_mail_action`, MCP)

`account`, `thread_id`, `type` (`draft` or `archive`), `ok` (boolean), `draft_url?` (`https://mail.google.com/…`, `draft` with `ok: true` only), `error?` (a code: lowercase letters and underscores, at most 40 characters, `ok: false` only).

- `ok: true` → `action: { type, state: done, draft_url? }`; an archive also sets `archived_at`.
- `ok: false` → the card is reopened: `status: pending`, `decision` cleared, `action: { type, state: failed }`, `action_error: <code>`. The user sees the error and can press the action again.
- The same report again is answered as it is (not an error). A report that contradicts the recorded result is refused (409), as is a report for an action never requested on the card (409).

### Listing and the agent's second pass

- `list_mail_cards` returns, besides the earlier fields: `options`, `recommended`, `draft` (the body, for Hermes to create the draft), `excerpt`, `action`, `action_error`, `note`. Hermes sees each requested draft and archive there, and each note.
- `GET /triage` returns `options`, `recommended`, `draft`, `excerpt`, `action` and `action_error` in each mail item's `payload`.
- A new `propose_mail` for a thread in `reviewing` replaces the card: open again, new choices and text, the note cleared. A `requested` action still waiting for its report survives the reopen, so the report still finds it.

### Storage

Table `mail_items`, migration `20261113170000` (`safe*` helpers, SQLite and PostgreSQL): `options` (JSON), `recommended` (string 16), `draft` (JSON `{ body }`), `excerpt` (text), `note` (JSON `{ text }`), `action` (JSON), `action_error` (string 64). `status` gains `reviewing`, `decision` gains `draft`, `archive` and `note`. Retention is unchanged: a card done is deleted 30 days after its decision.

### Clients

The « Trier mes mails » decks of the web and Android show the choices, the excerpt, the draft, the note field and the action error (see « Trier mes mails » deck). The cards of the « À trier » list (web `MailCard.tsx`, Android `MailCards.kt`) still show the earlier buttons and ignore the new fields; a card with `options` works there with those buttons.

## Out of scope

Reading a whole message, sending, attachments, IMAP or other providers, rules or filters, labels other than the inbox.

## Checks once built

- The agent proposes 3 threads: 3 cards on web and phone, none for a newsletter.
- **Tâche** creates the task with the Gmail link in its note in at most 2 taps.
- **Répondre** opens the prepared draft in Gmail.
- With the gateway set, « Archiver » removes the thread from the Gmail inbox; without it, the option is absent and no request leaves Cadence.
- A mail summary containing Markdown or a link shows as plain text.
- Decided card gone after 30 days; offline decision on the phone reaches the server once.

Server side, these are covered by `backend/tests/integration/triage-mail.test.js` (SQLite and PostgreSQL 16; the appointment tests of 2026-11-13 ran on SQLite only).
