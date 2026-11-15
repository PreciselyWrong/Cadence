# Agent decisions: one deck for every job that asks

Status: contract written on 2026-11-15, built the same day (server, web, Android, Hermes side). Mail cards (`docs/43-mail-triage.md`) keep their own contract: they carry Gmail-specific fields. Every other job that needs the user's choice uses this one.

An agent job (Hermes cron) finds things only the user can settle: a subscription to keep or cancel, a container update that may break, who drives the kids, a contract to renew, two memories that disagree. It proposes them as **decision cards**. The user goes through them in a deck like « Trier mes mails »: the agent's advice is highlighted, one tap decides. What was decided is carried out afterwards by code (Hermes side, no AI), never by the agent.

## Rules

- **The agent proposes, the user decides.** A card changes nothing until it is decided.
- **Facts and the follow-up are code.** The agent only judges and words the card. Applying a decision is deterministic (Hermes `decisions_sync`), from what is stored in Cadence, never from an agent's arguments.
- **Untrusted text.** Every text field is plain text: no Markdown, no links, control and invisible characters dropped (same cleaning as mail cards). The only link is `url`, `https://` only.
- **One card per thing.** Keyed on `(user, kind, key)`. A new proposal for a pending or `later` card updates it; a card waiting for the agent after a note (`reviewing`) is replaced and reopened; a decided card is left alone (`already_decided` in the answer).
- **Short retention.** A decided card is deleted 30 days after its decision (daily compaction, like mail cards).

## Card

| Field | Rule |
|---|---|
| `kind` | `^[a-z][a-z0-9_]{0,31}$`. Known kinds today: `subscription`, `docker_update`, `family`, `finance`, `memory`. Any valid kind is accepted (the deck is generic). |
| `kind_label` | Shown as the card's eyebrow and the group name, 1 to 40 characters (« Abonnements »). |
| `key` | The agent's stable id of the thing, `^[A-Za-z0-9._:-]{1,128}$`. |
| `title` | 1 to 120 characters. |
| `context` | Optional, 280 characters: the one line that says why it is asked. |
| `body` | Optional, 1500 characters, plain text, line breaks kept: details (folded after 7 lines in the clients). |
| `url` | Optional, `https://…` only, 2000 characters. Opened by « Ouvrir ». |
| `choices` | 2 to 5 `{ id, label, tone? }`: `id` `^[a-z][a-z0-9_]{0,23}$`, distinct, not `note` nor `later`; `label` 1 to 30 characters; `tone` `primary` or `danger` (optional). In display order. |
| `recommended` | Optional, one of the `choices` ids. |
| `reason` | Optional, 140 characters: why the agent recommends it (shown small under the buttons). |
| `data` | Optional JSON object, at most 2 KB serialized: what the follow-up needs (container name, version, date, memory ids). Never shown, returned to `list_decisions` only. |

`later` is always offered by the clients (« Plus tard », default tomorrow 08:00 in the profile time zone) and is not a choice.

## MCP tools (agent side, same API key as `propose_mail`)

| Tool | |
|---|---|
| `propose_decisions` | `kind`, `kind_label`, `items` (1 to 30 cards: `key`, `title`, `context?`, `body?`, `url?`, `choices`, `recommended?`, `reason?`, `data?`). Each item is checked on its own: a bad one is reported (`{ key, error }`) and skipped, the others are stored. Answer `{ created, updated, reopened, already_decided, errors: [{ key, error }] }`. Refused (400) when `kind` or `kind_label` is bad or `items` is empty or longer than 30. Starts the « N décisions à prendre » notification timer. |
| `list_decisions` | `kind?`, `status?` (`pending`, `later`, `reviewing`, `done`). Default: every card not done, plus the cards decided in the last 30 days. Each card: all its fields, `uid`, `status`, `decision`, `note`, `later_until`, `decided_at`, `result`. |
| `report_decision` | `kind`, `key`, `ok` (boolean), `error?` (a code, `^[a-z_]{1,40}$`, `ok: false` only), `url?` (`https://`). Records the follow-up of a decided card: `result: { state: done \| failed, error?, url? }`. Refused (409) on a card not decided, or with a result already recorded that differs; the same report again is answered as it is. |

