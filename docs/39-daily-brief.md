# Daily brief

Every morning Cadence prepares a short brief that arbitrates the day: what happens in the next three days, the few things worth doing tonight, the tasks to move, what to anticipate, the replies waiting and what was just settled. It is shown on the web (`/insights/daily-brief` and the Today card) and on Android, and read aloud by a local Piper voice.

The brief replaces the upstream AI-only Daily Brief. It works **without AI**: timeline, load, conflicts, duplicates and candidate dates are plain code. An LLM is optional and only rewrites the verdict and the reasons.

Plan and decisions: `docs/resume-matinal-plan.md`.

## Rules that never change

- **Propose only.** Generating a brief writes nothing but the brief (and its proposals). It never creates, moves, closes or edits a task, never drafts, archives or sends mail. Every action needs the user's explicit tap and can be undone.
- **External content is data.** Mail, event and note text never steers the engine; it is escaped when shown.
- **A brief is never rewritten by the job.** Only "Regenerate" makes a new version. Filling in a section that was waiting for an agent is not a rewrite.
- **No personal values in code.** Every value (calendars, hours, thresholds, voice, agent) is a setting, empty or neutral by default.

## Data

The brief of a day lives on that day's `daily_plans` row (one per user and local date):

| Column               | Meaning                                                              |
| -------------------- | -------------------------------------------------------------------- |
| `brief`              | JSON below, never HTML                                               |
| `brief_version`      | 1 for the first generation, +1 per "Regenerate"                      |
| `brief_status`       | `pending`, `partial` (some sources still pending), `ready`, `failed` |
| `brief_generated_at` | when the current version was built                                   |

Creating the row for a brief leaves `started_at` empty, so the day plan is not "started" and Today keeps offering the planner.

### Brief JSON (`schema: 1`)

```jsonc
{
  "schema": 1,
  "date": "YYYY-MM-DD",            // user's local date
  "timezone": "Area/City",
  "generated_at": "ISO",
  "sources": [                       // what was really read
    { "id": "tasks", "status": "read" },
    { "id": "calendar", "status": "read" | "not_configured" | "error", "detail": "…" },
    { "id": "mail", "status": "not_configured" | "pending" | "read" | "unavailable", "detail": "…" },
    { "id": "llm", "status": "off" | "used" | "error" }
  ],
  "counters": { "due_today": 0, "overdue": 0, "tonight_minutes": 0, "capacity_minutes": null, "conflicts": 0, "replies": 0 },
  "verdict": { "text": "One sentence.", "by": "rules" | "llm" },
  "timeline": [                      // the next N days (setting timelineDays, default 3), today first
    {
      "date": "YYYY-MM-DD",
      "work": [{ "start": 480, "end": 1020, "label": "…" }],       // focus blocks of that day, minutes after midnight
      "events": [{ "ref": "event:…", "series_ref": "series:…" | null, "title": "…", "all_day": false, "start_minute": 600, "end_minute": 660, "calendar": "…", "conflict": false }],
      "task_uids": ["…"],            // due that day (or planned on it)
      "load": { "planned_minutes": 0, "capacity_minutes": null, "hypothesis": true, "note": "…" },
      "flags": ["overloaded"]
    }
  ],
  "tonight": [{ "task_uid": "…", "reason": "…", "minutes": 30 }],          // at most thresholds.maxTonight, in order
  "moves": [{ "proposal_key": "…", "task_uid": "…", "from": "YYYY-MM-DD", "to": "YYYY-MM-DD", "reason": "…" }],
  "anticipate": [{ "key": "…", "type": "conflict" | "overload" | "duplicate" | "deadline_in_note" | "postponed" | "dependency" | "event_in_work_hours", "text": "…", "task_uids": [], "event_refs": [], "question": { "key": "…", "text": "…?", "target": { "scope": "task" | "event" | "series", "ref": "…" } } | null }],
  "replies": [{ "account": "…", "thread_ref": "…", "from": "…", "subject": "…", "date": "ISO", "summary": "…", "link": "https://…" }],
  "inbox": [{ "uid": "…", "title": "…", "proposal": { "action": "task" | "note" | "later" | "delete", "reason": "…" } }],
  "resolved": [{ "task_uid": "…", "completed_at": "ISO" }],
  "audio_script": { "chapters": [{ "id": "tonight" | "anticipate" | "replies" | "intro", "title": "…", "text": "…" }] },
  "audio": { "status": "none" | "pending" | "ready" | "failed" | "expired", "path": null, "duration_seconds": null, "chapters": [{ "id": "…", "start_seconds": 0 }], "voice": null, "error": null | "piper_unreachable" | "piper_error" | "piper_url_invalid" | "ffmpeg_missing" | "ffmpeg_error" | "render_failed" }
}
```

