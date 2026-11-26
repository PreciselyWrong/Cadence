# Goals

A goal says why a group of projects and tasks exists: a result aimed at for a month, a quarter, a season, or a year, with measurable key results and, alongside, a bucket list of wishes with no deadline. This page covers goals, key results, progress, the next step, the bucket list, and how they live on web and Android.

![Goals page](images/web/goals.png)

## The three levels of the screen

```
Goals (a result to reach)
  ├── Key results (a single level)
  ├── Linked projects
  └── Tasks linked directly
Bucket list (Have / Be / Do)       no date, never in Today
```

A goal is **independent of areas**: you can link a project to a goal whatever its area. A goal has a **horizon** (Month, Quarter, Season, Year), a **status** (Active, Achieved, Paused, Dropped) and can have a **target date**.

## Creating and editing a goal

**Web**
- **Goals** page: **New Goal** button; or the **+** next to "Goals" in the sidebar; or **Add Goal** from an area's page (the area is pre-filled).
- The form asks for the title (required), the "why" (optional, shown in italics), the horizon, the status, the target date, and the area (optional).
- Edit: the pencil on the card or on the goal's page. Delete: the trash can, with a confirmation that says linked projects will be detached.

**Android**: **Tâches › Objectifs** (Tasks › Goals), right after Projects, and the Objectifs card of the Bilan (Review tab). Tapping a goal opens its sheet: next step and **Créer une tâche** (Create a task) first, then name, note (the "why", empty it to clear it), type (for a wish), state, and **Supprimer** (Delete) with **Annuler** (Undo) for five seconds. Goals and key results are created on the web; editing (name, note, state, deletion) works on the phone, offline included.

**Statuses**: any status can move to any other (Active to Achieved, Paused, Dropped, and back). On the bucket list, the labels are Active, **Fulfilled** (achieved), Paused, **Dropped**.

## The Goals screen

A single scrolling screen, identical on web (`/goals`) and Android:

1. **Search** ("Search a goal or a wish") on title and "why", ignoring case and accents. A goal stays visible if it matches (with all its key results) or if one of its key results matches (only those stay); groups that contain a matching result open by themselves. "Nothing matches." is shown otherwise, with "Clear the search".
2. **Active goals**, closest target date first, then the others, then by title (accent-aware sort: "Écrire" files with the Es). Each card: title, percentage, horizon and target date, a thin progress bar, the **next step**, then its key results in short lines ("title ... 3/10", a check mark when everything is done).
3. **Paused, achieved or dropped**: folded.
4. **Bucket list**: Have, Be, Do, folded with their count, then **Fulfilled**.

Key results are never listed alone. The progress bar shows completed tasks and projects; a line shows the time elapsed between creation and the target date.

## Key results

A goal that has a parent is a **key result** of that goal; the tree has only **one level**.

- On a goal's page, a **Key results** section lists its results (each with its own progress "N of M done") and a discreet **Add a key result** field; a key result's page links back to its goal.
- The Goals page and the sidebar show only goals.
- **Rules**: the parent must be one of your goals and must not itself be a key result; a goal that has key results cannot become a key result; a goal cannot be its own parent; a key result is never on the bucket list. Any violation is refused.
- **Linking work**: projects and tasks link to a key result as to any goal; pickers show it as "Goal › Key result".
- **Deleting a goal deletes its key results**; the goal link of the projects and tasks concerned is cleared (they are not deleted).

## Progress

Progress is the **share of completed items** among linked projects (completed) and linked tasks (completed or archived, without sub-tasks). Abandoned items do not count.

| Case | Result |
|---|---|
| Nothing is linked | No percentage ("Nothing linked") |
| 3 linked tasks, 1 completed | 1 of 3, 33% |
| A goal with two key results | It counts its own items **plus** those of its key results |
| An abandoned or cancelled item | Not counted |

## The next step

Each active goal shows one task: among the open top-level tasks linked to the goal (and to its key results), the one with the closest due date, then the oldest, then by name. It appears with a checkbox that **completes** it. With no linked task, **Add a next step** opens quick capture linked to the goal. Android applies the same rule locally.

## Linking a project or a task

- **Project**: in the project's form, **Goal** section (choose a goal, "No goal", or **Maintenance**). A project is in one of three states: linked to a goal, **maintenance** (it keeps something running without aiming at a goal), or unlinked. From an area's page, an unlinked project has a **link...** button.
- **Task**: on the task card, **Goal** card (searchable list; the cross removes the link). A task and its project each have their own link: the project's goal is **not inherited** by the task.
- Deleting a goal detaches its projects without deleting them.

## A goal's page

`/goal/<id>-<title>`. A banner (title, why, status, horizon, target date, linked area, task and project counts, pencil and trash can), then two columns: the linked **projects** (name, status, colored border) and the tasks **linked directly** (active first, **Completed (n)** folded).

A target date makes the goal appear as a diamond on the **Roadmap** when the date falls in the displayed quarter (active and achieved goals only).

## Bucket list

A wish is a goal **without a plan**: no date is asked for, and it **never** appears in Today, the daily plan, or the sidebar. It is sorted by type: **Have**, **Be**, **Do**. To take a goal off the list, remove its type.

- **Open and fulfilled**: an active or paused wish is *open* and stays in its group; an achieved or dropped wish moves to **Fulfilled** (folded). Tapping a wish's checkbox marks it **fulfilled**, with **Undo** (back to active).
- **Adding**: a field at the bottom of each open group ("Add a wish to `<group>`", "+ Add") on the web; the **+** button of the Goals screen on Android (name and group, the sheet stays open for the next one). Android creates the wish offline, through the send queue.
- **Create a task**: a button on each open wish (and in its sheet on Android): opens quick capture on Task, pre-filled with the wish's name. The created task is **linked** to the wish and can receive a project like any task. **The wish stays on the list** (it is the dream, the task is its next step); its line shows that next step, or "Linked tasks: N".

## Offline and devices

Goals are synced as the `goal` entity (with the `goal_uid` link on tasks and projects): edits, wish creations, and deletions work offline on Android and are sent when the network returns. If a goal is modified on both sides, the merge is done field by field; conflicts stay visible in Settings › Sync ([Offline and Sync](Offline-and-Sync)).

## Edge cases

- Number of active goals in an area: beyond **5**, the area's page shows a warning (an invitation to restraint, not a limit).
- A deleted goal: a confirmation warns that linked projects become unlinked; there is no undo on the web, whereas on Android the undo lasts five seconds.
- The bar does not include sub-tasks (a task with sub-tasks counts as one).
- A key result keeps its own percentage; the goal's is not the average of its results.

## Going further

- [Goals system (doc)](https://github.com/PreciselyWrong/cadence/blob/main/docs/12-goals-system.md), [Roadmap (doc)](https://github.com/PreciselyWrong/cadence/blob/main/docs/31-roadmap.md)
- Wiki pages: [Projects and Areas](Projects-and-Areas), [Review, Insights, and Focus](Review-Insights-and-Focus), [Android](Android), [Integrations, MCP, and Plugins](Integrations-MCP-and-Plugins) (tools `list_goals`, `create_goal`, `update_goal`, `delete_goal`)