## REST (app side)

| Route | |
|---|---|
| `GET /api/decisions` | Cards to decide: status `pending`, and `later` whose `later_until` is past, newest first. `{ items: [card…], count }`. Each card has `uid`, `kind`, `kind_label`, `key`, `title`, `context`, `body`, `url`, `choices`, `recommended`, `reason`, `created_at`, `updated_at`. Never `data`. |
| `POST /api/decisions/:uid/decide` | `{ decision, note?, until?, idempotency_key? }`. `decision`: a choice id, `later` (`until` ISO date-time optional, default tomorrow 08:00 profile time zone) or `note` (`note` 1 to 500 characters, card goes `reviewing`). A choice settles the card (`status: done`, `decision`, `decided_at`, `result: { state: requested }`). Same rules as mail decisions: the card is taken (`deciding`) before the work; another decision on a settled card answers 409 « Déjà traité ailleurs. »; the same `idempotency_key` answers as done (`replayed: true`); a failed write gives the card back. Emits `decision.made` (webhooks and plugins), `data.decision`: `uid`, `kind`, `key`, `decision`, `note`. |

`GET /api/triage` carries `decisions_count` so « À trier » shows the button without a second call. Decision cards are not triage items and not a sync entity: like mail cards, the decision is a REST call with an `idempotency_key`, replayed offline by the clients' deferred calls (Android) or the outbox (web).

Storage: table `agent_decisions` (migration through the `safe*` helpers, SQLite and PostgreSQL): `uid`, `user_id`, `kind`, `kind_label`, `key`, `title`, `context`, `body`, `url`, `choices` (JSON), `recommended`, `reason`, `data` (JSON), `status` (`pending`, `later`, `reviewing`, `deciding`, `done`), `decision`, `note` (JSON), `later_until`, `decided_at`, `decide_key`, `result` (JSON), timestamps. Unique `(user_id, kind, key)`.

## Notification « N décisions à prendre »

Same timer as the mail notification (`backend/modules/triage/mailReady.js`, 2 minutes after the last card of a burst): type `decisions_ready`, title « 1 décision à prendre » / « N décisions à prendre », `sources` desktop and mobile, `data: { kind: 'decisions_ready', count }`, opens `/triage?deck=decisions` (web) and the decisions deck (Android). An unread earlier one is dismissed first.

## Clients

« À trier » shows « Décider (N) » next to « Trier mes mails (N) » when `decisions_count > 0`. It opens the **decisions deck**, full screen, built like the mail deck v2:

