package ch.nicolab.cadence.agenda

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import ch.nicolab.cadence.calendar.CalendarGraph
import ch.nicolab.cadence.calendar.CalendarRepository
import ch.nicolab.cadence.calendar.CalendarSurface
import ch.nicolab.cadence.calendar.CalendarWithDisplay
import ch.nicolab.cadence.calendar.EventInstanceKey
import ch.nicolab.cadence.calendar.TimeRange
import ch.nicolab.cadence.calendar.ofDays
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.TaskRepository
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** Vues de l'agenda, dans l'ordre du sélecteur segmenté. */
enum class AgendaMode { DAY, THREE_DAYS, MONTH, LIST }

/**
 * Réglages d'affichage, persistés dans `cadence_agenda`. Les valeurs par défaut suivent la maquette :
 * tâches à leur heure, terminées masquées, week-ends visibles, numéros de semaine cachés.
 */
data class AgendaOptions(
    val timedTasks: Boolean = true,
    val showDone: Boolean = false,
    val weekends: Boolean = true,
    val weekNumbers: Boolean = false,
)

/** Jours chargés pour une vue : [first] puis [days] jours consécutifs. */
internal data class AgendaWindow(val first: LocalDate, val days: Int)

internal data class AgendaUiState(
    val mode: AgendaMode = AgendaMode.DAY,
    val selected: LocalDate,
    val today: LocalDate,
    val entries: List<AgendaEntry> = emptyList(),
    val options: AgendaOptions = AgendaOptions(),
    val permissionMissing: Boolean = false,
    val checkEvents: Boolean = false,
)

private const val PREFS = "cadence_agenda"
private const val KEY_TIMED_TASKS = "timed_tasks"
private const val KEY_SHOW_DONE = "show_done"
private const val KEY_WEEKENDS = "weekends"
private const val KEY_WEEK_NUMBERS = "week_numbers"

/** La liste couvre le mois qui vient, à partir d'aujourd'hui. */
internal const val AGENDA_LIST_DAYS = 30

/**
 * Agenda : combine les événements de l'appareil et les tâches datées pour la plage visible.
 * Les habitudes ne figurent pas dans cette passe.
 */
internal class AgendaViewModel(application: Application) : AndroidViewModel(application) {
    private val calendar: CalendarRepository = CalendarGraph.repository(application)
    private val tasks: TaskRepository = TasksGraph.repository(application)
    private val prefs = application.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val zone: ZoneId = ZoneId.systemDefault()

    private val _mode = MutableStateFlow(AgendaMode.DAY)
    private val _selected = MutableStateFlow(LocalDate.now(zone))
    private val _options = MutableStateFlow(readOptions())

    val calendars: StateFlow<List<CalendarWithDisplay>> = calendar.calendars()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

    private val window: Flow<AgendaWindow> = combine(_mode, _selected) { mode, selected ->
        windowFor(mode, selected, LocalDate.now(zone))
    }.distinctUntilChanged()

    @OptIn(ExperimentalCoroutinesApi::class)
    private val entries: Flow<List<AgendaEntry>> = combine(window, _options) { w, options -> w to options }
        .flatMapLatest { (w, options) ->
            combine(
                calendar.events(TimeRange.ofDays(w.first, w.days, zone), CalendarSurface.AGENDA),
                tasks.observeTasks(),
                tasks.observeProjects(),
            ) { events, allTasks, projects ->
                val colors = projects.associate { it.uid to parseProjectColor(it.color) }
                val dated = allTasks
                    .mapNotNull { task -> agendaTask(task, colors[task.projectUid], zone) }
                    .filter { it.start.toLocalDate() in w.first..w.first.plusDays(w.days.toLong() - 1) }
                    .filter { options.showDone || !it.done }
                    .map { if (!options.timedTasks && !it.allDay) it.withoutTime() else it }
                events.map { agendaEvent(it, zone) } + dated
            }
        }

    val state: StateFlow<AgendaUiState> = combine(_mode, _selected, entries, _options) { mode, selected, all, options ->
        AgendaUiState(
            mode = mode,
            selected = selected,
            today = LocalDate.now(zone),
            entries = all,
            options = options,
        )
    }.combine(calendar.permissionMissing) { ui, missing -> ui.copy(permissionMissing = missing) }
        .combine(calendar.globalSettings) { ui, settings -> ui.copy(checkEvents = settings.checkEvents) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), AgendaUiState(selected = LocalDate.now(zone), today = LocalDate.now(zone)))

    fun selectMode(mode: AgendaMode) {
        _mode.value = mode
    }

    fun select(day: LocalDate) {
        _selected.value = day
    }

    fun goToToday() {
        _selected.value = LocalDate.now(zone)
    }

    /** Balayage horizontal de la vue : un jour, trois jours ou un mois selon la vue ; la liste ne bouge pas. */
    fun swipe(direction: Int) {
        _selected.value = when (_mode.value) {
            AgendaMode.DAY -> _selected.value.plusDays(direction.toLong())
            AgendaMode.THREE_DAYS -> _selected.value.plusDays(3L * direction)
            AgendaMode.MONTH -> _selected.value.plusMonths(direction.toLong())
            AgendaMode.LIST -> _selected.value
        }
    }

    /** Balayage de la bande des jours : une semaine à la fois. */
    fun swipeWeek(direction: Int) {
        _selected.value = _selected.value.plusWeeks(direction.toLong())
    }

    fun updateOptions(transform: (AgendaOptions) -> AgendaOptions) {
        val next = transform(_options.value)
        _options.value = next
        prefs.edit()
            .putBoolean(KEY_TIMED_TASKS, next.timedTasks)
            .putBoolean(KEY_SHOW_DONE, next.showDone)
            .putBoolean(KEY_WEEKENDS, next.weekends)
            .putBoolean(KEY_WEEK_NUMBERS, next.weekNumbers)
            .apply()
    }

    fun setCalendarShown(item: CalendarWithDisplay, shown: Boolean) = viewModelScope.launch {
        calendar.setDisplay(item.calendar.id, item.display.copy(agenda = shown))
    }

    fun toggleEvent(key: EventInstanceKey) = viewModelScope.launch {
        calendar.toggleDone(key)
    }

    fun refreshCalendar() = calendar.refresh()

    private fun readOptions(): AgendaOptions = AgendaOptions(
        timedTasks = prefs.getBoolean(KEY_TIMED_TASKS, true),
        showDone = prefs.getBoolean(KEY_SHOW_DONE, false),
        weekends = prefs.getBoolean(KEY_WEEKENDS, true),
        weekNumbers = prefs.getBoolean(KEY_WEEK_NUMBERS, false),
    )

    private companion object {
        const val STOP_TIMEOUT_MS = 5_000L
    }
}

/** Plage à charger pour [mode] : la semaine entière pour la bande, la grille complète pour le mois. */
internal fun windowFor(mode: AgendaMode, selected: LocalDate, today: LocalDate): AgendaWindow = when (mode) {
    AgendaMode.DAY -> AgendaWindow(weekDays(selected).first(), 7)
    AgendaMode.THREE_DAYS -> AgendaWindow(selected, 3)
    AgendaMode.MONTH -> monthGrid(YearMonth.from(selected)).let { AgendaWindow(it.first(), it.size) }
    AgendaMode.LIST -> AgendaWindow(today, AGENDA_LIST_DAYS)
}
