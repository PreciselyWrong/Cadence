package ch.nicolab.cadence

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ch.nicolab.cadence.data.local.CadenceRepository
import ch.nicolab.cadence.data.local.entities.HabitQuickValueEntity
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.HabitEntry
import ch.nicolab.cadence.domain.HabitEvaluation
import ch.nicolab.cadence.domain.HabitEvaluator
import ch.nicolab.cadence.domain.HabitGoal
import ch.nicolab.cadence.domain.HabitSchedule
import ch.nicolab.cadence.domain.PeriodCalculator
import ch.nicolab.cadence.domain.PeriodType
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class HabitCardState(val stored: PersistedHabit, val evaluation: HabitEvaluation, val quickValues: List<Long>)

class MainViewModel(private val repository: CadenceRepository) : ViewModel() {
    private val evaluator = HabitEvaluator()
    private val cards = MutableStateFlow<List<HabitCardState>>(emptyList())
    val habits: StateFlow<List<HabitCardState>> = cards.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    private var latest: List<PersistedHabit> = emptyList()
    init { viewModelScope.launch { repository.observeHabits().collect { source -> latest = source; rebuild(source) } } }

    fun addEntry(habit: HabitCardState, value: Long) = viewModelScope.launch {
        val now = Instant.now(); val zone = ZoneId.systemDefault()
        repository.addEntry(HabitEntry(UUID.randomUUID().toString(), habit.stored.id, now, now.atZone(zone).toLocalDate(), zone, value))
        rebuild(latest)
    }

    fun createHabit(name: String, type: String, target: Long, unit: String, period: PeriodType, quick: List<Long>) = viewModelScope.launch {
        val habit = PersistedHabit(UUID.randomUUID().toString(), name.trim(), true, HabitGoal(target, period), HabitSchedule(DayOfWeek.entries.toSet(), DayOfWeek.MONDAY))
        repository.addHabit(habit)
        quick.forEachIndexed { index, value -> repository.addQuickValue(habit.id, UUID.randomUUID().toString(), "+$value", value, index) }
    }

    fun exportBackup(onReady: (String) -> Unit) = viewModelScope.launch { onReady(repository.exportBackup()) }

    fun importBackup(content: String, onComplete: () -> Unit, onError: (String) -> Unit) = viewModelScope.launch {
        runCatching { repository.importBackup(content) }.onSuccess { onComplete() }.onFailure { onError(it.message ?: "Fichier de sauvegarde invalide") }
    }

    private suspend fun rebuild(source: List<PersistedHabit>) {
        val date = LocalDate.now()
        cards.value = source.map { habit ->
            val window = PeriodCalculator.window(date, habit.goal.period, habit.schedule.firstDayOfWeek)
            val entries = repository.observeEntries(habit.id, window.start, window.endExclusive.minusDays(1)).first()
            val pauses = repository.observePauses(habit.id).first()
            HabitCardState(habit, evaluator.evaluate(habit.definition, date, entries, pauses), repository.getQuickValues(habit.id).map(HabitQuickValueEntity::amountMinor))
        }
    }

}
