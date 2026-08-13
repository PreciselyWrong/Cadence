package ch.nicolab.cadence.data.local

import androidx.room.withTransaction
import ch.nicolab.cadence.data.local.entities.HabitEntity
import ch.nicolab.cadence.data.local.entities.HabitEntryEntity
import ch.nicolab.cadence.data.local.entities.HabitGoalEntity
import ch.nicolab.cadence.data.local.entities.HabitPauseEntity
import ch.nicolab.cadence.data.local.entities.HabitQuickValueEntity
import ch.nicolab.cadence.data.local.entities.HabitReminderEntity
import ch.nicolab.cadence.data.local.entities.HabitScheduleEntity
import ch.nicolab.cadence.data.local.entities.WidgetConfigurationEntity
import ch.nicolab.cadence.data.local.entities.WidgetHabitEntity
import ch.nicolab.cadence.data.local.model.HabitWithGoalAndSchedule
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitEntry
import ch.nicolab.cadence.domain.HabitGoal
import ch.nicolab.cadence.domain.HabitPause
import ch.nicolab.cadence.domain.HabitSchedule
import ch.nicolab.cadence.domain.MeasurementUnit
import ch.nicolab.cadence.domain.PeriodCalculator
import ch.nicolab.cadence.domain.PeriodType
import ch.nicolab.cadence.domain.ScheduleMode
import ch.nicolab.cadence.domain.UnitDimension
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.int

