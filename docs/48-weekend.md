# Week-end (proposition d'agent)

Kind `weekend` of the agent proposals (`docs/47-proposals.md`). The family agent (Hermes, profile `famille`, job « Météo du week-end », Thursday 17:00 for the next Saturday and Sunday, or on demand for the days the user picks) proposes at least five outings per free day; the user picks per slot, then « Valider ». Nothing reaches the calendar before that. Accepted outings are created in the shared calendar « Commun » by capgw (Hermes side), without AI.

Same rules as Career: the agent creates the proposal ready-made (no `pending`, no `proposal.requested`), facts are the payload, Cadence validates, nothing is applied without the user. Web and Android show the same sheet (mockup validated 2026-11-13).

## On demand: `POST /api/proposals { kind: "weekend", dates }`

The user picks 1 to 4 days, one by one (not necessarily in a row), from today to 13 days ahead (the forecast). `dates`: `YYYY-MM-DD` days; repeated days are merged, the list is sorted. Refused (400): no day, a bad day, a past day, a day beyond the forecast, more than 4 days.

- Stored `pending` with `facts.request = { dates }`, shown as `request` on the proposal; emits `proposal.requested` with `data: { uid, kind: "weekend", facts: { request: { dates } } }`. The Hermes plugin runs the weekend job right away.
- The same days asked again return the pending request (200); other days dismiss it and create a new one (201).
- The agent has an hour (the job, then the sync that publishes every 10 minutes): after that the request is `failed` with `timeout` and notifies « Le week-end n’a pas pu être préparé ».
- `GET /api/proposals?kind=weekend` lists the pending request first, then the last weekend still shown (`ready` or `applied`), so its outings stay decidable and its events are created meanwhile.

## Input: MCP tool `propose_weekend`

Open to the same API key as `propose_career` and `propose_mail`.

- `headline` (required, 60 characters), `subtitle` (160).
- `days`: `[{ date, weather, min, max }]`, 4 at most: the requested days when a request is pending, else Saturday and Sunday. `weather` ∈ `sun`, `partly`, `cloud`, `rain`, `snow`, `storm`, `fog`; `min`, `max` integers (°C).
- `slots`: `[{ id, date, part, weather?, temp?, feels?, busy?, activity?, recommended? }]`, 40 at most. Several slots may share a `date` and `part`: they are alternatives for the same half-day, each decided on its own. A free day gets at least five activities (spread over its free half-days); Cadence keeps fewer if that is all the agent sends.
  - `part` ∈ `morning`, `afternoon`, `day`. `date` must be one of `days[].date`.
  - `busy` (120): what the calendar already holds (« Foire aux livres, Penthalaz »). A busy slot has no `activity` and no decision.
  - `after` (120): a follow-up line of the slot itself (« Ensuite : balade à Dizy »), shown on a busy slot or under an activity.
  - `activity`: `{ title (120), url? (https), image? (https), place? (60), note? (140), travel? (30), start? (HH:MM), end? (HH:MM), after? (120) }`. `after`: an optional follow-up line (« Ensuite : balade à Dizy »).
  - `recommended`: the agent advises « Mettre à l'agenda » (preselected in the sheet).
- `nearby`: `[{ title (120), date, start? (HH:MM), place? (60), travel? (30), url? (https), image? (https), note? (140) }]`, 16 at most (`date` must be one of `days[].date`); other local events without decisions.
- `elsewhere`: `[{ place (60), date, weather, temp, travel? (30) }]`, 5 at most: places with better weather than home.

`id`: letters, digits, `_` or `-`, 1 to 64. Texts are cut to their limits; a slot with a bad id, date or part is dropped; an activity or nearby entry with a non-https `url` or `image` loses that address; a nearby entry without a title or with a date outside `days` is dropped. Refused (400): no headline, or no slot.

A new weekend proposal fills the pending request when there is one (same `uid`, `request` kept), else it is a new proposal; it replaces the ready one. Decisions of the replaced one carry over to slots of the new one with the same `id` (so an outing already accepted is not lost, and is not asked again). It is stored `ready` and notifies (desktop and mobile): title = headline, message = subtitle, `data: { proposal_uid, kind: "weekend" }`.

## Decisions: `POST /api/proposals/:uid/apply { decisions }`

`decisions: [{ slot_id, op, note? }]`, `note` 500 characters at most (the user's words, data only).

| `op` | Final | Effect |
|---|---|---|
| `calendar` | yes | Records an event request on the slot: `event: { state: "requested" }`. capgw creates it in « Commun ». |
| `skip` | yes | Records it. Nothing else. |
| `other` | no | Asks the agent for another idea for this slot (with the note). The slot stays open and shows « Autre idée demandée ». |

- Only slots with an `activity` take decisions; a busy slot, an unknown slot, a slot already settled (`already_decided`) or an unknown op is refused (400) for the whole call.
- The proposal becomes `applied` when every slot with an activity has a final decision.
- Each apply emits `proposal.decided` with `data: { uid, kind: "weekend", decisions }`.
- Decisions are kept in `facts.decisions` and shown on the answer (`slots[].decision`, `slots[].event`).

## Events: `POST /api/proposals/:uid/events { slot_id, state, link?, error? }`

Agent key only (the capgw sync). `state` ∈ `created`, `failed`; `link` an https Google Calendar address. Only a slot whose event is `requested` can be reported; `created` is final. The sheet shows « Ajouté à l'agenda » (with the link) or « Pas ajouté ».

Event body (built by capgw, Hermes side): calendar « Commun », title = activity title, description = note, url and travel, location if known, time = `start`–`end` if given, else morning 09:00–12:00, afternoon 14:00–17:00, day = all day; private property `cadenceWeekend = <proposal uid>:<slot id>` makes creation idempotent.

## Sheet (web and Android)

From the notification, the bell (`proposal_uid`, `kind: "weekend"`) and a « Week-end » entry where Career lives. Whole sheet scrolls; only the footer is pinned.

1. Headline (centered), subtitle.
2. Two day tiles: day name, weather icon, `min° · max°`.
3. One block per slot, in order: title « Samedi matin », weather and temperature on the right (« ressenti » when `feels`).
   - Activity: square thumbnail on the left (56 px / 56 dp, hidden when absent or failed, opens `url` on tap), title (link when `url`), muted line `place · start · travel`, `note`, `after` if any; chips « Mettre à l'agenda », « Autre idée », « Ignorer », and a note button. `recommended` preselects « Mettre à l'agenda ». Picks are local until « Valider ».
   - Busy: calendar icon, « Occupé : <busy> », `after` if any; no chips.
   - Decided: the decision as a muted label, and the event state.
4. « Près de chez nous » (only when `nearby` is not empty, grouped by day in received order): 40 px / 40 dp thumbnail if any, title (link when `url`), muted line « samedi 14:00 · La Sarraz · 5 min », `note` if any.
5. « Plus beau ailleurs » (only when `elsewhere` is not empty): sun icon, « Pontarlier, samedi : dégagé, 10° · 1 h ».
6. Footer: count line (« 1 sortie à l'agenda », « 1 autre idée demandée »), button « Valider » (one apply with every picked slot).

Weather words (FR): `sun` « ensoleillé », `partly` « éclaircies », `cloud` « nuageux », `rain` « pluie », `snow` « neige », `storm` « orage », `fog` « brouillard ».