Tasks are referenced by `uid` only. Clients show the task's **current** state (web: the `tasks` map returned with the brief; Android: Room), so a task done elsewhere shows as done in the brief.

Event refs are stable strings built by the engine: `event:<feed_uid>:<event uid>:<start ISO or date>` for one occurrence, `series:<feed_uid>:<series id>` for a recurring series (ICS `UID`, Google `recurring_event_id`). Google calendars have `feed_uid` `google-<calendar uid>`.

## Settings (`ui_settings.brief`)

Normalized by `backend/modules/daily-plan/brief/settings.js`; unknown or invalid values fall back to the default. Work hours are **focus blocks** (`ui_settings.planning.focusBlocks`), not a brief setting.

| Key                     | Default                                                                                             | Notes                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `enabled`               | `false`                                                                                             |                                                                                                           |
| `time`                  | `"07:00"`                                                                                           | local `HH:mm`, 5-minute steps                                                                             |
| `days`                  | `[]`                                                                                                | 0 = Sunday … 6                                                                                            |
| `sections`              | `["verdict","timeline","tonight","moves","anticipate","replies","inbox","resolved"]`                | order; a missing key hides the section                                                                    |
| `evening`               | `{ enabled: true, switchTime: "18:00" }`                                                            | evening review from `switchTime` (local `HH:mm`, 5-minute steps), see Evening review                      |
| `timelineDays`          | `3`                                                                                                 | 1–7                                                                                                       |
| `calendarFeedUids`      | `[]`                                                                                                | `feed_uid` values of ICS feeds and Google calendars read by the brief                                     |
| `calendarLookaheadDays` | `7`                                                                                                 | 1–14                                                                                                      |
| `priorities`            | `["consequence","blocking","money_deadline","planned_load","long_term"]`                            | order used by the tonight ranking                                                                         |
| `thresholds`            | `{ postponements: 3, duplicateSimilarity: 0.8, maxMoves: 3, maxTonight: 3, closedLookbackDays: 7 }` |                                                                                                           |
| `capacity.evening`      | `{}`                                                                                                | per weekday `"0"`–`"6"`: `{ start: "HH:mm", end: "HH:mm", minutes }`; missing = no evening capacity shown |
| `capacity.dayNotes`     | `{}`                                                                                                | per weekday: short text shown on the timeline (e.g. partial remote day)                                   |
| `retention`             | `{ decisionsDays: 90, audioDays: 7 }`                                                               |                                                                                                           |
| `alerts`                | `{ disabled: [], noise: { minVotes: 3, ratio: 0.7 } }`                                              | alert types switched off by hand; noise rule below                                                        |
| `writing`               | `{ tone: "neutral", signature: "", instructions: "" }`                                              | used by the optional LLM only                                                                             |
| `llm`                   | `{ enabled: false }`                                                                                | provider = Profile › AI Assistant                                                                         |
| `voice`                 | `{ enabled: false, piperUrl: "", voice: "", speed: 1, dictionary: [] }`                             | dictionary: `[{ from, to }]`                                                                              |
| `mail`                  | `{ enabled: false, accounts: [], excludedAccounts: [], replyWindowDays: 14 }`                       | read through the mail agent only                                                                          |
| `options`               | `{ eveningWrapUp: false, telegram: false, sonos: false, weekly: false }`                            | Android "brief ready" notification is an Android setting                                                  |