class CadenceRepository(
    private val database: CadenceDatabase,
) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    fun observeHabits(): Flow<List<PersistedHabit>> = observeHabitsEffectiveAt(LocalDate.now())

    fun observeHabitsEffectiveAt(date: LocalDate): Flow<List<PersistedHabit>> {
        return database.habitDao().observeHabitsWithGoalAndSchedule().map { habitRelations ->
            habitRelations.mapNotNull { relation -> mapToPersistedHabit(relation, date) }
        }
    }

    suspend fun getHabitsEffectiveAt(date: LocalDate): List<PersistedHabit> {
        return database.habitDao().getAllHabitsWithGoalAndSchedule().mapNotNull { relation ->
            mapToPersistedHabit(relation, date)
        }
    }

    suspend fun getHabitEffectiveAt(habitId: String, date: LocalDate): PersistedHabit? {
        val relation = database.habitDao().getHabitWithGoalAndScheduleById(habitId) ?: return null
        return mapToPersistedHabit(relation, date)
    }

    fun observeEntries(
        habitId: String,
        startDateInclusive: LocalDate,
        endDateInclusive: LocalDate,
    ): Flow<List<HabitEntry>> {
        return database.habitEntryDao().observeEntriesForHabit(
            habitId = habitId,
            startDateInclusive = startDateInclusive.toString(),
            endDateInclusive = endDateInclusive.toString(),
        ).map { entities ->
            entities.map { entity ->
                HabitEntry(
                    id = entity.id,
                    habitId = entity.habitId,
                    occurredAt = Instant.ofEpochMilli(entity.occurredAtEpochMs),
                    localDate = LocalDate.parse(entity.localDate),
                    observedZoneId = ZoneId.of(entity.observedZoneId),
                    valueMinor = entity.valueMinor,
                    sessionId = entity.sessionId,
                    note = entity.note,
                )
            }
        }
    }

    suspend fun getEntries(habitId: String): List<HabitEntry> =
        database.habitEntryDao().getEntriesForHabit(habitId).map { entity ->
            HabitEntry(
                id = entity.id,
                habitId = entity.habitId,
                occurredAt = Instant.ofEpochMilli(entity.occurredAtEpochMs),
                localDate = LocalDate.parse(entity.localDate),
                observedZoneId = ZoneId.of(entity.observedZoneId),
                valueMinor = entity.valueMinor,
                sessionId = entity.sessionId,
                note = entity.note,
            )
        }

    suspend fun addHabit(habit: PersistedHabit, effectiveFrom: LocalDate = LocalDate.now()) {
        database.withTransaction {
            val nowMs = System.currentTimeMillis()
            val createdAt = if (habit.createdAtEpochMs > 0) habit.createdAtEpochMs else nowMs
            val updatedAt = if (habit.updatedAtEpochMs > 0) habit.updatedAtEpochMs else nowMs

            val habitEntity = HabitEntity(
                id = habit.id,
                name = habit.name,
                description = habit.description,
                iconId = habit.iconId,
                colorArgb = habit.colorArgb,
                active = habit.active,
                startsOn = habit.startsOn.toString(),
                archived = habit.archived,
                sortOrder = habit.sortOrder,
                createdAtEpochMs = createdAt,
                updatedAtEpochMs = updatedAt,
            )

            val goalEntity = HabitGoalEntity(
                id = UUID.randomUUID().toString(),
                habitId = habit.id,
                targetMinor = habit.goal.targetMinor,
                period = habit.goal.period.name,
                goalType = habit.goal.goalType.name,
                unitId = habit.goal.unit?.id,
                unitDimension = habit.goal.unit?.dimension?.name,
                unitNameFr = habit.goal.unit?.nameFr,
                unitSymbol = habit.goal.unit?.symbol,
                unitScaleToCanonical = habit.goal.unit?.scaleToCanonical,
                frequencyTarget = habit.goal.frequencyTarget,
                effectiveFrom = effectiveFrom.toString(),
            )

            val scheduleEntity = HabitScheduleEntity(
                id = UUID.randomUUID().toString(),
                habitId = habit.id,
                scheduleMode = habit.schedule.mode.name,
                activeDays = habit.schedule.activeDays.joinToString(",") { it.name },
                firstDayOfWeek = habit.schedule.firstDayOfWeek.name,
                effectiveFrom = effectiveFrom.toString(),
                intervalDays = habit.schedule.intervalDays,
            )

            database.habitDao().insertHabit(habitEntity)
            database.habitDao().insertGoal(goalEntity)
            database.habitDao().insertSchedule(scheduleEntity)
        }
    }

    suspend fun updateHabit(habit: PersistedHabit, effectiveFrom: LocalDate? = null) {
        database.withTransaction {
            val nowMs = System.currentTimeMillis()
            val existingHabit = database.habitDao().getHabitById(habit.id)
            val createdAt = existingHabit?.createdAtEpochMs ?: (if (habit.createdAtEpochMs > 0) habit.createdAtEpochMs else nowMs)

            val today = LocalDate.now()
            val effectiveDate = effectiveFrom ?: run {
                val currentEffective = getHabitEffectiveAt(habit.id, today)
                if (currentEffective != null) {
                    PeriodCalculator.window(today, currentEffective.goal.period, currentEffective.schedule.firstDayOfWeek).endExclusive
                } else {
                    today
                }
            }

            val habitEntity = HabitEntity(
                id = habit.id,
                name = habit.name,
                description = habit.description,
                iconId = habit.iconId,
                colorArgb = habit.colorArgb,
                active = habit.active,
                startsOn = habit.startsOn.toString(),
                archived = habit.archived,
                sortOrder = habit.sortOrder,
                createdAtEpochMs = createdAt,
                updatedAtEpochMs = nowMs,
            )

            val goalEntity = HabitGoalEntity(
                id = UUID.randomUUID().toString(),
                habitId = habit.id,
                targetMinor = habit.goal.targetMinor,
                period = habit.goal.period.name,
                goalType = habit.goal.goalType.name,
                unitId = habit.goal.unit?.id,
                unitDimension = habit.goal.unit?.dimension?.name,
                unitNameFr = habit.goal.unit?.nameFr,
                unitSymbol = habit.goal.unit?.symbol,
                unitScaleToCanonical = habit.goal.unit?.scaleToCanonical,
                frequencyTarget = habit.goal.frequencyTarget,
                effectiveFrom = effectiveDate.toString(),
            )

            val scheduleEntity = HabitScheduleEntity(
                id = UUID.randomUUID().toString(),
                habitId = habit.id,
                scheduleMode = habit.schedule.mode.name,
                activeDays = habit.schedule.activeDays.joinToString(",") { it.name },
                firstDayOfWeek = habit.schedule.firstDayOfWeek.name,
                effectiveFrom = effectiveDate.toString(),
                intervalDays = habit.schedule.intervalDays,
            )

            database.habitDao().updateHabit(habitEntity)
            database.habitDao().insertGoal(goalEntity)
            database.habitDao().insertSchedule(scheduleEntity)
        }
    }

    suspend fun deleteHabit(habitId: String) {
        database.habitDao().deleteHabit(habitId)
    }

    suspend fun updateSortOrder(habitId: String, sortOrder: Int) {
        database.habitDao().updateSortOrder(habitId, sortOrder, System.currentTimeMillis())
    }

    suspend fun addEntry(entry: HabitEntry, source: String = "MANUAL") {
        val entryEntity = HabitEntryEntity(
            id = entry.id,
            habitId = entry.habitId,
            occurredAtEpochMs = entry.occurredAt.toEpochMilli(),
            localDate = entry.localDate.toString(),
            observedZoneId = entry.observedZoneId.id,
            valueMinor = entry.valueMinor,
            source = source,
            sessionId = entry.sessionId,
            note = entry.note,
        )
        database.habitEntryDao().insertEntry(entryEntity)
    }

    suspend fun deleteEntry(entryId: String) {
        database.habitEntryDao().deleteEntry(entryId)
    }

    suspend fun addQuickValue(
        habitId: String,
        id: String,
        label: String,
        amountMinor: Long,
        sortOrder: Int,
    ) {
        val quickValueEntity = HabitQuickValueEntity(
            id = id,
            habitId = habitId,
            label = label,
            amountMinor = amountMinor,
            sortOrder = sortOrder,
        )
        database.habitQuickValueDao().insertQuickValue(quickValueEntity)
    }

    fun observeQuickValues(habitId: String): Flow<List<HabitQuickValueEntity>> {
        return database.habitQuickValueDao().observeQuickValues(habitId)
    }

    suspend fun getQuickValues(habitId: String): List<HabitQuickValueEntity> {
        return database.habitQuickValueDao().getQuickValues(habitId)
    }

    suspend fun deleteQuickValue(id: String) {
        database.habitQuickValueDao().deleteQuickValue(id)
    }

    suspend fun getReminders(habitId: String): List<HabitReminderEntity> =
        database.habitReminderDao().getReminders(habitId)

    suspend fun getAllReminders(): List<HabitReminderEntity> =
        database.habitReminderDao().getAllReminders()

    suspend fun replaceReminders(habitId: String, reminders: List<HabitReminderEntity>) {
        require(reminders.all { it.habitId == habitId })
        database.withTransaction {
            database.habitReminderDao().deleteRemindersForHabit(habitId)
            reminders.forEach { database.habitReminderDao().insertReminder(it) }
        }
    }

    suspend fun replaceQuickValues(habitId: String, values: List<Long>) {
        database.withTransaction {
            database.habitQuickValueDao().deleteQuickValuesForHabit(habitId)
            values.forEachIndexed { index, amount ->
                val quickValueEntity = HabitQuickValueEntity(
                    id = UUID.randomUUID().toString(),
                    habitId = habitId,
                    label = "+$amount",
                    amountMinor = amount,
                    sortOrder = index,
                )
                database.habitQuickValueDao().insertQuickValue(quickValueEntity)
            }
        }
    }

    suspend fun addPause(
        habitId: String,
        id: String,
        pause: HabitPause,
        reason: String? = null,
    ) {
        val pauseEntity = HabitPauseEntity(
            id = id,
            habitId = habitId,
            start = pause.start.toString(),
            endExclusive = pause.endExclusive?.toString(),
            reason = reason,
        )
        database.habitPauseDao().insertPause(pauseEntity)
    }

    fun observePauses(habitId: String): Flow<List<HabitPause>> {
        return database.habitPauseDao().observePauses(habitId).map { entities ->
            entities.map { entity ->
                HabitPause(
                    start = LocalDate.parse(entity.start),
                    endExclusive = entity.endExclusive?.let { LocalDate.parse(it) },
                )
            }
        }
    }

    suspend fun getPauses(habitId: String): List<HabitPause> {
        return database.habitPauseDao().getPauses(habitId).map { entity ->
            HabitPause(
                start = LocalDate.parse(entity.start),
                endExclusive = entity.endExclusive?.let { LocalDate.parse(it) },
            )
        }
    }

    suspend fun deletePause(id: String) {
        database.habitPauseDao().deletePause(id)
    }

    suspend fun pauseHabit(habitId: String, date: LocalDate) {
        if (database.habitPauseDao().getOpenPauses(habitId).isEmpty()) {
            database.habitPauseDao().insertPause(
                HabitPauseEntity(UUID.randomUUID().toString(), habitId, date.toString(), null, null),
            )
        }
    }

    suspend fun resumeHabit(habitId: String, date: LocalDate) {
        database.habitPauseDao().getOpenPauses(habitId).forEach { pause ->
            val start = LocalDate.parse(pause.start)
            if (start >= date) database.habitPauseDao().deletePause(pause.id)
            else database.habitPauseDao().insertPause(pause.copy(endExclusive = date.toString()))
        }
    }

    suspend fun saveWidgetConfig(config: WidgetConfigurationEntity, habitIds: List<String>) {
        database.widgetConfigDao().saveWidgetConfiguration(config, habitIds)
    }

    suspend fun getWidgetConfig(appWidgetId: Int): WidgetConfigurationEntity? {
        return database.widgetConfigDao().getConfiguration(appWidgetId)
    }

    suspend fun getWidgetHabitIds(appWidgetId: Int): List<String> {
        return database.widgetConfigDao().getHabitIdsForWidget(appWidgetId)
    }

    suspend fun deleteWidgetConfig(appWidgetId: Int) {
        database.widgetConfigDao().deleteConfiguration(appWidgetId)
    }

    suspend fun exportBackup(): String {
        val habitRelations = database.habitDao().getAllHabitsWithGoalAndSchedule()
        val backupHabits = habitRelations.map { relation ->
            val goals = relation.goals.map { g ->
                val unit = g.unitId?.let { uId ->
                    BackupUnitV2(
                        id = uId,
                        dimension = g.unitDimension ?: UnitDimension.CUSTOM.name,
                        nameFr = g.unitNameFr ?: "",
                        symbol = g.unitSymbol ?: "",
                        scaleToCanonical = g.unitScaleToCanonical ?: 1L,
                    )
                }
                BackupGoalV2(
                    id = g.id,
                    habitId = g.habitId,
                    targetMinor = g.targetMinor,
                    period = g.period,
                    goalType = g.goalType,
                    unit = unit,
                    frequencyTarget = g.frequencyTarget,
                    effectiveFrom = g.effectiveFrom,
                )
            }

            val schedules = relation.schedules.map { s ->
                BackupScheduleV2(
                    id = s.id,
                    habitId = s.habitId,
                    scheduleMode = s.scheduleMode,
                    activeDays = s.activeDays.split(",").filter(String::isNotBlank),
                    firstDayOfWeek = s.firstDayOfWeek,
                    effectiveFrom = s.effectiveFrom,
                    intervalDays = s.intervalDays,
                )
            }

            BackupHabitV2(
                id = relation.habit.id,
                name = relation.habit.name,
                description = relation.habit.description,
                iconId = relation.habit.iconId,
                colorArgb = relation.habit.colorArgb,
                active = relation.habit.active,
                startsOn = relation.habit.startsOn,
                archived = relation.habit.archived,
                sortOrder = relation.habit.sortOrder,
                createdAtEpochMs = relation.habit.createdAtEpochMs,
                updatedAtEpochMs = relation.habit.updatedAtEpochMs,
                goals = goals,
                schedules = schedules,
            )
        }

        val backupEntries = database.habitEntryDao().getAllEntries().map { e ->
            BackupEntryV2(
                id = e.id,
                habitId = e.habitId,
                occurredAtEpochMs = e.occurredAtEpochMs,
                localDate = e.localDate,
                observedZoneId = e.observedZoneId,
                valueMinor = e.valueMinor,
                source = e.source,
                sessionId = e.sessionId,
                note = e.note,
            )
        }

        val backupQuickValues = database.habitQuickValueDao().getAllQuickValues().map { q ->
            BackupQuickValueV2(q.id, q.habitId, q.label, q.amountMinor, q.sortOrder)
        }

        val backupReminders = database.habitReminderDao().getAllReminders().map { r ->
            BackupReminderV2(r.id, r.habitId, r.time, r.daysOfWeek.split(",").filter(String::isNotBlank), r.enabled, r.conditional)
        }

        val backupPauses = database.habitPauseDao().getAllPauses().map { p ->
            BackupPauseV2(p.id, p.habitId, p.start, p.endExclusive, p.reason)
        }

        val widgetConfigs = database.widgetConfigDao().getAllConfigurations()
        val widgetHabits = database.widgetConfigDao().getAllWidgetHabits()
        val backupWidgetConfigs = widgetConfigs.map { c ->
            val habitIds = widgetHabits.filter { it.appWidgetId == c.appWidgetId }.map { it.habitId }
            BackupWidgetConfigV2(
                appWidgetId = c.appWidgetId,
                title = c.title,
                theme = c.theme,
                selectedHabitIds = habitIds,
                selectAll = c.selectAll,
                opacity = c.opacity,
                showValues = c.showValues,
                iconSizeDp = c.iconSizeDp,
                progressStyle = c.progressStyle,
                showDoneIndicator = c.showDoneIndicator,
                maxHabitsPerRow = c.maxHabitsPerRow,
            )
        }

        val doc = BackupDocument(
            formatVersion = 2,
            exportedAtEpochMs = System.currentTimeMillis(),
            habits = backupHabits,
            entries = backupEntries,
            quickValues = backupQuickValues,
            reminders = backupReminders,
            pauses = backupPauses,
            widgetConfigs = backupWidgetConfigs,
        )

        return json.encodeToString(BackupDocument.serializer(), doc)
    }

    suspend fun importBackup(content: String) {
        val rootObj = json.parseToJsonElement(content).jsonObject
        val version = rootObj["formatVersion"]?.jsonPrimitive?.int ?: 1

        val docV2: BackupDocument = if (version == 1) {
            val docV1 = json.decodeFromString<BackupDocumentV1>(content)
            migrateV1ToV2(docV1)
        } else {
            json.decodeFromString<BackupDocument>(content)
        }

        validateBackupV2(docV2)

        database.withTransaction {
            database.clearAllTables()

            docV2.habits.forEach { habit ->
                val habitEntity = HabitEntity(
                    id = habit.id,
                    name = habit.name,
                    description = habit.description,
                    iconId = habit.iconId,
                    colorArgb = habit.colorArgb,
                    active = habit.active,
                    startsOn = habit.startsOn,
                    archived = habit.archived,
                    sortOrder = habit.sortOrder,
                    createdAtEpochMs = habit.createdAtEpochMs,
                    updatedAtEpochMs = habit.updatedAtEpochMs,
                )
                database.habitDao().insertHabit(habitEntity)

                habit.goals.forEach { g ->
                    val goalEntity = HabitGoalEntity(
                        id = g.id,
                        habitId = g.habitId,
                        targetMinor = g.targetMinor,
                        period = g.period,
                        goalType = g.goalType,
                        unitId = g.unit?.id,
                        unitDimension = g.unit?.dimension,
                        unitNameFr = g.unit?.nameFr,
                        unitSymbol = g.unit?.symbol,
                        unitScaleToCanonical = g.unit?.scaleToCanonical,
                        frequencyTarget = g.frequencyTarget,
                        effectiveFrom = g.effectiveFrom,
                    )
                    database.habitDao().insertGoal(goalEntity)
                }

                habit.schedules.forEach { s ->
                    val scheduleEntity = HabitScheduleEntity(
                        id = s.id,
                        habitId = s.habitId,
                        scheduleMode = s.scheduleMode,
                        activeDays = s.activeDays.joinToString(","),
                        firstDayOfWeek = s.firstDayOfWeek,
                        effectiveFrom = s.effectiveFrom,
                        intervalDays = s.intervalDays,
                    )
                    database.habitDao().insertSchedule(scheduleEntity)
                }
            }

            docV2.entries.forEach { e ->
                database.habitEntryDao().insertEntry(
                    HabitEntryEntity(
                        id = e.id,
                        habitId = e.habitId,
                        occurredAtEpochMs = e.occurredAtEpochMs,
                        localDate = e.localDate,
                        observedZoneId = e.observedZoneId,
                        valueMinor = e.valueMinor,
                        source = e.source,
                        sessionId = e.sessionId,
                        note = e.note,
                    )
                )
            }

            docV2.quickValues.forEach { q ->
                database.habitQuickValueDao().insertQuickValue(
                    HabitQuickValueEntity(
                        id = q.id,
                        habitId = q.habitId,
                        label = q.label,
                        amountMinor = q.amountMinor,
                        sortOrder = q.sortOrder,
                    )
                )
            }

            docV2.reminders.forEach { r ->
                database.habitReminderDao().insertReminder(
                    HabitReminderEntity(
                        id = r.id,
                        habitId = r.habitId,
                        time = r.time,
                        daysOfWeek = r.daysOfWeek.joinToString(","),
                        enabled = r.enabled,
                        conditional = r.conditional,
                    )
                )
            }

            docV2.pauses.forEach { p ->
                database.habitPauseDao().insertPause(
                    HabitPauseEntity(
                        id = p.id,
                        habitId = p.habitId,
                        start = p.start,
                        endExclusive = p.endExclusive,
                        reason = p.reason,
                    )
                )
            }

            docV2.widgetConfigs.forEach { w ->
                val entity = WidgetConfigurationEntity(
                    appWidgetId = w.appWidgetId,
                    title = w.title,
                    theme = w.theme,
                    selectAll = w.selectAll,
                    opacity = w.opacity,
                    showValues = w.showValues,
                    iconSizeDp = w.iconSizeDp,
                    progressStyle = w.progressStyle,
                    showDoneIndicator = w.showDoneIndicator,
                    maxHabitsPerRow = w.maxHabitsPerRow,
                )
                database.widgetConfigDao().saveWidgetConfiguration(entity, w.selectedHabitIds)
            }
        }
    }

    private fun validateBackupV2(doc: BackupDocument) {
        val habitIds = doc.habits.map { it.id }.toSet()
        require(habitIds.size == doc.habits.size) { "Duplicate habit IDs in backup" }

        doc.habits.forEach { habit ->
            require(habit.id.isNotBlank()) { "Habit ID cannot be blank" }
            require(habit.goals.isNotEmpty()) { "Habit ${habit.id} must have at least one goal" }
            require(habit.schedules.isNotEmpty()) { "Habit ${habit.id} must have at least one schedule" }
            LocalDate.parse(habit.startsOn)

            habit.goals.forEach { g ->
                require(g.habitId == habit.id) { "Goal habitId mismatch" }
                require(g.targetMinor > 0) { "Goal targetMinor must be positive" }
                require(g.frequencyTarget == null || g.frequencyTarget > 0) { "Frequency target must be positive" }
                g.unit?.let { require(it.scaleToCanonical > 0) { "Unit scale must be positive" } }
                LocalDate.parse(g.effectiveFrom)
            }

            habit.schedules.forEach { s ->
                require(s.habitId == habit.id) { "Schedule habitId mismatch" }
                require(s.intervalDays >= 2) { "Schedule interval must be at least two days" }
                LocalDate.parse(s.effectiveFrom)
            }
        }

        val entryIds = doc.entries.map { it.id }.toSet()
        require(entryIds.size == doc.entries.size) { "Duplicate entry IDs in backup" }
        doc.entries.forEach { e ->
            require(e.habitId in habitIds) { "Entry references missing habitId ${e.habitId}" }
            require(e.valueMinor > 0) { "Entry valueMinor must be positive" }
            LocalDate.parse(e.localDate)
        }

        doc.quickValues.forEach { q ->
            require(q.habitId in habitIds) { "QuickValue references missing habitId ${q.habitId}" }
        }

        doc.reminders.forEach { r ->
            require(r.habitId in habitIds) { "Reminder references missing habitId ${r.habitId}" }
        }

        doc.pauses.forEach { p ->
            require(p.habitId in habitIds) { "Pause references missing habitId ${p.habitId}" }
            val start = LocalDate.parse(p.start)
            p.endExclusive?.let { end ->
                val endEx = LocalDate.parse(end)
                require(endEx > start) { "Pause end must be after start" }
            }
        }

        doc.widgetConfigs.forEach { w ->
            require(w.opacity in 0..100) { "Widget opacity must be between 0 and 100" }
            require(w.iconSizeDp in 24..48) { "Widget icon size is invalid" }
            require(w.maxHabitsPerRow in 1..6) { "Widget habits per row is invalid" }
            w.selectedHabitIds.forEach { hId ->
                require(hId in habitIds) { "Widget config references missing habitId $hId" }
            }
        }
    }

    private fun migrateV1ToV2(v1: BackupDocumentV1): BackupDocument {
        val habitsV2 = v1.habits.map { h ->
            BackupHabitV2(
                id = h.id,
                name = h.name,
                description = null,
                iconId = null,
                colorArgb = null,
                active = h.active,
                startsOn = "1970-01-01",
                archived = false,
                sortOrder = 0,
                createdAtEpochMs = v1.exportedAtEpochMs,
                updatedAtEpochMs = v1.exportedAtEpochMs,
                goals = listOf(
                    BackupGoalV2(
                        id = UUID.randomUUID().toString(),
                        habitId = h.id,
                        targetMinor = h.targetMinor,
                        period = h.period,
                        goalType = GoalType.QUANTITY.name,
                        unit = null,
                        frequencyTarget = null,
                        effectiveFrom = "1970-01-01",
                    )
                ),
                schedules = listOf(
                    BackupScheduleV2(
                        id = UUID.randomUUID().toString(),
                        habitId = h.id,
                        scheduleMode = ScheduleMode.SELECTED_DAYS.name,
                        activeDays = h.activeDays,
                        firstDayOfWeek = h.firstDayOfWeek,
                        effectiveFrom = "1970-01-01",
                        intervalDays = 2,
                    )
                ),
            )
        }

        val entriesV2 = v1.entries.map { e ->
            BackupEntryV2(
                id = e.id,
                habitId = e.habitId,
                occurredAtEpochMs = e.occurredAtEpochMs,
                localDate = e.localDate,
                observedZoneId = e.observedZoneId,
                valueMinor = e.valueMinor,
                source = e.source,
                sessionId = null,
                note = null,
            )
        }

        val quickValuesV2 = v1.quickValues.map { q ->
            BackupQuickValueV2(q.id, q.habitId, q.label, q.amountMinor, q.sortOrder)
        }

        val pausesV2 = v1.pauses.map { p ->
            BackupPauseV2(p.id, p.habitId, p.start, p.endExclusive, p.reason)
        }

        return BackupDocument(
            formatVersion = 2,
            exportedAtEpochMs = v1.exportedAtEpochMs,
            habits = habitsV2,
            entries = entriesV2,
            quickValues = quickValuesV2,
            reminders = emptyList(),
            pauses = pausesV2,
            widgetConfigs = emptyList(),
        )
    }

    private fun mapToPersistedHabit(relation: HabitWithGoalAndSchedule, date: LocalDate): PersistedHabit? {
        val dateStr = date.toString()
        val goalEntity = relation.goals.filter { it.effectiveFrom <= dateStr }.maxByOrNull { it.effectiveFrom } ?: return null
        val scheduleEntity = relation.schedules.filter { it.effectiveFrom <= dateStr }.maxByOrNull { it.effectiveFrom } ?: return null

        val unit = goalEntity.unitId?.let { id ->
            MeasurementUnit(
                id = id,
                dimension = UnitDimension.valueOf(goalEntity.unitDimension ?: UnitDimension.CUSTOM.name),
                nameFr = goalEntity.unitNameFr ?: "",
                symbol = goalEntity.unitSymbol ?: "",
                scaleToCanonical = goalEntity.unitScaleToCanonical ?: 1L,
            )
        }

        val activeDays = scheduleEntity.activeDays
            .split(",")
            .filter { it.isNotBlank() }
            .map { DayOfWeek.valueOf(it) }
            .toSet()

        val startsOn = try { LocalDate.parse(relation.habit.startsOn) } catch (e: Exception) { LocalDate.of(1970, 1, 1) }

        return PersistedHabit(
            id = relation.habit.id,
            name = relation.habit.name,
            description = relation.habit.description,
            iconId = relation.habit.iconId,
            colorArgb = relation.habit.colorArgb,
            active = relation.habit.active,
            startsOn = startsOn,
            archived = relation.habit.archived,
            sortOrder = relation.habit.sortOrder,
            createdAtEpochMs = relation.habit.createdAtEpochMs,
            updatedAtEpochMs = relation.habit.updatedAtEpochMs,
            goal = HabitGoal(
                targetMinor = goalEntity.targetMinor,
                period = PeriodType.valueOf(goalEntity.period),
                goalType = GoalType.valueOf(goalEntity.goalType),
                unit = unit,
                frequencyTarget = goalEntity.frequencyTarget,
            ),
            schedule = HabitSchedule(
                mode = ScheduleMode.valueOf(scheduleEntity.scheduleMode),
                activeDays = activeDays,
                firstDayOfWeek = DayOfWeek.valueOf(scheduleEntity.firstDayOfWeek),
                intervalDays = scheduleEntity.intervalDays,
            ),
        )
    }
}
