# Web UI offline (browser and Linux client)

Goal: the web UI, and so the Tauri client that loads it, keeps working while the server is unreachable, then reconciles. Android already works offline through its Room replica and `/api/v1/sync` ([30-offline-sync.md](../30-offline-sync.md)); this page is the web counterpart.

## Decision

Everything happens in the service worker (`public/sw.js`, its pure rules in `public/offline-core.js`), which already sits between every page request and the server. Components and `*Service.ts` stay unchanged: a request answered offline looks like a normal answer.

- **Read model: the REST answers, not a sync replica.** The web's views are computed by the server (Today, Plan, daily plan, project pages, habit statistics, counts). A replica in the `/api/v1/sync` wire shape would need that logic ported to the browser and kept in step with the server. The worker instead keeps the last answer of every `GET /api/*` it saw (Cache Storage) and lays the pending offline writes over it.
- **Writes: replayed REST requests with the sync merge.** An offline write is kept as the request it was (IndexedDB outbox), with its edit time (`X-Cadence-Offline-Clock`), for a create the uid the worker chose (`X-Cadence-Create-Uid`) and an `Idempotency-Key`. On replay the server applies it through the normal route, so all its rules (timezones, recurrence, tags by name, quotas) hold, but the sync hooks stamp the fields with the edit time instead of the server's clock: a field changed elsewhere after the offline edit keeps its newer value and the offline value is recorded in `sync_conflicts`, as for an Android push ([30-offline-sync.md](../30-offline-sync.md#web-client)). Translating REST bodies to sync ops in the browser would duplicate those rules.
- Considered and dropped: SQLite in Tauri (needs capabilities for the remote window, ⛔ in `desktop/AGENTS.md`, and works only in Tauri); a sync-wire replica in IndexedDB (duplicates the server's view logic).

## Behaviour

| Part         | Online                                                                             | Offline                                                                                                                                                                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| App shell    | network first for pages, cache first for hashed bundles                            | `index.html` and every chunk holding app code (precached at install, about 5 MB; the list is written into `sw.js` by `webpack.config.js`), icons; library chunks (diagrams, maths), fonts and locale files once loaded                                       |
| `GET /api/*` | network; the answer is cached, with the pending writes laid over it while any wait | cached answer + pending writes; a row (`/api/task/:uid`, `/api/note/:uid`, `/api/project/:uid`, …) never read on its own is taken from any cached list holding it; otherwise `503 {offline: true}`                                                           |
| Writes       | network (a create carries an `Idempotency-Key`)                                    | kept in the outbox, answered at once with the row as it will be (`X-Cadence-Offline: 1`); a create gets its uid and a temporary negative id; a write the worker cannot describe is answered `202` with `X-Tududi-Queued` (the app says it was saved offline) |
| Reconnect    |                                                                                    | outbox replayed in order, stopping at the first network failure; temporary ids (and a uid the server kept) rewritten; refused writes (4xx, or 500 three times) set aside; every SWR key revalidated; cached lists refreshed                                  |

While writes wait, a new write goes behind them even when the server is back, so the order holds.

"Unreachable" = a network error, no answer within 4 s (15 s for a write), or a proxy's `502/504/52x`. After one failure the worker answers locally at once; the page asks it to probe `GET /api/health` every 15 s, on the browser's `online` event and when the tab comes back (`frontend/utils/offlineService.ts`). Background Sync is used where it exists (Chrome) but not needed: WebKitGTK and Firefox lack it.

Overlay rules (`public/offline-core.js`): an update merges its body into every object with that uid; a delete removes that uid from every array (a row read on its own becomes `404`); a create is added to its entity's collection list (`/api/notes`, `/api/projects`, `/api/areas`, `/api/tags`, `/api/inbox`, `/api/goals`) and, for a task, to `/api/tasks?project_id=` of its project and to its project's page; other lists show it after the reconnect.

The corner pill (`frontend/components/Offline/OfflineStatus.tsx`, mounted next to `App` in `index.tsx`) shows only when there is something to know: « Hors ligne », « Hors ligne · N en attente », « Envoi des modifications (N) », « Non enregistrées : N » (the list with the server's reason, « OK » clears it), « Conflits : N » after a replay (opens Profil › Synchronisation, where each is settled as for a phone).

## Storage

- Cache Storage `tududi-<build>` (shell) and `tududi-api-v1` (answers), IndexedDB `tududi-offline` v2 (`tududi-sync-queue` outbox, `tududi-rejected`, `tududi-meta`: node id, user id, clock, temporary ids). `navigator.storage.persist()` is asked once so the browser does not evict them.
- About 5 MB of shell plus a few MB of answers; the browser's quota (a share of the disk) is far above it. Ten seconds after the app opens and after each replay, the worker refreshes up to 60 cached lists.

## Session

- Writes are tagged with the user id; a replay never sends another user's writes.
- Offline nothing checks the session. If it expired, the replay gets `401` and stops with the outbox kept; the app shows the login page, and the replay runs once the same user signs in again. A `401` or signing out drops the cached answers, never the writes waiting.

## Online only

AI (assistant, classification, text analysis), sign-in, push subscriptions, CalDAV and calendar feeds, Google sync, Telegram, MCP pairing, admin, billing, link previews (`/api/url/*`), uploads (attachments, banners, avatars). These answer `503` offline and the UI shows its usual error. Search over the server answers only what was cached.

## Limits

- A view never opened online stays empty offline (it is cached the first time it is opened).
- Server-computed values (counts, metrics, ordering, next occurrence of a recurring task) are the cached ones until the reconnect.
- A view that keeps its rows in its own state (not SWR) shows the offline values until it is opened again, even when a conflict kept the other device's value.
- Tag lists replayed from the outbox win over a newer tag change (the join table has no per-row clock).
- `PATCH /api/daily-plan/:date` carries an ETag: a day changed elsewhere meanwhile refuses the replay (`412`), listed as not saved.
- Habit rows logged offline reach the server on reconnect; the habit's progress shown offline is the cached one.

## Tauri

The main window is a WebKitGTK webview on the server's https origin, so it registers the same worker, stored in the app's data folder (`~/.local/share/ch.nicolab.cadence.desktop/serviceworkers`, `CacheStorage`). If the server is unreachable when the window opens, the worker serves the cached shell. Nothing changes in `desktop/`.

## Verification (2026-11-12)

- Unit: `frontend/__tests__/offlineCore.test.ts`, `serviceWorker.test.ts` (worker driven with in-memory Cache Storage and IndexedDB), `components/Offline/__tests__`; server: `backend/tests/integration/sync-offline-replay.test.js`.
- Chromium (Playwright, production build, `context.setOffline`): the project page shows a task created offline and a rename made offline; a route never opened renders; pill « Hors ligne · 3 en attente »; back online the three writes replay (`applied: 3`), the created task keeps the browser's uid, and a name changed meanwhile by a newer device push keeps the device's value with the offline one in the conflicts (« Conflits : N »). Today, Inbox, Projects, Upcoming, Notes, Tasks, Areas, Tags and Habits render offline as online.
- WebKitGTK 2.54 (the engine of the Tauri window, driven through PyGObject): the worker controls the page; with the server process stopped the app opens, a create is answered `201` from the outbox and the pill counts it; after the restart the replay stopped on `401` (the test server keeps sessions in memory) with the outbox kept, then ran after signing in again (0 waiting, the task on the server).
- Tauri release binary against the test server: the worker is registered in its data folder and the shell precached (5.3 MB). Not done: pulling the network in a real Tauri window by hand, and the user's own server behind its proxy.
- The Claude desktop app's browser pane refuses to register any service worker, so it cannot be used for this check.
