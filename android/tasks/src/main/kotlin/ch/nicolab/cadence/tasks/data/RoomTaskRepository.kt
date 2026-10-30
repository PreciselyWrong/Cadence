package ch.nicolab.cadence.tasks.data

import android.content.Context
import androidx.room.withTransaction
import ch.nicolab.cadence.tasks.ServerConnection
import ch.nicolab.cadence.tasks.TaskRepository
import ch.nicolab.cadence.tasks.model.AreaItem
import ch.nicolab.cadence.tasks.model.InboxEntry
import ch.nicolab.cadence.tasks.model.NoteChange
import ch.nicolab.cadence.tasks.model.NoteItem
import ch.nicolab.cadence.tasks.model.ProjectItem
import ch.nicolab.cadence.tasks.model.RecurringScope
import ch.nicolab.cadence.tasks.model.SyncStatus
import ch.nicolab.cadence.tasks.model.TagItem
import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskDraft
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskStatus
import ch.nicolab.cadence.tasks.sync.AuthError
import ch.nicolab.cadence.tasks.sync.Hlc
import ch.nicolab.cadence.tasks.sync.SyncApi
import ch.nicolab.cadence.tasks.sync.SyncScheduler
import ch.nicolab.cadence.tasks.sync.SyncState
import java.io.IOException
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.util.UUID
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Chaque écriture met à jour la ligne locale et ajoute son opération dans la même
 * transaction, puis demande une synchronisation. Rien ne dépend du réseau, sauf
 * [moveRecurring].
 */
