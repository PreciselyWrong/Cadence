package ch.nicolab.cadence

import androidx.glance.appwidget.updateAll
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ch.nicolab.cadence.data.local.CadenceRepository
import ch.nicolab.cadence.data.local.entities.HabitQuickValueEntity
import ch.nicolab.cadence.data.local.entities.HabitReminderEntity
import ch.nicolab.cadence.data.local.model.IdentifiedPause
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.HabitEntry
import ch.nicolab.cadence.domain.HabitEntryCorrection
import ch.nicolab.cadence.domain.HabitEvaluation
import ch.nicolab.cadence.domain.HabitEvaluator
import ch.nicolab.cadence.domain.HabitGroup
import ch.nicolab.cadence.domain.HabitPause
import ch.nicolab.cadence.domain.HabitTimer
import ch.nicolab.cadence.domain.PauseReason
import ch.nicolab.cadence.domain.HabitInsights
import ch.nicolab.cadence.domain.HabitInsightsCalculator
import ch.nicolab.cadence.domain.InsightDay
import ch.nicolab.cadence.domain.PeriodType
import ch.nicolab.cadence.domain.HabitStreak
import ch.nicolab.cadence.domain.PeriodCalculator
import ch.nicolab.cadence.domain.StreakCalculator
import ch.nicolab.cadence.domain.isPlannedOn
import ch.nicolab.cadence.widget.CadenceWidget
import ch.nicolab.cadence.widget.WidgetRefreshDispatcher
import ch.nicolab.cadence.reminder.ReminderScheduler
import ch.nicolab.cadence.reminder.TimerNotifications
import java.time.Clock
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class HabitCardState(
    val stored: PersistedHabit,
    val evaluation: HabitEvaluation,
    val quickValues: List<Long>,
    val reminders: List<HabitReminderEntity>,
    val history: List<PeriodStat>,
    val entryCount: Int,
    val dailyHistory: List<DailyStat>,
    /** Tendances calculées sur la même fenêtre, absentes quand l'échantillon ne les porte pas. */
    val insights: HabitInsights,
    /** Saisies les plus récentes, de la plus récente à la plus ancienne, pour correction. */
    val recentEntries: List<HabitEntry>,
    /** Sauts et suspensions de l'habitude, avec leur identifiant pour les annuler. */
    val pauses: List<IdentifiedPause>,
    /** Périodes planifiées réussies d'affilée, et meilleure série passée. */
    val streak: HabitStreak,
) {
    /** Saut du jour encore annulable, s'il existe. */
    fun cancellableSkip(today: LocalDate): IdentifiedPause? =
        pauses.firstOrNull { it.pause.isCancellableOn(today) }

    /** Suspension en cours qu'une reprise anticipée peut écourter. */
    fun activePause(today: LocalDate): IdentifiedPause? =
        pauses.firstOrNull { !it.pause.isSingleDay && it.pause.includes(today) }
}

/** Profondeur d'historique proposée à la correction depuis Aujourd'hui et l'historique. */
private const val RECENT_ENTRIES = 60

data class PeriodStat(
    val label: String,
    val progressMinor: Long,
    val targetMinor: Long,
    val succeeded: Boolean,
    val excludedByPause: Boolean,
)

