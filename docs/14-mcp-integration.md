# MCP Integration

This guide explains how to configure and use the Model Context Protocol (MCP) integration in Cadence to enable AI assistants to interact with your tasks, projects, notes, and inbox.

**Related:** [API Keys](08-user-management.md), [Architecture Overview](architecture.md)

---

## Table of Contents

- [Overview](#overview)
- [What is MCP?](#what-is-mcp)
- [Supported Clients](#supported-clients)
- [Configuration](#configuration)
    - [Prerequisites](#prerequisites)
    - [Quick Setup](#quick-setup)
- [Two Transport Modes](#two-transport-modes)
    - [Stdio Mode (Local)](#stdio-mode-local)
    - [HTTP Mode (Remote)](#http-mode-remote)
- [Available Tools](#available-tools)
    - [Tasks Tools (11)](#tasks-tools-11)
    - [Comments Tools (2)](#comments-tools-2)
    - [Projects Tools (5)](#projects-tools-5)
    - [Inbox Tools (6)](#inbox-tools-6)
    - [Views Tools (5)](#views-tools-5)
    - [Goals Tools (5)](#goals-tools-5)
    - [Areas Tools (5)](#areas-tools-5)
    - [Notes Tools (5)](#notes-tools-5)
    - [Tags Tools (5)](#tags-tools-5)
    - [Habits Tools (9)](#habits-tools-9)
    - [People Tools (5)](#people-tools-5)
    - [Links Tools (3)](#links-tools-3)
    - [Misc Tools (1)](#misc-tools-1)
- [Claude Desktop Setup](#claude-desktop-setup)
- [Cursor Setup](#cursor-setup)
- [VS Code + Continue Setup](#vs-code--continue-setup)
- [Other MCP Clients](#other-mcp-clients)
- [Security](#security)
- [Troubleshooting](#troubleshooting)

---

## Overview

Cadence's MCP integration allows AI assistants (Claude, Cursor, VS Code extensions, etc.) to interact with your Cadence data using the [Model Context Protocol](https://modelcontextprotocol.io). This provides a standardized way for AI tools to read and modify your tasks, projects, inbox, and more.

**Key Features:**

- **68 Tools:** Complete CRUD operations for tasks, projects, inbox, views, goals, areas, notes, tags, habits, and people, plus task comments
- **Secure Authentication:** API token-based authentication with user isolation
- **Local or Remote:** Two transport modes for different use cases
- **Enabled by default:** No configuration needed to turn MCP on
- **Frontend Configuration:** Web UI for generating client configurations

---

## History

MCP was introduced in Cadence [v1.0.0](https://github.com/chrisvel/tududi/pull/953) as a way to expose Cadence's data to AI assistants through the Model Context Protocol.

---

## What is MCP?

MCP (Model Context Protocol) is an open protocol developed by Anthropic that standardizes how AI applications connect to external data sources and tools. Think of it as a "USB-C port" for AI assistants — a universal connector that lets any MCP-compatible AI application interact with Cadence without custom integrations.

Cadence implements MCP as an MCP **Server**, exposing tools that AI clients can discover and call. This means:

- **AI sees Cadence as a set of tools** — like `list_tasks`, `create_task`, `search`, etc.
- **AI uses natural language** — "Show me my overdue tasks" triggers the `list_tasks` tool
- **AI can take action** — "Create a task for X" triggers `create_task`
- **All interactions are authenticated** — Your API token secures every connection

---

## Supported Clients

Cadence's MCP server works with any MCP-compatible client:

| Client                      | Transport     | Setup Complexity |
| --------------------------- | ------------- | ---------------- |
| **Claude Desktop**          | Stdio or HTTP | Easy             |
| **Cursor**                  | Stdio         | Easy             |
| **VS Code + Continue**      | Stdio         | Medium           |
| **Windsurf (Codeium)**      | Stdio         | Easy             |
| **Zed**                     | Stdio         | Medium           |
| **Any HTTP-capable client** | HTTP          | Medium           |

---

## Configuration

### Prerequisites

1. **Cadence installed and running** — v1.0.0 or later
2. **An API token** — Generate one at `Profile → API Keys`
3. **An MCP-compatible client** — Claude Desktop, Cursor, etc.

### Quick Setup

1. **Generate an API token:**
    - Navigate to `Profile → API Keys` in Cadence
    - Create a new token (keep it secure)

2. **Choose your transport mode:**
    - **Stdio:** For local Desktop/CLI client integration
    - **HTTP:** For remote access or Docker deployments

3. **Configure your client** — Use the configuration below

---

## Two Transport Modes

Cadence supports two transport modes for different deployment scenarios:

### Stdio Mode (Local)

**Use case:** Claude Desktop or Cursor running on the same machine as Cadence.

- **Authentication:** Via `TUDUDI_API_TOKEN` environment variable
- **Communication:** Direct process communication (stdio)
- **Performance:** Lowest latency
- **Setup:** Configure in your client's JSON config

**Best for:**

- Local development
- Single-machine Claude Desktop setup
- Direct CLI access

### HTTP Mode (Remote)

**Use case:** Remote Cadence server (Docker, cloud) accessed via HTTP.

- **Authentication:** Bearer token in Authorization header
- **Communication:** HTTP POST to `/api/mcp`
- **Protocol:** Streamable HTTP (stateless mode)
- **Setup:** Requires `mcp-remote` npm package
- **claude.ai custom connector:** with `TUDUDI_PUBLIC_MCP_URL` set, the same endpoint is also served at `/mcp`, for connector tokens only, with a built-in OAuth authorization server (DCR during a pairing window opened from Profile › MCP, PKCE, two-factor consent, MCP-only tokens). See [Remote MCP connector (claude.ai)](38-remote-mcp.md)

**Best for:**

- Docker deployments
- Cloud-hosted Cadence
- Remote Claude Desktop access
- Team environments

**HTTP Configuration Example:**

```json
{
    "mcpServers": {
        "Cadence": {
            "command": "npx",
            "args": [
                "-y",
                "mcp-remote",
                "https://${TUDUDI_HOST}/api/mcp",
                "--header",
                "Authorization:Bearer ${TUDUDI_API_TOKEN}"
            ],
            "env": {
                "TUDUDI_API_TOKEN": "your-token-here",
                "TUDUDI_HOST": "tududi.yourdomain.tld"
            }
        }
    }
}
```

---

## Available Tools

Cadence exposes 65 MCP tools organized into 12 categories. All tools are scoped to the authenticated user — you can never access another user's data.

### Tasks Tools (12)

#### `list_tasks`

List tasks with optional filtering by type, status, or project.

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `type` | string | No | — | Filter: `today` (what the Today page shows: in progress, planned for today, due today, overdue), `upcoming` (due or deferred in the next 7 days), `completed`, `archived`, `all` |
| `status` | string | No | — | Filter: `pending`, `in_progress`, `completed`, `archived` |
| `project_id` | number | No | — | Filter by project ID |
| `blocked` | boolean | No | — | `true`: only tasks with an open blocker. `false`: only tasks without one |
| `limit` | number | No | 50 | Maximum tasks to return |

**Example:**

```json
{
    "type": "today",
    "limit": 20
}
```

**Returns:** Task objects with full details including project, tags, subtasks, and priority.

---

#### `get_task`

Get a single task by ID (number) or UID (string).

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number/string | Yes | Task ID or UID |

**Example:**

```json
{
    "id": "abc123"
}
```

---

#### `create_task`

Create a new task.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Task name |
| `note` | string | No | Task note (the same field REST calls `note`) |
| `description` | string | No | Alias of `note`; `note` wins if both are sent |
| `priority` | string | No | `none`, `low`, `medium`, or `high` (default: `medium`) |
| `due_date` | string | No | ISO 8601 date |
| `defer_until` | string | No | ISO 8601 date/time; task is hidden from view until this point |
| `project_id` | number | No | Assign to a project |
| `area_id` | number | No | Assign directly to an area (tasks in a project take the project's area) |
| `area_uid` | string | No | Area UID, alternative to `area_id` |
| `source` | string | No | Where the task came from (`gmail`, `telegram`, `mcp`, `android`, `desktop`, `link`, `web`); defaults to `mcp`. Shown as a badge |
| `source_url` | string | No | http or https page the badge opens (e.g. a Gmail message link) |
| `assigned_to` | string | No | Person UID to assign the task to (from `list_people`) |
| `tags` | string[] | No | Array of tag names to apply |
| `recurrence_type` | string | No | `none`, `daily`, `weekly`, `monthly`, `monthly_weekday`, or `monthly_last_day` |
| `recurrence_interval` | number | No | Repeat every N days/weeks/months (default: 1) |
| `recurrence_weekday` | number | No | Weekday for `weekly`/`monthly_weekday` recurrence (0=Sunday..6=Saturday) |
| `recurrence_weekdays` | number[] | No | Multiple weekdays for `weekly` recurrence, alternative to `recurrence_weekday` |
| `recurrence_month_day` | number | No | Day of month for `monthly` recurrence (1-31, or -1 for last day) |
| `recurrence_week_of_month` | number | No | Week of month for `monthly_weekday` recurrence (1-5, or -1 for last) |
| `recurrence_end_date` | string | No | Optional end date for the recurrence (ISO 8601); omit for indefinite recurrence |
| `completion_based` | boolean | No | If true, the next occurrence is scheduled from the completion date instead of the fixed schedule |

**Example:**

```json
{
    "name": "Review pull request #42",
    "description": "Check the MCP integration changes",
    "priority": "high",
    "due_date": "2026-04-27T17:00:00Z",
    "tags": ["code-review", "urgent"]
}
```

**Recurring task example:**

```json
{
    "name": "Take out the trash",
    "recurrence_type": "weekly",
    "recurrence_weekday": 2,
    "recurrence_interval": 1
}
```

---

#### `update_task`

Update an existing task.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number/string | Yes | Task ID or UID |
| `name` | string | No | New task name |
| `note` | string | No | New note (the same field REST calls `note`) |
| `description` | string | No | Alias of `note`; `note` wins if both are sent |
| `priority` | string | No | `none`, `low`, `medium`, `high` (none clears priority) |
| `status` | string | No | `pending`, `in_progress`, `completed`, `archived` |
| `due_date` | string | No | New due date (ISO 8601) |
| `defer_until` | string | No | New defer until date/time (ISO 8601); pass `null` or `""` to clear it |
| `project_id` | number | No | Reassign to a project (`null` to remove) |
| `area_id` | number | No | Assign directly to an area (`null` to remove) |
| `area_uid` | string | No | Area UID, alternative to `area_id` |
| `assigned_to` | string | No | Person UID to assign the task to (`null` to unassign) |
| `today` | boolean | No | Add to Today list |
| `tags` | string[] | No | Array of tag names (replaces existing tags) |
| `in_view` | boolean | No | Put the task in view (a possibility, not a commitment) or take it out |
| `week_of` | string | No | Commit to a week: a date in it (`YYYY-MM-DD`), `this_week`, `next_week`, or `null` |
| `review_on` | string | No | Day to decide about the task again (`YYYY-MM-DD`, or `null`); never a due date |
| `later` | boolean | No | `true` parks the task (`#someday`, out of view, week and today); `false` brings it back |
| `recurrence_type` | string | No | `none`, `daily`, `weekly`, `monthly`, `monthly_weekday`, or `monthly_last_day` |
| `recurrence_interval` | number | No | Repeat every N days/weeks/months |
| `recurrence_weekday` | number | No | Weekday for `weekly`/`monthly_weekday` recurrence (0=Sunday..6=Saturday) |
| `recurrence_weekdays` | number[] | No | Multiple weekdays for `weekly` recurrence, alternative to `recurrence_weekday` |
| `recurrence_month_day` | number | No | Day of month for `monthly` recurrence (1-31, or -1 for last day) |
| `recurrence_week_of_month` | number | No | Week of month for `monthly_weekday` recurrence (1-5, or -1 for last) |
| `recurrence_end_date` | string | No | Optional end date for the recurrence (ISO 8601) |
| `completion_based` | boolean | No | If true, the next occurrence is scheduled from the completion date instead of the fixed schedule |

Any parameter not in the table above is rejected with an error rather than silently ignored.

**Example:**

```json
{
    "id": "abc123",
    "priority": "high",
    "status": "in_progress"
}
```

Changing recurrence fields on a task that already has future recurring instances regenerates those instances, the same way `PATCH /api/task/:uid` does.

---

#### `complete_task`

Toggle a task between completed and pending.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number/string | Yes | Task ID or UID |

**Example:**

```json
{
    "id": "abc123"
}
```

---

#### `skip_task_occurrence`

Move a recurring task to its next due date without completing it. The skipped occurrence does not count in completion stats or streaks. Returns an error for non-recurring tasks, completed tasks, and tasks whose recurrence has no further occurrence.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number/string | Yes | Task ID or UID |

**Example:**

```json
{
    "id": "abc123"
}
```

---

#### `delete_task`

Permanently delete a task.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number/string | Yes | Task ID or UID |

---

#### `add_subtask`

Add a subtask to a parent task.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `parent_id` | number/string | Yes | Parent task ID or UID |
| `name` | string | Yes | Subtask name |
| `priority` | string | No | `none`, `low`, `medium`, `high` (default: `medium`) |
| `due_date` | string | No | ISO 8601 date |

**Example:**

```json
{
    "parent_id": "xyz789",
    "name": "Write unit tests",
    "priority": "medium"
}
```

---

#### `create_task_relation`

Link two tasks. The type is from the point of view of the task in `id`. Circular blocking chains are refused, and you need edit access to both tasks.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number/string | Yes | Task ID or UID to add the relation to |
| `target_id` | number/string | Yes | The other task's ID or UID |
| `type` | string | Yes | `blocks`, `blocked_by`, `related_to`, `duplicates`, `duplicated_by` |

---

#### `list_task_relations`

List the tasks linked to a task. Each entry has a relation `uid`, a `type` and the other task's `uid`, `name` and `status`. Linked tasks you cannot read are left out.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number/string | Yes | Task ID or UID |

---

#### `remove_task_relation`

Remove a relation using the `uid` from `list_task_relations`. Removing it from either task removes it for both.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number/string | Yes | Task ID or UID |
| `relation_uid` | string | Yes | Relation UID |

`complete_task` still completes a blocked task, and adds a `warning` and `open_blockers` to its result when it does.

---

#### `get_task_metrics`

Get productivity metrics and task statistics.

**Parameters:** None

**Returns:**

```json
{
    "open_tasks": 12,
    "completed_tasks": 48,
    "overdue_tasks": 3,
    "in_progress_tasks": 5,
    "completed_today": 2,
    "completed_this_week": 11
}
```

---

### Comments Tools (2)

#### `list_task_comments`

List the comments on a task, oldest first. Replies are nested under the comment they answer in `replies`. You need read access to the task.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number/string | Yes | Task ID or UID |

---

#### `add_task_comment`

Add a comment to a task. Read access is enough, so a read-only collaborator can comment too. The task owner, the assignee and anyone mentioned get the usual comment notifications.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number/string | Yes | Task ID or UID |
| `body` | string | Yes | Comment text (max 10,000 characters) |
| `parent_comment_uid` | string | No | Reply to this top-level comment |
| `mentioned_person_uids` | string[] | No | Person UIDs to mention |

**Example:**

```json
{
    "id": "abc123",
    "body": "Blocked on the vendor, following up Monday"
}
```

---

### Projects Tools (5)

#### `list_projects`

List projects with optional filtering.

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `status` | string | No | — | Filter: `not_started`, `planned`, `in_progress`, `waiting`, `done`, `cancelled`, `all` |
| `area_id` | number | No | — | Filter by area ID |
| `limit` | number | No | 30 | Maximum projects to return |

---

#### `get_project`

Get a single project by UID.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | string | Yes | Project UID |

Project responses from `list_projects`, `get_project`, `create_project` and `update_project` include `goal`, `is_maintenance`, `visibility` and `next_task` (`{ uid, name }` of the designated next action, or `null`).

---

#### `create_project`

Create a new project. Refused for an account whose role does not allow creating projects (a guest, or a user who was denied `create_projects`).

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Project name |
| `description` | string | No | Project description |
| `priority` | number | No | 0=low, 1=medium, 2=high |
| `status` | string | No | `not_started`, `planned`, `in_progress`, `waiting`, `done`, `cancelled` |
| `area_id` | number | No | Parent area ID |
| `due_date_at` | string | No | Due date (ISO 8601) |
| `tags` | string[] | No | Array of tag names |
| `goal_id` | number | No | Goal ID to link the project to (must be your own goal) |
| `goal_uid` | string | No | Goal UID, as an alternative to `goal_id` |
| `is_maintenance` | boolean | No | Mark as a maintenance project; cannot be combined with a goal |
| `visibility` | string | No | `area` (default): shared with everyone its area or goal is shared with. `restricted`: only you, the area owner and people the project itself is shared with |

---

#### `update_project`

Update an existing project.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | string | Yes | Project UID |
| `name` | string | No | New name |
| `description` | string | No | New description |
| `priority` | number | No | New priority |
| `status` | string | No | New status |
| `area_id` | number | No | New area ID (owner only) |
| `pinned` | boolean | No | Pin to sidebar |
| `goal_id` | number | No | Link to a goal you own; `null` unlinks (owner only) |
| `goal_uid` | string | No | Goal UID, as an alternative to `goal_id`; `null` or empty unlinks |
| `is_maintenance` | boolean | No | `true` marks as maintenance and unlinks any goal (owner only if a goal is set); linking a goal sets it back to `false` |
| `visibility` | string | No | `area` or `restricted` (project owner or area owner only); restricting takes back the access the area and goal gave |
| `next_task_uid` | string | No | Next action: UID of an open task of this project, the same rule as the REST `PATCH`; `null` clears. Cleared automatically when the task is closed, deleted or moved out. A new project has no tasks, so `create_project` does not take it |

---

#### `delete_project`

Permanently delete a project and all its tasks (notes are orphaned).

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | string | Yes | Project UID |

---

### Inbox Tools (6)

#### `list_inbox`

List inbox items. Only active items (not deleted, trashed, or processed) are returned by default.

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | number | No | 20 | Maximum items |
| `offset` | number | No | 0 | Items to skip |
| `status` | string | No | — | Filter by a specific status (e.g. `added`, `processed`, `deleted`, `trashed`). Omit to return only active items. |

---

#### `add_to_inbox`

Add an item to the inbox.

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `content` | string | Yes | — | Inbox content |
| `source` | string | No | `mcp` | Source identifier |

---

#### `get_inbox_item`

Get a single inbox item by ID.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | Yes | Inbox item ID |

---

#### `update_inbox_item`

Update an existing inbox item.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | Yes | Inbox item ID |
| `content` | string | No | New content |

---

#### `process_inbox_item`

Marks an inbox item as processed, once what it became exists (same as `PATCH /api/inbox/:uid/process`). Its files move to the task, project or note given.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | string | Yes | Inbox item UID |
| `task_uid`, `project_uid`, `note_uid` | string | No | What the item became (one of them); must be the user's |
| `link_uid` | string | No | The link made from it with `create_link`; a link of someone else is an error and the item stays open |

---

#### `delete_inbox_item`

Delete an inbox item.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | Yes | Inbox item ID |

---

### Views Tools (5)

#### `list_views`

List saved smart views (saved searches).

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `pinned_only` | boolean | No | `false` | Return only pinned views |

**Returns:** View objects with name, search query, filter config, and pin state.

---

#### `get_view`

Get a specific smart view by UID.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | string | Yes | View UID |

---

#### `create_view`

Create a new smart view (saved search).

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | View name |
| `search_query` | string | No | Text search query |
| `is_pinned` | boolean | No | Pin to sidebar (default: false) |
| `priority` | string | No | Priority filter: `low`, `medium`, `high` |
| `due` | string | No | Due date filter (e.g. `today`, `this_week`) |
| `tags` | string[] | No | Tag filters |

**Example:**

```json
{
    "name": "High priority this week",
    "priority": "high",
    "due": "this_week",
    "is_pinned": true
}
```

---

#### `update_view`

Update an existing smart view.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | string | Yes | View UID |
| `name` | string | No | New name |
| `search_query` | string | No | New search query |
| `is_pinned` | boolean | No | Pin or unpin from sidebar |
| `priority` | string | No | New priority filter |
| `due` | string | No | New due date filter |
| `tags` | string[] | No | New tag filters |

---

#### `delete_view`

Delete a smart view.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | string | Yes | View UID |

---

### Goals Tools (5)

#### `list_goals`

List goals with optional filtering by area or status.

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `area_id` | number | No | — | Filter by area ID |
| `status` | string | No | `all` | Filter: `active`, `achieved`, `paused`, `dropped`, `all` |

**Returns:** Goal objects with title, why, horizon, status, bucket, target date, linked area, `parent_goal_uid` (set on a key result), `key_results` (`[{ uid, title }]`, for an objective) and `progress` (`{ done, total, percent }`; an objective also counts its key results' projects and tasks).

---

#### `get_goal`

Get a single goal by UID, including the projects linked to it, `parent_goal_uid`, `key_results` and `progress` (same shape as `list_goals`).

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | string | Yes | Goal UID |

---

#### `create_goal`

Create a new goal within an area.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | Yes | Goal title |
| `area_id` | number | Yes | Parent area ID |
| `why` | string | No | Motivation behind the goal |
| `horizon` | string | No | `month`, `quarter`, `season` or `year` (default: `season`) |
| `target_date` | string | No | Target date (YYYY-MM-DD) |
| `status` | string | No | `active`, `achieved`, `paused`, `dropped` (default: `active`) |
| `bucket` | string | No | `have`, `be` or `do` to put the goal on the bucket list |
| `parent_goal_uid` | string | No | Make the goal a key result of this objective. One level only: the objective cannot itself be a key result, must be yours, and a bucket-list goal cannot be a key result |

**Example:**

```json
{
    "title": "Ship the mobile app",
    "area_id": 3,
    "why": "Expand reach to users who prefer mobile",
    "horizon": "season",
    "target_date": "2026-09-30"
}
```

---

#### `update_goal`

Update an existing goal.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | string | Yes | Goal UID |
| `title` | string | No | New title |
| `why` | string | No | New motivation text |
| `horizon` | string | No | `month`, `quarter`, `season` or `year` |
| `target_date` | string | No | New target date or empty string to clear |
| `status` | string | No | `active`, `achieved`, `paused`, `dropped` |
| `bucket` | string | No | `have`, `be` or `do`; bucket list group |
| `parent_goal_uid` | string | No | Make the goal a key result of this objective (same rules as `create_goal`, and a goal that has key results cannot become one); `null` makes it a top-level objective again |

---

#### `delete_goal`

Delete a goal. Linked projects become unlinked (their `goal_id` is set to null).

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | string | Yes | Goal UID |

---

### Areas Tools (5)

#### `list_areas`

List all organizational areas. No parameters.

---

#### `get_area`

Get a specific area by UID.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | string | Yes | Area UID |

---

#### `create_area`

Create a new organizational area.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Area name |
| `description` | string | No | Optional description |
| `color` | string | No | Hex color (e.g. `#ff6b6b`) |

---

#### `update_area`

Update an existing area.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | string | Yes | Area UID |
| `name` | string | No | New name |
| `description` | string | No | New description |
| `color` | string | No | New hex color or empty string to remove |

---

#### `delete_area`

Delete an area. Projects are orphaned, not deleted.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | string | Yes | Area UID |

---

### Notes Tools (5)

#### `list_notes`

List notes with optional filtering. No required parameters.

---

#### `get_note`

Get a specific note by UID.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | string | Yes | Note UID |

---

#### `create_note`

Create a new note.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | Yes | Note title |
| `content` | string | No | Note body (Markdown supported) |
| `project_id` | number | No | Link to a project |
| `tags` | string[] | No | Array of tag names |

---

#### `update_note`

Update an existing note.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | string | Yes | Note UID |
| `title` | string | No | New title |
| `content` | string | No | New content |

---

#### `delete_note`

Delete a note permanently.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | string | Yes | Note UID |

---

### Tags Tools (5)

#### `list_tags`

List all tags. No parameters.

---

#### `get_tag`

Get a specific tag by ID.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | Yes | Tag ID |

---

#### `create_tag`

Create a new tag.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Tag name |

---

#### `update_tag`

Rename a tag.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | Yes | Tag ID |
| `name` | string | Yes | New tag name |

---

#### `delete_tag`

Delete a tag. Removes it from all entities.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | Yes | Tag ID |

---

### Habits Tools (9)

These tools read and write Cadence habits, the same data as the web and the phone ([Habits](21-habits.md)). A habit has a goal (target per period, a limit or a free activity) and a schedule, both versioned. Quantities are integers in minor units of the goal (see [Conventions](21-habits.md#conventions)).

#### `list_habits`

List habits with the goal and schedule in force on a day, the progress of that day's period and the streak.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `archived` | boolean | No | List archived habits instead |
| `date` | string | No | Evaluate on this day (`YYYY-MM-DD`), default today in the user's timezone |

---

#### `get_habit`

Get a habit by UID with every goal and schedule version, pauses, reminders and statistics.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | string | Yes | Habit UID |
| `date` | string | No | Evaluate on this day (`YYYY-MM-DD`) |

---

#### `create_habit`

Create a habit. Without `goal` it is a daily yes/no habit.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Habit name |
| `uid` | string | No | Client-chosen UID; sending it again returns the existing habit |
| `description` | string | No | Notes |
| `group_uid` | string | No | `group-morning`, `group-afternoon`, `group-evening` or `group-day` |
| `starts_on` | string | No | First day (`YYYY-MM-DD`), default today |
| `goal` | object | No | `target_minor`, `period` (`DAY`, `WEEK`, `MONTH`), `goal_type` (`BINARY`, `COUNT`, `QUANTITY`, `DURATION`), `direction` (`AT_LEAST`, `AT_MOST`, `TRACK_ONLY`), unit fields, `minimum_minor`, `frequency_target` |
| `schedule` | object | No | `schedule_mode` (`EVERY_DAY`, `SELECTED_DAYS`, `FLEXIBLE_PERIOD`, `INTERVAL_DAYS`), `active_days` (`MONDAY,WEDNESDAY`), `interval_days`, `first_day_of_week` |

---

#### `update_habit`

Rename a habit, change its description or group, or archive / restore it. Goals and schedules are versions and are not changed here.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | string | Yes | Habit UID |
| `name` | string | No | New name |
| `description` | string | No | Notes |
| `group_uid` | string | No | New group |
| `archived` | boolean | No | `true` archives (keeps history), `false` restores |

---

#### `delete_habit`

Delete a habit and everything under it.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | string | Yes | Habit UID |

---

#### `log_habit_completion`

Record an entry (for a limit or an abstinence it is a slip), or skip a day with a one-day pause so the streak is kept.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | string | Yes | Habit UID |
| `entry_uid` | string | No | Client-chosen entry UID; sending it again returns the existing entry |
| `value_minor` | number | No | Amount in minor units of the goal (default 1) |
| `occurred_at` | string | No | ISO 8601 instant (defaults to now) |
| `local_date` | string | No | Civil day (`YYYY-MM-DD`), default the day of `occurred_at` in the user's timezone |
| `note` | string | No | Optional note |
| `skip` | boolean | No | Skip `local_date` (default today) instead |

---

#### `get_habit_completions`

Get the entries of a habit.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | string | Yes | Habit UID |
| `from` | string | No | First day (`YYYY-MM-DD`) |
| `to` | string | No | Last day (`YYYY-MM-DD`) |

---

#### `delete_habit_completion`

Remove an entry.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | string | Yes | Habit UID |
| `entry_uid` | string | Yes | Entry UID |

---

#### `get_habit_stats`

Get the state of the current period, the current and best streak, the success rate and the activity over time.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | string | Yes | Habit UID |
| `date` | string | No | Evaluate on this day (`YYYY-MM-DD`) |

---

### People Tools (5)

#### `list_people`

List people (contacts) with optional filtering.

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `archived` | boolean | No | `false` | Include archived contacts |
| `relationship_type` | string | No | — | Filter by type: `colleague`, `friend`, `family`, `other` |
| `sort` | string | No | `name` | Sort order: `name` or `created_at` |

**Returns:** Contact objects with name, email, phone, relationship type, notes, and color.

---

#### `get_person`

Get a specific person by UID, including their assigned task count.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | string | Yes | Person UID |

---

#### `create_person`

Create a new person/contact. Refused for an account whose role does not allow adding people (a guest, or a user who was denied `create_people`).

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Full name |
| `email` | string | No | Email address |
| `phone` | string | No | Phone number |
| `relationship_type` | string | No | `colleague`, `friend`, `family`, `other` (default: `other`) |
| `notes` | string | No | Free-text notes |
| `color` | string | No | Hex color (e.g. `#4f9ef8`) |

**Example:**

```json
{
    "name": "Alice Smith",
    "email": "alice@example.com",
    "relationship_type": "colleague",
    "color": "#4f9ef8"
}
```

---

#### `update_person`

Update an existing person/contact.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | string | Yes | Person UID |
| `name` | string | No | New name |
| `email` | string | No | New email |
| `phone` | string | No | New phone |
| `relationship_type` | string | No | New relationship type |
| `notes` | string | No | New notes |
| `color` | string | No | New hex color or empty string to remove |
| `archived` | boolean | No | Archive or unarchive |

---

#### `delete_person`

Permanently delete a person/contact.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | string | Yes | Person UID |

---

### Links Tools (3)

Links are made on purpose, never by the server, and carry their page metadata ([37-links.md](37-links.md)). Status is `new` (to read) or `dropped` (archived); "later" is the review day `review_at`. An assistant may write the note, the tags, the status and the review day, never the URL or the metadata.

#### `list_links`

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `status` | string | No | — | Comma list of `new`, `dropped` |
| `kind` | string | No | — | Comma list of `repo`, `article`, `video`, `tool`, `other` |
| `tag` | string | No | — | Exact tag name |
| `untagged` | boolean | No | `false` | Only links without any tag (to tag them) |
| `domain` | string | No | — | Domain without `www.` |
| `query` | string | No | — | Searched in title, description, url, note and README excerpt |
| `source_type` | string | No | — | `inbox_item`, `task` or `note` |
| `sort` | string | No | `newest` | `newest` or `oldest` |
| `limit`, `offset` | number | No | 100, 0 | Max 1000 |

**Returns:** `{ count, total, links }`; each link has `uid`, `url`, `domain`, `title`, `description`, `image_url`, `site_name`, `kind`, `github_stars`, `github_language`, `github_last_commit`, `readme_excerpt`, `note`, `status`, `tags`, `source_type`, `source_uid`, `fetch_status`.

#### `get_link`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | string | Yes | Link UID |

#### `create_link`

Saves a web page as a link on purpose; the same page twice is one link. `url`, and optionally `title`, `note`, `status` (`new` or `dropped`), `tags`, `project_uid` (a project the user can write to), `source_type` (`inbox_item`, `task` or `note`) and `source_uid`. The former statuses (`to_evaluate`, `tested`, `kept`, `parked`) are read as `new`. To sort an inbox idea into the links: `create_link` with `source_type: inbox_item` and the idea's uid, then `process_inbox_item` with `link_uid`.

#### `group_links`

Puts related links in one theme: adds the tag `theme` to each of `uids`, keeping their other tags.

#### `propose_link_slot`

Proposes a slot in the agenda for related links. It only waits in the triage queue until the user accepts or refuses it. `link_uids`, `title`, `reason`, `date`, optionally `start_minute`, `duration_minutes`.

#### `delete_link`

Permanently deletes a saved link; its address stays out of the library until the user saves it again. `uid`. Only when the user asks: to set a link aside, use `update_link` with `status: dropped`.

#### `update_link`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | string | Yes | Link UID |
| `note` | string or null | No | Free text; `null` or `""` clears it |
| `tags` | string[] | No | Replaces the whole set; nested tags as paths (`dev/tools`); `[]` removes all |
| `status` | string | No | `new` or `dropped`; a former status is read as `new`, and `parked` also sets `review_at` to today + 30 days when none is given |
| `review_at` | string or null | No | Day to look at a link again (`YYYY-MM-DD`, or `null`) |

---

### Misc Tools (1)

#### `search`

Universal search across tasks, projects, and notes.

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | — | Search query |
| `type` | string | No | `all` | `task`, `project`, `note`, `all` |
| `limit` | number | No | 10 | Max results per type |

---

## Claude Desktop Setup

### Step 1: Generate an API Token

1. Log into Cadence
2. Navigate to `Profile → API Keys`
3. Click "Generate New Token"
4. Copy and securely store the token

### Step 2: Configure Claude Desktop

#### For Stdio (Local Cadence):

1. Set your environment variable:

    ```bash
    export TUDUDI_API_TOKEN="your-token-here"
    ```

2. Edit your Claude Desktop config file:
    - **Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`
    - **Linux:** `~/.config/claude/claude_desktop_config.json`

3. Add the Cadence server:
    ```json
    {
        "mcpServers": {
            "Cadence": {
                "command": "node",
                "args": ["/path/to/tududi/backend/modules/mcp/server.js"],
                "env": {
                    "TUDUDI_API_TOKEN": "your-token-here"
                }
            }
        }
    }
    ```

4. Restart Claude Desktop. Cadence tools will appear in the tool list.

#### For HTTP (Remote Cadence):

Use `mcp-remote` to proxy HTTP requests — see the [HTTP Mode config above](#http-mode-remote).

---

## Cursor Setup

1. **Generate an API token** — see [Step 1 above](#step-1-generate-an-api-token).

2. Create or edit `~/.cursor/mcp.json`:

    ```json
    {
        "mcpServers": {
            "Cadence": {
                "command": "node",
                "args": ["/path/to/tududi/backend/modules/mcp/server.js"],
                "env": {
                    "TUDUDI_API_TOKEN": "your-token-here"
                }
            }
        }
    }
    ```

3. Restart Cursor and open a new chat. Cadence tools will appear in the tool list.

For remote Cadence, use the HTTP transport config from [HTTP Mode](#http-mode-remote) instead.

---

## VS Code + Continue Setup

The [Continue](https://www.continue.dev/) extension adds MCP support to VS Code.

1. Install the Continue extension from the VS Code marketplace.

2. Open `~/.continue/config.json` and add:

    ```json
    {
        "mcpServers": [
            {
                "name": "Cadence",
                "command": "node",
                "args": ["/path/to/tududi/backend/modules/mcp/server.js"],
                "env": {
                    "TUDUDI_API_TOKEN": "your-token-here"
                }
            }
        ]
    }
    ```

3. Reload the Continue extension. Cadence tools will be available in the Continue chat panel.

---

## Other MCP Clients

Cadence's MCP server is compatible with any MCP SDK implementation. For custom integrations:

### Direct HTTP API

You can interact with Cadence's MCP server directly via HTTP:

**List available tools:**

```bash
curl -X GET http://tududi.yourdomain.com/api/mcp/tools \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Get MCP config:**

```bash
curl -X GET http://tududi.yourdomain.com/api/mcp/config \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Call a tool:**

```bash
curl -X POST http://tududi.yourdomain.com/api/mcp \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "list_tasks",
      "arguments": { "type": "today", "limit": 10 }
    }
  }'
```

### SDK Usage

```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const client = new Client({ name: 'my-app', version: '1.0.0' });

// Connect to HTTP transport
await client.connect({
    url: 'http://tududi.yourdomain.com/api/mcp',
    headers: {
        Authorization: 'Bearer YOUR_TOKEN',
    },
});

// List available tools
const tools = await client.listTools();

// Call a tool
const result = await client.callTool({
    name: 'create_task',
    arguments: {
        name: 'New task from SDK',
        priority: 'high',
    },
});
```

---

## Security

### Authentication

- All MCP tools authenticate via API tokens
- Tokens are scoped to a single user — no cross-user data access
- Tokens can be revoked at any time from `Profile → API Keys`
- HTTP mode uses Bearer token in the `Authorization` header
- OAuth tokens issued to a remote connector (claude.ai) only open the MCP endpoint and appear under `Profile → API Keys` as `Claude MCP (…)`; see [Remote MCP connector](38-remote-mcp.md)

### Access Control

MCP is enabled by default:

- **Token required:** Each user must generate their own API token to use the MCP tools.

### Data Isolation

Every MCP tool query includes `user_id` filtering:

- Task queries: Only the authenticated user's tasks
- Project queries: Only the authenticated user's projects
- Search queries: Only the authenticated user's data across entities

---

## Troubleshooting

### "Invalid or expired API token"

**Cause:** The token has expired or been revoked.

**Fix:**

1. Go to `Profile → API Keys`
2. Generate a new token
3. Update your MCP client configuration

### HTTP Connection Refused

**Cause:** Cadence server is not accessible.

**Checklist:**

1. Verify Cadence is running and accessible at the configured URL
2. Check firewall settings for remote deployments
3. Verify SSL certificates for HTTPS connections
4. Check CORS settings if using browser-based MCP clients

### Tool Returns Empty Results

**Cause:** No data matches the query parameters.

**Fix:**

1. Verify the task/project/inbox has data
2. Check the filter parameters (e.g., `type`, `status`)
3. Try with broader parameters first, then narrow down

### Claude Doesn't Show Cadence Tools

**Cause:** Claude Desktop may not have refreshed its tool list.

**Fix:**

1. Restart Claude Desktop completely
2. In Claude settings, verify the MCP server shows as "Connected"
3. Ask Claude: "What tools do you have available?"

### Docker Deployment Issues

**Problem:** MCP doesn't work in Docker.

**Solutions:**

- **Stdio mode:** Not recommended for Docker — use HTTP mode instead
- **HTTP mode:** Ensure Cadence is accessible from outside the container:
    ```yaml
    # docker-compose.yml example
    services:
        Cadence:
            ports:
                - '3002:3002'
            environment:
                - BACKEND_URL=http://tududi.yourdomain.com:3002
    ```

---

## Architecture Notes

### How It Works

```
┌─────────────┐     MCP Protocol     ┌──────────────┐
│   AI Client  │ ◄──────────────────► │  Cadence MCP  │
│ (Claude,     │   Tool Calls         │   Server     │
│  Cursor, etc) │                    │              │
└─────────────┘                      └──────┬───────┘
                                            │
                                    ┌───────┴───────┐
                                    │  Authentication │
                                    │  (API Token)    │
                                    └───────┬───────┘
                                            │
                                    ┌───────┴───────┐
                                    │   Cadence DB    │
                                    │ (SQLite/PG)    │
                                    └───────────────┘
```

### File Structure

| File                                          | Purpose                       |
| --------------------------------------------- | ----------------------------- |
| `backend/modules/mcp/server.js`               | Stdio MCP server entry point  |
| `backend/modules/mcp/httpTransport.js`        | HTTP transport handler        |
| `backend/modules/mcp/toolRegistry.js`         | Registers all tool categories |
| `backend/modules/mcp/tools/taskTools.js`      | Task tools (8)                |
| `backend/modules/mcp/tools/projectTools.js`   | Project tools (5)             |
| `backend/modules/mcp/tools/inboxTools.js`     | Inbox tools (6)               |
| `backend/modules/mcp/tools/viewTools.js`      | Smart view tools (5)          |
| `backend/modules/mcp/tools/goalTools.js`      | Goal tools (5)                |
| `backend/modules/mcp/tools/areaTools.js`      | Area tools (5)                |
| `backend/modules/mcp/tools/noteTools.js`      | Note tools (5)                |
| `backend/modules/mcp/tools/tagTools.js`       | Tag tools (5)                 |
| `backend/modules/mcp/tools/habitTools.js`     | Habit tools (9)               |
| `backend/modules/mcp/tools/peopleTools.js`    | People/contact tools (5)      |
| `backend/modules/mcp/tools/miscTools.js`      | Search tool (1)               |
| `backend/modules/mcp/middleware.js`           | API token authentication      |
| `backend/modules/mcp/controller.js`           | REST API endpoints            |
| `backend/modules/mcp/routes.js`               | Express route definitions     |
| `frontend/components/Profile/tabs/McpTab.tsx` | Web UI for config             |

---

- **Document Version:** 1.1.0
- **Last Updated:** 2026-07-27
- **Minimum Cadence Version:** v1.0.0 (released 2026-03-27)
