# Summary

The Summary page (Insights → Summary, `/insights/summary`) lists what you got done in a period, ready to paste into a status update, a journal or a timesheet.

## Using it

1. **Period:** Today, This week, Last week, This month, or a custom range (at most 366 days). Weeks start on the first day of the week from your profile.
2. **Tasks:** tasks completed in the period. Tick _Include open tasks due in this period_ to add tasks that are still open (not done, archived or cancelled) and due inside it.
3. **Group by:** project (alphabetical, "No project" last), day (completion day, else due day) or status.
4. **Export:** Copy as Markdown, Download .md, Download .txt, Download .csv, or Print. Print uses the browser dialog and prints only the summary (see the `@media print` rule at the end of `frontend/styles/tailwind.css`).

_Save as template_ stores the grouping and the include-open choice in `ui_settings.summary` (`{ group_by, include_open }`); the page opens with it next time.

Days are whole days in your profile timezone, so a task finished at 23:30 local time counts for that day even if it is the next day in UTC.

Only top-level tasks are listed (subtasks are left out, as in the task lists). Visibility follows the task lists: your own tasks, tasks shared with you, and tasks in projects shared with you (`permissionsService.ownershipOrPermissionWhere('task', ...)`).

## API

`GET /api/reports/summary?start=YYYY-MM-DD&end=YYYY-MM-DD&include_open=true`

- `400` when a date is missing or invalid, `end` is before `start`, or the range is longer than 366 days.
- Response:

```json
{
    "start": "2026-02-09",
    "end": "2026-02-15",
    "timezone": "Europe/Brussels",
    "include_open": true,
    "completed_count": 12,
    "open_count": 3,
    "tasks": [
        {
            "uid": "…",
            "name": "Ship release",
            "status": "done",
            "completed_at": "2026-02-10T15:00:00.000Z",
            "completed_date": "2026-02-10",
            "due_date": null,
            "project": { "uid": "…", "name": "Launch" },
            "tags": ["work"]
        }
    ]
}
```

`completed_date` and `due_date` are dates in the user's timezone. `status` is one of `not_started`, `in_progress`, `done`, `archived`, `waiting`, `cancelled`, `planned`.

`PUT /api/profile/ui-settings` with `{ "summary": { "group_by": "day", "include_open": true } }` saves the template; unknown groupings fall back to `project`, other keys are dropped.

## Code

| Part                                | Location                                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| Query                               | `backend/modules/reports/summary.js`                                                           |
| Route                               | `backend/modules/reports/routes.js`                                                            |
| Template sanitizer                  | `sanitizeSummary` in `backend/modules/users/service.js`                                        |
| Page                                | `frontend/components/Insights/SummaryPage.tsx`                                                 |
| Grouping and export builders (pure) | `frontend/components/Insights/summaryExport.ts`                                                |
| API client                          | `frontend/utils/summaryService.ts`                                                             |
| Tests                               | `backend/tests/integration/reports-summary.test.js`, `frontend/components/Insights/__tests__/` |

The CSV is UTF-8 with a BOM so spreadsheet apps read accents correctly; cells starting with `=`, `+`, `-` or `@` are prefixed with `'` to block formula injection.