class MainViewModel(
    private val app: CadenceApp,
    private val repository: CadenceRepository,
    private val clock: Clock = Clock.systemDefaultZone(),
) : ViewModel() {
    private val evaluator = HabitEvaluator()
    private val cards = MutableStateFlow<List<HabitCardState>>(emptyList())
    val habits: StateFlow<List<HabitCardState>> = cards.stateIn(
        viewModelScope,
        SharingStarted.Eagerly,
        emptyList(),
    )
    val lastEntryId = MutableStateFlow<String?>(null)

    private var latest: List<PersistedHabit> = emptyList()
    private val widgetRefresh = WidgetRefreshDispatcher(app.applicationScope) {
        CadenceWidget().updateAll(app)
    }

    /** Groupes disponibles, garnis à la première ouverture avec les moments livrés. */
    val groups: StateFlow<List<HabitGroup>> = repository.observeGroups().stateIn(
        viewModelScope,
        SharingStarted.Eagerly,
        emptyList(),
    )

    init {
        viewModelScope.launch { repository.ensureDefaultGroups() }

        // Les saisies venues du widget écrivent directement en base : l'état affiché est
        // reconstruit à chaque révision des habitudes, des saisies ou des pauses, sans
        // dépendre d'une copie conservée en mémoire par l'application.
        viewModelScope.launch {
            combine(
                repository.observeHabits(),
                repository.observeEntryRevision(),
                repository.observePauseRevision(),
            ) { source, _, _ -> source }.collect { source ->
                latest = source
                rebuild(source)
            }
        }
    }

    fun addEntry(
        habit: HabitCardState,
        valueMinor: Long,
        source: String = "APP",
        sessionId: String? = null,
    ) = viewModelScope.launch {
        require(valueMinor > 0)
        val now = clock.instant()
        val zone = clock.zone
        val entryId = UUID.randomUUID().toString()
        repository.addEntry(
            HabitEntry(
                id = entryId,
                habitId = habit.stored.id,
                occurredAt = now,
                localDate = now.atZone(zone).toLocalDate(),
                observedZoneId = zone,
                valueMinor = valueMinor,
                sessionId = sessionId ?: entryId,
            ),
            source = source,
        )
        // La confirmation (et donc l'accès à « Annuler ») n'apparaît qu'une fois le
        // rafraîchissement du widget demandé.
        refreshAll()
        lastEntryId.value = entryId
    }

    fun undoLastEntry() = viewModelScope.launch {
        val id = lastEntryId.value ?: return@launch
        repository.deleteEntry(id)
        refreshAll()
        lastEntryId.value = null
    }

    fun saveHabit(
        habit: PersistedHabit,
        quickValues: List<Long>,
        reminderTimes: List<String>,
        conditionalReminders: Boolean,
        isNew: Boolean,
    ) = viewModelScope.launch {
        require(habit.name.isNotBlank())
        require(quickValues.all { it > 0 })
        if (isNew) repository.addHabit(habit) else repository.updateHabit(habit)
        repository.replaceQuickValues(habit.id, quickValues.distinct())
        repository.getReminders(habit.id).forEach { ReminderScheduler.cancel(app, it.id) }
        val reminders = reminderTimes.distinct().map { time ->
            HabitReminderEntity(
                id = UUID.randomUUID().toString(),
                habitId = habit.id,
                time = time,
                daysOfWeek = "",
                enabled = true,
                conditional = conditionalReminders,
            )
        }
        repository.replaceReminders(habit.id, reminders)
        reminders.forEach { ReminderScheduler.schedule(app, it) }
        refreshAll()
    }

    fun archiveHabit(habit: PersistedHabit, archived: Boolean) = viewModelScope.launch {
        repository.updateHabit(habit.copy(archived = archived), effectiveFrom = LocalDate.now(clock))
        refreshAll()
    }

    fun togglePause(habit: HabitCardState) = viewModelScope.launch {
        val today = LocalDate.now(clock)
        if (habit.evaluation.isPaused) repository.resumeHabit(habit.stored.id, today)
        else repository.pauseHabit(habit.stored.id, today)
        refreshAll()
    }

    /**
     * Saute la journée avec un motif. Le saut ne valide pas l'habitude et ne casse pas la
     * série : il reste une pause d'un jour, annulable tant que ce jour dure.
     */
    fun skipToday(
        habit: HabitCardState,
        reason: PauseReason = PauseReason.REST,
        label: String? = null,
    ) = viewModelScope.launch {
        val today = LocalDate.now(clock)
        repository.addPause(
            habit.stored.id,
            UUID.randomUUID().toString(),
            HabitPause.skip(today, reason, label),
        )
        refreshAll()
    }

    /**
     * Chronomètres en cours, réémis à chaque commande. Le temps affiché se dérive de cet
     * état et de l'horloge : rien n'a besoin d'être rattrapé après un redémarrage.
     */
    val timers: StateFlow<Map<String, HabitTimer>> = repository.observeTimers().stateIn(
        viewModelScope,
        SharingStarted.Eagerly,
        emptyMap(),
    )

    fun startTimer(habitId: String) = viewModelScope.launch {
        val existing = repository.getTimer(habitId)
        // Un second appui sur `Démarrer` ne repart pas de zéro : il reprend.
        val timer = existing?.resumedAt(clock.instant()) ?: HabitTimer.started(habitId, clock.instant())
        repository.saveTimer(timer)
        latest.firstOrNull { it.id == habitId }?.let { TimerNotifications.show(app, it, timer) }
        widgetRefresh.request()
    }

    fun pauseTimer(habitId: String) = viewModelScope.launch {
        val timer = repository.getTimer(habitId) ?: return@launch
        repository.saveTimer(timer.pausedAt(clock.instant()))
        TimerNotifications.cancel(app, habitId)
        widgetRefresh.request()
    }

    fun resetTimer(habitId: String) = viewModelScope.launch {
        repository.clearTimer(habitId)
        TimerNotifications.cancel(app, habitId)
        widgetRefresh.request()
    }

    /**
     * Termine la séance : une seule saisie de durée est enregistrée, puis le chronomètre
     * disparaît. Un chronomètre resté à zéro n'écrit rien.
     */
    fun finishTimer(habit: HabitCardState) = viewModelScope.launch {
        val timer = repository.getTimer(habit.stored.id) ?: return@launch
        val seconds = timer.elapsedSecondsAt(clock.instant())
        repository.clearTimer(habit.stored.id)
        TimerNotifications.cancel(app, habit.stored.id)
        if (seconds <= 0) {
            refreshAll()
            return@launch
        }
        addEntry(habit, seconds, source = "TIMER").join()
    }

    fun cancelSkip(pauseId: String) = viewModelScope.launch {
        repository.deletePause(pauseId)
        refreshAll()
    }

    /** Suspend plusieurs habitudes sur une plage inclusive, sélection par groupe comprise. */
    fun startTravel(habitIds: List<String>, from: LocalDate, toInclusive: LocalDate) = viewModelScope.launch {
        if (habitIds.isEmpty()) return@launch
        repository.startTravel(habitIds, from, toInclusive)
        refreshAll()
    }

    /** Reprise anticipée d'une suspension, à partir du jour choisi. */
    fun resumePause(pauseId: String, date: LocalDate = LocalDate.now(clock)) = viewModelScope.launch {
        repository.resumePause(pauseId, date)
        refreshAll()
    }

    fun moveHabit(habitId: String, direction: Int) = viewModelScope.launch {
        val ordered = latest.sortedBy(PersistedHabit::sortOrder)
        val index = ordered.indexOfFirst { it.id == habitId }
        val otherIndex = index + direction
        if (index !in ordered.indices || otherIndex !in ordered.indices) return@launch
        val current = ordered[index]
        val other = ordered[otherIndex]
        repository.updateSortOrder(current.id, other.sortOrder)
        repository.updateSortOrder(other.id, current.sortOrder)
        refreshAll()
    }

    fun duplicateHabit(habit: PersistedHabit) = viewModelScope.launch {
        val copy = habit.copy(
            id = UUID.randomUUID().toString(),
            name = "${habit.name} (copie)",
            archived = false,
            createdAtEpochMs = 0,
            updatedAtEpochMs = 0,
            sortOrder = latest.maxOfOrNull(PersistedHabit::sortOrder)?.plus(1) ?: 0,
        )
        repository.addHabit(copy)
        repository.replaceQuickValues(copy.id, repository.getQuickValues(habit.id).map(HabitQuickValueEntity::amountMinor))
        refreshAll()
    }

    fun deleteHabit(habitId: String) = viewModelScope.launch {
        repository.getReminders(habitId).forEach { ReminderScheduler.cancel(app, it.id) }
        repository.deleteHabit(habitId)
        refreshAll()
    }

    /**
     * Corrige une saisie déjà enregistrée. Progression, séries, statistiques et widget
     * se recalculent depuis les saisies, il n'y a donc rien d'autre à mettre à jour.
     */
    fun correctEntry(
        entry: HabitEntry,
        valueMinor: Long,
        localDate: LocalDate? = null,
        localTime: LocalTime? = null,
        note: String? = null,
    ) = viewModelScope.launch {
        val corrected = HabitEntryCorrection.apply(
            entry = entry,
            valueMinor = valueMinor,
            localDate = localDate,
            localTime = localTime,
            note = note,
        )
        repository.updateEntry(corrected)
        refreshAll()
    }

    fun deleteEntry(entryId: String) = viewModelScope.launch {
        repository.deleteEntry(entryId)
        if (lastEntryId.value == entryId) lastEntryId.value = null
        refreshAll()
    }

    fun saveGroup(group: HabitGroup) = viewModelScope.launch {
        repository.saveGroup(group)
        refreshAll()
    }

    fun addGroup(name: String, startMinute: Int?, endMinute: Int?) = viewModelScope.launch {
        val order = (groups.value.maxOfOrNull(HabitGroup::sortOrder) ?: 0) + 1
        repository.saveGroup(HabitGroup(UUID.randomUUID().toString(), name, startMinute, endMinute, order))
        refreshAll()
    }

    fun deleteGroup(groupId: String) = viewModelScope.launch {
        repository.deleteGroup(groupId)
        refreshAll()
    }

    fun exportBackup(onReady: (String) -> Unit) = viewModelScope.launch { onReady(repository.exportBackup()) }

    fun importBackup(content: String, onComplete: () -> Unit, onError: (String) -> Unit) = viewModelScope.launch {
        runCatching { repository.importBackup(content) }
            .onSuccess { repository.getAllReminders().forEach { ReminderScheduler.schedule(app, it) }; refreshAll(); onComplete() }
            .onFailure { onError(it.message ?: "Fichier de sauvegarde invalide") }
    }

    private suspend fun refreshAll() {
        rebuild(latest)
        widgetRefresh.request().join()
    }

    private suspend fun rebuild(source: List<PersistedHabit>) {
        val date = LocalDate.now(clock)
        cards.value = source.sortedBy(PersistedHabit::sortOrder).map { habit ->
            val window = PeriodCalculator.window(date, habit.goal.period, habit.schedule.firstDayOfWeek)
            val entries = repository.observeEntries(habit.id, window.start, window.endExclusive.minusDays(1)).first()
            val identifiedPauses = repository.observeIdentifiedPauses(habit.id).first()
            val pauses = identifiedPauses.map(IdentifiedPause::pause)
            val allEntries = repository.getEntries(habit.id)
            val versions = repository.habitVersionsOf(habit.id)
            val streak = StreakCalculator.compute(
                habitAt = { day -> versions(day)?.definition },
                today = date,
                entries = allEntries,
                pauses = pauses,
            )
            var cursor = date
            val history = buildList {
                repeat(6) {
                    val historicalHabit = repository.getHabitEffectiveAt(habit.id, cursor) ?: habit
                    val historicalWindow = PeriodCalculator.window(cursor, historicalHabit.goal.period, historicalHabit.schedule.firstDayOfWeek)
                    val evaluation = evaluator.evaluate(historicalHabit.definition, cursor, allEntries, pauses)
                    val paused = generateSequence(historicalWindow.start) { it.plusDays(1) }
                        .takeWhile { it < historicalWindow.endExclusive }
                        .any { day -> pauses.any { it.includes(day) } }
                    add(PeriodStat(historicalWindow.start.toString(), evaluation.progressMinor, historicalHabit.goal.targetMinor, evaluation.isCompleted, paused))
                    cursor = historicalWindow.start.minusDays(1)
                }
            }.reversed()
            val dailyStart = date.minusDays(83)
            val valuesByDate = allEntries.filter { it.localDate in dailyStart..date }
                .groupBy(HabitEntry::localDate)
                .mapValues { (_, dayEntries) -> dayEntries.sumOf(HabitEntry::valueMinor) }
            val dailyHistory = mutableListOf<DailyStat>()
            val insightDays = mutableListOf<InsightDay>()
            for (offset in 0 until 84) {
                val day = dailyStart.plusDays(offset.toLong())
                val historicalHabit = repository.getHabitEffectiveAt(habit.id, day) ?: habit
                val paused = pauses.any { it.includes(day) }
                dailyHistory.add(
                    DailyStat(
                        date = day,
                        valueMinor = valuesByDate[day] ?: 0,
                        targetMinor = historicalHabit.goal.targetMinor,
                        paused = paused,
                    ),
                )
                insightDays.add(
                    InsightDay(
                        date = day,
                        minimumMinor = historicalHabit.goal.effectiveMinimumMinor,
                        targetMinor = historicalHabit.goal.targetMinor,
                        planned = isPlannedOn(historicalHabit.definition, day),
                        paused = paused,
                        dailyGoal = historicalHabit.goal.period == PeriodType.DAY,
                    ),
                )
            }
            HabitCardState(
                stored = habit,
                evaluation = evaluator.evaluate(habit.definition, date, entries, pauses),
                quickValues = repository.getQuickValues(habit.id).map(HabitQuickValueEntity::amountMinor),
                reminders = repository.getReminders(habit.id),
                history = history,
                entryCount = allEntries.size,
                dailyHistory = dailyHistory,
                insights = HabitInsightsCalculator.of(allEntries, date, insightDays),
                recentEntries = allEntries.sortedByDescending(HabitEntry::occurredAt).take(RECENT_ENTRIES),
                pauses = identifiedPauses,
                streak = streak,
            )
        }
    }
}
