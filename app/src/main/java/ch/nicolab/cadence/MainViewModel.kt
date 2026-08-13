package ch.nicolab.cadence

import androidx.glance.appwidget.updateAll
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ch.nicolab.cadence.data.local.CadenceRepository
import ch.nicolab.cadence.data.local.entities.HabitQuickValueEntity
import ch.nicolab.cadence.data.local.entities.HabitReminderEntity
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.HabitEntry
import ch.nicolab.cadence.domain.HabitEvaluation
import ch.nicolab.cadence.domain.HabitEvaluator
import ch.nicolab.cadence.domain.PeriodCalculator
import ch.nicolab.cadence.widget.CadenceWidget
import ch.nicolab.cadence.reminder.ReminderScheduler
import java.time.Clock
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
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
)

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

    init {
        viewModelScope.launch {
            repository.observeHabits().collect { source ->
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
        lastEntryId.value = entryId
        refreshAll()
    }

    fun undoLastEntry() = viewModelScope.launch {
        val id = lastEntryId.value ?: return@launch
        repository.deleteEntry(id)
        lastEntryId.value = null
        refreshAll()
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

    fun exportBackup(onReady: (String) -> Unit) = viewModelScope.launch { onReady(repository.exportBackup()) }

    fun importBackup(content: String, onComplete: () -> Unit, onError: (String) -> Unit) = viewModelScope.launch {
        runCatching { repository.importBackup(content) }
            .onSuccess { repository.getAllReminders().forEach { ReminderScheduler.schedule(app, it) }; refreshAll(); onComplete() }
            .onFailure { onError(it.message ?: "Fichier de sauvegarde invalide") }
    }

    private suspend fun refreshAll() {
        rebuild(latest)
        CadenceWidget().updateAll(app)
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
            HabitCardState(
                stored = habit,
                evaluation = evaluator.evaluate(habit.definition, date, entries, pauses),
                quickValues = repository.getQuickValues(habit.id).map(HabitQuickValueEntity::amountMinor),
                reminders = repository.getReminders(habit.id),
                history = history,
                entryCount = allEntries.size,
            )
        }
    }
}
