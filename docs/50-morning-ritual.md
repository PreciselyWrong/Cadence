# Morning ritual (Android)

A short morning ritual on the phone, in three steps of large cards, prepared by the AI before the user wakes up. The PC is for planning the week (Plan, `docs/03-upcoming-view.md`); the phone is for the day. Decided on 2026-11-19.

## Where it comes from

The morning run (`docs/47-proposals.md` › Morning run) prepares a week proposal with `facts.trigger = "morning"` when there are overdue tasks. The ritual is that proposal, opened on the phone:

- The notification « N retards replacés, à valider » carries `data.trigger = "morning"`; a tap opens the ritual instead of the week sheet.
- `GET /api/proposals/:uid` returns `trigger` (`"morning"` or `null`). A ready morning proposal of today also shows a « Ma matinée » entry at the top of Aujourd'hui until it is applied or dismissed.
- The answer carries `focus`: up to three `task_uid` of `facts.tasks`, the tasks that matter most today, chosen by the agent with its view of goals and projects (unknown or repeated uids are dropped by the server).

Nothing is written before the last step: choices stay on the phone, then one `POST /api/proposals/:uid/apply` with the decisions of the tasks the ritual showed. The other tasks of the proposal are left as they are (`keep`).

## Step 1: « Hier et retards »

One large card per overdue task (`facts.tasks[].overdue`), one at a time, full width, with a progress line (« 2 / 6 »):

- The task: name, project, how late (« hier », « 3 j »), its estimate.
- The AI's advice in a highlighted block: the operation it proposes (« Demain », « Sam. 22 », « Cette semaine », « Faite », « Abandonner ») and its reason (`changes[].reason`).
- Big buttons, the advice first and preselected: « Aujourd'hui », « Demain », « Plus… » (the next days with their task count, This week, Next week, This month, Later, a date), « Faite », « Abandonner ». The user chooses; the advice is only a suggestion.
- Swipes: right takes the AI's advice, left « Demain », up « Plus tard » (`later`). A swipe or a tap moves to the next card; « Annuler » goes back one card and clears its choice.
- A task with no advice starts on « Aujourd'hui » highlighted as neutral, no reason line.

## Step 2: « Ta journée »

The day as it will be once the choices apply:

- « Ce qui compte » first: the `focus` tasks as large cards with a star, at most three (focus tasks not planned today are shown only if the choices put them on today).
- Then the day in time order: the day's calendar events (`facts.days[today].events`), today's plan lines, and the tasks the choices or the AI put on today (`plan_day` today).
- The load against the day: « 3 h prévues · 4 h libres » (planned minutes against the day's working hours), in the warning colour when over.
- Each non-focus task has « Pas aujourd'hui » (→ Demain); each card a menu to change its choice. The user can also mark a task focus or not.
- « C'est parti » applies (one call), then opens Aujourd'hui. « Plus tard » closes without applying; the entry stays on Aujourd'hui for the day.

## Step 3: « C'est parti »

The ritual closes on Aujourd'hui with the first focus task highlighted as the next thing; the widget follows the same list.

## Rules

- Pure rules (`proposals/MorningRitual.kt`, Kotlin, unit tested): which cards step 1 shows and in which order (by lateness, oldest first), the default choice of a card, the day of step 2 (members, order, load), and the decisions sent to `apply`.
- Offline: the proposal is read once when the notification arrives (cached); choices are local; `apply` goes through the deferred-call queue like the other proposal writes.
- Cost: no extra AI run; the ritual reads the morning proposal.
- Web: no ritual (the PC plans the week on the Plan); the same proposal shows on the Plan board as the week preview.
