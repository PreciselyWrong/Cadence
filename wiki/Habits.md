# Habits

A habit is not a task: it collects **entries** ("read 20 pages", "one drink"), never "completions", and is judged over periods (day, week, month) with a streak, not against a due date. Cadence habits are the same on web, on Android, and on the server: you log on the phone, and you see the same cards and statistics on the web.

![Habits](images/web/habits.png)

## Classic habits and Cadence habits

A habit used to be a task marked "habit". That is no longer the case:

- Today's habits are **Cadence habits**: the model of the Android app (versioned goal and schedule, limits, pauses, timers, groups), stored on the server so that every device reads and writes the same data.
- **A habit never appears in a task list.** It has its own page, its own section in Today, and its markers in the calendar.
- **Importing the old habits**: when the server starts, each old habit-task that has no equivalent yet becomes a Cadence habit (the name, description, color, archiving, start date, goal, schedule, time of day, a reminder, and every check-in carry over). The old rows are **neither deleted nor modified**; they stay out of task lists, Today, the calendar, and the plan.
- An imported habit keeps the same outcome in spirit, but its **streak and strength are recalculated** by the Cadence rules and may differ from the old figures. A "quantity" check-in without a value counted for nothing before and is not imported.
- The starter habits from onboarding ("yes" every day, certain days, or once a week) create Cadence habits.

## The Habits page

Habits are **grouped by time of day** (morning, afternoon, evening, anytime; empty groups are hidden). Each card looks the same as on Android: a tinted gradient, a **hexagonal facet** filled according to the period's progress, the status line, the streak, and the quick action. A yes/no habit with several sessions per period says how far it is ("2 of 3 this week") and its card fills in proportion, instead of reading "To do" until the last session.

**The status line** says where you stand: "2 / 30 min", "1 of 2 max", "12 days clear", "Paused", "Not planned today", "Done", "Limit reached", "Limit exceeded".

**Quick entry**
- **Yes / no**: a single tap.
- **Quantity or duration**: a tap adds the first quick amount; the arrow offers the other quick amounts and a free **Other amount**, with an optional note.
- After each entry, an **Undo** message (6 seconds) deletes the entry.

**Tabs**: **Habits** and **Archived** (with **Restore**). A line "N of M done for now" summarizes the day. A **Pause or trip** button opens the pause form.

**A card's ... menu**: **Move up**, **Move down** (within the group, which is renumbered), **Duplicate** (copies the goal, schedule, quick amounts, reminders, and group; the copy is named "`<name>` (copy)", **starts today with no history**, and is placed last in the group).

## Habit types

| Type | Meaning | Example |
|---|---|---|
| **Goal** | Reach a target in each period | Read 20 pages a day |
| **Limit** | Stay **under** a maximum: staying below is a success; nothing is secured before the period ends | At most 2 coffees a day |
| **Free activity** | Note an activity with no target, no streak, no success or failure | Walking: note the km |
| **Abstinence** | Count the days **without**; each slip you note restarts the count | No smoking |

**Measure**: yes/no ("Done or not"), **Count**, **Quantity** (with a unit: minutes, pages, glasses, kilometers, etc., or a custom unit with its name and symbol), or **Duration**.

**Goal**: an **ideal**, possibly a **minimum that counts** (the threshold that validates the period and the streak; with no minimum, the two coincide) and a number of **sessions per period**. The **period** is Per day, Per week, or Per month.

**Schedule**: Every day, **Selected days**, **Any day of the period** (flexible rhythm, "3 times a week"), or **Every N days** (at least 2). A first day of the week can also be set.

## A habit's page

Clicking a card opens `/habit/<id>`:
- **Statistics**: current streak, best streak, **30-day success**, active days, total entries since the start.
- **Calendar** of the last 365 days: each day has a symbol **and** a color (goal reached, minimum reached, missed, paused, activity, clear).
- **History** of entries: add, edit (date, amount, note), delete.
- **Goal and schedule**: the version in force and past versions.
- **Pauses and trips**: see below.
- **Skip today** (rest day, sick, traveling: the streak is kept); **Cancel the skip** while it holds.
- Edit, **Archive** (keeps the history; prefer it to deleting), **Delete** (deletes the habit and all its entries, **on every device**).

### Trends ("Patterns")

The **Patterns** section (called **Régularité** (Consistency) on Android) shows, for a habit:
- A **heat map of the last 365 days** (today on the right; scroll for older weeks).
- The **success rate by day of the week**: which day you succeed most, which least. This is where the **best day** shows.
- The **rate by month**, over 12 months.
- A summary "Over 12 months: N % (X of Y days)".

Calculation rules: a day counts as *successful* if it is "ideal", "minimum", or "activity"; it counts as *evaluated* if it is also "missed" or "no activity". **Today only counts once done.** A day that is not planned or is paused is never evaluated. While there are not enough days, the screen says "Not enough days yet" rather than showing a misleading percentage.

### The phone's statistics (Android)

Android takes the analysis further, without inventing anything:
- **Bilan** (Review): the number of tasks completed this week, due tasks, and **habit consistency** (30-day average).
- **Ce que disent vos saisies** (What your entries say): **Meilleur jour** (Best day) ("`<day>` on average, versus `<average>` across all days"), **Meilleur créneau** (Best time slot) (morning, noon, afternoon, evening, night), and **Ce mois, comparé au précédent** (This month, compared to the previous one) (quantity, consistency, days at minimum, days at ideal, over elapsed days, pauses excluded). The messages are cautious: "Moins de 12 saisies pour dégager un jour dominant" (Fewer than 12 entries to single out a dominant day), "Aucun jour de la semaine ne se détache nettement" (No day of the week stands out clearly), "Moins de deux mois d'historique pour comparer" (Less than two months of history to compare).
- **Fiabilité** (Reliability): "Assez de données pour s'y fier" (Enough data to rely on it), "Encore peu de données" (Still little data), or "Trop tôt pour juger" (Too early to judge), with the number of evaluated periods.
- **Comparison with the previous period** ("N points better", "Same rate", "Change of rhythm: comparison suspended") only if the rhythm is uniform and the samples are sufficient.
- A free activity has its own 30-day figures (entries, active days, quantity noted, average per active day), even during a pause.

