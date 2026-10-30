# Keyboard, command palette and inbox triage

Everything here is keyboard-first and works without a mouse. Single keys only fire when focus is not in a text field, an editor or a modal dialog.

## Command palette (`Ctrl+K`, `Cmd+K` on a Mac)

Fuzzy search (accents ignored, every word must match, keywords count at a lower weight) across:

- commands: create a task, project, note or habit, quick capture, search, triage the inbox, toggle dark mode, show shortcuts;
- pages: Today, Inbox, Upcoming, Calendar, Projects, Tasks, Notes, Habits, Settings;
- entities: tasks, projects and notes (existing search API), habits (matched by name);
- task commands, when a task is the target: complete or reopen, open, date (today, tomorrow, next week, none), priority, move to a project.

The target task is the row with focus, else the row under the pointer, else the task open in the side panel. Up and Down move, Enter runs, Esc closes. With an empty field the palette lists recent commands and recently opened entities. Each row shows its shortcut.

Code: `frontend/components/CommandPalette/`, ranking in `frontend/utils/commandPalette.ts`.

## Shortcuts

The single list is `frontend/utils/shortcutRegistry.ts`; `?` opens it as an overlay.

| Keys | Action |
|---|---|
| `Ctrl/Cmd+K` | Command palette (works in fields) |
| `c` | Quick capture |
| `/` | Search |
| `?` | Shortcuts help |
| `g` then `t`, `i`, `u`, `c`, `p` | Today, Inbox, Upcoming, Calendar, Projects (second key within 1 s) |
| `Alt+Shift+I/T/P/N/A/G` | Create inbox item, task, project, note, area, tag (unchanged, configurable in Profile) |

On a focused task row (Minimal density): Up/Down between rows, `x` or Space complete, `e` or Enter open, `d` date, `p` priority, `m` move to a project (opens the palette on the project list), `Delete` delete with undo.

Delete with undo hides the row at once and calls the API only after 6 seconds, so Undo restores the same task. Reloading the page inside that window cancels the delete.

Dispatcher: `frontend/utils/shortcutDispatcher.ts` (pure, tested). Plain keys are ignored with Ctrl, Meta or Alt held, in `input`, `textarea`, `select`, content-editable elements and inside `aria-modal` dialogs.

## Search

The search overlay shows filter chips (types with result counts, priority, due date; more filters on demand) instead of a sentence and an accordion. Results are grouped by type with counts; Up/Down move, Enter opens, Esc closes.

## Quick capture

The lightning chip in the navbar reads "Capture" and shows its key (`C`). The box shows chips for the parsed date, `#tags`, `+project` and `!1`-`!3` priority, and a permanent syntax hint line. Parsing is unchanged (see [04-inbox-page.md](04-inbox-page.md)).

## Inbox triage

Inbox, Triage button (or `/inbox?triage=1`, or "Triage the inbox" in the palette). One item at a time:

| Key | Action |
|---|---|
| `t` | Make a task (date, tags, project read from the text) |
| `p` | Make a project |
| `n` | Make a note |
| `l` | Later: keep it in the inbox and move to the next |
| `Delete` | Delete |
| `Enter` | Accept the suggestion |
| `Esc` | Leave |

Suggestions are rule-based, no AI (`frontend/utils/inboxTriage.ts`): a `+project` means task; a `#tag` such as `idea`, `recette`, `read` means note, `#projet` means project, any other tag means task; a bare link, a long or multi-line text, or a leading word such as "idée", "lire" means note; "projet" means project; action verbs ("acheter", "appeler", "buy", "call") mean task; otherwise task. "Later" lasts for the session only.
