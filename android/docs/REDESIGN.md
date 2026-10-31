# Refonte UI/UX Android (2026-10)

Source of truth: the OpenPencil file `~/Dev/Cadence/Cadence.fig`. Every screen is exported in `docs/redesign/*.png` (360×800 dp at 1×; open them before building a screen). This file states the rules the images alone do not carry.

## Principles

- Tâches is the home tab. Habits live in their own tab and as a compact routine strip on the task home.
- Rounded surfaces and controls everywhere. The flat-top hexagon (`Facet`) is reserved for habits; never use it for buttons, checkboxes, tabs or markers.
- One design system shared by `:app`, `:tasks` and the widgets. No screen hard-codes a colour, radius or spacing.
- French UI strings in `res/values/strings*.xml`; the word is « habitude », never « suivi ».
- Brand: the "beat check" mark from `docs/brand/` at the repo root (Android vectors `app/src/main/res/drawable/ic_widget_mark*.xml`, launcher icons already generated). Never the old hexagon logo, never a generic "add task" glyph (too close to TickTick).

## Navigation

- Floating pill bar, 5 equal targets: **Boîte · Tâches · Agenda · Habitudes · Bilan**. Tâches is selected at launch. Active item: rounded `primaryContainer` pill, filled icon and label. The bar is translucent (background @ 60 % light / 72 % dark) with a backdrop blur where available (API 31+, plain translucency below) and a soft shadow. It sits above the system navigation (3-button or gesture); content scrolls under it.
- Réglages opens from a header button (gear) on Tâches, Boîte, Habitudes; it is a pushed screen with a back arrow, not a tab.
- Tâches top tabs scroll horizontally: Aujourd'hui · À venir · Projets · Étiquettes · Terminées (selected = filled `primary` pill, others glass pills with a count).
- Habitudes tab: segmented « Aujourd'hui | Toutes ». Aujourd'hui is the former Jour screen (restyled), Toutes the former habits list (abstinences, habitudes, activités libres, group chips). Bilan replaces Semaine + Stats (stages À faire / Bien parti / Minimum / Terminé, task KPIs, régularité per habit, existing statistics sheets).

## Tokens (light default, violet + white)

| Role | Light | Dark |
|---|---|---|
| primary | `#5E5CE6` | `#A9A6FF` |
| onPrimary | `#FFFFFF` | `#1B1680` |
| primaryContainer / on | `#E4E3FF` / `#16136B` | `#3A378F` / `#E4E3FF` |
| background = surface | `#FDFCFF` | `#121218` |
| onSurface | `#1B1B21` | `#E5E1EC` |
| surfaceVariant / on | `#E4E1EC` / `#46464F` | `#46454F` / `#C8C5D0` |
| card (rows, cards) | `#F3F1FC` | `#1F1E2A` |
| containerLow / High / Highest | `#F5F3FA` / `#E9E7F0` / `#E3E1EA` | `#1B1B21` / `#2A2930` / `#35343B` |
| outline / outlineVariant | `#66656F` / `#C7C5D0` | `#918F9A` / `#46454F` |
| error / errorContainer | `#BA1A1A` / `#FFDAD6` | `#FFB4AB` / `#93000A` |
| success / successContainer | `#286C2A` / `#ABF5A3` | `#8FD88A` / `#1F5223` |
| warning / warningContainer | `#7C5800` / `#FFDEA8` | `#F5BD52` / `#5D4200` |

- Glass (idle buttons, chips): `surfaceVariant` @ 60 % light / 35 % dark, 1 dp border `outline` @ 35 %. Selected glass: `primaryContainer` @ 72 % / 55 %, border `primary` @ 45 %.
- Accent is user-chosen (Réglages › Apparence): presets Violet `#5E5CE6` (default), Indigo `#3F51B5`, Bleu `#1E6FD9`, Sarcelle `#00897B`, Vert `#2E7D32`, Ambre `#C77700`, Corail `#E0483B`, Rose `#C2185B`, free colour, or Material You (API 31+). Derive container and on-roles from the seed with HSL lightness (container ≈ L 0.92 in light, ≈ L 0.30 in dark; on-colours by contrast). In light, a seed too light to read as text (Ambre, Corail, Sarcelle, Bleu, most free colours) is darkened, hue kept, to 4.5:1 on the card; every text/fill pair reaches 4.5:1. Theme mode: Système / Clair / Sombre; option « Noir pur » in dark. Habit tints keep their own colour.
- Radii: chip 12, control 16, card/row group 20, panel 24, sheet 28 (top corners), pills 999. Connected row groups: outer 20, inner 4, 2 dp gap.
- Spacing: gutter 16, steps 4/8/12/16/24/32. Touch targets ≥ 48 dp.
- Type: keep the embedded Plus Jakarta Sans. Roles: display 30/36 semibold, headline 24/32 semibold, title 20/26 semibold, titleM 16/22 bold, body 16/24, bodyM 14/20, label 14/20 medium, labelM 12/16 medium, metric 32/36 semibold.
- Motion: springs without bounce for appear/press, 220 ms tweens for colour, press scale 0.97.

