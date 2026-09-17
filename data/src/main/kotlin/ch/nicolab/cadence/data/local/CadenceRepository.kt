package ch.nicolab.cadence.data.local

import androidx.room.withTransaction
import ch.nicolab.cadence.data.local.entities.AlcoholConsumptionEntity
import ch.nicolab.cadence.data.local.entities.HabitEntity
import ch.nicolab.cadence.data.local.entities.HabitEntryEntity
import ch.nicolab.cadence.data.local.entities.HabitGoalEntity
import ch.nicolab.cadence.data.local.entities.HabitPauseEntity
import ch.nicolab.cadence.data.local.entities.HabitQuickValueEntity
import ch.nicolab.cadence.data.local.entities.HabitReminderEntity
import ch.nicolab.cadence.data.local.entities.HabitGroupEntity
import ch.nicolab.cadence.data.local.entities.HabitScheduleEntity
import ch.nicolab.cadence.data.local.entities.HabitTimerEntity
import ch.nicolab.cadence.data.local.entities.WidgetConfigurationEntity
import ch.nicolab.cadence.data.local.entities.WidgetHabitEntity
import ch.nicolab.cadence.data.local.model.HabitWithGoalAndSchedule

import ch.nicolab.cadence.data.local.model.IdentifiedPause
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.AlcoholConsumption
import ch.nicolab.cadence.domain.GoalDirection
import ch.nicolab.cadence.domain.AbstinenceProfile
import ch.nicolab.cadence.domain.AbstinenceLog
import ch.nicolab.cadence.domain.AbstinenceLogKind
import ch.nicolab.cadence.data.local.entities.AbstinenceLogEntity
import java.time.Clock
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitEntry
import ch.nicolab.cadence.domain.HabitGoal
import ch.nicolab.cadence.domain.HabitGroup
import ch.nicolab.cadence.domain.HabitPause
import ch.nicolab.cadence.domain.HabitSchedule
import ch.nicolab.cadence.domain.GoalProgression
import ch.nicolab.cadence.domain.ProgressionCadence
import ch.nicolab.cadence.domain.HabitTimer
import ch.nicolab.cadence.domain.PauseReason
import ch.nicolab.cadence.domain.MeasurementUnit
import ch.nicolab.cadence.domain.PeriodType
import ch.nicolab.cadence.domain.ScheduleMode
import ch.nicolab.cadence.domain.SavingsPeriod
import ch.nicolab.cadence.domain.UnitDimension
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.util.UUID
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.int

