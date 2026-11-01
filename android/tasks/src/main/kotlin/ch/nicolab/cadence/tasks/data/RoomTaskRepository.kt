package ch.nicolab.cadence.tasks.data

import android.content.Context
import androidx.room.withTransaction
import ch.nicolab.cadence.tasks.ServerConnection
import ch.nicolab.cadence.tasks.TaskRepository
import ch.nicolab.cadence.tasks.model.AreaItem
import ch.nicolab.cadence.tasks.model.Delivery
import ch.nicolab.cadence.tasks.model.RefusedItem
import ch.nicolab.cadence.tasks.model.SyncConflictItem
import ch.nicolab.cadence.tasks.model.SyncConflictText
import ch.nicolab.cadence.tasks.model.GoalChange
import ch.nicolab.cadence.tasks.model.GoalItem
import ch.nicolab.cadence.tasks.model.GoalStatus
import ch.nicolab.cadence.tasks.model.IconIds
import ch.nicolab.cadence.tasks.model.InboxEntry
import ch.nicolab.cadence.tasks.model.LinkItem
import ch.nicolab.cadence.tasks.model.LinkStatus
import ch.nicolab.cadence.tasks.model.NoteChange
import ch.nicolab.cadence.tasks.model.OccurrenceFields
import ch.nicolab.cadence.tasks.model.NoteItem
import ch.nicolab.cadence.tasks.model.ProjectHierarchy
import ch.nicolab.cadence.tasks.model.ProjectItem
import ch.nicolab.cadence.tasks.model.ProjectStatus
import ch.nicolab.cadence.tasks.model.RecurringScope
import ch.nicolab.cadence.tasks.model.SyncStatus
import ch.nicolab.cadence.tasks.model.TagColors
import ch.nicolab.cadence.tasks.model.TagEditPlan
import ch.nicolab.cadence.tasks.model.TagEditProblem
import ch.nicolab.cadence.tasks.model.TagItem
import ch.nicolab.cadence.tasks.model.TagPaths
import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskDraft
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskStatus
import ch.nicolab.cadence.tasks.sync.AuthError
import ch.nicolab.cadence.tasks.sync.HttpError
import ch.nicolab.cadence.tasks.sync.Hlc
import ch.nicolab.cadence.tasks.sync.DeferredCall
import ch.nicolab.cadence.tasks.sync.NetworkMonitor
import ch.nicolab.cadence.tasks.sync.describeFailure
import ch.nicolab.cadence.tasks.sync.moveOccurrenceCall
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
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Chaque écriture met à jour la ligne locale et ajoute son opération dans la même
 * transaction, puis demande une synchronisation. Rien ne dépend du réseau : [moveRecurring]
 * (le décalage d'un jour seul passe par le serveur) attend dans la file des appels différés.
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
    /** Le téléphone a un réseau ([NetworkMonitor]) : sans lui, la ligne d'état dit « Hors ligne ». */
    private val online: Flow<Boolean> = NetworkMonitor.online,
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

    override fun observeGoals(): Flow<List<GoalItem>> =
        database.goalDao().observeAll().map { rows -> rows.map { it.toItem() } }

    override suspend fun updateGoal(uid: String, change: GoalChange) {
        val clock = hlc.now()
        val written = database.withTransaction {
            val existing = database.goalDao().get(uid) ?: return@withTransaction false
            val title = change.title?.trim()
            if (title != null && title.isEmpty()) return@withTransaction false
            val why = change.why?.let { it.trim().ifEmpty { null } }
            val fields = buildMap<String, JsonElement> {
                if (title != null && title != existing.title) put("title", JsonPrimitive(title))
                if (change.why != null && why != existing.why) put("why", jsonString(why))
                change.bucket?.wire?.takeIf { it != existing.bucket }?.let { put("bucket", JsonPrimitive(it)) }
                change.status?.wire?.takeIf { it != (existing.status ?: GoalStatus.ACTIVE.wire) }?.let { put("status", JsonPrimitive(it)) }
            }
            if (fields.isEmpty()) return@withTransaction false
            database.goalDao().upsert(
                existing.copy(
                    title = title ?: existing.title,
                    why = if (change.why != null) why else existing.why,
                    bucket = change.bucket?.wire ?: existing.bucket,
                    status = change.status?.wire ?: existing.status,
                ),
            )
            outbox.insert(LocalOps.upsert("goal", uid, fields, clock, nowMs()))
            true
        }
        if (written) afterLocalWrite()
    }

    override suspend fun deleteGoal(uid: String) {
        val clock = hlc.now()
        database.withTransaction {
            database.goalDao().deleteKeyResults(uid)
            database.goalDao().delete(uid)
            outbox.insert(LocalOps.delete("goal", uid, clock, nowMs()))
        }
        afterLocalWrite()
    }

    override fun observeLinks(): Flow<List<LinkItem>> =
        database.linkDao().observeAll().map { rows -> rows.map { it.toItem() } }

    override suspend fun setLinkNote(uid: String, note: String?) {
        val value = note?.trim()?.ifEmpty { null }
        writeLink(uid, "note" to jsonString(value)) { it.copy(note = value) }
    }

    override suspend fun setLinkStatus(uid: String, status: LinkStatus) {
        writeLink(uid, "status" to JsonPrimitive(status.wire)) { it.copy(status = status.wire) }
    }

    override suspend fun setLinkReviewDate(uid: String, date: java.time.LocalDate?) {
        val value = date?.toString()
        writeLink(uid, "review_at" to (value?.let(::JsonPrimitive) ?: JsonNull)) { it.copy(reviewAtRaw = value) }
    }

    override suspend fun setLinkTags(uid: String, tagUids: List<String>) {
        val tags = tagUids.distinct()
        writeLink(uid, "tag_uids" to jsonArray(tags)) { it.copy(tagUidsJson = jsonArray(tags).toString()) }
    }

    private suspend fun writeLink(uid: String, field: Pair<String, JsonElement>, change: (LinkEntity) -> LinkEntity) {
        val clock = hlc.now()
        val written = database.withTransaction {
            val existing = database.linkDao().get(uid) ?: return@withTransaction false
            database.linkDao().upsert(change(existing))
            outbox.insert(LocalOps.upsert("link", uid, mapOf(field), clock, nowMs()))
            true
        }
        if (written) afterLocalWrite()
    }

    override fun observeInbox(): Flow<List<InboxEntry>> =
        inboxDao.observeAll().map { rows -> rows.map { it.toEntry() } }

    override fun observeNotes(): Flow<List<NoteItem>> =
        noteDao.observeAll().map { rows -> rows.map { it.toItem() } }

    override fun observeNote(uid: String): Flow<NoteItem?> =
        noteDao.observeOne(uid).map { it?.toItem() }

    override fun observeSyncStatus(): Flow<SyncStatus> = combine(
        connection.observe(),
        syncState,
        combine(outbox.observeCount(), database.deferredCallDao().observeCount()) { ops, calls -> ops + calls },
        database.syncMetaDao().observe(RoomSyncStore.LAST_SYNC),
        online,
    ) { info, state, pending, lastSync, isOnline ->
        val lastSyncAt = lastSync?.toLongOrNull()?.let(Instant::ofEpochMilli)
        when {
            info == null -> SyncStatus.NotConnected
            state.running -> SyncStatus.Syncing
            // Sans réseau, l'erreur du dernier passage n'est plus l'information utile : tout attend le réseau.
            !isOnline -> SyncStatus.Offline(lastSyncAt, pending)
            state.lastError != null -> SyncStatus.Failed(state.lastError, pending)
            else -> SyncStatus.Idle(lastSyncAt, pending)
        }
    }

    override fun observeUnsupportedEntities(): Flow<List<String>> = syncState.map { it.unsupported }.distinctUntilChanged()

    override fun observeConflicts(): Flow<List<SyncConflictItem>> = database.syncConflictDao().observeAll().map { rows ->
        rows.map { row ->
            SyncConflictItem(
                id = row.id,
                entityLabel = SyncConflictText.entityLabel(row.entity),
                name = row.displayName,
                fieldLabel = SyncConflictText.fieldLabel(row.field),
                localText = row.localText,
                serverText = row.serverText,
                atMs = row.atMs,
                canKeepLocal = row.entity in SyncConflictText.REAPPLICABLE,
            )
        }
    }

    override suspend fun resolveConflict(id: String, keepLocal: Boolean) {
        val conflict = database.syncConflictDao().get(id) ?: return
        if (!keepLocal || conflict.entity !in SyncConflictText.REAPPLICABLE) {
            database.syncConflictDao().delete(id)
            return
        }
        val value = Json.parseToJsonElement(conflict.localJson)
        val field = mapOf(conflict.field to value)
        // Une horloge neuve, plus récente que celle du serveur : la valeur du téléphone l'emporte à l'envoi.
        val clock = hlc.now()
        database.withTransaction {
            when (conflict.entity) {
                "task" -> taskDao.get(conflict.uid)?.let {
                    taskDao.upsert(WireCodec.taskFromWire(JsonObject(WireCodec.taskToWire(it) + field)))
                }
                "note" -> noteDao.get(conflict.uid)?.let {
                    noteDao.upsert(WireCodec.noteFromWire(JsonObject(WireCodec.noteToWire(it) + field)))
                }
                // Les autres lignes prennent la valeur à l'écho du serveur, au passage qui suit.
                else -> Unit
            }
            outbox.insert(LocalOps.upsert(conflict.entity, conflict.uid, field, clock, nowMs()))
            database.syncConflictDao().delete(id)
        }
        afterLocalWrite()
    }

    override fun observeRefused(): Flow<List<RefusedItem>> = database.failedOpDao().observeRecent(REFUSED_SHOWN).map { rows ->
        rows.map { RefusedItem(SyncConflictText.entityLabel(it.entity), it.displayName, it.reason, it.atMs) }
    }

    override suspend fun clearRefused() = database.failedOpDao().clear()

    override suspend fun createTask(draft: TaskDraft): String {
        val uid = UUID.randomUUID().toString()
        val fields = buildMap<String, JsonElement> {
            put("name", JsonPrimitive(draft.name))
            put("note", jsonString(draft.note))
            put("priority", jsonInt(draft.priority))
            put("project_uid", jsonString(draft.projectUid))
            put("tag_uids", jsonArray(draft.tagUids))
            draft.parentTaskUid?.let { put("parent_task_uid", JsonPrimitive(it)) }
            draft.goalUid?.let { put("goal_uid", JsonPrimitive(it)) }
            putAll(dueFields(draft.dueDate, draft.dueTime))
        }
        writeFields(uid, fields)
        return uid
    }

    override suspend fun updateTask(uid: String, change: TaskChange) {
        val fields = fieldsFor(uid, change)
        if (fields.isNotEmpty()) writeFields(uid, fields)
    }

    /** Champs serveur d'un changement : effacer est explicite, une heure seule garde la date déjà prévue. */
    private suspend fun fieldsFor(uid: String, change: TaskChange): Map<String, JsonElement> {
        // Une heure seule garde la date déjà prévue.
        val keptDate = if (change.dueDate == null && change.dueTime != null) currentDueDate(uid) else null
        val accountZone = accountZone().first()
        return buildMap<String, JsonElement> {
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
            change.pinned?.let { put("pinned_at", if (it) JsonPrimitive(Instant.ofEpochMilli(nowMs()).toString()) else JsonNull) }
            if (change.hasDecision()) putAll(decisionFields(uid, change))
        }
    }

    /** Champs de l'entonnoir ; « Plus tard » crée l'étiquette `someday` si l'appareil ne la connaît pas encore. */
    private suspend fun decisionFields(uid: String, change: TaskChange): Map<String, JsonElement> {
        val task = taskDao.get(uid)
        val tagUids = task?.let { WireCodec.decodeTagUids(it.tagUidsJson) }.orEmpty()
        val somedayUid = when (change.later) {
            true -> somedayTagUid()
            false -> tagDao.findByName(SOMEDAY_TAG)?.uid
            null -> null
        }
        return TaskFields.decision(
            change = change,
            inViewAtRaw = task?.inViewAtRaw,
            tagUids = tagUids,
            somedayUid = somedayUid,
            nowIso = Instant.ofEpochMilli(nowMs()).toString(),
        )
    }

    private suspend fun somedayTagUid(): String {
        tagDao.findByName(SOMEDAY_TAG)?.let { return it.uid }
        val uid = UUID.randomUUID().toString()
        val clock = hlc.now()
        database.withTransaction {
            tagDao.upsert(TagEntity(uid, SOMEDAY_TAG, null))
            outbox.insert(LocalOps.upsert("tag", uid, mapOf("name" to JsonPrimitive(SOMEDAY_TAG)), clock, nowMs()))
        }
        return uid
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

    override suspend fun moveRecurring(uid: String, scope: RecurringScope, newDate: LocalDate): Result<Delivery> {
        val task = taskDao.get(uid) ?: return Result.failure(IllegalArgumentException("Tâche introuvable"))
        val occurrence = occurrenceDayOf(task.dueDateRaw, accountZone().first())
            ?: return Result.failure(IllegalStateException("Pas d'échéance à déplacer"))
        return try {
            api.moveOccurrence(uid, scope.wire, occurrence.toString(), newDate.toString())
            requestSync()
            Result.success(Delivery.SENT)
        } catch (error: AuthError) {
            Result.failure(IllegalStateException("Clé API refusée", error))
        } catch (error: HttpError) {
            if (error.isClientError) {
                Result.failure(IllegalStateException(describeFailure(error), error))
            } else {
                defer(moveOccurrenceCall(uid, scope.wire, occurrence.toString(), newDate.toString()))
            }
        } catch (error: IOException) {
            defer(moveOccurrenceCall(uid, scope.wire, occurrence.toString(), newDate.toString()))
        }
    }

    override suspend fun editRecurring(
        uid: String,
        scope: RecurringScope,
        occurrence: LocalDate?,
        change: TaskChange,
    ): Result<Unit> = recurringWrite(uid) { task, zones ->
        val current = occurrenceDayOf(task.dueDateRaw, zones.account) ?: error("Pas d'échéance à modifier")
        val scoped = OccurrenceFields.scoped(change)
        val occurrenceChange = OccurrenceChange(
            fields = fieldsFor(uid, scoped.copy(dueDate = null, dueTime = null)),
            day = scoped.dueDate,
            time = scoped.dueTime,
        )
        RecurringEdits.edit(
            series = WireCodec.taskToWire(task),
            scope = scope,
            occurrence = occurrence ?: current,
            change = occurrenceChange,
            newUid = UUID.randomUUID().toString(),
            zones = zones,
            today = Instant.ofEpochMilli(nowMs()).atZone(zones.account).toLocalDate(),
            now = Instant.ofEpochMilli(nowMs()),
        )
    }

    override suspend fun deleteRecurring(uid: String, scope: RecurringScope, occurrence: LocalDate?): Result<Unit> =
        recurringWrite(uid) { task, zones ->
            val current = occurrenceDayOf(task.dueDateRaw, zones.account) ?: error("Pas d'échéance à supprimer")
            RecurringEdits.delete(WireCodec.taskToWire(task), scope, occurrence ?: current, zones)
        }

    /** Construit le plan d'une modification de série puis l'écrit : lignes locales et file d'envoi, sans réseau. */
    private suspend fun recurringWrite(
        uid: String,
        plan: suspend (TaskEntity, Zones) -> RecurringPlan,
    ): Result<Unit> {
        val task = taskDao.get(uid) ?: return Result.failure(IllegalArgumentException("Tâche introuvable"))
        return try {
            val ops = plan(task, Zones(accountZone().first(), deviceZone.value)).ops
            val clocks = ops.map { hlc.now() }
            database.withTransaction { ops.zip(clocks).forEach { (op, clock) -> writeOp(op, clock) } }
            afterLocalWrite()
            Result.success(Unit)
        } catch (error: IllegalStateException) {
            Result.failure(error)
        } catch (error: IllegalArgumentException) {
            Result.failure(error)
        }
    }

    private suspend fun writeOp(op: RecurringOp, clock: String) {
        when (op) {
            is RecurringOp.Upsert -> {
                val current = taskDao.get(op.uid)?.let { WireCodec.taskToWire(it) }
                    ?: JsonObject(mapOf("uid" to JsonPrimitive(op.uid)))
                taskDao.upsert(WireCodec.taskFromWire(JsonObject(current + op.fields)))
                outbox.insert(LocalOps.upsert("task", op.uid, op.fields, clock, nowMs()))
            }
            is RecurringOp.Delete -> {
                taskDao.delete(op.uid)
                outbox.insert(LocalOps.delete("task", op.uid, clock, nowMs()))
            }
            is RecurringOp.Skip -> {
                taskDao.get(op.uid)?.let { taskDao.upsert(it.copy(status = TaskStatus.DONE)) }
                outbox.insert(LocalOps.occurrence(ACTION_SKIP_OCCURRENCE, op.uid, op.occurrenceDate, clock, nowMs()))
            }
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

    override suspend fun setProjectStatus(uid: String, status: ProjectStatus) {
        val clock = hlc.now()
        val fields = mapOf("status" to JsonPrimitive(status.wire))
        val written = database.withTransaction {
            val existing = projectDao.get(uid) ?: return@withTransaction false
            projectDao.upsert(existing.copy(status = status.wire))
            outbox.insert(LocalOps.upsert("project", uid, fields, clock, nowMs()))
            true
        }
        if (written) afterLocalWrite()
    }

    override suspend fun setProjectIcon(uid: String, icon: String?) {
        require(IconIds.isValid(icon)) { "Identifiant d'icône invalide" }
        val value = IconIds.normalize(icon)
        val clock = hlc.now()
        val written = database.withTransaction {
            val existing = projectDao.get(uid) ?: return@withTransaction false
            if (existing.icon == value) return@withTransaction false
            projectDao.upsert(existing.copy(icon = value))
            outbox.insert(LocalOps.upsert("project", uid, mapOf("icon" to jsonString(value)), clock, nowMs()))
            true
        }
        if (written) afterLocalWrite()
    }

    override suspend fun setTagIcon(uid: String, icon: String?) {
        require(IconIds.isValid(icon)) { "Identifiant d'icône invalide" }
        val value = IconIds.normalize(icon)
        val clock = hlc.now()
        val written = database.withTransaction {
            val existing = tagDao.get(uid) ?: return@withTransaction false
            if (existing.icon == value) return@withTransaction false
            tagDao.upsert(existing.copy(icon = value))
            outbox.insert(LocalOps.upsert("tag", uid, mapOf("icon" to jsonString(value)), clock, nowMs()))
            true
        }
        if (written) afterLocalWrite()
    }

    override suspend fun setTagColor(uid: String, color: String?) {
        val value = color?.trim()?.lowercase()?.also { require(TagColors.parse(it) != null) { "Couleur invalide" } }
        val clock = hlc.now()
        val written = database.withTransaction {
            val existing = tagDao.get(uid) ?: return@withTransaction false
            if (existing.color == value) return@withTransaction false
            tagDao.upsert(existing.copy(color = value))
            outbox.insert(LocalOps.upsert("tag", uid, mapOf("color" to jsonString(value)), clock, nowMs()))
            true
        }
        if (written) afterLocalWrite()
    }

    override suspend fun moveProject(uid: String, parentUid: String?): Boolean {
        val clock = hlc.now()
        var accepted = false
        var written = false
        database.withTransaction {
            val projects = projectDao.all()
            accepted = ProjectHierarchy.canMove(projects.map { it.toItem() }, uid, parentUid)
            val existing = projects.firstOrNull { it.uid == uid }
            if (!accepted || existing == null || existing.parentProjectUid == parentUid) return@withTransaction
            projectDao.upsert(existing.copy(parentProjectUid = parentUid))
            outbox.insert(LocalOps.upsert("project", uid, mapOf("parent_project_uid" to jsonString(parentUid)), clock, nowMs()))
            written = true
        }
        if (written) afterLocalWrite()
        return accepted
    }

    override suspend fun renameTag(uid: String, name: String): TagEditProblem? =
        editTag(uid) { tags -> TagPaths.plan(tags, uid, name) }

    override suspend fun moveTag(uid: String, parentUid: String?): TagEditProblem? =
        editTag(uid) { tags ->
            val target = TagPaths.moveTarget(tags, uid, parentUid)
            if (target == null) TagEditPlan.Rejected(TagEditProblem.UNKNOWN) else TagPaths.plan(tags, uid, target)
        }

    /**
     * Seule l'étiquette modifiée part dans la file : le serveur renomme son sous-arbre et le renvoie au pull.
     * Les sous-étiquettes changent aussi ici, pour que l'arbre reste cohérent en attendant la synchronisation.
     */
    private suspend fun editTag(uid: String, plan: (List<TagItem>) -> TagEditPlan): TagEditProblem? {
        val clock = hlc.now()
        val problem = database.withTransaction {
            when (val result = plan(tagDao.all().map { it.toItem() })) {
                is TagEditPlan.Rejected -> result.problem
                is TagEditPlan.Apply -> {
                    (listOf(result.root) + result.cascaded).forEach { change ->
                        val existing = tagDao.get(change.uid) ?: return@forEach
                        tagDao.upsert(existing.copy(name = change.name, parentUid = change.parentUid))
                    }
                    outbox.insert(LocalOps.upsert("tag", uid, mapOf("name" to JsonPrimitive(result.root.name)), clock, nowMs()))
                    null
                }
            }
        }
        if (problem == null) afterLocalWrite()
        return problem
    }

    override suspend fun setNextAction(projectUid: String, taskUid: String?) {
        val clock = hlc.now()
        val fields = mapOf("next_task_uid" to jsonString(taskUid))
        val written = database.withTransaction {
            val existing = projectDao.get(projectUid) ?: return@withTransaction false
            projectDao.upsert(existing.copy(nextTaskUid = taskUid))
            outbox.insert(LocalOps.upsert("project", projectUid, fields, clock, nowMs()))
            true
        }
        if (written) afterLocalWrite()
    }

    override suspend fun createTag(name: String): String {
        tagDao.findByName(name)?.let { return it.uid }
        val uid = UUID.randomUUID().toString()
        val clock = hlc.now()
        database.withTransaction {
            tagDao.upsert(TagEntity(uid, name, null))
            outbox.insert(LocalOps.upsert("tag", uid, mapOf("name" to JsonPrimitive(name)), clock, nowMs()))
        }
        afterLocalWrite()
        return uid
    }

    override suspend fun createArea(name: String): String {
        val uid = UUID.randomUUID().toString()
        val clock = hlc.now()
        database.withTransaction {
            areaDao.upsert(AreaEntity(uid, name, null))
            outbox.insert(LocalOps.upsert("area", uid, mapOf("name" to JsonPrimitive(name)), clock, nowMs()))
        }
        afterLocalWrite()
        return uid
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

    override suspend fun processInboxItem(uid: String) {
        val clock = hlc.now()
        val written = database.withTransaction {
            val existing = inboxDao.get(uid) ?: return@withTransaction false
            inboxDao.upsert(existing.copy(status = INBOX_PROCESSED))
            outbox.insert(LocalOps.upsert("inbox_item", uid, mapOf("status" to JsonPrimitive(INBOX_PROCESSED)), clock, nowMs()))
            true
        }
        if (written) afterLocalWrite()
    }

    override fun requestSync() = SyncScheduler.requestNow(context)

    /** Garde un appel à l'API pour le prochain passage ; un appel de même clé est remplacé. */
    suspend fun defer(call: DeferredCall): Result<Delivery> {
        database.deferredCallDao().put(
            DeferredCallEntity(call.key, call.method, call.path, call.body?.toString(), call.label, nowMs()),
        )
        requestSync()
        return Result.success(Delivery.QUEUED)
    }

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
        const val REFUSED_SHOWN = 20
        const val ACTION_COMPLETE_OCCURRENCE = "complete_occurrence"
        const val ACTION_SKIP_OCCURRENCE = "skip_occurrence"
        const val INBOX_STATUS = "added"
        const val INBOX_SOURCE = "android"
        const val INBOX_PROCESSED = "processed"
        /** Étiquette système de « Plus tard », comme `review/repository.js` du serveur. */
        const val SOMEDAY_TAG = TagPaths.SOMEDAY
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

private fun TaskChange.hasDecision(): Boolean =
    inView != null || weekOf != null || clearWeek || reviewOn != null || clearReviewOn || later != null || reviewed

private fun jsonString(value: String?): JsonElement = value?.let { JsonPrimitive(it) } ?: JsonNull

private fun jsonInt(value: Int?): JsonElement = value?.let { JsonPrimitive(it) } ?: JsonNull

private fun jsonArray(values: List<String>): JsonElement = JsonArray(values.map { JsonPrimitive(it) })
