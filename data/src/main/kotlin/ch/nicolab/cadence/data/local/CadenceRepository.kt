package ch.nicolab.cadence.data.local

import ch.nicolab.cadence.data.local.entities.HabitEntity
import ch.nicolab.cadence.data.local.entities.HabitEntryEntity
import ch.nicolab.cadence.data.local.entities.HabitGoalEntity
import ch.nicolab.cadence.data.local.entities.HabitPauseEntity
import ch.nicolab.cadence.data.local.entities.HabitQuickValueEntity
import ch.nicolab.cadence.data.local.entities.HabitScheduleEntity
import ch.nicolab.cadence.data.local.entities.WidgetConfigurationEntity
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.HabitEntry
import ch.nicolab.cadence.domain.HabitGoal
import ch.nicolab.cadence.domain.HabitPause
import ch.nicolab.cadence.domain.HabitSchedule
import ch.nicolab.cadence.domain.PeriodType
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import androidx.room.withTransaction
import kotlinx.serialization.json.Json

class CadenceRepository(
    private val database: CadenceDatabase,
) {
    private val json = Json { ignoreUnknownKeys = false; encodeDefaults = true }
    fun observeHabits(): Flow<List<PersistedHabit>> {
        return database.habitDao().observeHabitsWithGoalAndSchedule().map { habitRelations ->
            val today = LocalDate.now().toString()
            habitRelations.mapNotNull { relation ->
                val goalEntity = relation.goals.filter { it.effectiveFrom <= today }.maxByOrNull { it.effectiveFrom } ?: return@mapNotNull null
                val scheduleEntity = relation.schedules.filter { it.effectiveFrom <= today }.maxByOrNull { it.effectiveFrom } ?: return@mapNotNull null

                val activeDays = scheduleEntity.activeDays
                    .split(",")
                    .filter { it.isNotBlank() }
                    .map { DayOfWeek.valueOf(it) }
                    .toSet()

                PersistedHabit(
                    id = relation.habit.id,
                    name = relation.habit.name,
                    active = relation.habit.active,
                    goal = HabitGoal(
                        targetMinor = goalEntity.targetMinor,
                        period = PeriodType.valueOf(goalEntity.period),
                    ),
                    schedule = HabitSchedule(
                        activeDays = activeDays,
                        firstDayOfWeek = DayOfWeek.valueOf(scheduleEntity.firstDayOfWeek),
                    ),
                )
            }
        }
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
                )
            }
        }
    }

    suspend fun addHabit(habit: PersistedHabit, effectiveFrom: LocalDate = LocalDate.now()) {
        val nowMs = System.currentTimeMillis()
        val habitEntity = HabitEntity(
            id = habit.id,
            name = habit.name,
            active = habit.active,
            createdAtEpochMs = nowMs,
        )
        val goalEntity = HabitGoalEntity(
            id = UUID.randomUUID().toString(),
            habitId = habit.id,
            targetMinor = habit.goal.targetMinor,
            period = habit.goal.period.name,
            effectiveFrom = effectiveFrom.toString(),
        )
        val scheduleEntity = HabitScheduleEntity(
            id = UUID.randomUUID().toString(),
            habitId = habit.id,
            activeDays = habit.schedule.activeDays.joinToString(",") { it.name },
            firstDayOfWeek = habit.schedule.firstDayOfWeek.name,
            effectiveFrom = effectiveFrom.toString(),
        )

        database.habitDao().insertHabit(habitEntity)
        database.habitDao().insertGoal(goalEntity)
        database.habitDao().insertSchedule(scheduleEntity)
    }

    suspend fun updateHabit(habit: PersistedHabit, effectiveFrom: LocalDate = LocalDate.now()) {
        val existingHabit = database.habitDao().getHabitById(habit.id)
        val createdAt = existingHabit?.createdAtEpochMs ?: System.currentTimeMillis()
        val habitEntity = HabitEntity(
            id = habit.id,
            name = habit.name,
            active = habit.active,
            createdAtEpochMs = createdAt,
        )
        val goalEntity = HabitGoalEntity(
            id = UUID.randomUUID().toString(),
            habitId = habit.id,
            targetMinor = habit.goal.targetMinor,
            period = habit.goal.period.name,
            effectiveFrom = effectiveFrom.toString(),
        )
        val scheduleEntity = HabitScheduleEntity(
            id = UUID.randomUUID().toString(),
            habitId = habit.id,
            activeDays = habit.schedule.activeDays.joinToString(",") { it.name },
            firstDayOfWeek = habit.schedule.firstDayOfWeek.name,
            effectiveFrom = effectiveFrom.toString(),
        )

        database.habitDao().updateHabit(habitEntity)
        database.habitDao().insertGoal(goalEntity)
        database.habitDao().insertSchedule(scheduleEntity)
    }

    suspend fun deleteHabit(habitId: String) {
        database.habitDao().deleteHabit(habitId)
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
        val habits = database.habitDao().getAllHabitsWithGoalAndSchedule().mapNotNull { relation ->
            val goal = relation.goals.maxByOrNull { it.effectiveFrom } ?: return@mapNotNull null
            val schedule = relation.schedules.maxByOrNull { it.effectiveFrom } ?: return@mapNotNull null
            BackupHabit(relation.habit.id, relation.habit.name, relation.habit.active, goal.targetMinor, goal.period, schedule.activeDays.split(",").filter(String::isNotBlank), schedule.firstDayOfWeek)
        }
        return json.encodeToString(BackupDocument(
            exportedAtEpochMs = System.currentTimeMillis(),
            habits = habits,
            entries = database.habitEntryDao().getAllEntries().map { BackupEntry(it.id, it.habitId, it.occurredAtEpochMs, it.localDate, it.observedZoneId, it.valueMinor, it.source) },
            quickValues = database.habitQuickValueDao().getAllQuickValues().map { BackupQuickValue(it.id, it.habitId, it.label, it.amountMinor, it.sortOrder) },
            pauses = database.habitPauseDao().getAllPauses().map { BackupPause(it.id, it.habitId, it.start, it.endExclusive, it.reason) },
        ))
    }

    suspend fun importBackup(content: String) {
        val document = json.decodeFromString<BackupDocument>(content)
        require(document.formatVersion == 1) { "Unsupported backup version" }
        require(document.habits.map(BackupHabit::id).toSet().size == document.habits.size) { "Duplicate habit IDs" }
        val habitIds = document.habits.map(BackupHabit::id).toSet()
        require(document.entries.all { it.habitId in habitIds && it.valueMinor > 0 }) { "Invalid entries" }
        database.withTransaction {
            database.clearAllTables()
            document.habits.forEach { backup ->
                addHabit(PersistedHabit(backup.id, backup.name, backup.active, HabitGoal(backup.targetMinor, PeriodType.valueOf(backup.period)), HabitSchedule(backup.activeDays.map(DayOfWeek::valueOf).toSet(), DayOfWeek.valueOf(backup.firstDayOfWeek))))
            }
            document.entries.forEach { entry -> database.habitEntryDao().insertEntry(HabitEntryEntity(entry.id, entry.habitId, entry.occurredAtEpochMs, entry.localDate, entry.observedZoneId, entry.valueMinor, entry.source)) }
            document.quickValues.forEach { value -> database.habitQuickValueDao().insertQuickValue(HabitQuickValueEntity(value.id, value.habitId, value.label, value.amountMinor, value.sortOrder)) }
            document.pauses.forEach { pause -> database.habitPauseDao().insertPause(HabitPauseEntity(pause.id, pause.habitId, pause.start, pause.endExclusive, pause.reason)) }
        }
    }
}
