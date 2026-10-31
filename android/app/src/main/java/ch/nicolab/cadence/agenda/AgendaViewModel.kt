package ch.nicolab.cadence.agenda

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import ch.nicolab.cadence.CadenceApp
import ch.nicolab.cadence.calendar.CalendarGraph
import ch.nicolab.cadence.calendar.CalendarRepository
import ch.nicolab.cadence.calendar.CalendarSurface
import ch.nicolab.cadence.calendar.CalendarWithDisplay
import ch.nicolab.cadence.calendar.EventInstanceKey
import ch.nicolab.cadence.calendar.HiddenEvent
import ch.nicolab.cadence.calendar.TimeRange
import ch.nicolab.cadence.calendar.isUsed
import ch.nicolab.cadence.calendar.ofDays
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.TaskRepository
import ch.nicolab.cadence.tasks.model.TaskChange
import java.time.LocalDateTime
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onStart
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** Vues de l'agenda, dans l'ordre du sélecteur segmenté. */
enum class AgendaMode { DAY, THREE_DAYS, MONTH, LIST }

/**
 * Réglages d'affichage, persistés dans `cadence_agenda`. Les valeurs par défaut suivent la maquette :
 * tâches à leur heure, habitudes prévues, terminées masquées, week-ends visibles, numéros de semaine cachés.
 */
data class AgendaOptions(
    val timedTasks: Boolean = true,
    val habits: Boolean = true,
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
    /** Tâches sans date ou en retard, proposées dans le bac « À planifier » de la vue Jour. */
    val tray: List<TrayItem> = emptyList(),
    val options: AgendaOptions = AgendaOptions(),
    val permissionMissing: Boolean = false,
    val checkEvents: Boolean = false,
)

/** Planification faite par un dépôt : de quoi la défaire (« Annuler ») en rendant à la tâche son échéance d'avant. */
internal data class ScheduleReceipt(val uid: String, val at: LocalDateTime, val restore: TaskChange)

private const val PREFS = "cadence_agenda"
private const val KEY_TIMED_TASKS = "timed_tasks"
private const val KEY_HABITS = "habits"
private const val KEY_SHOW_DONE = "show_done"
private const val KEY_WEEKENDS = "weekends"
private const val KEY_WEEK_NUMBERS = "week_numbers"

/** La liste couvre le mois qui vient, à partir d'aujourd'hui. */
internal const val AGENDA_LIST_DAYS = 30

/**
 * Agenda : combine les événements de l'appareil, les tâches datées et les habitudes prévues
 * pour la plage visible, plus le bac des tâches à planifier.
 */
internal class AgendaViewModel(application: Application) : AndroidViewModel(application) {
    private val calendar: CalendarRepository = CalendarGraph.repository(application)
    private val tasks: TaskRepository = TasksGraph.repository(application)
    private val habitRepository = (application as CadenceApp).repository
    private val prefs = application.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val zone: ZoneId = ZoneId.systemDefault()

    private val _mode = MutableStateFlow(AgendaMode.DAY)
    private val _selected = MutableStateFlow(LocalDate.now(zone))
    private val _options = MutableStateFlow(readOptions())

