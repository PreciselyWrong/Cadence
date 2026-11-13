# Plugins

A plugin adds a personal integration (Hermes, a home automation, a chat bridge) without putting it inside Cadence. It lives in its own folder, usually its own Git repository, with its own version and its own update cycle. Cadence loads it, lets you configure it and turn it on or off, and tells it when things happen.

Guide pas-à-pas : [fork/PLUGIN-GUIDE.md](fork/PLUGIN-GUIDE.md).

Status: server, Profile › Plugins and sidebar entries built on 2026-11-12; Android has the same management screen and menu entries. Tracked in `TODO.md`.

## Verdict

Feasible and small, because Cadence already has the two things a plugin needs: an event stream (the webhook events of [Webhooks](27-webhooks.md)) and an authenticated API (API keys and [MCP](14-mcp-integration.md)). A plugin is a Node module loaded **in the server process**, so it runs with the server's rights. That is the trade-off: no process boundary to build, but you only install plugins you wrote or read. A plugin that must be isolated should stay outside Cadence and use a webhook and an API key instead.

## Trust model

- Off by default. Nothing loads unless `TUDUDI_PLUGINS_DIR` points to a folder.
- Never on a hosted instance (`TUDUDI_HOSTED_MODE`): arbitrary code on a shared server is not acceptable.
- Only an admin sees or changes plugins. A plugin found on disk stays **off** until an admin turns it on.
- Turning a plugin on (web and Android) first shows what it asks for (`permissions` and `events`) and needs an explicit **Approve and enable**. That approval records what it asks for (`permissions` and `events`). If an update asks for more, the plugin stays off (`needs_approval`) until an admin turns it on again.
- Permissions gate the `ctx` Cadence hands the plugin. They are **not a sandbox**: plugin code can still `require('fs')`. Read a plugin before enabling it.
- Cadence runs `git` only when an admin asks: **Add** (`git clone --depth 1`) and **Update** (`git pull --ff-only`) in Profile › Plugins, never `npm`, never on its own. Addresses are https, http or ssh (a local Gitea works); no credentials in the address (use the server's SSH key or git credential helper), no `file:` or `ext::`. A fresh clone is always **off**: read what it asks for, then turn it on.
- You can also still replace the folder by hand (a `git pull`, a cron, a sidecar); Cadence notices the new version on **Reload**.

## Folder layout

```
$TUDUDI_PLUGINS_DIR/
  hermes/                     one folder per plugin, any name
    cadence-plugin.json       manifest
    index.js                  entry point (`main`)
    node_modules/             bundled dependencies, if any
```

Cadence does not install dependencies. Bundle them (a single-file build, or a committed `node_modules`).

## Manifest

```json
{
    "id": "hermes",
    "name": "Hermes",
    "version": "1.0.0",
    "apiVersion": 1,
    "description": "Forwards Cadence events to a Hermes webhook.",
    "main": "index.js",
    "permissions": ["events", "routes"],
    "events": ["task.created", "task.completed"],
    "settings": [
        {
            "key": "url",
            "type": "string",
            "label": "Webhook address",
            "required": true
        },
        { "key": "secret", "type": "secret", "label": "Signing secret" },
        {
            "key": "includeNotes",
            "type": "boolean",
            "label": "Send notes",
            "default": false
        }
    ],
    "update": { "url": "https://example.org/cadence-plugin.json" }
}
```

| Field         | Rule                                                                                                                                                                                                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | `^[a-z][a-z0-9-]{1,31}$`, unique. Becomes the URL segment and the storage key; never change it.                                                                                                                                                                                                          |
| `version`     | `x.y.z`. Compared numerically to show updates.                                                                                                                                                                                                                                                           |
| `apiVersion`  | Integer. Cadence's plugin API is `1`. A higher value is `incompatible`.                                                                                                                                                                                                                                  |
| `main`        | Relative path inside the folder (no `..`).                                                                                                                                                                                                                                                               |
| `permissions` | Any of `events` (use `ctx.on`), `routes` (use `ctx.router`) and `notify` (use `ctx.notify`, see Notifications). `brief`, retired with the daily brief on 2026-11-12, is ignored with a warning in the log: the plugin still loads, without it. `ctx.settings`, `ctx.storage` and `ctx.logger` need none. |
| `events`      | Event names from [Webhooks](27-webhooks.md) the plugin may subscribe to. Required with `events`.                                                                                                                                                                                                         |
| `settings`    | Fields of the form in Profile › Plugins. Types: `string`, `secret`, `boolean`, `number`, `select` (with `options`). `secret` values are encrypted at rest and never sent back to the browser.                                                                                                            |
| `menu`        | Optional. `{ "label": "Agents", "page": "ui/index.html" }`: a sidebar entry (label of 40 characters at most) that opens the plugin's page, served from that subfolder at `/api/plugins/<id>/ui/<file>`.                                                                                                  |
| `actions`     | Optional, needs `menu`. At most 10 header buttons, see Page actions.                                                                                                                                                                                                                                     |
| `update.url`  | Optional. A public JSON file with at least `{ "version": "x.y.z" }`. Fetched only when you press **Check for updates**.                                                                                                                                                                                  |

## Entry point

```js
module.exports = {
    async activate(ctx) {
        ctx.on('task.completed', async (event) => {
            const { url } = ctx.settings.all();
            await fetch(url, { method: 'POST', body: JSON.stringify(event) });
        });

        ctx.router.get('/ping', (req, res) => res.json({ ok: true }));
    },

    async deactivate() {},
};
```

`activate` has 10 seconds. A throw or a timeout puts the plugin in `error` with the message shown in Profile › Plugins; the server keeps running.

### `ctx`

| Member                                                     | Needs    | What it does                                                                                                                                                                                        |
| ---------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ctx.id`, `ctx.version`                                    |          | The manifest values.                                                                                                                                                                                |
| `ctx.logger`                                               |          | `debug/info/warn/error(obj, message)`, tagged with the plugin id. Keep secrets out.                                                                                                                 |
| `ctx.settings.get(key)`, `.all()`                          |          | Current values (defaults filled in, secrets decrypted). Read at call time: a saved change applies without a reload.                                                                                 |
| `ctx.storage.get(key)`, `.set(key, value)`, `.delete(key)` |          | Small JSON state kept across restarts (64 KB in total).                                                                                                                                             |
| `ctx.on(event, handler)`                                   | `events` | `handler({ id, name, userId, text, data, at })`. `data` is the webhook payload data. Handlers run in the background, one failure never reaches the code that caused the event; each has 10 seconds. |
| `ctx.router`                                               | `routes` | An Express router served at `/api/plugins/<id>/x/`. The caller is signed in (`req.currentUser`); the plugin decides what each user may do.                                                          |
| `ctx.onDispose(fn)`                                        |          | Runs on deactivation or reload (clear timers, close sockets).                                                                                                                                       |

A plugin that reaches Cadence's data does so through the API with an API key, like any other client.

## Page actions

A plugin adds buttons to the header of some Cadence pages, on the web and on Android:

```json
"actions": [
    { "id": "plan-week", "label": "Planifier ma semaine", "places": ["plan", "today"] }
]
```

- `id`: `^[a-z][a-z0-9-]{0,31}$`, unique in the manifest; `label`: 30 characters at most, shown as is (the plugin writes it in the user's language).
- `places`: where the button shows. A click opens the plugin's page with `?action=<id>&place=<place>` and what the page shows:

| Place     | Page                                                       | Context in the query                                    |
| --------- | ---------------------------------------------------------- | ------------------------------------------------------- |
| `plan`    | Plan (web `/upcoming`, Android Planifier), left of Display | `start`, `end` (first and last day shown, `YYYY-MM-DD`) |
| `today`   | Today                                                      | `date`                                                  |
| `inbox`   | Inbox                                                      | none                                                    |
| `project` | A project's page                                           | `project` (its uid)                                     |
| `triage`  | À trier                                                    | none                                                    |

- `GET /api/plugins/menu` returns `{ items, actions }`; an action shows only while its plugin runs. Rules in `backend/modules/plugins/core/actions.js`; web `frontend/components/Plugins/PluginActions.tsx`; Android `tasks/plugins/PluginActionButtons.kt`.
- A new place is added to `ACTION_PLACES` and drawn by both clients in the same change.

## Notifications

With the `notify` permission, `ctx.notify({ userId, title, message?, level?, data?, sources? })` creates a Cadence notification for one account and resolves with the stored row. It is a `system` notification, listed in the app like the others, with `data.pluginId` set by Cadence. `sources` is `desktop` and `mobile` (the default, both), so the desktop client and the phone show it at once through the live stream ([Notifications](36-notifications.md#live-stream)); quiet hours hold it like any other. `data.openPath` is a path inside Cadence (for example `/plugins/hermes?msg=m1`) that a click opens; anything else (an address, `//host`) is refused. `ctx.notify.read({ userId, uid })` marks read a notification the same plugin created (any other resolves `false`), so a message read in the plugin's page stops showing as unread in the app. The other way round, `ctx.notify.onRead(fn)` calls `fn({ userId, uid })` when the person reads, dismisses or marks all read one of the plugin's notifications in Cadence (bell, banner, phone), so the plugin marks its own copy read; a read made by the plugin itself does not call it. A plugin page receives the query of `/plugins/<id>?…` in its own address, so it can show the item a notification is about.

## Lifecycle and states

`disabled` → (admin turns it on) → `active`. A plugin is reloaded by **Reload** or at server start; `deactivate` and every `onDispose` run first, and the module cache of its folder is cleared so the new code is read.

| State            | Meaning                                                            |
| ---------------- | ------------------------------------------------------------------ |
| `disabled`       | Found, not turned on.                                              |
| `active`         | Loaded and running.                                                |
| `error`          | `activate` threw or timed out; `last_error` says why.              |
| `invalid`        | The manifest is unreadable or breaks a rule above.                 |
| `incompatible`   | `apiVersion` is higher than Cadence's.                             |
| `needs_approval` | Turned on earlier, now asks for more. Turn it on again to approve. |
| `missing`        | Turned on earlier, folder gone. Settings are kept.                 |

## Updates

Each plugin owns its release cycle. Cadence shows the version loaded, the one before the last reload, and, after **Check for updates**, the latest version at `update.url`. To update a plugin installed from Git: **Update** (a fast-forward pull, then a reload; a plugin that now asks for more waits for approval). Otherwise replace the folder and press **Reload**. To roll back: `git checkout <tag>` in the folder (or put the old folder back), **Reload**. **Remove** stops the plugin, deletes its folder and its settings.

## HTTP API (admin)

| Call                                 | Does                                                                                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/plugins`                   | `{ configured, plugins: [...] }`: state, version, permissions, events, settings (schema and values, secrets as `has_value`), update info. |
| `PATCH /api/plugins/:id`             | `{ enabled?, settings? }`. Turning on approves the current permissions and events. A `secret` left out keeps its value; `null` clears it. |
| `POST /api/plugins/reload`           | Rescans the folder and reloads every enabled plugin.                                                                                      |
| `POST /api/plugins/:id/reload`       | Reloads one plugin.                                                                                                                       |
| `POST /api/plugins/:id/check-update` | Fetches `update.url` and stores the result.                                                                                               |
| `ALL /api/plugins/:id/x/*`           | The plugin's own router (any signed-in user). 404 when the plugin is not active.                                                          |

## Checks once built

- With `TUDUDI_PLUGINS_DIR` unset, `GET /api/plugins` says `configured: false` and nothing loads.
- A folder with a valid manifest shows as `disabled`; turning it on makes it `active` and its `ctx.on` handler receives the next `task.created`.
- Raising `version` and adding an event in the manifest, then **Reload**, leaves the plugin `needs_approval`.
- A plugin whose `activate` throws shows `error` and the server keeps answering.
