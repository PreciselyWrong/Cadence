# Mail cards in "À trier"

Status: server built on 2026-11-12 (`backend/modules/triage/mail.js`, MCP tools, route, Gmail gateway); web card built the same day (`frontend/components/Triage/MailCard.tsx`); Android card the same day (1.17.0, `android/tasks/.../ui/triage/MailCards.kt`). « Trier mes mails » deck and the appointment decision (`event`) on 2026-11-13, server, web and Android; the Hermes side (create the calendar event, chat on a card) is still to do (see Hermes contract). Tracked in `TODO.md` › Next.

Mail that asks something of the user shows up as cards in the triage queue (`docs/40-triage.md`), next to the other proposals. The user decides there in one gesture. Cadence is not a mail client: it never shows a full message, never sends, and only touches Gmail to archive a thread when the user asks for it.

## Why this shape

- The mail-sorting agent already reads Gmail and prepares reply drafts through the restricted Gmail tool (`integrations/hermes-gmail/`). What is missing is a place to decide, and chat is a poor one.
- A real client (IMAP, threads, HTML rendering, sending, attachments) would take months, stay worse than Gmail, and put untrusted HTML and mail tokens inside Cadence.
- Cadence already has the queue, its gestures on web and Android, offline reading and the MCP write path. Mail cards reuse all of it.

## Rules

- **The agent proposes, the user decides.** A card changes nothing until the user taps it, like every triage card.
- **Only mail that needs an action.** The agent sends a card for a thread that asks for a reply, a task or a decision. Newsletters, notifications and receipts never become cards.
- **One card per thread.** Keyed on `(user, account, thread_id)`. A new message on a thread already pending updates its card; a thread already decided gets a new card only if a new message arrives after the decision.
- **No mail body in Cadence.** A card holds the sender, the subject, the date, a one-line summary written by the agent and, when there is one, the start of the prepared draft. Nothing else is stored.
- **Untrusted text.** Sender, subject, summary and draft excerpt are shown as plain text: no Markdown, no links. Control characters and the characters that reorder or hide text (bidi controls, zero-width) are dropped when stored. The only link is `gmail_url`, accepted only when it starts with `https://mail.google.com/`.
- **Gmail writes stay narrow.** The only write Cadence may make in Gmail is archiving a thread, through the restricted Gmail tool's `archive_thread`, and only if that tool is configured (see Gmail gateway). Sending always happens in Gmail, by the user.
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
| `propose_mail` | `account`, `thread_id`, `from_name`, `from_address`, `subject`, `received_at`, `summary`, `suggestion`, `draft_excerpt?`, `gmail_url`. Creates or updates the card of the thread (rules above). Refuses a summary over 200 characters, a `gmail_url` outside Gmail, or an impossible date (`2026-02-31`). |
| `resolve_mail` | `account`, `thread_id`. Closes a waiting card (pending or put off) when the agent sees the thread handled in Gmail (answered, archived by hand). |
| `list_mail_cards` | Pending and recently decided cards, with their `decision` and `event`, so the agent does not propose a thread twice, learns from dismissals and finds the appointments still `requested`. |
| `report_mail_event` | `account`, `thread_id`, `state: created \| failed`, `url?` (only `https://calendar.google.com/…` or `https://www.google.com/calendar/…`), `error?` (200 characters). Records what came of an accepted appointment on its card. Refused on a card not decided as `event`. |

Every decision (not a replay of the same order) is also sent as the webhook and plugin event `mail.decided` (`docs/27-webhooks.md`), `data.mail`: `mail_uid`, `account`, `thread_id`, `subject`, `decision`, `task_uid`, `event`, `later_until`.

## Hermes contract

What the mail agent and the Hermes plugin (separate repository) do with the deck:

- **Propose an appointment.** When a mail sets a meeting, `propose_mail` with `suggestion: { kind: "event", event: { title, start, end?, location? } }`. The deck shows « Ajouter à l’agenda : <date> » as the main button.
- **Create it once accepted.** The plugin subscribes to `mail.decided` (manifest `events`) and forwards a decision `event` to the mail agent's Hermes route; the agent creates the event in Google Calendar through capgw, then calls `report_mail_event` (`created` with the event link, or `failed` with the reason, also written to the Agents inbox). As a fallback (plugin off, agent down), the agent's scheduled run reads `list_mail_cards` and handles every card whose `event.state` is still `requested`. The calendar write must be idempotent on `(account, thread_id)`: the event and the poll can both see the same card.
- **Chat on a card.** « Discuter » opens the plugin page with `?view=chat&mail=<mail_uid>`. The page should start (or resume) a conversation with the mail agent about that card: it can read the card from `GET /api/triage` (item `mail:<mail_uid>`) for the subject, sender and summary. Until the plugin reads `mail`, the button opens the plain chat.

The agent's prompt change lives in Hermes, outside this repository.

## Gmail gateway

Optional. `TUDUDI_GMAIL_MCP_URL` and `TUDUDI_GMAIL_MCP_TOKEN` point Cadence's server at the restricted Gmail tool's HTTP endpoint on the same Docker network. The token is the tool's **archive-only token** (`--archive-token-file`, tool 1.3.0), never its full token: the tool itself refuses every other method and tool for it (`403 tool_not_allowed`), and Cadence's code only ever sends `archive_thread`, without following redirects. Without these variables the archive option is hidden and Cadence never contacts Gmail. Cadence holds no Google OAuth token.

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
- **Android gestures**: swipe right follows the advice, left puts off (TalkBack has both as custom actions); back closes the deck.

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
