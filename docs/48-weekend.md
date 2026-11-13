# Week-end (proposition d'agent)

Kind `weekend` of the agent proposals (`docs/47-proposals.md`). The family agent (Hermes, profile `famille`, job « Météo du week-end », Thursday 17:00) proposes one outing per free slot of the weekend; the user picks per slot, then « Valider ». Nothing reaches the calendar before that. Accepted outings are created in the shared calendar « Commun » by capgw (Hermes side), without AI.

Same rules as Career: the agent creates the proposal ready-made (no `pending`, no `proposal.requested`), facts are the payload, Cadence validates, nothing is applied without the user. Web and Android show the same sheet (mockup validated 2026-11-13).

## Input: MCP tool `propose_weekend`

Open to the same API key as `propose_career` and `propose_mail`.

- `headline` (required, 60 characters), `subtitle` (160).
- `days`: `[{ date, weather, min, max }]`, 2 at most. `weather` ∈ `sun`, `partly`, `cloud`, `rain`, `snow`, `storm`, `fog`; `min`, `max` integers (°C).
- `slots`: `[{ id, date, part, weather?, temp?, feels?, busy?, activity?, recommended? }]`, 6 at most.
  - `part` ∈ `morning`, `afternoon`, `day`. `date` must be one of `days[].date`.
  - `busy` (120): what the calendar already holds (« Foire aux livres, Penthalaz »). A busy slot has no `activity` and no decision.
  - `after` (120): a follow-up line of the slot itself (« Ensuite : balade à Dizy »), shown on a busy slot or under an activity.
  - `activity`: `{ title (120), url? (https), note? (140), travel? (30), start? (HH:MM), end? (HH:MM), after? (120) }`. `after`: an optional follow-up line (« Ensuite : balade à Dizy »).
  - `recommended`: the agent advises « Mettre à l'agenda » (preselected in the sheet).
- `elsewhere`: `[{ place (60), date, weather, temp, travel? (30) }]`, 5 at most: places with better weather than home.

`id`: letters, digits, `_` or `-`, 1 to 64. Texts are cut to their limits; a slot with a bad id, date or part is dropped; an activity with a non-https url loses the url. Refused (400): no headline, or no slot.

A new weekend proposal replaces the ready one. Decisions of the replaced one carry over to slots of the new one with the same `id` (so an outing already accepted is not lost, and is not asked again). It is stored `ready` and notifies (desktop and mobile): title = headline, message = subtitle, `data: { proposal_uid, kind: "weekend" }`.

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
   - Activity: title (link when `url`), muted line `note · travel`, `after` if any; chips « Mettre à l'agenda », « Autre idée », « Ignorer », and a note button. `recommended` preselects « Mettre à l'agenda ». Picks are local until « Valider ».
   - Busy: calendar icon, « Occupé : <busy> », `after` if any; no chips.
   - Decided: the decision as a muted label, and the event state.
4. « Plus beau ailleurs » (only when `elsewhere` is not empty): sun icon, « Pontarlier, samedi : dégagé, 10° · 1 h ».
5. Footer: count line (« 1 sortie à l'agenda », « 1 autre idée demandée »), button « Valider » (one apply with every picked slot).

Weather words (FR): `sun` « ensoleillé », `partly` « éclaircies », `cloud` « nuageux », `rain` « pluie », `snow` « neige », `storm` « orage », `fog` « brouillard ».
