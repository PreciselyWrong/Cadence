# Fork features and agent rules

Moved verbatim from the "This Fork" section of `CLAUDE.md`, which stays identical to upstream so weekly merges do not conflict.

This repository is a fork of [chrisvel/tududi](https://github.com/chrisvel/tududi), branched at `99ef695`. It brings the calendar and planning views closer to TickTick while staying mergeable with upstream.

## What the fork adds

| Area | Fork feature | Docs |
|---|---|---|
| Calendar | Real task length (estimate or start→due), resize, multi-day bars, all-day row | [20-daily-plan.md](../20-daily-plan.md) |
| Calendar | Year (heatmap), N days, Agenda views; week numbers; mini calendar; print | [20-daily-plan.md](../20-daily-plan.md) |
| Calendar | Arrange tasks panel (undated / overdue → drag onto the grid) | [20-daily-plan.md](../20-daily-plan.md) |
| Calendar | Recurring occurrences, habits, focus sessions, public holidays (`date-holidays`) on the grid | [20-daily-plan.md](../20-daily-plan.md), [01-recurring-tasks-behavior.md](../01-recurring-tasks-behavior.md) |
| Calendar | View options saved in `ui_settings.calendar`; colour by project / priority / tag; visible hours (`visibleHours`) | [20-daily-plan.md](../20-daily-plan.md) |
| Today | Calendar mode drags with dnd-kit onto 15-minute slots and the all-day row (due time set or cleared) | [20-daily-plan.md](../20-daily-plan.md) |
| Calendar | Secret `.ics` feed of the user's tasks (`users.task_feed_token_hash`) | [20-daily-plan.md](../20-daily-plan.md) |
| Focus | Tomato timer records `focus_sessions`; focus statistics in Insights | [30-focus-sessions.md](../30-focus-sessions.md) |
| Tasks | Pinned tasks (`tasks.pinned_at`) | [00-tasks-behavior.md](../00-tasks-behavior.md) |
| Tasks | Round check before each title (priority ring; completes from the list with undo); Minimal rows set priority and due date in place; Task and Upcoming lists open on open tasks, `status=all` is explicit | [00-tasks-behavior.md](../00-tasks-behavior.md) |
| Tasks | Minimal: a row click opens the task in a right-hand pane, edited in place (`?task=<uid>`); Dense keeps inline expansion | [00-tasks-behavior.md](../00-tasks-behavior.md) |
| Tasks | Minimal row gestures: chevron before the check toggles subtasks, collapsible project and day group headers, right-click menu (priority, date, project, pin, delete), arrow keys between rows, Space completes, Enter opens, D and P open the date and priority pickers | [00-tasks-behavior.md](../00-tasks-behavior.md) |
| Tasks | Minimal lists reorder by drag (Tasks, project, tag): saved per account in `user_task_orders` (scopes `all`, `project:<id>`, `tag:<id>`), listed as Custom; a row dropped on a sidebar project moves the task there (Minimal) | [00-tasks-behavior.md](../00-tasks-behavior.md) |
| Tasks | Minimal: "+ Add task" field at the top of Today, Tasks, project and tag lists (creates into that list); collapsed "Completed (N)" section at the bottom | [00-tasks-behavior.md](../00-tasks-behavior.md) |
| Today | Day's tasks listed without a planning gate; "Plan your day" is a link | [02-today-page-sections.md](../02-today-page-sections.md), [20-daily-plan.md](../20-daily-plan.md) |
| Today | Planning on one page: candidates left, Planning / Calendar switch right (toggle hides the panel), previous / next day arrows kept in `?date=` | [20-daily-plan.md](../20-daily-plan.md) |
| Tags | Nested tags, one level (`tags.parent_id`) | [09-tags-system.md](../09-tags-system.md) |
| Projects | Board tab with free sections and card order (`project_sections`, `tasks.section_id`, `tasks.section_position`); timeline colour by priority / tag | [06-projects.md](../06-projects.md) |
| Projects | Sub-projects, any depth, area follows the parent (`projects.parent_project_id`) | [06-projects.md](../06-projects.md) |
| Appearance | Minimal (default) or Dense interface (`ui_settings.appearance.density`); Minimal row chips chosen and ordered (`ui_settings.appearance.rowFields`) | [08-user-management.md](../08-user-management.md), [00-tasks-behavior.md](../00-tasks-behavior.md) |
| Insights | Custom Eisenhower matrices (`ui_settings.matrices`); period Summary with export (`ui_settings.summary`) | [08-views-system.md](../08-views-system.md), [31-summary.md](../31-summary.md) |
| Sidebar | Minimal: smart lists with counts, Areas as folders, icon rail with a More menu; smart lists, rail placement and count badges customisable in Profile → Sidebar; Dense is upstream | [32-sidebar.md](../32-sidebar.md) |
| Views | Minimal: List / Board (by priority) / Calendar (month by due date) switch on saved views, tag pages, projects and Tasks, remembered in `ui_settings.viewTypes`; New view from the sidebar (name, project, tag, priority, due, status; `views.project_uid`); Dense is upstream | [08-views-system.md](../08-views-system.md) |
| Inbox / quick add | French dates (`demain 15h`, `après-demain`, `le 12`, `d'ici vendredi`), `!1`–`!3` priority, `^list` as an alias of `+project` (accent-insensitive, unique prefix) | [04-inbox-page.md](../04-inbox-page.md) |

## Rules for agents working on the fork

1. **Keep the README up to date.** `README.md` has a section "🍴 What this fork adds" with Upstream / This fork tables and an "Under the hood" list (tables, columns, endpoints, docs). Any change that adds, removes or changes a fork feature updates that section in the same commit. Also keep the table above in sync.
2. **Docs with every behaviour change.** Update the matching `docs/*.md` page (and the documentation index below when a page is added). Behaviour docs describe rules, not code.
3. **All 26 languages.** Every new UI string goes into all `public/locales/*/translation.json`. Keep each file's own indentation (`sk` uses 4 spaces, the others 2), keep key order, and check that every file still parses as JSON. Translations written by an agent are flagged as unreviewed in the README.
4. **Migrations.** One file per change in `backend/migrations`, with a timestamp no other migration uses (check `ls backend/migrations` before naming it). Use `backend/utils/migration-utils` helpers so they are idempotent and dialect-safe. Verify the upgrade path on SQLite and PostgreSQL: schema created by upstream `99ef695`, then `npx sequelize-cli db:migrate` with this branch.
5. **New tables** go into `backend/tests/helpers/setup.js` `CLEANUP_TABLES` and into `backend/services/accountErasureService.js`.
6. **New `ui_settings` keys** are whitelisted and sanitized in `backend/modules/users/service.js` (`updateUiSettings`) and kept by the profile save (`kept`), and typed in `frontend/utils/profileService.ts`.
7. **Tests first, then the full run.** Backend integration + frontend RTL for each behaviour; before pushing, run the backend suite, `npm run frontend:test`, `npx tsc --noEmit -p .`, `npm run lint` and `npm run build`.
8. **Stay close to upstream.** Small, focused commits in upstream style so they can be offered back to chrisvel/tududi. Don't reformat files you don't otherwise change.
9. **TickTick is a reference for behaviour only.** Never copy its code, assets (SVG/PNG) or texts into this MIT repository.

## Syncing with upstream

`git fetch https://github.com/chrisvel/tududi main`, merge it into the fork branch, resolve locale conflicts key by key (merge the JSON, don't pick one side), check migration timestamps are still unique, run the full checks above, and update the base commit mentioned in this section and in the README.


## Fork pages in the documentation index

Upstream's `CLAUDE.md` index lists pages 1–38. The fork adds:

39. **[Focus Sessions](../30-focus-sessions.md)**
    - The top-bar tomato timer records finished sessions (and early stops of 5 minutes or more)
    - Shown on the Calendar and in Insights → Productivity → Focus statistics
    - `focus_sessions` table and `/api/focus-sessions` endpoints

40. **[Summary](../31-summary.md)**
    - Insights → Summary: tasks completed in a period (today, this week, last week, this month, custom up to 366 days), optionally open tasks due in it
    - Group by project, day or status; copy as Markdown, download .md/.txt/.csv, print
    - `GET /api/reports/summary` in user timezone; template saved in `ui_settings.summary`

41. **[Sidebar (Minimal)](../32-sidebar.md)**
    - Smart lists at the top (Today, Tomorrow, Next 7 days, Inbox) with open-task counts from `GET /api/tasks/smart-counts`
    - Projects and Tags in the panel, Areas as folders; Goals, Notes, People and the rest in the icon rail with a More menu
    - `GET /api/tasks?type=tomorrow`; Dense keeps the upstream sidebar

And page 29, Daily Plan, reads in the fork: Today is one page (`/today`) with planning built in; `/today/plan` and `/today_legacy` redirect to `/today`.