Agent settings (`ui_settings.agents`, secret in `users.agent_api_key`, encrypted with `secretCipher`, shown as last 4 characters): `baseUrl`, `timeoutSeconds` (120), `profiles` `{ mail: "", drafting: "" }`, `triageRules` `[{ id, match: { from, label, type }, instruction, mode: "propose" | "off" }]`.

## API

All routes exist under `/api` and `/api/v1`.

| Route                                                              |                                                                                                                                                                   |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /daily-plan/:date/brief`                                      | `{ brief, version, status, generated_at, tasks }`; `brief: null` when none exists                                                                                 |
| `POST /daily-plan/:date/brief`                                     | explicit regeneration: new version                                                                                                                                |
| `GET /daily-plan/brief/settings`, `PUT /daily-plan/brief/settings` | normalized settings; `PUT` merges and validates                                                                                                                   |
| `GET /daily-plan/brief/status`                                     | each source: configured, missing, working, last error (the voice source asks the Piper server for its voices)                                                     |
| `GET /daily-plan/:date/evening`                                    | `{ date, evening, tasks }`: the evening review, built on each call, nothing stored (see Evening review)                                                           |
| `GET /daily-plan/:date/brief/audio`                                | the MP3 of the current version (`audio/mpeg`, byte ranges); `404` when none is ready                                                                              |
| `GET /daily-plan/brief/voices`                                     | `{ voices: [id] }` from the user's Piper server; `502` `{ error }` when it does not answer                                                                        |
| `POST /daily-plan/brief/voice-preview`                             | `{ voice, speed, text? }` (text at most 200 characters): a sample, `audio/mpeg` (`audio/wav` without ffmpeg), nothing stored                                      |
| `POST /daily-plan/:date/brief/decisions`                           | records a decision on a proposal (`kind`, `target_type`, `target_ref`, `proposal`, `fingerprint`, `decision`, `reason?`, `idempotency_key`)                       |
| `POST /daily-plan/:date/brief/answers`                             | answers a question: `{ question_key, target: {scope, ref}, answer: 'yes' \| 'no' \| text, idempotency_key }`; writes the linked context and a `question` decision |
| `GET /daily-plan/brief/contexts?scope=&target_ref=`                | the user's linked contexts, optionally filtered                                                                                                                   |
| `PATCH /daily-plan/brief/contexts/:uid`                            | `{ text }`                                                                                                                                                        |
| `DELETE /daily-plan/brief/contexts/:uid`                           | `204`                                                                                                                                                             |

## Engine

`backend/modules/daily-plan/brief/`:

- `settings.js`: defaults, normalization, validation.
- `collect.js`: reads the inputs (open tasks today, overdue, upcoming within the lookahead, inbox, tasks closed in `closedLookbackDays` with their notes, events of the selected calendars, focus blocks and exceptions, postponements from `review/postponements.js`, live contexts, decisions and feedback from the memory below, replies from the mail agent).
- `rules/*.js`: **pure functions** of `(input, settings, today)`; one file per rule, each unit-tested.
- `build.js`: assembles the JSON from the rules; `writer.js`: optional LLM rewrite of `verdict.text` and reasons, falling back to the rules text on any error. `script.js`: `buildAudioScript`, the spoken script. `audio.js`, `piper.js`, `wav.js`: audio rendering, Piper client, WAV helpers (see Audio).
- `generate.js`: `generateBrief(user, date, { reason })`. A job run keeps an existing brief; a manual run makes a new version. A failed run sets `brief_status = failed` and keeps the previous brief; the job does not retry it, "Regenerate" does. Replies from the mail agent arrive afterwards and update only `replies`, `counters.replies` and the mail source. The audio script is built with the brief, and the audio renders in the background after it.
- `job.js`: `generateDueBriefs({ now })`, run every 5 minutes by `taskScheduler.js` (`daily_brief`).
- `sources.js`: configuration checks used by `GET /daily-plan/brief/status`.

### Rules

- **Timeline load**: planned minutes of a day = `estimated_minutes` of tasks due or planned that day + timed events. Evening capacity = setting minutes minus the part of the evening window covered by focus blocks and events. Always marked as an hypothesis.
- **Conflicts**: a timed event overlapping a focus block (work) is `event_in_work_hours`; two overlapping busy events are `conflict`.
- **Overload**: planned minutes above capacity (when capacity is known), or more than the threshold of due tasks.
- **Closed first**: before an open task is reported as open business, tasks closed in the lookback are checked. An open task whose normalized name equals a recently closed one is a probable duplicate; above `duplicateSimilarity` (token Jaccard) it is a possible duplicate. Closed subtasks never close their open parent.
- **Deadline in a note**: a date found with `chrono-node` (French and English) in a task note, earlier than `due_date`, wins and is asked as a question.
- **Candidate dates**: a move target is the first day after today, within the timeline, that is not overloaded, not refused before for that task, and fits the task's minutes.
- **Postponed**: a task with `recent_count >= thresholds.postponements` gets the "do, drop or later" card.
- **Deductions are questions**: anything inferred (transport, presence, dependency) is phrased as a question with a target, never as a fact.
- **Contexts**: before producing a question or an alert, the engine drops it when a live context exists for its target.
- **Refused and ignored moves**: a move refused for a day is never proposed for that day again; a move left without answer is ignored by the next brief and not repeated identically (same task, same day).
- **Noise**: a card type with at least `alerts.noise.minVotes` votes, of which at least `alerts.noise.ratio` say "noise", is dropped from `anticipate`.

## Audio

The brief is read aloud by a Piper server on the user's network, or by a Piper voice on the Android phone itself (see On-device rendering). The script is built with the brief, so every client speaks the same text, and the text-to-speech fallbacks read it too.

### Script (`script.js`)

- Four chapters in French, written for the ear: `intro` (date and verdict), `tonight` (ordinal list with durations), `anticipate` (the questions), `replies` (count and senders). An empty chapter is left out.
- Target 60 to 90 seconds: at most 230 words. Lists are trimmed from the end (`anticipate`, then reply senders, then `tonight`) until the script fits; the leads still state the full counts.
- Numbers, durations and dates are spelled out in French, because Piper does not normalize digits: `speakDuration(90)` is "une heure trente", `speakTime(630)` is "dix heures trente", `0` and `720` are "minuit" and "midi". The date is "mercredi quatre novembre".
- The verdict is spoken from the counters, not from `verdict.text`: an LLM rewrite of the verdict is not read.
- External text (task names, senders, questions) loses control characters and `[[` / `]]` before it is spoken.
- `settings.voice.dictionary` is applied last, as whole-word, case-insensitive replacements.
- Task titles come from the task map given at generation; without it the tonight list says "une tâche".

### Rendering (`audio.js`)

- Starts after the brief is saved, when the voice is enabled with an address and a voice. `audio.status` is `pending` meanwhile, then `ready` or `failed`. The audio renders once per version, from that version's script: replies that arrive later are not spoken.
- Each chapter is synthesized by Piper; the WAV clips are joined with 0.8 s of silence and encoded to MP3 (mono, 48 kbit/s) by `ffmpeg`, spawned with an argument array and fed through stdin/stdout. `chapters[].start_seconds` comes from the clip durations.
- ffmpeg is looked for once per process. Without it the render fails with `ffmpeg_missing`, and the voice preview answers WAV instead of MP3.
- A failure sets `audio.status = 'failed'` and `audio.error` to a code (`piper_unreachable`, `piper_error`, `piper_url_invalid`, `ffmpeg_missing`, `ffmpeg_error`, `render_failed`). The brief stays usable. The job does not retry; "Regenerate" renders again.
- The file is kept only if the day still holds the same `brief_version`; a version replaced meanwhile removes its file.

### Piper contract (`piper.js`)

Piper's HTTP server (`python -m piper.http_server`, see `docker/piper/README.md`):

- `POST {piperUrl}/synthesize` with `{ text, voice, length_scale }`, answers a WAV. `length_scale = 1 / speed`; speed is 0.5 to 2.
- `GET {piperUrl}/voices`: the voice ids (voice picker, `checkPiper`).

The address must be http(s), without credentials, and not a link-local or cloud metadata host (the guard of the agent address, `isLinkLocalOrMetadataHost`). Private and loopback addresses are allowed: Piper runs on the LAN. Requests time out (60 s to synthesize, 3 s to check), refuse redirects, and never log their text. The script only goes to the configured address.

### Storage and access

- File: `<TUDUDI_UPLOAD_PATH>/briefs/<user uid>/<date>-v<version>.mp3`; folder mode 0700, file mode 0600. The row keeps the relative `audio.path`.
- Not public: the static uploads route refuses the `briefs` category (`uploadsAccessControl`). The owner gets it from `GET /daily-plan/:date/brief/audio`, which supports byte ranges (`206`, `416`) for seeking, and only for the path of the current version.

### Retention

- `brief_purge` (02:30 UTC) deletes the MP3 files older than the owner's `retention.audioDays` (default 7) and sets their brief's `audio.status` to `expired`. A folder whose owner no longer exists keeps the default.

### Fallback

Clients play, in this order: the audio rendered on the device (Android), the server MP3 when `audio.status` is `ready`, then the device's text-to-speech reading `audio_script`; with none of them (no script, no audio) the play button is hidden.

### On-device rendering (Android)

The Android app is the default renderer: it speaks `audio_script` itself with a Piper voice running on the phone (Sherpa-ONNX, CPU), so the script never leaves the device and the server's Piper and `ffmpeg` are optional.

- **Voices**: Réglages › Résumé › « Voix sur ce téléphone ». Two French voices are offered, `siwis` (CC BY 4.0) and `tom` (AGPL-3.0), with their license line, size, progress and a delete button. Nothing is installed or downloaded until the user asks; the voice archive (`.tar.bz2`, about 21 MB each, from the Sherpa-ONNX GitHub release) is the only network use of the feature. It is checked by size and SHA-256, extracted without links or paths outside the folder, and moved into place in one step (`files/brief-voices/<id>`); the archive's `MODEL_CARD` license file stays with the model. The voice, the speed (0.5 to 2, one tenth steps) and the sample ("Écouter un extrait") are Android-local settings, never synced.
- **Rendering**: after each brief refresh (`SyncEngine.onSynced`) a WorkManager job (`brief-audio`, KEEP so a running render is never restarted) renders today's brief when a voice is installed: each chapter of `audio_script` is synthesized, the clips are joined with 0.8 s of silence like the server render, and the result is one mono 16-bit WAV per brief date and version, `files/brief-audio/<date>-v<version>.wav`, with a `.json` sheet holding the duration, the start offset of every chapter, the voice and the speed. WAV rather than AAC: no encoder to manage, exact seeking, and about 2.6 MB per minute, so under 40 MB for the seven days kept. A render made with another voice or speed is replaced; a failed render leaves nothing behind and the server MP3 takes over.
- **Retention**: the job deletes audio files older than 7 days (`BriefAudioFiles.RETENTION_DAYS`) and the other versions of the same day; deleting a voice deletes its renders.
- **Server MP3**: without a usable local voice, the job copies the MP3 of a `ready` audio (`GET /daily-plan/:date/brief/audio`, device API key) next to a sheet built from `audio.chapters[].start_seconds`, so it plays offline. Pressing play with no copy downloads it on the spot.
- **Playback**: Media3 ExoPlayer in a `MediaSessionService` (foreground service type `mediaPlayback`, channel « Lecture du résumé »): lock-screen and Bluetooth controls, previous/next chapter, and a resume position kept per brief version. The brief header shows « Écouter · N min » (N from the file, or estimated at 150 words per minute for the system voice) and, once playing, pause and chapter skip.
- **System voice**: Android `TextToSpeech` (French) reads the chapters one after the other. It has no media session: it follows the brief screen.

## Evening review

The morning brief arbitrates the day; after the switch time the clients show the **evening review** instead. The morning brief stays one tap away ("Voir le résumé du matin").

- Setting `ui_settings.brief.evening`: `{ enabled: true, switchTime: "18:00" }` (local `HH:mm`, 5-minute steps). Disabled: the morning brief stays all day.
- No AI, no job, nothing stored: `GET /daily-plan/:date/evening` computes it from the current state each time (pure rules in `brief/rules/evening.js`), so it is never stale. The optional AI recap of the day stays the existing wrap-up (`ai_wrap_up`, `POST /daily-plan/:date/ai/wrap-up`).
- Response `{ date, evening, tasks }`, `tasks` = the same current-state map as the morning route. `evening` (`schema: 1`):

```jsonc
{
  "schema": 1,
  "date": "YYYY-MM-DD",
  "generated_at": "ISO",
  "verdict": { "text": "One sentence.", "by": "rules" },
  "counters": { "done": 0, "slipped": 0, "tonight_minutes": 0, "capacity_minutes": null },
  "done": ["task_uid"],                                  // completed today (local day), newest first, max 10
  "tonight": [{ "task_uid": "…", "minutes": 30 }],       // the morning brief's tonight items still open, in order
  "slipped": [{ "task_uid": "…", "reason": "…" }],       // due or planned today, still open, not in tonight
  "carry_over": ["task_uid"],                             // slipped + tonight items, proposed for tomorrow
  "tomorrow": { /* one timeline day, same shape as brief.timeline[] */ },
  "audio_script": { "chapters": [{ "id": "intro" | "done" | "tonight" | "tomorrow", "title": "…", "text": "…" }] }
}
```

- `counters.done` counts every task completed today; `done` lists the newest ten.
- `audio_script.chapters` ids are `intro`, `done`, `tonight` and `tomorrow` (an empty `done` or `tonight` chapter is left out). The spoken text uses the same helpers as the morning script.
- Web: the page and the Today card switch at `evening.switchTime` read in the profile's timezone (the browser's clock is not used). The page keeps the morning brief one tap away ("Voir le résumé du matin") and the evening review one tap away from the morning ("Voir le bilan du soir").
- Actions: "C'est fait" on every task (existing completion with undo; the row stays in place and shows the new state at once); "Reporter à demain" on carry-over items calls the existing `POST /daily-plan/:date/carry-over` for tomorrow (never changes a due date). Undo removes the task from tomorrow's plan with `PUT /daily-plan/:date`, only when the action added it: a task already planned for tomorrow is left alone and offers no undo.
- Android caches the last evening response like the brief and renders its audio script on the phone with the same voice.

## Mail

Cadence holds no mail credentials and reads no mail. The mail agent (Hermes, `docs/resume-matinal-plan.md` §7) answers typed requests through `/v1/runs`; Cadence only stores thread refs and metadata. When the agent is not configured or not reachable, the replies section says "source not read" and nothing is inferred.

## Memory

What the user decided or said, read by the engine on the next brief. Tables (migrations `20261104100000`, `20261104100100`, all `safe*`):

- `brief_proposals`: one row per proposal shown (`pending`), per decision (`accepted`, `refused`, `ignored`) and per answer or feedback. A shown proposal that gets a decision keeps its row. `idempotency_key` is unique: the same key returns the stored row. `proposal` is JSON without any mail body.
- `linked_contexts`: `scope` (`task`, `event`, `series`), `target_ref`, `text` (1 to 500 characters). One context per user, scope and target; an answer replaces its text.

Lifetimes, applied when the brief reads them (`contexts.js`) and purged daily (`brief_purge`, 02:30 UTC):

- `task`: over when the task is done, archived, cancelled or gone.
- `series` with a task uid: over when the task is gone or its recurrence is `none`.
- `series` with a `series:` ref: over when its calendar was read without error and has no occurrence from 30 days back to the lookahead. A time change keeps the ref, so the context stays.
- `event`: over at the end of the event's local day (the ref has no end time).
- Decisions: deleted after `retention.decisionsDays` (default 90).

Feedback is a decision of kind `feedback` with `proposal: { card_type, vote: 'useful' | 'noise' }`.
