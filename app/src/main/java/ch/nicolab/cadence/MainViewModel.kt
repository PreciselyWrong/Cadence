package ch.nicolab.cadence

import androidx.glance.appwidget.updateAll
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ch.nicolab.cadence.data.local.CadenceRepository
import ch.nicolab.cadence.data.local.entities.HabitQuickValueEntity
import ch.nicolab.cadence.data.local.entities.HabitReminderEntity
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.HabitEntry
import ch.nicolab.cadence.domain.HabitEntryCorrection
import ch.nicolab.cadence.domain.HabitEvaluation
import ch.nicolab.cadence.domain.HabitEvaluator
import ch.nicolab.cadence.domain.HabitGroup
import ch.nicolab.cadence.domain.PeriodCalculator
import ch.nicolab.cadence.widget.CadenceWidget
import ch.nicolab.cadence.widget.WidgetRefreshDispatcher
import ch.nicolab.cadence.reminder.ReminderScheduler
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
    /** Saisies les plus récentes, de la plus récente à la plus ancienne, pour correction. */
    val recentEntries: List<HabitEntry>,
)

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

    fun skipToday(habit: HabitCardState) = viewModelScope.launch {
        val today = LocalDate.now(clock)
        repository.addPause(
            habit.stored.id,
            UUID.randomUUID().toString(),
            ch.nicolab.cadence.domain.HabitPause(today, today.plusDays(1)),
            reason = "SKIPPED_TODAY",
        )
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
            val pauses = repository.observePauses(habit.id).first()
            val allEntries = repository.getEntries(habit.id)
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
            val dailyHistory = buildList {
                for (offset in 0 until 84) {
                val day = dailyStart.plusDays(offset.toLong())
                val historicalHabit = repository.getHabitEffectiveAt(habit.id, day) ?: habit
                add(DailyStat(
                    date = day,
                    valueMinor = valuesByDate[day] ?: 0,
                    targetMinor = historicalHabit.goal.targetMinor,
                    paused = pauses.any { it.includes(day) },
                ))
                }
            }
            HabitCardState(
                stored = habit,
                evaluation = evaluator.evaluate(habit.definition, date, entries, pauses),
                quickValues = repository.getQuickValues(habit.id).map(HabitQuickValueEntity::amountMinor),
                reminders = repository.getReminders(habit.id),
                history = history,
                entryCount = allEntries.size,
                dailyHistory = dailyHistory,
                recentEntries = allEntries.sortedByDescending(HabitEntry::occurredAt).take(RECENT_ENTRIES),
            )
        }
    }
}
