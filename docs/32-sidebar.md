# Sidebar (Minimal)

The sidebar has two looks, chosen with `ui_settings.appearance.density`. This page covers **Minimal** (the default). **Dense** keeps the upstream sidebar, with every section in one list.

## Layout

- **Icon rail** on the far left, always visible in Minimal. Collapsed, it is the whole sidebar; open, it sits beside the panel.
- **Panel** (open): its blocks (Pinned, Month calendar, Smart lists, Projects, Areas, Tags) in the order chosen in Profile → Sidebar, each one can be hidden.
- **Footer** (+, apps, theme) runs under both the rail and the panel, so its top line spans the whole sidebar.

## Smart lists

Four rows at the top of the panel. By default only Today and Inbox show a count on the right (what waits for you); Tomorrow and Next 7 days stay quiet until their count is switched on. Each row can be hidden, moved up or down, or have its count switched off (see [Customising](#customising)):

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

- **Panel**: show or hide each block of the open panel (Pinned, Month calendar, Smart lists, Projects, Areas, Tags), move it up or down, and switch the count badge of Projects, Areas and Tags (off by default; Pinned has none). A block hidden here does not hide the matching rail item: Today, Inbox and Areas go back on the rail when their block is hidden.
- **Smart lists**: show or hide each row, switch its count badge on or off, and move it up or down. Hidden rows are not fetched for counts unless another visible row needs one.
- **Icon rail and More**: each item is on the icon rail, in the More menu, or hidden. Within each place, the order is the order in the editor.
- **Reset to default** puts every panel block, smart list, rail item and badge back to the defaults.

The entry **Customize sidebar** sits once, in the More menu of the icon rail (Escape closes that menu); it opens that Profile section.

The panel is the only scroller: sections (Pinned, Projects, Areas, Tags, Goals, People, Views) grow with their content and fold from their header instead of scrolling inside a fixed-height box.

Stored in `users.sidebar_settings` as `smartLists: [{key, visible, showCount}]`, `rail: [{key, place}]`, `sectionBadges: {favorites, projects, areas, tags}` and `panel: [{key, visible}]` (keys `favorites`, `miniMonth`, `smartLists`, `projects`, `areas`, `tags`). Unknown keys are dropped and flags are read as booleans. Items missing from a saved list (for example, a new item added later) take their default and appear at the end.

## Pinned

Pinned projects, notes and tags open the panel, above the smart lists (or the Dense links), in a tinted block titled **Pinned**. The block is always open and has no collapse arrow; it disappears when nothing is pinned.

- **Pin** from any project or tag row of the sidebar: the pin button shows on hover (always on touch screens), one click, nothing opens. Notes and projects can still be pinned from their page (**…** menu).
- A pinned row shows the project's icon in its colour, the tag's colour dot or the note icon; the cross on hover unpins.
- Profile → Sidebar keeps a **Pinned** switch at the top of the layout editor to hide the block. It cannot be moved: it always comes first.

Projects and notes use `pin_to_sidebar`, tags `pinned`; all are synced.

## Lists

- **Projects** and **Tags** stay in the panel under the smart lists. Projects and tags keep their nesting.
- A project with sub-projects has a chevron on its left: it folds or unfolds them, at any depth. The choice is kept on this device (`sidebarFoldedProjects` in local storage). The open project stays visible even when a parent is folded.
- **Areas** are folders. Click the arrow to show the projects inside an area; click the name to open the area page.
- Rows are 34 px tall with 14 px text.

## Drop on the sidebar

Drag a task, a note or a project onto a sidebar row to file it there, in Minimal and in Dense. The row under the pointer lights up (blue ring) only when it takes what is dragged; releasing elsewhere changes nothing.

| Row | Task | Note | Project |
|---|---|---|---|
| Project (Projects section, or under an open area folder) | moves into the project | moves into the project | — |
| Tag | gains the tag (full path, e.g. `perso/sport`); its other tags stay | same | — |
| Area | gets the area | — (notes have no area) | is filed in the area |
| Today, Tomorrow (Minimal smart lists), Today (Dense links) | becomes due that day | — | — |

- What can be dragged: task rows in every task list (Tasks, Upcoming, project, area, tag and Today pages, Today's candidate cards), note cards (Notes page, project page) and note rows in the sidebar, project rows in the sidebar and project cards on the Projects page. Lists that reorder by drag keep doing so; a drop on the sidebar wins over a reorder.
- Nothing is saved when the item already has it (same project, same area, the tag already set, already due that day).
- Not taken: recurring tasks on Today or Tomorrow (one date of a series moves through the occurrence move), a sub-project on an area (its area follows its parent), tasks mirrored from a `TODO.md` file, occurrences that only exist on screen, tags not yet saved.
- The row keeps its place in the list it came from and shows the change at once. A failed save shows an error toast. The click that ends a drag does not open the row it lands on.
- Keyboard reordering is unchanged and never drops on the sidebar.

## Icon rail and More

By default the primary icons are Today, Inbox, Calendar, Notes, Habits, Views, Areas, Goals, People, Insights; the rest sit in **More**: All tasks, Assigned to me, Everyone, Boards, Templates, Access. Each item can be moved between the rail, More and hidden (see [Customising](#customising)). Calendar, Habits, Templates, Everyone and Access still follow their feature and visibility settings.

Every item here still has its own route. Hiding an item in the sidebar settings hides it in the rail too.

## Dense

The Customising settings do not apply to Dense. Dense renders the upstream sidebar: the full link list, every section in the panel, the admin group at the bottom, and the upstream icon rail.