## Components (see `redesign/s01-systeme.png`)

- Round 48 dp header buttons (glass, or plain on detail screens; add = filled primary).
- Task checkbox: 24 dp rounded square (radius 8), 2 dp `outline` stroke; done = filled `primary` with white check; high priority = `error` stroke.
- Calendar event check: 24 dp **circle** stroked in the calendar colour; done = filled calendar colour + white check, row at 55 % opacity, title struck through. Event rows show a 14 dp calendar icon in the calendar colour, the time range and the calendar name.
- Row: 3 dp project/calendar colour rail on the left, title (1 line, ellipsis), meta line of badges (date/time badge, project badge).
- Badges: 24 dp pill, tones neutral / primary / success / warning / error / project colour @ 16 %.
- Habit card (`e07`): 80 dp, radius 20, three-stop gradient of the habit tint, facet on the left, quick action pill on the right (« +1 », « ▶ 10 min ») or a check when done.
- Routine strip (`e01`): card « Routine · <moment> n/m », optional « 1 à compléter » badge, up to 5 tappable facets with name and value. Tapping a facet opens quick entry; the chevron opens Habitudes › Aujourd'hui.
- FAB 56 dp, radius 18, filled primary, bottom-right above the pill bar.
- Sheets: top radius 28, 32×4 handle, dimmed scrim.

## Screens

| Image | Screen | Notes |
|---|---|---|
| e01, e02 | Tâches › Aujourd'hui | En retard (error header, « Voir les n »), Aujourd'hui, routine strip, FAB. Calendar events of the day are mixed in by time (e22). Empty day: « Journée bouclée » + Demain. |
| e04, e05 | À venir, Projets | Week strip of 7 day cells with dots; projects grouped by area with a progress bar. |
| e03, e20 | Boîte | Capture field, items with Aujourd'hui / Planifier / Projet actions. Segments Idées / Notes: notes (synced read-only, `note` entity, Room v3) as a 2-column card grid and a full-screen read-only note view; editing stays on the web. |
| e11, e21, e12, e13 | Agenda | Segmented Jour · 3 jours · Mois · Liste. Day: week strip, « À planifier » tray (dragging a task onto the grid sets its date and time), all-day row, hour grid, now line. 3 days: three columns. Month: grid with coloured dots + list of the selected day. Affichage sheet: toggles (tâches avec heure, habitudes, terminées, week-ends, n° de semaine) and calendar chips. |
| e22, e23 | Events in the task list; Réglages › Agendas | Source: device calendars (`CalendarContract`, includes Google accounts synced on the phone). Per calendar: show in Agenda / Liste Tâches / Widget. Checking an event marks it done in Cadence only (never writes to the provider). Option « Masquer les événements faits ». Events are task-like rows in Tâches (swipe from Réglages › Gestes: Terminer = check, Supprimer = « Masquer ici », other actions disabled; long-press menu; detail sheet with time, calendar, location, description, link previews). « Masquer ici » hides one occurrence in Cadence only (Agenda, Tâches, widget), with an « Annuler » snackbar on the single shell host; hidden events are listed and restorable in Réglages › Agendas. Agenda: a horizontal swipe on the view pages the period (day ±1, 3 days ±3, month ±1, list ±30 days) with a slide animation. |
| e06, e07, e10, e14 | Habitudes | List, detail, abstinence with savings (e10) and without (e14: record, écart moyen, écarts / 30 j fill the slot). |
| e15, e16, n02 | Questions apprises | Per habit (logs and abstinences). Detect weekday patterns from past entries; when an entry is missing on a usual day, ask the next day at the chosen time: Non / Oui / Oui + quantité. Settings: on/off, hour, threshold (default ≥ 1 in 2 of that weekday over the last 12 weeks), silent during pauses, « Ne plus demander le <jour> ». |
| e17, t1–t3 | Apparence | Theme tiles Système / Clair / Sombre, accent swatches, free colour, Material You, noir pur. |
| e08, e09 | Bilan, Réglages | Réglages rows: sync banner, Apparence, Widgets, Rappels, Agendas, Moments de la journée, Mode voyage, Health Connect, Sauvegarde, Compte. |
| e18, e19 | Recherche, détail de tâche | Search tasks/projects/habits with filter chips. Task detail: sub-tasks, début → échéance, répétition, estimation, étiquettes, liens, commentaires; fields the app cannot store yet are read-only from `extrasJson`. Built: search lives in `:tasks` (`SearchScreen`, ranking in `search/SearchEngine`), opened from the header search button of Tâches and Boîte; saved views (« Enregistrer comme vue ») are not built. Detail: sub-tasks, start, due, repetition (none/daily/weekly/monthly + interval), estimate and tags are editable and go through the outbox; start, estimate and repetition details live in `extrasJson` and are written as plain synced fields; links and comments are not in the sync registry (placeholder rows); other server fields are listed read-only. Focus timer (pomodoro 25/5/15) is local only (`focus/`), launched from the detail sheet. |
| f01–f08 | Sheets | Quick entry stepper, capture with parsed date/#tag chips, task detail, new habit chooser, 4-step habit editor, timer, skip, options. |
| w01–w06 | Widgets | See below. |
| n01, n02 | Notifications | Actions as pills. |

