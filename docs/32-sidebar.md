# Sidebar (Minimal)

The sidebar has two looks, chosen with `ui_settings.appearance.density`. This page covers **Minimal** (the default). **Dense** keeps the upstream sidebar, with every section in one list.

## Layout

- **Icon rail** on the far left, always visible in Minimal. Collapsed, it is the whole sidebar; open, it sits beside the panel.
- **Panel** (open): smart lists, then the lists, then the footer.

## Smart lists

Four rows at the top of the panel, each with its open-task count on the right:

| Row | Opens | Count |
|---|---|---|
| Today | `/today` | Open tasks due today (not done, cancelled or archived; subtasks excluded) |
| Tomorrow | `/tasks?type=tomorrow` | Open tasks due tomorrow, same rule as the list |
| Next 7 days | `/upcoming` | Open tasks in the 7-day Upcoming view |
| Inbox | `/inbox` | Inbox items, the number the Inbox page shows |

- Counts come from `GET /api/tasks/smart-counts` (`{today, tomorrow, next7}`). Tomorrow and Next 7 days run the same filter as their list; Today counts due-today tasks only, because the Today page mixes plan, progress and due sections.
- The counts refresh on every navigation.
- `type=tomorrow` is a list type of `GET /api/tasks`, computed in the user's timezone.

## Lists

- **Favorites**, **Projects** and **Tags** stay in the panel. Projects and tags keep their nesting.
- **Areas** are folders. Click the arrow to show the projects inside an area; click the name to open the area page.
- Rows are 34 px tall with 14 px text.

## Icon rail and More

Primary icons, in order: Today, Inbox, Calendar, Notes, Habits, Views, Areas, Goals, People, Insights. Calendar, Habits, Templates and Access follow their existing settings.

**More** lists the rest: All tasks, Assigned to me, Everyone, Boards, Templates, Access.

Every item here still has its own route. Hiding an item in the sidebar settings hides it in the rail too.

## Dense

Dense renders the upstream sidebar: the full link list, every section in the panel, the admin group at the bottom, and the upstream icon rail.