- one card at a time, ordered by kind (kinds in the order of their oldest card), then oldest first;
- header: `kind_label` as eyebrow, progress « 3 / 9 »; card: title, context, body (folded after 7 lines, « Lire la suite »), « Ouvrir » when `url`;
- one row of 2 to 5 big buttons from `choices` in their order, `recommended` framed and tinted, `tone: danger` in the error colour; `reason` small under the row;
- quiet row: « Répondre par un mot » (note, the card leaves with « Renvoyé à l'agent »), « Plus tard », « Passer », « Annuler » (the last decision waits like in the mail deck: web 5 s or next decision; Android the 4.5 s undo window through the deferred calls);
- web keys: Entrée or → = `recommended`, 1–5 = that button, ← = plus tard, ↓ = passer, Ctrl/⌘+Z = annuler, Échap closes; Android: swipe right = recommended, left = later, TalkBack custom actions;
- end: « Tout est décidé » and a button back to « À trier ».

Web `frontend/components/Decisions/` (rules `decisionDeck.ts`, service `frontend/utils/decisionsService.ts`); Android `tasks/.../decisions/` (rules `DecisionDeck.kt`, client, deferred calls key `decision:<uid>`) and `ui/decisions/DecisionDeckScreen.kt`.

## Hermes side

- **Proposing** (prompts of the jobs, through capgw `cadence_propose_decisions`):
  - « Revue des abonnements » (Trieur, the 2nd): kind `subscription`, label « Abonnements », one card per subscription worth a look; choices `keep` Garder, `cancel` Résilier (danger), `renegotiate` Renégocier; `data: { name, amount? }`.
  - « Mises à jour » (Sysad, nightly): kind `docker_update`, label « Mises à jour », one card per update held back for a breaking change; choices `update` Mettre à jour, `skip_version` Ignorer cette version; `data: { container, version }`.
  - « Synthèse famille » (Famille, Sunday): kind `family`, label « Famille », one card per alert that asks who does what; choices `nicolas` Moi, `audrey` Audrey, `both` Les deux; `data: { date }`.
  - « Revue financière » (Herald, monthly): kind `finance`, label « Finances », one card per contract to renew or cancel within 90 days and per unusual bill; choices `task` Tâche, `ok` C'est bon; `data: { due_date? }`.
  - « Ménage de la mémoire » (Herald, weekly): kind `memory`, label « Mémoire », one card per contradiction with a memory written by Nicolas; choices `keep_mine` Garder la mienne, `take_new` Prendre la nouvelle; `data: { mine: <id>, other: <id> }`.
- **Applying** (no AI): capgw `decisions_sync` (every 10 minutes, in the job « Cartes Mail acceptées ») reads `list_decisions`, and for each done card whose `result.state` is `requested`: `subscription` `cancel` / `renegotiate` → a Cadence task (« Résilier … » / « Renégocier … »); `docker_update` `update` → `unraid_update` of `data.container` (its own allow-list and daily limit apply), `skip_version` → the version is remembered so Sysad does not propose it again; `family` `nicolas` / `both` → a Cadence task on `data.date`; `finance` `task` → a Cadence task (due `data.due_date`); every other choice → nothing. Then `report_decision`. Kind `memory` is applied by the Herald script job `memory_decisions.py` (Mnemoteca lives in the Hermes container): `take_new` marks Nicolas's memory `superseded` by the other, `keep_mine` marks the other one `superseded`; then `report_decision`. Unknown kind or choice: `report_decision` with `ok: false, error: 'unknown_choice'`.
- A note (`reviewing`) goes back to the job at its next run (listed by `list_decisions`), which proposes the corrected card again.

## Mail improvements of the same step

- **Sender rule.** On a mail card (deck and list), « Toujours archiver cet expéditeur » records `{ address, action: 'archive' }` for the user (table `mail_sender_rules`, unique `(user_id, address)`, address lower-cased) and decides the card `archive`. `DELETE` is offered in Profil › À trier (list of rules, « Retirer »). `list_mail_cards` returns `sender_rules`; `propose_mail` for a sender with a rule stores the card already decided `archive` (`action: requested`, never shown), so Hermes archives it at the next sync. On the Hermes side `tri_prep.py` does not give those threads to the agent: it proposes them itself (no AI) with the minimal card. REST: `GET /api/triage/mail/rules`, `POST /api/triage/mail/rules { address }`, `DELETE /api/triage/mail/rules/:address`.
- **Last run shown.** A run action may carry `status` (40 characters, from `ctx.actions.onRun(id, handler, { status })`, listed in `GET /api/plugins/menu`): the Hermes plugin says « relevé à 9 h 12 » or « en cours… » (requested less than 10 minutes ago and no later run). Web: muted text after the button; Android: the button's second line.
- **List cards like the deck.** The cards of the « À trier » list show the same choice buttons as the deck (`deckButtons`), the recommended one framed.
- **Deck order.** The mail deck shows cards recommended `event` first, then `draft` (or `reply`), then `task`, then the rest, newest first inside each group.
