# Daily brief (retired)

Retired on 2026-11-12, server and web. The morning summary and the evening review are now messages from the Hermes agents in the agents' inbox (the Hermes plugin, its own repository, with live notifications: `docs/46-plugins.md`, `docs/36-notifications.md`).

What went: the engine (`backend/modules/daily-plan/brief/`), the `/api/daily-plan/*brief*` and `/evening` routes, the `daily_brief` and `brief_purge` jobs, Piper audio, the `/insights/daily-brief` page, the Today card and its `today_settings.showDailyBrief` switch, Profile › Résumé, the plugin `brief` permission and `ctx.brief`, and the upstream AI daily brief (`/api/ai-assistant/daily-brief`).

What stayed, in the triage queue (`docs/40-triage.md`): the rules on duplicates, dates in notes, postponements and calendar conflicts, the linked contexts, and the settings they read, still stored in `ui_settings.brief`. The old answer path `POST /daily-plan/:date/brief/answers` is kept for the Android app up to 1.20.

The columns and tables stay in the schema, unused (`docs/database.md`).