## Widgets

- The habit widget (`CadenceWidget`) keeps its rendering and configuration.
- New combined widget « Aujourd'hui » replaces the tasks list widget: header (scope title + count + chevron, bare `+` and `⋮` icons), tasks module, habits module (facets with name and value). Configuration screen (`w04`), also reachable from Réglages › Widgets:
  - Fond: Automatique (follows the phone's light/dark theme, default), Clair, Sombre, Aucun. Always a solid opaque surface from the design-system tokens (`LightPalette` / `DarkPalette`); the frosted « Flou » / « Verre » styles and the intensity and veil sliders were removed (app widgets cannot blur the wallpaper, and a translucent tint was unreadable). Saved « Flou » falls back to Automatique, « Verre » to Sombre.
  - Control colour for icons and checkboxes: Blanc, Projet (each checkbox in its project colour), Indigo, Corail, Menthe, Ambre, free colour; « Boutons discrets » (icons only).
  - Modules: Tâches and Habitudes toggles, order (habits above / below / hidden), habits « Selon l'heure / Toutes / Choisir », max facets.
  - Tâches: scope (En retard + aujourd'hui, Aujourd'hui, Demain, 3 / 7 prochains jours, Sans date, Boîte, Projet…), filters (projects, #tags, high priority, hide recurring), sort (échéance, priorité, projet), overdue section, check from widget, project rail, calendar events of calendars enabled for the widget.
  - Text size S/M/L, corner radius.
- Layout: header and habits keep their own height and are always visible (minimum widget height 140 dp, `TodayWidgetLayout`); the task list (overdue first, then the day's tasks, then calendar events) is a scrolling `LazyColumn` that takes the remaining height and shows every task, with no row cap and no « +N » footer.
- Small widgets: 2×2 tasks, 4×1 capture bar (brand mark + « Nouvelle tâche… », idea, dictate), 1×1 « Ajouter » with the brand mark.

## Task detail and quick add (2026-10)

- Detail (`ui/TaskDetailSheet.kt`) follows `e19`: header with back, title edited in place, focus timer and actions menu; tappable badges (date, priority, project, status, tags); sub-task card; connected rows Début → échéance, Répétition, Estimation, Priorité, Statut, Étiquettes, Projet, each opening a design-system sheet; sticky « Planifier » / « Terminer » bar (hidden while the keyboard is up); links and comments are one muted row. There is no Save button: every picker writes its field as soon as it is chosen, title and note are written after a 700 ms pause and on close (`TaskEdits` builds the `TaskChange`).
- Shared date sheet (`ui/TaskDateSheet.kt`, `quickadd/QuickDates.kt`): Aujourd'hui, Demain, Ce week-end, Semaine prochaine, Sans date, mini calendar, optional time. Same labels and order as the web `DatePopover`; the weekend and next-week rules mirror `frontend/utils/dateShortcuts.ts` (next week starts on Monday).
- Quick add (`ui/QuickAddSheet.kt`): one field, parsed chips under it (tap to remove: the word goes back to the title), « Plus d'options » for priority, project and tags. The parser (`quickadd/QuickAddParser.kt`, pure Kotlin, fixed `Clock` in tests) reads aujourd'hui, demain, après-demain, weekdays (next occurrence, « lundi prochain » = that day next calendar week), « dans 3 jours / 2 semaines / 1 mois », « ce soir » (19:00), « ce week-end », « semaine prochaine », « à 14h », « 14h30 », « 14:30 », « midi », `!1`-`!3`, `+projet` / `^projet`, `#nom` (tag, else project) and `@étiquette`. `#`, `+`, `^`, `!` are the web capture tokens (`frontend/utils/inboxTokens.ts`); a word that names nothing existing stays in the title.

## Not in this pass

Note editing on Android, links and comments of a task (not synced), server sync of habits (see `TODO.md` › Now), kanban/Eisenhower, review, saved views, goals, people.
