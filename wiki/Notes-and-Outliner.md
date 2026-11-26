# Notes and Outliner

Notes keep what you want to hold on to (meeting notes, ideas, references); notes and task descriptions are written by default as an **outline** (outliner, Workflowy or Logseq style), keyboard first, in plain Markdown. This page covers notes, the outline editor, links between notes, tasks, and people, backlinks, and contact links (phone numbers, emails).

![Notes](images/web/notes.png)

## Notes

A note has a title (optional, "Untitled Note" otherwise), Markdown content, an optional project, tags, a background color (10 shades or none) and, on the web, an optional background image (⋮ menu › **Background**, the same photos as Profile › Appearance, with the photographer's credit in the corner). No date, priority, or state: a note is information.

**Creating**: the **New Note** button on the Notes page, the `n` key on the Notes page, from the Inbox, or from a project (the note is then attached to the project). A note that was never typed into is not created.

**Opening**: there is no separate reading mode: a note opens directly in the editor. **Autosave** one second after the last keystroke (statuses Saved, Saving..., Unsaved changes); **Esc** saves immediately and leaves the note open; switching notes first saves the one you leave, and what you type during a save is never overwritten by the server's response.

**The Notes panel**: a list (title, start of the content, modification date); the `/notes` page shows an **overview** as a **List** (text cards) or a **Gallery** (cards with an image: the note's first image, otherwise the preview of an address it contains, otherwise the start of the text, plus the title and up to three tags). The choice is kept for your account. **All notes** in a note's ⋮ menu leads back to this overview. No note opens by itself.

**Focus mode**: a button enlarges the note to full screen with no sidebar or list; **Esc** or the cross leaves it.

**Pin** (⋮ menu › **Pin to sidebar**), **delete** (⋮ menu › Delete, with confirmation and **no undo**: the note and its files disappear, the project and tags remain), **image or file** (paste, drag, or `/` › **Image or File**: a file follows the note's access; a new note must first have a title or text).

**Public sharing** (web and Android): the globe icon (or **Partager publiquement** (Share publicly) in Android's ⋯ menu) creates a read-only "Anyone with the link" link, which you can turn off, regenerate (the old link stops working), or turn back on (same link). The reader only sees the title, the content, and the date. See [Self-Hosting](Self-Hosting) if the server has turned this flag off.

## The outline editor

A single surface: the notes editor. Outline keys take priority over Markdown ones and do nothing outside a list (except Enter on a line of prose). **Nothing changes in storage**: the text stays Markdown (`- ` lists, 2-space indent), so it is read as is by Android and by backlinks. No migration: a prose note displays as before and is not rewritten when opened.

| Key | Effect |
|---|---|
| Enter | Splits the bullet at the cursor: the text after becomes the next bullet and keeps the children. At the end of a bullet: a new sibling (or first child if the bullet is expanded with children). At the start of a bullet: an empty bullet above. An empty indented bullet goes up one level; at the first level, it leaves the list |
| Shift+Enter | Line break within the same bullet |
| Tab / Shift+Tab | Indent / outdent the bullet **with its children** (Shift+Tab places it right after its parent; the siblings that followed it stay under the parent, as in Workflowy) |
| Backspace at the start of the text | First removes the checkbox; deletes an empty bullet; merges a bullet without children into the line above; no effect on a bullet that has children |
| Alt+Up / Alt+Down | Swaps the bullet and its children with its sibling above / below |
| Ctrl/Cmd+Up / Ctrl/Cmd+Down | Collapses / expands the bullet |
| Ctrl/Cmd+. / Ctrl/Cmd+, | Zooms into the bullet / goes up one level |
| Ctrl/Cmd+Enter | Checkbox: none, then `[ ]`, then `[x]`, then `[ ]`; a plain line becomes `- [ ]` |
| Ctrl/Cmd+Shift+T (or Alt+Shift+T) | Turns the bullet into a **linked task** (see below). Browsers often reserve Ctrl+Shift+T to reopen a tab: Alt+Shift+T and the bullet's menu work everywhere |

**Typing**: typing on an empty line outside a list starts a bullet. Markdown block starts (`#`, `>`, `|`, `` ` ``, `-`, `*`, `+`) are left alone: headings, quotes, tables, and code are written as before. **Enter on a line of prose** turns it into a bullet and opens the next one: this is the only time existing prose becomes a bullet.

**Bullets**: a round dot; a click on the dot **zooms**, a right-click on the dot or the checkbox opens the **Bullet** menu: Zoom in, Collapse / Expand, **Make a task**.

**Folding**: a chevron on the left (shown on hover, always visible for a folded bullet); a folded bullet reads "...". It stays folded when you move it.
- **Remembered** per reader and per browser (`localStorage`), shared between the editor and reading; a bullet is recognized by its text and its rank among bullets with the same text: renaming a folded bullet expands it on the next visit. In private browsing (storage refused), folding only lasts for the visit. Nothing is synced between devices.

**Zoom**: only the bullet and its children remain visible, the bullet serves as the title, with an "All › parents" breadcrumb to go back up. Nothing outside the bullet can change. Enter on the title adds a first child. Zoom only lasts for the visit.

**Reading**: wherever a note or a description is read (task panel, focus mode, note window), the same outline is displayed with its chevrons, its zooming dot, and its checkable boxes, which write to the right place even when zoomed. Cards, the public page, and the blog keep plain lists.

### Bullet to linked task

Ctrl/Cmd+Shift+T (or **Make a task** in the bullet menu):
- creates a task named after the bullet's text without Markdown (255 characters at most);
- in the **note's project** (or that of the task whose description it is), otherwise with no project;
- **replaces** the bullet's text with `[[task:Name]]` (the checkbox is kept): the name only appears once, and the task lists the note in its backlinks. If creation fails, a message says so and the bullet stays a link to a task to be created.
- A `- [ ] ...` box becomes `- [ ] [[task:Name]]`.

**Linked checkbox**: when reading, the box of a bullet that starts with `[[task:Name]]` **follows the task's state** (checked if it is completed or archived); a click **completes or reopens the task**. The note's text is never rewritten (the written `[ ]`/`[x]` can therefore differ from what you see). In the editor, the box stays the one in the text.

## The formatting bar

Notes and task descriptions are edited in the **same editor**. A task's description opens on click and saves when focus leaves the editor, its bar, and its menus.

A **fixed bar at the bottom of the editor** (it stays stuck at the bottom): bold (Ctrl/Cmd+B), italic (Ctrl/Cmd+I), strikethrough (Ctrl/Cmd+Shift+X), heading (cycles H1, H2, H3, text; Ctrl/Cmd+1/2/3), bullet lists, numbered, checkbox, quote, code (Ctrl/Cmd+E: inline on one line, block on several), link (Ctrl/Cmd+K), `[[ ]]` (note picker), `@` (person picker), table (rows x columns grid; with the cursor in a table, "Add / Delete a row, a column" appear). Selecting text also shows a floating bar.

Typing `/` at the start of a line or after a space opens the **command menu**: headings, styles, code block, quote, task, lists, divider, link, note link, callouts (NOTE, TIP, WARNING, IMPORTANT, DANGER), table, Mermaid diagram, today's date, **Image or File**.

**Rendering**: full Markdown (GFM) rendered live as you type (a line's source reappears when the cursor enters it): headings, bold, italic, strikethrough, lists, clickable checkboxes, tables, colored code, quotes and `> [!NOTE]` callouts, images and videos, links, bare addresses, Mermaid diagrams. **Security**: raw HTML is never interpreted (shown as text); only `http`, `https`, `mailto`, `tel`, and relative paths pass; an external web link opens in a new tab (in the Linux client, in the default browser); a link to an app page stays in the app.

## Links between notes, tasks, and people

| You write | It points to | Rendering |
|---|---|---|
| `[[Title]]` | The note with that title (case ignored) | "Note: Title" chip |
| `[[task:Name]]` | The task with that name (an open one first, then the most recent) | "Task: Name" chip |
| `@[Name](person:<id>)` | The person | `@Name` chip to their card |
| `[text](/note/<id>)`, `/task/<id>`, `/person/<id>` | The item with that id | In-app link |

- **Inserting**: typing `[[` opens note search; when no note has the typed title, the menu offers **Create note "..."** and links it in one step. Typing `@` at the start of a word opens the list of people (arrows, Enter or Tab, Esc); the choice is saved as `@[Name](person:...)`. An `@` in the middle of a word (email address) opens nothing.
- **Unknown target**: a faded "+" chip. A click creates the note (and opens it) or the task (and opens its panel). Closing a `[[Title]]` by hand or Ctrl/Cmd-clicking a link to a missing note also asks whether to create it (Enter creates, Esc ignores). Message: "No note called "Title" yet. Create it?"
- **Opening**: Ctrl/Cmd-click a link in the editor; a simple click when reading.
- **In code** (inline or block), nothing is a link.
- `[[task:...]]` names are resolved among the tasks you can open (100 names at most per page).
- A **public page** only shows linked public notes; a task or a mention stays a chip without a link there, and a link to a private note shows a padlock.

### Backlinks

Under a note, in a task's panel, and on a person's card, a **Backlinks** section lists the notes and tasks that point to the item (from most recently modified to oldest, 100 at most), with an excerpt of the sentence. It only appears if there are any.
- **Computed on read**, with no table: renaming, editing, or deleting a source shows immediately, whatever the write path (web, MCP, sync, TODO.md).
- Only sources you can open are listed (direct, group, and project shares included). A note that cites itself is not listed.
- **Android**: backlinks of a note and of a task, read online when opening (absent offline); those of a **person** stay on the web (Android has no person card; a mention reads there as a chip without opening).

## Contact links: phone numbers and emails

In Markdown rendering (notes, task notes, the preview of an event's description), a **phone number** becomes a `tel:` link and an **email address** a `mailto:` link.

| Written | Becomes |
|---|---|
| `+41 79 123 45 67`, `+33 6 12 34 56 78` | `tel:` link (international: 8 to 15 digits, separators space, dot, hyphen, parentheses) |
| `079 123 45 67` | `tel:` link (national, 10 digits starting with 0) |
| `camille@example.com` | `mailto:` link |
| `2026`, `14h30`, `12.11.2026` | **Never** a link: dates, times, and years are not detected |
| A number already inside a link or code | Left as is |

**Android**: task titles and notes, and note titles, open recognized addresses on tap (including domains with typographic hyphens and addresses followed by invisible characters); an edit button keeps their text editable. Notes keep their Markdown links.

## On Android

- **Outline editing**: same storage, same text rules as the web (a Kotlin port with the same test cases). The phone keyboard only sends text; the app recognizes Enter, backspace at the start of a bullet, and typing on an empty line.
- **Bar above the keyboard**: outdent, indent, move up, move down, collapse / expand, zoom, checkbox, **Créer une tâche** (Create a task), then formatting (the table is chosen from ready-made sizes, from 2 x 2 to 4 x 3, with no row or column adding).
- **Reading**: a chevron before each foldable bullet, "..." that expands, a dot that zooms (breadcrumb), boxes that write to the right place even when zoomed. Folding is remembered **per device**, never synced.
- **Linked checkbox**: follows the task of that name **on the device** (offline) and completes or reopens it; with no task of that name, it is an ordinary box.
- **Links**: `[[Title]]` opens the note, `[[task:Name]]` the task, an unknown target is a "+" chip that creates the item through the send queue. The **@** picker reads people online on first open and keeps the last list on the device to write a mention offline.
- **Offline**: notes are synced both ways (title, content, color, pin, project, tags); typing is saved deferred and merged without erasing what was typed since. A note deletion can be undone for about 4.5 seconds.

## Edge cases

- **Deleting a note**: permanent, no trash. A note that links to itself has no backlink.
- **A note without a title** is not saved while there is neither title nor text (useful for files).
- **Collaborators**: only a note's owner can share it publicly.
- The outline also works outside a list: as long as no bullet exists, the editor behaves like a classic Markdown editor.

## Going further

- [Notes (doc)](https://github.com/PreciselyWrong/cadence/blob/main/docs/05-notes-system.md), [Markdown, links, and backlinks (doc)](https://github.com/PreciselyWrong/cadence/blob/main/docs/44-notes-links.md), [Outline, outliner (doc)](https://github.com/PreciselyWrong/cadence/blob/main/docs/45-outliner.md)
- Wiki pages: [Tasks](Tasks), [People and Close Ones](People-and-Close-Ones), [Android](Android), [Offline and Sync](Offline-and-Sync)
