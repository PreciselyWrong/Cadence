# Sidebar (Minimal)

The sidebar has two looks, chosen with `ui_settings.appearance.density`. This page covers **Minimal** (the default). **Dense** keeps the upstream sidebar, with every section in one list.

## Layout

- **Icon rail** on the far left, always visible in Minimal. Collapsed, it is the whole sidebar; open, it sits beside the panel.
- **Panel** (open): smart lists, then the lists, then the footer.

## Smart lists

Four rows at the top of the panel, each with its open-task count on the right. Each row can be hidden, moved up or down, or have its count switched off (see [Customising](#customising)):

| Row | Opens | Count |
|---|---|---|
| Today | `/today` | Open tasks due today (not done, cancelled or archived; subtasks excluded) |
| Tomorrow | `/tasks?type=tomorrow` | Open tasks due tomorrow, same rule as the list |
| Next 7 days | `/upcoming` | Open tasks in the 7-day Upcoming view |
| Inbox | `/inbox` | Inbox items, the number the Inbox page shows |

- Counts come from `GET /api/tasks/smart-counts` (`{today, tomorrow, next7}`). Tomorrow and Next 7 days run the same filter as their list; Today counts due-today tasks only, because the Today page mixes plan, progress and due sections.
- The counts refresh on every navigation.
- `type=tomorrow` is a list type of `GET /api/tasks`, computed in the user's timezone.

## Customising

Profile → Sidebar has a **Minimal sidebar** section (it shows for Minimal only; Dense keeps its own layout editor above). Every change saves at once.

- **Smart lists**: show or hide each row, switch its count badge on or off, and move it up or down. Hidden rows are not fetched for counts unless another visible row needs one.
- **Icon rail and More**: each item is on the icon rail, in the More menu, or hidden. Within each place, the order is the order in the editor.
- **Count badges**: Projects, Areas and Tags show their item count in the header by default; switch it off per section. (Favorites has no count badge.)
- **Reset to default** puts every smart list, rail item and badge back to the defaults.

The same entry, **Customize sidebar**, sits in the More menu of the icon rail and above the footer of the panel; both open that Profile section.

Stored in `users.sidebar_settings` as `smartLists: [{key, visible, showCount}]`, `rail: [{key, place}]` and `sectionBadges: {favorites, projects, areas, tags}`. Unknown keys are dropped and flags are read as booleans. Items missing from a saved list (for example, a new item added later) take their default and appear at the end.

## Lists

- **Favorites**, **Projects** and **Tags** stay in the panel. Projects and tags keep their nesting.
- **Areas** are folders. Click the arrow to show the projects inside an area; click the name to open the area page.
- Rows are 34 px tall with 14 px text.

## Icon rail and More

By default the primary icons are Today, Inbox, Calendar, Notes, Habits, Views, Areas, Goals, People, Insights; the rest sit in **More**: All tasks, Assigned to me, Everyone, Boards, Templates, Access. Each item can be moved between the rail, More and hidden (see [Customising](#customising)). Calendar, Habits, Templates, Everyone and Access still follow their feature and visibility settings.

Every item here still has its own route. Hiding an item in the sidebar settings hides it in the rail too.

## Dense

The Customising settings do not apply to Dense. Dense renders the upstream sidebar: the full link list, every section in the panel, the admin group at the bottom, and the upstream icon rail.