    val calendars: StateFlow<List<CalendarWithDisplay>> = calendar.calendars()
        .map { items -> items.filter { it.display.isUsed(it.calendar) } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

    private val window: Flow<AgendaWindow> = combine(_mode, _selected) { mode, selected ->
        windowFor(mode, selected)
    }.distinctUntilChanged()

    @OptIn(ExperimentalCoroutinesApi::class)
    private val entries: Flow<List<AgendaEntry>> = combine(window, _options) { w, options -> w to options }
        .flatMapLatest { (w, options) ->
            combine(
                calendar.events(TimeRange.ofDays(w.first, w.days, zone), CalendarSurface.AGENDA),
                tasks.observeTasks(),
                tasks.observeProjects(),
                habitEntries(w, options.habits),
            ) { events, allTasks, projects, habits ->
                val colors = projects.associate { it.uid to parseProjectColor(it.color) }
                val dated = allTasks
                    .mapNotNull { task -> agendaTask(task, colors[task.projectUid], zone) }
                    .filter { it.start.toLocalDate() in w.first..w.first.plusDays(w.days.toLong() - 1) }
                    .filter { options.showDone || !it.done }
                    .map { if (!options.timedTasks && !it.allDay) it.withoutTime() else it }
                events.map { agendaEvent(it, zone) } + dated + habits.filter { options.showDone || !it.done }
            }
        }

    private val tray: Flow<List<TrayItem>> = combine(tasks.observeTasks(), tasks.observeProjects()) { allTasks, projects ->
        val colors = projects.associate { it.uid to parseProjectColor(it.color) }
        trayItems(allTasks, colors, LocalDate.now(zone))
    }

    val state: StateFlow<AgendaUiState> = combine(_mode, _selected, entries, _options) { mode, selected, all, options ->
        AgendaUiState(
            mode = mode,
            selected = selected,
            today = LocalDate.now(zone),
            entries = all,
            options = options,
        )
    }.combine(tray) { ui, items -> ui.copy(tray = items) }.combine(calendar.permissionMissing) { ui, missing -> ui.copy(permissionMissing = missing) }
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

    /** Précédent (-1) ou suivant (1) : flèches de l'en-tête et balayage horizontal de la vue. */
    fun swipe(direction: Int) {
        _selected.value = stepDate(_mode.value, _selected.value, direction, _options.value.weekends)
    }

    private val _scheduled = MutableSharedFlow<ScheduleReceipt>(extraBufferCapacity = 4)

    /** Planifications faites à l'instant, pour proposer « Annuler ». */
    val scheduled: SharedFlow<ScheduleReceipt> = _scheduled.asSharedFlow()

    private val _completed = MutableSharedFlow<String>(extraBufferCapacity = 4)

    /** Tâches terminées à l'instant ; une récurrente avance d'occurrence et n'en fait pas partie. */
    val completed: SharedFlow<String> = _completed.asSharedFlow()

    /** Dépôt d'une tâche sur la grille : date et heure passent par la mise à jour normale, donc synchronisée. */
    fun schedule(uid: String, at: LocalDateTime) = viewModelScope.launch {
        val before = tasks.observeTask(uid).first()
        tasks.updateTask(uid, dropChange(at))
        before?.let { _scheduled.tryEmit(ScheduleReceipt(uid, at, restoreSchedule(it, zone))) }
    }

    fun undoSchedule(receipt: ScheduleReceipt) = viewModelScope.launch {
        tasks.updateTask(receipt.uid, receipt.restore)
    }

    /** Bord bas d'un bloc tiré : la durée est l'estimation de la tâche, écrite comme un champ synchronisé ordinaire. */
    fun resizeTask(uid: String, minutes: Int) = viewModelScope.launch {
        tasks.updateTask(uid, TaskChange(estimatedMinutes = minutes))
    }

    fun toggleTask(task: AgendaEntry.Task) = viewModelScope.launch {
        if (task.done) {
            tasks.reopenTask(task.uid)
        } else {
            tasks.completeTask(task.uid)
            if (!task.recurring) _completed.tryEmit(task.uid)
        }
    }

    fun undoComplete(uid: String) = viewModelScope.launch { tasks.reopenTask(uid) }

    /** Balayage de la bande des jours : une semaine à la fois. */
    fun swipeWeek(direction: Int) {
        _selected.value = _selected.value.plusWeeks(direction.toLong())
    }

    fun updateOptions(transform: (AgendaOptions) -> AgendaOptions) {
        val next = transform(_options.value)
        _options.value = next
        prefs.edit()
            .putBoolean(KEY_TIMED_TASKS, next.timedTasks)
            .putBoolean(KEY_HABITS, next.habits)
            .putBoolean(KEY_SHOW_DONE, next.showDone)
            .putBoolean(KEY_WEEKENDS, next.weekends)
            .putBoolean(KEY_WEEK_NUMBERS, next.weekNumbers)
            .apply()
    }

    fun setCalendarShown(item: CalendarWithDisplay, shown: Boolean) = viewModelScope.launch {
        calendar.setDisplay(item.calendar.id, item.display.copy(agenda = shown))
    }

    fun setCalendarTasks(item: CalendarWithDisplay, shown: Boolean) = viewModelScope.launch {
        calendar.setDisplay(item.calendar.id, item.display.copy(tasks = shown))
    }

    fun toggleEvent(key: EventInstanceKey) = viewModelScope.launch {
        calendar.toggleDone(key)
    }

    private val _hidden = MutableSharedFlow<HiddenEvent>(extraBufferCapacity = 4)

    /** Occurrences masquées à l'instant, pour proposer « Annuler ». */
    val hidden: SharedFlow<HiddenEvent> = _hidden.asSharedFlow()

    /** Masque l'occurrence dans Cadence seulement : le fournisseur d'agendas n'est jamais modifié. */
    fun hideEvent(event: HiddenEvent) = viewModelScope.launch {
        calendar.hideEvent(event)
        _hidden.tryEmit(event)
    }

    fun restoreEvent(key: EventInstanceKey) = viewModelScope.launch { calendar.restoreEvent(key) }

    fun refreshCalendar() = calendar.refresh()

    private fun readOptions(): AgendaOptions = AgendaOptions(
        timedTasks = prefs.getBoolean(KEY_TIMED_TASKS, true),
        habits = prefs.getBoolean(KEY_HABITS, true),
        showDone = prefs.getBoolean(KEY_SHOW_DONE, false),
        weekends = prefs.getBoolean(KEY_WEEKENDS, true),
        weekNumbers = prefs.getBoolean(KEY_WEEK_NUMBERS, false),
    )

    /** Habitudes prévues sur la plage, relues à chaque écriture de la base des habitudes. */
    private fun habitEntries(w: AgendaWindow, enabled: Boolean): Flow<List<AgendaEntry>> {
        if (!enabled) return flowOf(emptyList())
        return habitRepository.observeWidgetRevisions().onStart { emit(0) }.map { loadHabitEntries(w) }
    }

    private suspend fun loadHabitEntries(w: AgendaWindow): List<AgendaEntry> {
        val days = List(w.days) { w.first.plusDays(it.toLong()) }
        val habits = habitRepository.getHabitsEffectiveAt(LocalDate.now(zone)).filter { it.isAgendaScheduled() }
        val pauses = habits.associate { it.id to habitRepository.getPauses(it.id) }
        val done = habits.associate { habit ->
            habit.id to habitRepository.getEntries(habit.id, days.first(), days.last())
                .filter { it.valueMinor > 0 }
                .map { it.localDate }
                .toSet()
        }
        return habitAgendaEntries(habits, habitRepository.getGroups(), pauses, done, days)
    }

    private companion object {
        const val STOP_TIMEOUT_MS = 5_000L
    }
}

/** Plage à charger pour [mode] : la semaine entière pour la bande, la grille complète pour le mois, la liste à partir du jour choisi. */
internal fun windowFor(mode: AgendaMode, selected: LocalDate): AgendaWindow = when (mode) {
    AgendaMode.DAY -> AgendaWindow(weekDays(selected).first(), 7)
    AgendaMode.THREE_DAYS -> AgendaWindow(selected, 5) // cinq jours : trois jours visibles même sans les week-ends
    AgendaMode.MONTH -> monthGrid(YearMonth.from(selected)).let { AgendaWindow(it.first(), it.size) }
    AgendaMode.LIST -> AgendaWindow(selected, AGENDA_LIST_DAYS)
}
