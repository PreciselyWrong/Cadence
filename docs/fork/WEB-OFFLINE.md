# Web UI offline (browser and Linux client)

Goal: the web UI, and so the Tauri client that loads it, keeps working while the server is unreachable, then reconciles. Android already works offline through its Room replica and `/api/v1/sync` ([30-offline-sync.md](../30-offline-sync.md)); this page is the web counterpart.

## Decision

Everything happens in the service worker (`public/sw.js`), which already sits between every page request and the server. Components and `*Service.ts` stay unchanged: a request answered offline looks like a normal answer.

- **Read model: the REST answers, not a sync replica.** The web's views are computed by the server (Today, Plan, daily plan, project pages, habit statistics, counts). A replica in the `/api/v1/sync` wire shape would need that logic ported to the browser and kept in step with the server. The worker instead keeps the last answer of every `GET /api/*` it saw (Cache Storage) and lays the pending offline writes over it. A warm-up fetches the main views after each reconnect so they are cached even if not opened.
- **Writes: replayed REST requests with the sync merge.** An offline write is kept as the request it was (IndexedDB outbox), with a stable `Idempotency-Key`, its edit time (`X-Cadence-Offline-At`) and, for a create, the uid the worker chose (`X-Cadence-Create-Uid`). On replay the server applies it through the normal route, so all its rules (timezones, recurrence, tags by name, quotas) hold, but the sync hooks stamp the fields with the edit time instead of the server's clock: a field changed elsewhere after the offline edit keeps its newer value and the offline value is recorded in `sync_conflicts`, exactly as for an Android push. Translating REST bodies to sync ops in the browser would duplicate those rules.
- Considered and dropped: SQLite in Tauri (breaks the "no capabilities for the remote window" rule and works only in Tauri); a sync-wire replica in IndexedDB (duplicates the server's view logic).

## Behaviour

| Part         | Online                                                  | Offline                                                                                                                                                                                                 |
| ------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App shell    | network first for pages, cache first for hashed bundles | `index.html`, every bundle and chunk of the build (precached at install), icons, fonts and the locale files already loaded                                                                              |
| `GET /api/*` | network, the answer is cached                           | cached answer + pending writes overlaid; a detail (`/api/task/:uid`, `/api/note/:uid`, `/api/project/:uid`, …) not cached is found in any cached list holding that uid; otherwise `503 {offline: true}` |
| Writes       | network                                                 | kept in the outbox, answered at once with the object as it will be (optimistic); a create gets its uid and a temporary negative id                                                                      |
| Reconnect    |                                                         | outbox replayed in order (stop at the first network failure), temporary ids rewritten to the real ones, conflicts listed in Profil › Synchronisation, every SWR key revalidated, warm-up                |

"Unreachable" = a network error, no answer within 4 s, or a proxy's `502/503/504/52x`. After one failure the worker answers locally at once and probes `GET /api/health` every 15 s (and on the browser's `online` event).

Overlay rules (pure, `public/offline-core.js`): an update merges its body into every object with that uid; a delete removes that uid from every array; a create is added to the lists it belongs to (`tasks` lists of inbox, project, area and today views, notes, projects, areas, tags, inbox items, by the query's filters); it shows elsewhere after the reconnect.

## Storage

- Cache Storage `tududi-<build>` (shell) and `tududi-api-v1` (answers), IndexedDB `tududi-offline` (outbox, rejected writes, meta: node id, user id). `navigator.storage.persist()` is asked once so the browser does not evict them.
- A few MB for a typical account; the browser's quota (a share of the disk) is far above it.

## Session

- Writes are tagged with the user id; a replay never sends another user's writes.
- Offline nothing checks the session. If it expired, the replay gets `401`: the outbox is kept, the app goes to the login page, and the replay resumes after signing in as the same user. Signing out empties the cache and the outbox.

## Online only

AI (assistant, classification, text analysis), CalDAV and calendar feeds, Google sync, uploads (attachments, banners, avatars), sharing and members, admin, billing, MCP pairing, Telegram, search over the server (`/api/search`: cached answers only). These answer `503` offline and the UI shows its usual error.

## Limits

- A view never opened and not in the warm-up stays empty offline.
- Server-computed values (counts, metrics, ordering, recurrence of the next occurrence) are the cached ones until the reconnect.
- Tag lists replayed from the outbox win over a newer tag change (the join table has no per-row clock).
- `PATCH /api/daily-plan/:date` carries an ETag: a day changed elsewhere meanwhile refuses the replay (`412`), which is listed as a rejected write.

## Tauri

The main window is a WebKitGTK webview on the server's https origin, so it registers the same worker. If the server is unreachable when the window opens, the worker serves the cached shell.
