# Mail cards in "À trier" (spec, not built)

Status: specified on 2026-11-12, nothing implemented yet. Tracked in `TODO.md` › Next.

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
- **Untrusted text.** Sender, subject, summary and draft excerpt are shown as plain text: no Markdown, no links. The only link is `gmail_url`, accepted only when it starts with `https://mail.google.com/`.
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
| `task` | Creates a task through the MCP tools: name and date from `payload` (prefilled from `suggestion`), note with the summary and `gmail_url`, source `mail` (the source icon of `TODO.md` › "Icône de la source"). Card done. |
| `reply` | The client opens `gmail_url` (the draft when there is one). Card done after the undo window. |
| `later` | Card hidden until `payload.until` (default tomorrow 08:00, profile time zone). |
| `dismiss` | Card done. |

`archive: true` (offered on `task`, `reply` and `dismiss`, off by default) archives the thread in Gmail after the decision is stored. If the archive fails, the decision stays and the client shows « Pas archivé dans Gmail ». The same `idempotency_key` does nothing twice, as for `/triage/apply`.

## Agent side (MCP)

| Tool | |
|---|---|
| `propose_mail` | `account`, `thread_id`, `from_name`, `from_address`, `subject`, `received_at`, `summary`, `suggestion`, `draft_excerpt?`, `gmail_url`. Creates or updates the card of the thread (rules above). Refuses a summary over 200 characters or a `gmail_url` outside Gmail. |
| `resolve_mail` | `account`, `thread_id`. Removes a pending card when the agent sees the thread handled in Gmail (answered, archived by hand). |
| `list_mail_cards` | Pending and recently decided cards, so the agent does not propose a thread twice and learns from dismissals. |

The agent's prompt change lives in Hermes, outside this repository.

## Gmail gateway

Optional. `TUDUDI_GMAIL_MCP_URL` and `TUDUDI_GMAIL_MCP_TOKEN` point Cadence's server at the restricted Gmail tool's HTTP endpoint on the same Docker network. Cadence calls only `archive_thread` and refuses any other tool name in code. Without these variables the archive option is hidden and Cadence never contacts Gmail. Cadence holds no Google OAuth token.

## Storage and sync

- Table `mail_items`: `uid`, `user_id`, `account`, `thread_id`, the card fields, `status` (`pending`, `later`, `done`), `later_until`, `decision`, `decided_at`, timestamps. Unique `(user_id, account, thread_id)`. Migration through the `safe*` helpers, checked on SQLite and PostgreSQL.
- Sync entity `mail_item` (read and decide offline on Android, decision replayed on reconnect); a decision made on both clients keeps the first one, the second gets 409 « Déjà traité ailleurs. ».
- Setting `ui_settings.mail.maxPending` (default 30): above it the oldest pending cards are shown last and the agent is told through `list_mail_cards`.

## Clients

- **Web**: mail cards in `/triage`, same layout as the other cards: sender and subject, summary, draft excerpt, buttons **Tâche**, **Répondre**, **Plus tard**, **Ignorer**, and « Archiver dans Gmail » when the gateway is set. « À trier (n) » counts them.
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