internal class RoomTaskRepository(
    private val context: Context,
    private val database: TududiDatabase,
    private val api: SyncApi,
    private val hlc: Hlc,
    private val clockState: ClockStateStore,
    private val connection: ServerConnection,
    private val syncState: StateFlow<SyncState>,
    /** Suivi du fuseau de l'appareil : les vues se recalculent à chaque changement. */
    private val deviceZone: StateFlow<ZoneId>,
    private val nowMs: () -> Long = System::currentTimeMillis,
) : TaskRepository {
    private val taskDao = database.taskDao()
    private val projectDao = database.projectDao()
    private val areaDao = database.areaDao()
    private val tagDao = database.tagDao()
    private val inboxDao = database.inboxDao()
    private val noteDao = database.noteDao()
    private val outbox = database.outboxDao()

    override fun observeTasks(): Flow<List<TaskItem>> =
        combine(taskDao.observeTopLevel(), accountZone(), deviceZone) { rows, account, device ->
            rows.map { it.toItem(account, device) }
        }

    override fun observeAllTasks(): Flow<List<TaskItem>> =
        combine(taskDao.observeEvery(), accountZone(), deviceZone) { rows, account, device ->
            rows.map { it.toItem(account, device) }
        }

    override fun observeTask(uid: String): Flow<TaskItem?> =
        combine(taskDao.observeOne(uid), accountZone(), deviceZone) { row, account, device ->
            row?.toItem(account, device)
        }

    override fun observeSubtasks(parentUid: String): Flow<List<TaskItem>> =
        combine(taskDao.observeChildren(parentUid), accountZone(), deviceZone) { rows, account, device ->
            rows.map { it.toItem(account, device) }
        }

    override fun observeProjects(): Flow<List<ProjectItem>> =
        projectDao.observeAll().map { rows -> rows.map { it.toItem() } }

    /** Fuseau du compte tant qu'il est connu, sinon celui de l'appareil. */
    private fun accountZone(): Flow<ZoneId> =
        combine(connection.observe(), deviceZone) { info, device -> info?.accountZone ?: device }
            .distinctUntilChanged()

    override fun observeAreas(): Flow<List<AreaItem>> =
        areaDao.observeAll().map { rows -> rows.map { it.toItem() } }

    override fun observeTags(): Flow<List<TagItem>> =
        tagDao.observeAll().map { rows -> rows.map { it.toItem() } }

    override fun observeInbox(): Flow<List<InboxEntry>> =
        inboxDao.observeAll().map { rows -> rows.map { it.toEntry() } }

    override fun observeNotes(): Flow<List<NoteItem>> =
        noteDao.observeAll().map { rows -> rows.map { it.toItem() } }

    override fun observeNote(uid: String): Flow<NoteItem?> =
        noteDao.observeOne(uid).map { it?.toItem() }

    override fun observeSyncStatus(): Flow<SyncStatus> = combine(
        connection.observe(),
        syncState,
        outbox.observeCount(),
        database.syncMetaDao().observe(RoomSyncStore.LAST_SYNC),
    ) { info, state, pending, lastSync ->
        when {
            info == null -> SyncStatus.NotConnected
            state.running -> SyncStatus.Syncing
            state.lastError != null -> SyncStatus.Failed(state.lastError, pending)
            else -> SyncStatus.Idle(lastSync?.toLongOrNull()?.let(Instant::ofEpochMilli), pending)
        }
    }

    override suspend fun createTask(draft: TaskDraft): String {
        val uid = UUID.randomUUID().toString()
        val fields = buildMap<String, JsonElement> {
            put("name", JsonPrimitive(draft.name))
            put("note", jsonString(draft.note))
            put("priority", jsonInt(draft.priority))
            put("project_uid", jsonString(draft.projectUid))
            put("tag_uids", jsonArray(draft.tagUids))
            draft.parentTaskUid?.let { put("parent_task_uid", JsonPrimitive(it)) }
            putAll(dueFields(draft.dueDate, draft.dueTime))
        }
        writeFields(uid, fields)
        return uid
    }

    override suspend fun updateTask(uid: String, change: TaskChange) {
        // Une heure seule garde la date déjà prévue.
        val keptDate = if (change.dueDate == null && change.dueTime != null) currentDueDate(uid) else null
        val accountZone = accountZone().first()
        val fields = buildMap<String, JsonElement> {
            change.name?.let { put("name", JsonPrimitive(it)) }
            change.note?.let { put("note", JsonPrimitive(it)) }
            if (change.clearPriority) put("priority", JsonNull)
            change.priority?.let { put("priority", JsonPrimitive(it)) }
            change.status?.let { status ->
                put("status", JsonPrimitive(status))
                put("completed_at", if (status == TaskStatus.DONE) JsonPrimitive(Instant.now().toString()) else JsonNull)
            }
            when {
                change.clearDue -> putAll(dueFields(null, null))
                change.dueDate != null -> putAll(dueFields(change.dueDate, change.dueTime))
                change.dueTime != null -> putAll(dueFields(keptDate, change.dueTime))
            }
            if (change.clearProject) put("project_uid", JsonNull)
            change.projectUid?.let { put("project_uid", JsonPrimitive(it)) }
            change.tagUids?.let { put("tag_uids", jsonArray(it)) }
            when {
                change.clearStart -> putAll(TaskFields.start(null, null, accountZone, deviceZone.value))
                change.startDate != null -> putAll(TaskFields.start(change.startDate, change.startTime, accountZone, deviceZone.value))
                change.startTime != null ->
                    putAll(TaskFields.start(currentStartDay(uid), change.startTime, accountZone, deviceZone.value))
            }
            when {
                change.clearEstimate -> putAll(TaskFields.estimate(null))
                change.estimatedMinutes != null -> putAll(TaskFields.estimate(change.estimatedMinutes))
            }
            change.repetition?.let { putAll(TaskFields.repetition(it, repetitionAnchor(uid, change))) }
        }
        if (fields.isNotEmpty()) writeFields(uid, fields)
    }

    override suspend fun completeTask(uid: String) {
        val task = taskDao.get(uid) ?: return
        if (task.isRecurring) {
            writeOccurrence(uid, ACTION_COMPLETE_OCCURRENCE)
        } else {
            writeFields(
                uid,
                mapOf(
                    "status" to JsonPrimitive(TaskStatus.DONE),
                    "completed_at" to JsonPrimitive(Instant.now().toString()),
                ),
            )
        }
    }

    override suspend fun reopenTask(uid: String) {
        writeFields(
            uid,
            mapOf(
                "status" to JsonPrimitive(TaskStatus.NOT_STARTED),
                "completed_at" to JsonNull,
            ),
        )
    }

    override suspend fun skipOccurrence(uid: String) = writeOccurrence(uid, ACTION_SKIP_OCCURRENCE)

    override suspend fun deleteTask(uid: String) {
        val clock = hlc.now()
        database.withTransaction {
            taskDao.delete(uid)
            outbox.insert(LocalOps.delete("task", uid, clock, nowMs()))
        }
        afterLocalWrite()
    }

    override suspend fun moveRecurring(uid: String, scope: RecurringScope, newDate: LocalDate): Result<Unit> {
        val task = taskDao.get(uid) ?: return Result.failure(IllegalArgumentException("Tâche introuvable"))
        val occurrence = occurrenceDayOf(task.dueDateRaw, accountZone().first())
            ?: return Result.failure(IllegalStateException("Pas d'échéance à déplacer"))
        return try {
            api.moveOccurrence(uid, scope.wire, occurrence.toString(), newDate.toString())
            requestSync()
            Result.success(Unit)
        } catch (error: AuthError) {
            Result.failure(IllegalStateException("Clé API refusée", error))
        } catch (error: IOException) {
            Result.failure(IllegalStateException("Connexion requise", error))
        }
    }

    override suspend fun saveNote(uid: String, change: NoteChange) {
        val existing = noteDao.get(uid)
        val fields = buildMap<String, JsonElement> {
            if (existing == null) {
                put("title", JsonPrimitive(change.title.orEmpty()))
                put("content", JsonPrimitive(change.content.orEmpty()))
            } else {
                change.title?.let { put("title", JsonPrimitive(it)) }
                change.content?.let { put("content", JsonPrimitive(it)) }
            }
            if (change.clearColor) put("color", JsonNull)
            change.color?.let { put("color", JsonPrimitive(it)) }
            change.pinned?.let { put("pin_to_sidebar", JsonPrimitive(it)) }
            if (change.clearProject) put("project_uid", JsonNull)
            change.projectUid?.let { put("project_uid", JsonPrimitive(it)) }
            change.tagUids?.let { put("tag_uids", jsonArray(it)) }
        }
        if (fields.isEmpty()) return
        val clock = hlc.now()
        database.withTransaction {
            val current = noteDao.get(uid)?.let { WireCodec.noteToWire(it) }
                ?: JsonObject(mapOf("uid" to JsonPrimitive(uid)))
            val stamped = fields + ("updated_at" to JsonPrimitive(Instant.ofEpochMilli(nowMs()).toString()))
            noteDao.upsert(WireCodec.noteFromWire(JsonObject(current + stamped)))
            outbox.insert(LocalOps.upsert("note", uid, fields, clock, nowMs()))
        }
        afterLocalWrite()
    }

    override suspend fun deleteNote(uid: String) {
        val clock = hlc.now()
        database.withTransaction {
            noteDao.delete(uid)
            outbox.insert(LocalOps.delete("note", uid, clock, nowMs()))
        }
        afterLocalWrite()
    }

    override suspend fun captureInbox(text: String): String {
        val uid = UUID.randomUUID().toString()
        val clock = hlc.now()
        val fields = mapOf(
            "content" to JsonPrimitive(text),
            "status" to JsonPrimitive(INBOX_STATUS),
            "source" to JsonPrimitive(INBOX_SOURCE),
        )
        database.withTransaction {
            inboxDao.upsert(InboxItemEntity(uid, text, INBOX_STATUS, Instant.now().toString()))
            outbox.insert(LocalOps.upsert("inbox_item", uid, fields, clock, nowMs()))
        }
        afterLocalWrite()
        return uid
    }

    override suspend fun deleteInboxItem(uid: String) {
        val clock = hlc.now()
        database.withTransaction {
            inboxDao.delete(uid)
            outbox.insert(LocalOps.delete("inbox_item", uid, clock, nowMs()))
        }
        afterLocalWrite()
    }

    override fun requestSync() = SyncScheduler.requestNow(context)

    private suspend fun writeFields(uid: String, fields: Map<String, JsonElement>) {
        val clock = hlc.now()
        database.withTransaction {
            val current = taskDao.get(uid)?.let { WireCodec.taskToWire(it) }
                ?: JsonObject(mapOf("uid" to JsonPrimitive(uid)))
            taskDao.upsert(WireCodec.taskFromWire(JsonObject(current + fields)))
            outbox.insert(LocalOps.upsert("task", uid, fields, clock, nowMs()))
        }
        afterLocalWrite()
    }

    /** Une occurrence terminée disparaît localement jusqu'au prochain pull, qui apporte la date suivante. */
    private suspend fun writeOccurrence(uid: String, action: String) {
        val clock = hlc.now()
        database.withTransaction {
            val task = taskDao.get(uid) ?: return@withTransaction
            val occurrence = task.dueDateRaw ?: return@withTransaction
            taskDao.upsert(task.copy(status = TaskStatus.DONE))
            outbox.insert(LocalOps.occurrence(action, uid, occurrence, clock, nowMs()))
        }
        afterLocalWrite()
    }

    private suspend fun currentDueDate(uid: String): LocalDate? {
        val task = taskDao.get(uid) ?: return null
        return dueDayOf(task.dueDateRaw, task.dueHasTime, accountZone().first(), deviceZone.value)
    }

    private suspend fun currentStartDay(uid: String): LocalDate? {
        val task = taskDao.get(uid) ?: return null
        val extras = TaskExtras.parse(task.extrasJson)
        return dueDayOf(extras["start_date"], extras["start_has_time"] == "true", accountZone().first(), deviceZone.value)
    }

    /** Jour qui ancre la règle : l'échéance qui vient d'être choisie, sinon celle déjà enregistrée. */
    private suspend fun repetitionAnchor(uid: String, change: TaskChange): LocalDate? =
        if (change.clearDue) null else change.dueDate ?: currentDueDate(uid)

    private suspend fun dueFields(date: LocalDate?, time: String?): Map<String, JsonElement> {
        if (date == null) return mapOf("due_date" to JsonNull, "due_has_time" to JsonPrimitive(false))
        val due = dueInstant(date, time, accountZone().first(), deviceZone.value)
        return mapOf(
            "due_date" to JsonPrimitive(due.toString()),
            "due_has_time" to JsonPrimitive(time != null),
        )
    }

    private fun afterLocalWrite() {
        clockState.save(hlc.state())
        requestSync()
    }

    private companion object {
        const val ACTION_COMPLETE_OCCURRENCE = "complete_occurrence"
        const val ACTION_SKIP_OCCURRENCE = "skip_occurrence"
        const val INBOX_STATUS = "added"
        const val INBOX_SOURCE = "android"
    }
}

/**
 * Instant envoyé au serveur. Une date seule vaut la fin du jour dans le fuseau du compte
 * (le serveur fait de même) ; une heure "HH:mm" est une heure de l'appareil.
 */
internal fun dueInstant(date: LocalDate, time: String?, accountZone: ZoneId, deviceZone: ZoneId): Instant =
    if (time == null) {
        date.atTime(END_OF_DAY).atZone(accountZone).toInstant()
    } else {
        date.atTime(LocalTime.parse(time)).atZone(deviceZone).toInstant()
    }

private val END_OF_DAY = LocalTime.of(23, 59, 59, 999_000_000)

private fun jsonString(value: String?): JsonElement = value?.let { JsonPrimitive(it) } ?: JsonNull

private fun jsonInt(value: Int?): JsonElement = value?.let { JsonPrimitive(it) } ?: JsonNull

private fun jsonArray(values: List<String>): JsonElement = JsonArray(values.map { JsonPrimitive(it) })