## Changing a goal without rewriting the past

A habit's goal and schedule are **versions**, each valid from a date. When you change the goal or schedule of an existing habit, a question asks how to apply it:

| Choice | Effect |
|---|---|
| **From a date (new version)** (default: today) | Adds a version: earlier days **keep the goal of their time** |
| **Correct the current version** | Rewrites the current version, past days included: to fix a mistake |

This is why a streak does not jump when you go from 10 to 20 pages: the past is still judged against 10.

## Pauses, trips, and skips

- **Pause or trip**: choose one or more habits, the first day, the last day (included, optional), and a reason: **Rest**, **Illness**, **Trip**, **Other reason** (in your own words).
- Paused days **are not counted as missed and do not break the streak**; no reminder rings during a pause. For an abstinence, a pause interrupts the continuity of the count and stays excluded from the statistics.
- **Skip today** is a one-day pause, cancelable the same day; a trip is a range that can be cut short ("End the pause"). An upcoming pause can be cancelled before it starts.

## Abstinence and alcohol

- **Abstinence**: a profile chosen at creation (alcohol, smoking, vaping, cannabis, caffeine, gambling, social media, screens at bedtime, impulse shopping, or something else) and a start date. The page shows the **current run**, the **best run**, a strip of the last 90 days (clear days / slips noted), a **Note a slip today** button (which restarts the count), and the ability to note an **urge** with an intensity from 1 to 5.
- **Alcohol**: in addition, **standard drinks** by date ("to specify" until the amount is filled in). Android calculates the 90-day frequency and a personal goal of alcohol-free days, and can send a local follow-up the next day at the time you choose.
- **No health claims**: the text says so ("These counts do not measure your health"). No calculation is presented as a blood alcohol level or as fitness to drive.

## In Today and in the calendar

- **Today** (web): a **Habits · N** section in the day's list: a tap checks a yes/no habit or adds its first quick amount, with undo; completed habits fold and follow "Hide completed". A habit that has a reminder that day appears as a **thin marker** on the day's calendar, at the reminder's time (a click opens the habit). On Android, habits are in **Ma journée** (My day).
- **Calendar**: "Show habits" places the habits' due days on the grid (a flexible-rhythm habit or a free activity only appears on days when it has an entry; abstinence never appears there).

## Reminders

Each habit can have several reminders (a time, days of the week, and the **Only remind me while the period is not met** choice, on by default). The **phone** is the main voice (alarms specific to each habit). The **server** also reads these reminders and adds an in-app notification ("Rappel : `<habit>`" (Reminder: `<habit>`)), once per reminder and per day, never for a paused or already-met habit (conditional reminder), and only if the time was reached within the last 10 minutes (a server that was down for a long time does not ring a morning reminder in the evening). By default, only the "in-app" channel is active; you set the other channels in **Settings › Notifications** (type "Habit reminders"). Quiet hours apply. See [Notifications and Reminders](Notifications-and-Reminders).

## Timer, learned questions, and Health Connect (Android)

- **Timer**: a duration habit can offer a stopwatch. It keeps the completed segments and the resume time; a pause freezes the counter, and a phone restart recovers the exact value.
- **Learned questions**: for a habit with regular entries, the app can ask the next day "did you do it?" on the day of the week when you usually log (threshold of 50% of the last 12 weeks, at least 4 observed weeks). A "No" writes no entry; a retroactive "Yes" triggers no reminder and never replaces an entry already made.
- **Health Connect**: an optional local source for duration habits: Cadence reads sessions from the last 30 days according to a rule (activity types and source app) and imports them **only once each**. No health data is exported.

## Offline and devices

Habits are **local first** on Android: entry works without a network and goes out with the next sync (fifteen row types: habits, goal and schedule versions, entries, pauses, groups, reminders, quick amounts, timers, Health Connect rules, abstinence, alcohol, learned questions).
- **Each entry keeps its calendar date and its time zone**: an entry made at 11:30 pm in Lisbon stays "of the day" you lived it, whatever the time zone of the device displaying it.
- An entry added for a past date keeps that date; on the web, it is placed at noon of that date in the browser's time zone.
- **Two devices**: changes to the same fields are merged field by field; the **timer** is written as a whole so that two halves are never mixed.
- **Switching accounts on the phone**: local habits belong to the previous account. When signed in to another account, Cadence **never** sends them: the app asks whether you want to **keep them on this phone only** or **delete them** (those of the new account then arrive from a full snapshot). Reconnecting the original account resumes their sync.
- A duplicate created by two devices on the same natural key (alcohol, learned question, Health Connect import) is resolved: the device adopts the server's row.
- Deleting a habit deletes all its rows, on every device.
- A deleted group sends its habits back to "Day" ("Journée"); "Day" has no schedule and cannot be deleted.

## Going further

- [Habits (doc)](https://github.com/PreciselyWrong/cadence/blob/main/docs/21-habits.md), [Notifications (doc)](https://github.com/PreciselyWrong/cadence/blob/main/docs/36-notifications.md), [Android](https://github.com/PreciselyWrong/cadence/blob/main/android/AGENTS.md)
- Wiki pages: [Today and Daily Plan](Today-and-Daily-Plan), [Offline and Sync](Offline-and-Sync), [Android](Android), [Review, Insights, and Focus](Review-Insights-and-Focus)
