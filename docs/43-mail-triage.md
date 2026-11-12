# Mail cards in "À trier"

Status: server built on 2026-11-12 (`backend/modules/triage/mail.js`, MCP tools, route, Gmail gateway); web card built the same day (`frontend/components/Triage/MailCard.tsx`); the Android card is not built yet (`TODO.md` › Now). Tracked in `TODO.md` › Next.

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
| `suggestion` | `{ kind: task \| reply \| read, task_name?, due_date?, project_uid? }` |
| `draft_excerpt` | First 280 characters of the prepared draft, if any |
| `gmail_url` | Opens the thread (or the draft) in Gmail |

`reason` (shown on the card) is the summary.

## Decisions

`POST /triage/mail/:uid/decide` with `{ decision, payload?, archive?, idempotency_key? }`:

| Decision | Effect |
|---|---|
| `task` | Creates a task through the MCP tools: name and date from `payload` (prefilled from `suggestion`), note with the summary and `gmail_url`, source `gmail` with the Gmail address as `source_url` (the source badge). Card done. |
| `reply` | The client opens `gmail_url` (the draft when there is one). Card done: sent at once on the web, like the other triage gestures. |
| `later` | Card hidden until `payload.until` (default tomorrow 08:00, profile time zone). |
| `dismiss` | Card done. |

`archive: true` (offered on `task`, `reply` and `dismiss`, off by default) archives the thread in Gmail after the decision is stored. If the archive fails, the decision stays and the client shows « Pas archivé dans Gmail ». The same `idempotency_key` does nothing twice, as for `/triage/apply`.

## Agent side (MCP)

| Tool | |
|---|---|
| `propose_mail` | `account`, `thread_id`, `from_name`, `from_address`, `subject`, `received_at`, `summary`, `suggestion`, `draft_excerpt?`, `gmail_url`. Creates or updates the card of the thread (rules above). Refuses a summary over 200 characters, a `gmail_url` outside Gmail, or an impossible date (`2026-02-31`). |
| `resolve_mail` | `account`, `thread_id`. Closes a waiting card (pending or put off) when the agent sees the thread handled in Gmail (answered, archived by hand). |
| `list_mail_cards` | Pending and recently decided cards, so the agent does not propose a thread twice and learns from dismissals. |

The agent's prompt change lives in Hermes, outside this repository.

## Gmail gateway

Optional. `TUDUDI_GMAIL_MCP_URL` and `TUDUDI_GMAIL_MCP_TOKEN` point Cadence's server at the restricted Gmail tool's HTTP endpoint on the same Docker network. The token is the tool's **archive-only token** (`--archive-token-file`, tool 1.3.0), never its full token: the tool itself refuses every other method and tool for it (`403 tool_not_allowed`), and Cadence's code only ever sends `archive_thread`, without following redirects. Without these variables the archive option is hidden and Cadence never contacts Gmail. Cadence holds no Google OAuth token.

## Storage and offline

- Table `mail_items`: `uid`, `user_id`, `account`, `thread_id`, the card fields, `status` (`pending`, `later`, `done`), `later_until`, `decision` (`task`, `reply`, `later`, `dismiss`, or `resolved` by the agent), `decided_at`, `decide_key`, `task_uid`, `archived_at`, timestamps. Unique `(user_id, account, thread_id)`. Migration through the `safe*` helpers, checked on SQLite and PostgreSQL.
- Not a sync entity: like every triage card, the card comes with `GET /triage` (kept for offline reading on Android) and the decision is a REST call with an `idempotency_key`, replayed by the deferred calls. A decision made on both clients keeps the first one: the card is taken (status `deciding`) before the work, so two orders never both run; another decision answers 409 « Déjà traité ailleurs. », the same one is answered as done (`replayed: true`). A failed decision gives the card back and frees its key; a card left `deciding` by a crash is free again after 5 minutes. The last key stays on the card, even when a new message reopens it, so an old order resent later does not settle the new message.
- Cards are listed newest first, with no cap: the agent only proposes what asks for an action.
- `GET /triage` carries `mail_archive: true` when the Gmail gateway is set, so the clients show the archive option.

## Clients

- **Web** (`frontend/components/Triage/MailCard.tsx`): subject as title, sender and date, summary, draft excerpt, all as plain text; buttons **Tâche** (a form with the suggested name and due date, so 2 taps), **Répondre** (a link that opens `gmail_url` in a new tab, only when it is a Gmail address, and settles the card), **Plus tard**, **Ignorer**; the main button is Répondre when the agent suggests a reply, Tâche otherwise. « Archiver dans Gmail » (a check box, off) only when `mail_archive` is true; it is never sent with Plus tard, and « Pas archivé dans Gmail » shows when the archive failed. « À trier (n) » counts the cards.
- **Android**: the same card in `ui/triage/`, same gestures and undo window; **Répondre** opens Gmail on the thread (same handling as the Gmail links of 1.15.2).

## Out of scope

Reading a whole message, sending, attachments, IMAP or other providers, rules or filters, labels other than the inbox.

## Checks once built

- The agent proposes 3 threads: 3 cards on web and phone, none for a newsletter.
- **Tâche** creates the task with the Gmail link in its note in at most 2 taps.
- **Répondre** opens the prepared draft in Gmail.
- With the gateway set, « Archiver » removes the thread from the Gmail inbox; without it, the option is absent and no request leaves Cadence.
- A mail summary containing Markdown or a link shows as plain text.
- Decided card gone after 30 days; offline decision on the phone reaches the server once.

Server side, these are covered by `backend/tests/integration/triage-mail.test.js` (SQLite and PostgreSQL 16).