class CadenceRepository(
    private val database: CadenceDatabase,
    private val clock: Clock = Clock.systemDefaultZone(),
) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    fun observeAbstinenceLogRevision(): Flow<Int> = database.abstinenceLogDao().observeRevision()

    fun observeAlcoholRevision(): Flow<Long> = database.alcoholConsumptionDao().observeRevision()

    suspend fun getAlcoholConsumptions(habitId: String): List<AlcoholConsumption> =
        database.alcoholConsumptionDao().getConsumptions(habitId).map(::toAlcoholConsumption)

    suspend fun saveAlcoholConsumption(consumption: AlcoholConsumption) {
        require(consumption.id.isNotBlank()) { "Alcohol consumption ID cannot be blank" }
        require(consumption.localDate <= LocalDate.now(clock)) { "Alcohol consumption cannot be in the future" }
        val standardDrinks = consumption.standardDrinks
        require(standardDrinks == null || standardDrinks > 0) {
            "Standard drinks must be positive"
        }
        consumption.followUpDate?.let { require(it > consumption.localDate) { "Follow-up must be after consumption" } }
        consumption.observedAt?.let {
            require(it <= clock.instant()) { "Alcohol consumption cannot be observed in the future" }
        }
        ZoneId.of(consumption.observedZoneId.id)
        database.withTransaction {
            val habit = requireNotNull(getHabitEffectiveAt(consumption.habitId, consumption.localDate)) {
                "Alcohol habit is missing"
            }
            require(habit.abstinenceProfile == AbstinenceProfile.ALCOHOL) {
                "Alcohol consumption requires the alcohol profile"
            }
            val existing = database.alcoholConsumptionDao().getConsumptionForDay(
                consumption.habitId, consumption.localDate.toString(),
            )
            if (existing != null && existing.id != consumption.id) {
                database.alcoholConsumptionDao().delete(consumption.id)
            }
            database.alcoholConsumptionDao().save(
                AlcoholConsumptionEntity(
                    id = existing?.id ?: consumption.id,
                    habitId = consumption.habitId,
                    localDate = consumption.localDate.toString(),
                    observedZoneId = consumption.observedZoneId.id,
                    standardDrinks = consumption.standardDrinks,
                    followUpDate = consumption.followUpDate?.toString(),
                    followUpNotified = consumption.followUpNotified,
                    observedAtEpochMs = consumption.observedAt?.toEpochMilli() ?: existing?.observedAtEpochMs,
                ),
            )
        }
    }

    suspend fun deleteAlcoholConsumption(id: String) = database.alcoholConsumptionDao().delete(id)

    suspend fun markAlcoholFollowUpNotified(id: String) =
        database.alcoholConsumptionDao().markFollowUpNotified(id)

    private fun toAlcoholConsumption(entity: AlcoholConsumptionEntity) = AlcoholConsumption(
        id = entity.id,
        habitId = entity.habitId,
        localDate = LocalDate.parse(entity.localDate),
        observedZoneId = ZoneId.of(entity.observedZoneId),
        standardDrinks = entity.standardDrinks,
        followUpDate = entity.followUpDate?.let(LocalDate::parse),
        followUpNotified = entity.followUpNotified,
        observedAt = entity.observedAtEpochMs?.let(Instant::ofEpochMilli),
    )

    suspend fun getAbstinenceLogs(habitId: String): List<AbstinenceLog> =
        database.abstinenceLogDao().getLogs(habitId).map(::toAbstinenceLog)

    suspend fun saveAbstinenceLog(log: AbstinenceLog) {
        database.withTransaction {
            val habit = requireNotNull(getHabitEffectiveAt(log.habitId, LocalDate.now(clock))) { "Journal habit is missing" }
            require(habit.goal.isAbstinence && habit.abstinenceProfile != AbstinenceProfile.NONE) { "Journal requires abstinence" }
            validateLogDates(log, requireNotNull(habit.abstinenceStartedOn(clock.zone)) { "Observation start is missing" })
            val entity = toAbstinenceLogEntity(log)
            database.abstinenceLogDao().getLog(entity.id)?.let { existing ->
                require(existing.habitId == log.habitId && existing.kind == log.kind.name) { "Journal identity cannot change habit or kind" }
            }
            database.abstinenceLogDao().save(entity)
        }
    }

    suspend fun deleteAbstinenceLog(id: String) = database.abstinenceLogDao().delete(id)

    private fun validateLogDates(log: AbstinenceLog, startsOn: LocalDate) {
        require(log.localDate in startsOn..LocalDate.now(clock)) { "Journal date is outside observation" }
        require(log.occurredAt <= clock.instant()) { "Journal instant cannot be in the future" }
        require(log.occurredAt.atZone(log.observedZoneId).toLocalDate() == log.localDate) { "Journal date and observed zone disagree" }
    }

    private fun toAbstinenceLogEntity(log: AbstinenceLog) = AbstinenceLogEntity(
        id = if (log.kind == AbstinenceLogKind.CHECK_IN) {
            UUID.nameUUIDFromBytes("check-in:${log.habitId}:${log.localDate}".toByteArray(Charsets.UTF_8)).toString()
        } else log.id,
        habitId = log.habitId,
        occurredAtEpochMs = log.occurredAt.toEpochMilli(),
        localDate = log.localDate.toString(),
        observedZoneId = log.observedZoneId.id,
        kind = log.kind.name,
        intensity = log.intensity,
        note = log.note,
    )

    private fun toAbstinenceLog(entity: AbstinenceLogEntity) = AbstinenceLog(
        entity.id, entity.habitId, Instant.ofEpochMilli(entity.occurredAtEpochMs),
        LocalDate.parse(entity.localDate), ZoneId.of(entity.observedZoneId),
        AbstinenceLogKind.valueOf(entity.kind), entity.intensity, entity.note,
    )

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

    /**
     * Lecteur des versions successives d'une habitude, résolu en une seule requête.
     * Parcourir un long historique date par date passerait sinon par autant de requêtes.
     */
    suspend fun habitVersionsOf(habitId: String): (LocalDate) -> PersistedHabit? {
        val relation = database.habitDao().getHabitWithGoalAndScheduleById(habitId)
            ?: return { null }
        return { date -> mapToPersistedHabit(relation, date) }
    }

    suspend fun getHabitEffectiveAt(habitId: String, date: LocalDate): PersistedHabit? {
        val relation = database.habitDao().getHabitWithGoalAndScheduleById(habitId) ?: return null
        return mapToPersistedHabit(relation, date)
    }

    /**
     * Signal de révision des saisies et des pauses. Il émet aussi bien pour une écriture
     * de l'application que pour une écriture venue du widget, ce qui permet de reconstruire
     * l'état sans jamais s'appuyer sur une copie conservée en mémoire.
     */
    fun observeEntryRevision(): Flow<Long> = database.habitEntryDao().observeEntryRevision()

    fun observePauseRevision(): Flow<Int> = database.habitPauseDao().observePauseRevision()

    fun observeHabitRevision(): Flow<Int> = database.habitDao().observeHabitRevision()

    fun observeTimerRevision(): Flow<Int> = database.habitTimerDao().observeTimerRevision()

    fun observeGroupRevision(): Flow<Int> = database.habitGroupDao().observeGroupRevision()

    fun observeWidgetConfigRevision(): Flow<Int> = database.widgetConfigDao().observeWidgetConfigRevision()

    /**
     * Toutes les révisions dont dépend l'affichage d'un widget, fusionnées. Un widget qui
     * s'y abonne se remet à jour quelle que soit l'origine de l'écriture.
     */
    fun observeWidgetRevisions(): Flow<Number> = merge(
        observeHabitRevision(),
        observeEntryRevision(),
        observeAlcoholRevision(),
        observePauseRevision(),
        observeTimerRevision(),
        observeGroupRevision(),
        observeWidgetConfigRevision(),
    )

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

    suspend fun getEntries(
        habitId: String,
        startDateInclusive: LocalDate,
        endDateInclusive: LocalDate,
    ): List<HabitEntry> =
        database.habitEntryDao().getEntriesForHabitBetween(
            habitId = habitId,
            startDateInclusive = startDateInclusive.toString(),
            endDateInclusive = endDateInclusive.toString(),
        ).map { entity ->
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
                groupId = habit.groupId,
                timerEnabled = habit.timerEnabled,
                abstinenceProfile = habit.abstinenceProfile.name,
                abstinenceStartedOn = habit.abstinenceStartedOn(clock.zone)?.toString(),
                abstinenceStartedAtEpochMs = habit.abstinenceStartedAt?.toEpochMilli(),
                abstinenceSpendingMinor = habit.abstinenceSpendingMinor,
                abstinenceSpendingPeriod = habit.abstinenceSpendingPeriod?.name,
                abstinenceSavingsCurrency = habit.abstinenceSavingsCurrency,
                alcoholFollowUpTime = alcoholFollowUpTime(habit.abstinenceProfile, habit.alcoholFollowUpTime),
            )

            val goalEntity = HabitGoalEntity(
                id = UUID.randomUUID().toString(),
                habitId = habit.id,
                targetMinor = habit.goal.targetMinor,
                minimumMinor = habit.goal.minimumMinor,
                direction = habit.goal.direction.name,
                progressionStep = habit.goal.progression?.step,
                progressionCadence = habit.goal.progression?.cadence?.name,
                progressionCapMinor = habit.goal.progression?.capMinor,
                progressionStartsOn = habit.goal.progression?.startsOn?.toString(),
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

            // Un objectif modifié s'applique à partir d'aujourd'hui : les jours déjà écoulés
            // gardent leur version, mais l'utilisateur voit immédiatement sa correction.
            val effectiveDate = effectiveFrom ?: LocalDate.now()

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
                groupId = habit.groupId,
                timerEnabled = habit.timerEnabled,
                abstinenceProfile = habit.abstinenceProfile.name,
                abstinenceStartedOn = habit.abstinenceStartedOn(clock.zone)?.toString(),
                abstinenceStartedAtEpochMs = habit.abstinenceStartedAt?.toEpochMilli(),
                abstinenceSpendingMinor = habit.abstinenceSpendingMinor,
                abstinenceSpendingPeriod = habit.abstinenceSpendingPeriod?.name,
                abstinenceSavingsCurrency = habit.abstinenceSavingsCurrency,
                alcoholFollowUpTime = alcoholFollowUpTime(habit.abstinenceProfile, habit.alcoholFollowUpTime),
            )

            val goalEntity = HabitGoalEntity(
                id = UUID.randomUUID().toString(),
                habitId = habit.id,
                targetMinor = habit.goal.targetMinor,
                minimumMinor = habit.goal.minimumMinor,
                direction = habit.goal.direction.name,
                progressionStep = habit.goal.progression?.step,
                progressionCadence = habit.goal.progression?.cadence?.name,
                progressionCapMinor = habit.goal.progression?.capMinor,
                progressionStartsOn = habit.goal.progression?.startsOn?.toString(),
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

            database.habitDao().deleteGoalsFrom(habit.id, effectiveDate.toString())
            database.habitDao().deleteSchedulesFrom(habit.id, effectiveDate.toString())
            database.habitDao().updateHabit(habitEntity)
            if (!habit.timerEnabled || habit.goal.goalType != GoalType.DURATION) {
                database.habitTimerDao().delete(habit.id)
            }
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

    /**
     * Réécrit une saisie existante. La source d'origine est conservée quand elle n'est pas
     * précisée : une correction ne transforme pas une saisie du widget en saisie manuelle.
     */
    suspend fun updateEntry(entry: HabitEntry, source: String? = null) {
        val existing = database.habitEntryDao().getEntryById(entry.id)
        addEntry(entry, source ?: existing?.source ?: "MANUAL")
    }

    suspend fun getEntry(entryId: String): HabitEntry? =
        database.habitEntryDao().getEntryById(entryId)?.let { entity ->
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

    /**
     * Chronomètres en cours. Rien n'est écrit tant qu'aucun chronomètre n'a démarré :
     * l'absence de ligne signifie « arrêté à zéro ».
     */
    fun observeTimers(): Flow<Map<String, HabitTimer>> =
        database.habitTimerDao().observeTimers().map { rows ->
            rows.associate { it.habitId to toTimer(it) }
        }

    suspend fun getTimers(): Map<String, HabitTimer> =
        database.habitTimerDao().getTimers().associate { it.habitId to toTimer(it) }

    suspend fun getTimer(habitId: String): HabitTimer? =
        database.habitTimerDao().getTimer(habitId)?.let(::toTimer)

    suspend fun saveTimer(timer: HabitTimer) {
        database.habitTimerDao().upsert(
            HabitTimerEntity(
                habitId = timer.habitId,
                accumulatedSeconds = timer.accumulatedSeconds,
                runningSinceEpochMs = timer.runningSince?.toEpochMilli(),
            ),
        )
    }

    suspend fun clearTimer(habitId: String) {
        database.habitTimerDao().delete(habitId)
    }

    private fun toTimer(entity: HabitTimerEntity) = HabitTimer(
        habitId = entity.habitId,
        accumulatedSeconds = entity.accumulatedSeconds,
        runningSince = entity.runningSinceEpochMs?.let(Instant::ofEpochMilli),
    )

    suspend fun addPause(
        habitId: String,
        id: String,
        pause: HabitPause,
    ) {
        database.habitPauseDao().insertPause(toPauseEntity(id, habitId, pause))
    }

    fun observePauses(habitId: String): Flow<List<HabitPause>> {
        return database.habitPauseDao().observePauses(habitId).map { entities ->
            entities.map(::toPause)
        }
    }

    /** Pauses avec leur identifiant, nécessaire pour annuler un saut ou écourter un voyage. */
    fun observeIdentifiedPauses(habitId: String): Flow<List<IdentifiedPause>> {
        return database.habitPauseDao().observePauses(habitId).map { entities ->
            entities.map { IdentifiedPause(it.id, it.habitId, toPause(it)) }
        }
    }

    /** Pauses identifiées en une seule lecture, sans passer par un flux à collecter. */
    suspend fun getIdentifiedPauses(habitId: String): List<IdentifiedPause> =
        database.habitPauseDao().getPauses(habitId).map { IdentifiedPause(it.id, it.habitId, toPause(it)) }

    suspend fun getPauses(habitId: String): List<HabitPause> {
        return database.habitPauseDao().getPauses(habitId).map(::toPause)
    }

    suspend fun deletePause(id: String) {
        database.habitPauseDao().deletePause(id)
    }

    /**
     * Suspend plusieurs habitudes sur une plage inclusive. Chaque habitude reçoit sa propre
     * pause, ce qui permet ensuite d'en écourter une sans toucher aux autres.
     */
    suspend fun startTravel(habitIds: List<String>, from: LocalDate, toInclusive: LocalDate) {
        val pause = HabitPause.travel(from, toInclusive)
        database.withTransaction {
            habitIds.distinct().forEach { habitId ->
                database.habitPauseDao().insertPause(
                    toPauseEntity(UUID.randomUUID().toString(), habitId, pause),
                )
            }
        }
    }

    /**
     * Reprise anticipée : la pause s'arrête au matin de [date], ou disparaît si la reprise
     * précède son premier jour.
     */
    suspend fun resumePause(pauseId: String, date: LocalDate) {
        val entity = database.habitPauseDao().getPauseById(pauseId) ?: return
        val resumed = toPause(entity).resumedOn(date)
        if (resumed == null) database.habitPauseDao().deletePause(pauseId)
        else database.habitPauseDao().insertPause(toPauseEntity(pauseId, entity.habitId, resumed))
    }

    private fun toPause(entity: HabitPauseEntity) = HabitPause(
        start = LocalDate.parse(entity.start),
        endExclusive = entity.endExclusive?.let { LocalDate.parse(it) },
        reason = PauseReason.fromStorage(entity.reason),
        reasonLabel = entity.reasonLabel,
    )

    private fun toPauseEntity(id: String, habitId: String, pause: HabitPause) = HabitPauseEntity(
        id = id,
        habitId = habitId,
        start = pause.start.toString(),
        endExclusive = pause.endExclusive?.toString(),
        reason = pause.reason?.name,
        reasonLabel = pause.reasonLabel,
    )

    suspend fun pauseHabit(habitId: String, date: LocalDate) {
        if (database.habitPauseDao().getOpenPauses(habitId).isEmpty()) {
            database.habitPauseDao().insertPause(
                toPauseEntity(
                    UUID.randomUUID().toString(),
                    habitId,
                    HabitPause(date, null, PauseReason.MANUAL),
                ),
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

    /**
     * Groupes d'habitudes, garnis à la première lecture avec `Journée`, `Matin`,
     * `Après-midi` et `Soir`. Le groupe sans horaire ne disparaît jamais : il reste la
     * destination de repli d'une habitude dont le groupe est supprimé.
     */
    fun observeGroups(): Flow<List<HabitGroup>> =
        database.habitGroupDao().observeGroups().map { rows -> rows.map(::mapToGroup) }

    suspend fun getGroups(): List<HabitGroup> {
        ensureDefaultGroups()
        return database.habitGroupDao().getGroups().map(::mapToGroup)
    }

    suspend fun ensureDefaultGroups() {
        if (database.habitGroupDao().getGroups().isNotEmpty()) return
        database.habitGroupDao().upsertAll(HabitGroup.defaults().map(::mapToGroupEntity))
    }

    suspend fun saveGroup(group: HabitGroup) {
        require(!(group.id == HabitGroup.ALL_DAY_ID && !group.isAllDay)) {
            "The all day group keeps no schedule"
        }
        database.habitGroupDao().upsert(mapToGroupEntity(group))
    }

    suspend fun saveGroups(groups: List<HabitGroup>) {
        database.habitGroupDao().upsertAll(groups.map(::mapToGroupEntity))
    }

    /** Supprime un groupe et ramène ses habitudes vers `Journée`. */
    suspend fun deleteGroup(groupId: String) {
        require(groupId != HabitGroup.ALL_DAY_ID) { "The all day group cannot be removed" }
        database.withTransaction {
            database.habitGroupDao().reassignHabits(groupId, HabitGroup.ALL_DAY_ID)
            database.habitGroupDao().delete(groupId)
        }
    }

    private fun mapToGroup(entity: HabitGroupEntity) = HabitGroup(
        id = entity.id,
        name = entity.name,
        startMinute = entity.startMinute,
        endMinute = entity.endMinute,
        sortOrder = entity.sortOrder,
    )

    private fun mapToGroupEntity(group: HabitGroup) = HabitGroupEntity(
        id = group.id,
        name = group.name,
        startMinute = group.startMinute,
        endMinute = group.endMinute,
        sortOrder = group.sortOrder,
    )

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
                    minimumMinor = g.minimumMinor,
                    direction = g.direction,
                    progressionStep = g.progressionStep,
                    progressionCadence = g.progressionCadence,
                    progressionCapMinor = g.progressionCapMinor,
                    progressionStartsOn = g.progressionStartsOn,
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
                groupId = relation.habit.groupId,
                timerEnabled = relation.habit.timerEnabled,
                abstinenceProfile = relation.habit.abstinenceProfile,
                abstinenceStartedOn = relation.habit.abstinenceStartedOn,
                abstinenceStartedAtEpochMs = relation.habit.abstinenceStartedAtEpochMs,
                abstinenceSpendingMinor = relation.habit.abstinenceSpendingMinor,
                abstinenceSpendingPeriod = relation.habit.abstinenceSpendingPeriod,
                abstinenceSavingsCurrency = relation.habit.abstinenceSavingsCurrency,
                alcoholFollowUpTime = relation.habit.alcoholFollowUpTime,
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
            BackupPauseV2(p.id, p.habitId, p.start, p.endExclusive, p.reason, p.reasonLabel)
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
                showLabels = c.showLabels,
                labelTextSizeSp = c.labelTextSizeSp,
                labelOpacity = c.labelOpacity,
                valueTextSizeSp = c.valueTextSizeSp,
                valueOpacity = c.valueOpacity,
                iconOpacity = c.iconOpacity,
                iconSaturation = c.iconSaturation,
                monochromeIcons = c.monochromeIcons,
                groupMode = c.groupMode,
                groupId = c.groupId,
                slotMode = c.slotMode,
                slotAlignment = c.slotAlignment,
            )
        }

        val backupGroups = database.habitGroupDao().getGroups().map { g ->
            BackupGroupV2(g.id, g.name, g.startMinute, g.endMinute, g.sortOrder)
        }

        val doc = BackupDocument(
            formatVersion = 3,
            exportedAtEpochMs = System.currentTimeMillis(),
            habits = backupHabits,
            entries = backupEntries,
            quickValues = backupQuickValues,
            reminders = backupReminders,
            pauses = backupPauses,
            widgetConfigs = backupWidgetConfigs,
            groups = backupGroups,
            abstinenceLogs = database.abstinenceLogDao().getAllLogs().map { log ->
                BackupAbstinenceLogV2(log.id, log.habitId, log.occurredAtEpochMs, log.localDate,
                    log.observedZoneId, log.kind, log.intensity, log.note)
            },
            alcoholConsumptions = database.alcoholConsumptionDao().getAllConsumptions().map { consumption ->
                BackupAlcoholConsumptionV3(
                    id = consumption.id,
                    habitId = consumption.habitId,
                    localDate = consumption.localDate,
                    observedZoneId = consumption.observedZoneId,
                    standardDrinks = consumption.standardDrinks,
                    followUpDate = consumption.followUpDate,
                    followUpNotified = consumption.followUpNotified,
                    observedAtEpochMs = consumption.observedAtEpochMs,
                )
            },
        )

        return json.encodeToString(BackupDocument.serializer(), doc)
    }

    suspend fun importBackup(content: String) {
        val rootObj = json.parseToJsonElement(content).jsonObject
        val version = rootObj["formatVersion"]?.jsonPrimitive?.int ?: 1

        val decoded: BackupDocument = if (version == 1) {
            val docV1 = json.decodeFromString<BackupDocumentV1>(content)
            migrateV1ToV2(docV1)
        } else {
            json.decodeFromString<BackupDocument>(content)
        }
        val docV2 = if (version < 3) migrateAlcoholEntriesToV3(decoded) else decoded

        validateBackupV2(docV2)
        val journal = validateBackupJournal(docV2)

        database.withTransaction {
            database.clearAllTables()

            // Les groupes précèdent les habitudes : une sauvegarde antérieure aux groupes
            // restaure les groupes livrés et laisse chaque habitude dans `Journée`.
            val restoredGroups = docV2.groups
                .map { HabitGroupEntity(it.id, it.name, it.startMinute, it.endMinute, it.sortOrder) }
                .ifEmpty { HabitGroup.defaults().map(::mapToGroupEntity) }
            val knownGroupIds = restoredGroups.map(HabitGroupEntity::id).toSet()
            database.habitGroupDao().upsertAll(restoredGroups)

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
                    groupId = habit.groupId.takeIf(knownGroupIds::contains) ?: HabitGroup.ALL_DAY_ID,
                    timerEnabled = habit.timerEnabled,
                    abstinenceProfile = habit.abstinenceProfile,
                    abstinenceStartedOn = habit.abstinenceStartedOn,
                    abstinenceStartedAtEpochMs = habit.abstinenceStartedAtEpochMs,
                    abstinenceSpendingMinor = habit.abstinenceSpendingMinor,
                    abstinenceSpendingPeriod = habit.abstinenceSpendingPeriod,
                    abstinenceSavingsCurrency = habit.abstinenceSavingsCurrency,
                    alcoholFollowUpTime = alcoholFollowUpTime(
                        AbstinenceProfile.valueOf(habit.abstinenceProfile),
                        habit.alcoholFollowUpTime,
                    ),
                )
                database.habitDao().insertHabit(habitEntity)

                habit.goals.forEach { g ->
                    val goalEntity = HabitGoalEntity(
                        id = g.id,
                        habitId = g.habitId,
                        targetMinor = g.targetMinor,
                        minimumMinor = g.minimumMinor,
                        direction = g.direction,
                        progressionStep = g.progressionStep,
                        progressionCadence = g.progressionCadence,
                        progressionCapMinor = g.progressionCapMinor,
                        progressionStartsOn = g.progressionStartsOn,
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

            journal.forEach { database.abstinenceLogDao().save(it) }

            docV2.alcoholConsumptions.forEach { consumption ->
                database.alcoholConsumptionDao().save(
                    AlcoholConsumptionEntity(
                        id = consumption.id,
                        habitId = consumption.habitId,
                        localDate = consumption.localDate,
                        observedZoneId = consumption.observedZoneId,
                        standardDrinks = consumption.standardDrinks,
                        followUpDate = consumption.followUpDate,
                        // Une restauration remet les données en place sans déclencher une ancienne relance.
                        followUpNotified = consumption.followUpNotified || consumption.followUpDate != null,
                        observedAtEpochMs = consumption.observedAtEpochMs,
                    ),
                )
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
                        reasonLabel = p.reasonLabel,
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
                    showLabels = w.showLabels,
                    labelTextSizeSp = w.labelTextSizeSp,
                    labelOpacity = w.labelOpacity,
                    valueTextSizeSp = w.valueTextSizeSp,
                    valueOpacity = w.valueOpacity,
                    iconOpacity = w.iconOpacity,
                    iconSaturation = w.iconSaturation,
                    monochromeIcons = w.monochromeIcons,
                    groupMode = w.groupMode,
                    groupId = w.groupId?.takeIf(knownGroupIds::contains),
                    slotMode = w.slotMode,
                    slotAlignment = w.slotAlignment,
                )
                database.widgetConfigDao().saveWidgetConfiguration(entity, w.selectedHabitIds)
            }
        }
    }

    private fun validateBackupJournal(doc: BackupDocument): List<AbstinenceLogEntity> {
        val habits = doc.habits.associateBy { it.id }
        val ids = mutableSetOf<String>()
        val checkIns = mutableSetOf<Pair<String, LocalDate>>()
        val logs = doc.abstinenceLogs.map { raw ->
            require(ids.add(raw.id)) { "Duplicate journal ID" }
            val habit = requireNotNull(habits[raw.habitId]) { "Journal references a missing habit" }
            val log = AbstinenceLog(raw.id, raw.habitId, Instant.ofEpochMilli(raw.occurredAtEpochMs),
                LocalDate.parse(raw.localDate), ZoneId.of(raw.observedZoneId),
                AbstinenceLogKind.valueOf(raw.kind), raw.intensity, raw.note)
            // Old journal pages remain restorable after a profile change or stopping abstinence.
            validateLogDates(log, LocalDate.parse(habit.startsOn))
            if (log.kind == AbstinenceLogKind.CHECK_IN) {
                require(checkIns.add(log.habitId to log.localDate)) { "Duplicate daily check-in" }
            }
            toAbstinenceLogEntity(log)
        }
        require(logs.map { it.id }.distinct().size == logs.size) { "Conflicting journal identities" }
        return logs
    }

    private fun validateBackupV2(doc: BackupDocument) {
        val habitIds = doc.habits.map { it.id }.toSet()
        require(habitIds.size == doc.habits.size) { "Duplicate habit IDs in backup" }

        doc.habits.forEach { habit ->
            require(habit.id.isNotBlank()) { "Habit ID cannot be blank" }
            require(habit.goals.isNotEmpty()) { "Habit ${habit.id} must have at least one goal" }
            require(habit.schedules.isNotEmpty()) { "Habit ${habit.id} must have at least one schedule" }
            val startsOn = LocalDate.parse(habit.startsOn)
            val profile = AbstinenceProfile.valueOf(habit.abstinenceProfile)
            if (profile == AbstinenceProfile.ALCOHOL) {
                alcoholFollowUpTime(profile, habit.alcoholFollowUpTime)
            } else {
                require(habit.alcoholFollowUpTime == null) { "Only alcohol uses an alcohol follow-up time" }
            }
            val abstinenceStart = habit.abstinenceStartedAtEpochMs?.let(java.time.Instant::ofEpochMilli)
                ?.atZone(clock.zone)?.toLocalDate() ?: habit.abstinenceStartedOn?.let(LocalDate::parse)
            if (profile != AbstinenceProfile.NONE) {
                require(abstinenceStart != null && abstinenceStart >= startsOn) { "Abstinence requires an observation start" }
                val latestGoal = habit.goals.maxBy { LocalDate.parse(it.effectiveFrom) }
                val latestSchedule = habit.schedules.maxBy { LocalDate.parse(it.effectiveFrom) }
                require(latestGoal.direction == GoalDirection.AT_MOST.name && latestGoal.targetMinor == 0L &&
                    latestGoal.goalType == GoalType.COUNT.name && latestGoal.period == PeriodType.DAY.name &&
                    latestGoal.frequencyTarget == null && latestGoal.progressionStep == null && !habit.timerEnabled &&
                    latestSchedule.scheduleMode == ScheduleMode.EVERY_DAY.name) { "Invalid abstinence configuration" }
            }

            habit.goals.forEach { g ->
                require(g.habitId == habit.id) { "Goal habitId mismatch" }
                require(g.targetMinor > 0 || (g.targetMinor == 0L && g.direction != GoalDirection.AT_LEAST.name)) {
                    "Only a limit or tracker permits a zero target"
                }
                require(g.targetMinor != 0L || (g.progressionStep == null && g.frequencyTarget == null)) {
                    "Abstinence carries no progression or frequency"
                }
                g.minimumMinor?.let {
                    require(it > 0) { "Goal minimumMinor must be positive" }
                    require(it <= g.targetMinor) { "Goal minimumMinor cannot exceed the ideal" }
                }
                require(GoalDirection.entries.any { it.name == g.direction }) { "Goal direction is invalid" }
                if (g.direction == GoalDirection.AT_MOST.name) {
                    require(g.minimumMinor == null) { "A limit carries no minimum" }
                }
                if (g.direction == GoalDirection.TRACK_ONLY.name) {
                    require(g.targetMinor == 0L && g.period == PeriodType.DAY.name &&
                        g.goalType != GoalType.BINARY.name && g.minimumMinor == null) {
                        "A tracker needs a measurable daily entry and no goal"
                    }
                }
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
            require(doc.habits.first { it.id == e.habitId }.abstinenceProfile != AbstinenceProfile.ALCOHOL.name) {
                "Alcohol entries must use alcoholConsumptions"
            }
            require(e.valueMinor > 0) { "Entry valueMinor must be positive" }
            LocalDate.parse(e.localDate)
        }

        val alcoholIds = mutableSetOf<String>()
        val alcoholDays = mutableSetOf<Pair<String, String>>()
        doc.alcoholConsumptions.forEach { consumption ->
            require(alcoholIds.add(consumption.id) && consumption.id.isNotBlank()) { "Duplicate alcohol consumption ID" }
            require(consumption.habitId in habitIds) { "Alcohol consumption references missing habit" }
            require(doc.habits.first { it.id == consumption.habitId }.abstinenceProfile == AbstinenceProfile.ALCOHOL.name) {
                "Alcohol consumption requires the alcohol profile"
            }
            require(alcoholDays.add(consumption.habitId to consumption.localDate)) { "Duplicate alcohol consumption day" }
            val localDate = LocalDate.parse(consumption.localDate)
            val observedZone = ZoneId.of(consumption.observedZoneId)
            consumption.observedAtEpochMs?.let { raw ->
                val observedAt = Instant.ofEpochMilli(raw)
                require(observedAt <= clock.instant()) { "Alcohol consumption cannot be observed in the future" }
                require(observedAt.atZone(observedZone).toLocalDate() == localDate) {
                    "Alcohol consumption instant and date disagree"
                }
            }
            val standardDrinks = consumption.standardDrinks
            require(standardDrinks == null || standardDrinks > 0) { "Standard drinks must be positive" }
            consumption.followUpDate?.let { followUp ->
                require(LocalDate.parse(followUp) > localDate) { "Follow-up must be after consumption" }
            }
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
            require(w.labelTextSizeSp in 8..18) { "Widget label size is invalid" }
            require(w.valueTextSizeSp in 8..18) { "Widget value size is invalid" }
            require(w.labelOpacity in 0..100) { "Widget label opacity is invalid" }
            require(w.valueOpacity in 0..100) { "Widget value opacity is invalid" }
            require(w.iconOpacity in 0..100) { "Widget icon opacity is invalid" }
            require(w.iconSaturation in 0..100) { "Widget icon saturation is invalid" }
            require(w.slotMode in setOf("FLEXIBLE", "FIXED")) { "Widget slot mode is invalid" }
            require(w.slotAlignment in setOf("START", "CENTER", "END")) { "Widget slot alignment is invalid" }
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

    private fun migrateAlcoholEntriesToV3(document: BackupDocument): BackupDocument {
        val alcoholHabitIds = document.habits
            .filter { it.abstinenceProfile == AbstinenceProfile.ALCOHOL.name }
            .mapTo(mutableSetOf()) { it.id }
        val legacyAlcoholEntries = document.entries.filter { it.habitId in alcoholHabitIds }
        val consumptions = legacyAlcoholEntries
            .groupBy { it.habitId to it.localDate }
            .values
            .map { entries ->
                val selected = entries.minWith(compareBy<BackupEntryV2> { it.occurredAtEpochMs }.thenBy { it.id })
                BackupAlcoholConsumptionV3(
                    id = selected.id,
                    habitId = selected.habitId,
                    localDate = selected.localDate,
                    observedZoneId = selected.observedZoneId,
                )
            }
        return document.copy(
            formatVersion = 3,
            habits = document.habits.map { habit ->
                habit.copy(
                    alcoholFollowUpTime = alcoholFollowUpTime(
                        AbstinenceProfile.valueOf(habit.abstinenceProfile),
                        habit.alcoholFollowUpTime,
                    ),
                )
            },
            entries = document.entries.filterNot { it.habitId in alcoholHabitIds },
            alcoholConsumptions = consumptions,
        )
    }

    private fun alcoholFollowUpTime(profile: AbstinenceProfile, configured: String?): String? {
        if (profile != AbstinenceProfile.ALCOHOL) return null
        val value = configured ?: "09:00"
        LocalTime.parse(value)
        return value
    }

    /** Une progression n'existe que si son pas, sa cadence et son départ sont tous présents. */
    private fun toProgression(goal: HabitGoalEntity): GoalProgression? {
        val step = goal.progressionStep ?: return null
        val cadence = goal.progressionCadence?.let { raw ->
            ProgressionCadence.entries.firstOrNull { it.name == raw }
        } ?: return null
        val startsOn = goal.progressionStartsOn?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
            ?: return null
        return runCatching {
            GoalProgression(step, cadence, goal.progressionCapMinor, startsOn)
        }.getOrNull()
    }

    private fun mapToPersistedHabit(relation: HabitWithGoalAndSchedule, date: LocalDate): PersistedHabit? {
        val dateStr = date.toString()
        val maxGoalDate = relation.goals.filter { it.effectiveFrom <= dateStr }.maxOfOrNull { it.effectiveFrom } ?: return null
        val goalEntity = relation.goals.findLast { it.effectiveFrom == maxGoalDate } ?: return null
        val maxScheduleDate = relation.schedules.filter { it.effectiveFrom <= dateStr }.maxOfOrNull { it.effectiveFrom } ?: return null
        val scheduleEntity = relation.schedules.findLast { it.effectiveFrom == maxScheduleDate } ?: return null

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
            groupId = relation.habit.groupId,
            timerEnabled = relation.habit.timerEnabled,
            abstinenceProfile = AbstinenceProfile.valueOf(relation.habit.abstinenceProfile),
            abstinenceStartedAt = relation.habit.abstinenceStartedAtEpochMs?.let(java.time.Instant::ofEpochMilli)
                ?: relation.habit.abstinenceStartedOn?.let(LocalDate::parse)?.atStartOfDay(clock.zone)?.toInstant(),
            abstinenceSpendingMinor = relation.habit.abstinenceSpendingMinor,
            abstinenceSpendingPeriod = relation.habit.abstinenceSpendingPeriod?.let(SavingsPeriod::valueOf),
            abstinenceSavingsCurrency = relation.habit.abstinenceSavingsCurrency,
            alcoholFollowUpTime = relation.habit.alcoholFollowUpTime,
            goal = HabitGoal(
                targetMinor = goalEntity.targetMinor,
                minimumMinor = goalEntity.minimumMinor,
                direction = GoalDirection.valueOf(goalEntity.direction),
                progression = toProgression(goalEntity),
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
