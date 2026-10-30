package ch.nicolab.cadence.tasks.ui

import android.app.Application
import android.content.Context
import androidx.core.content.edit
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import ch.nicolab.cadence.calendar.CalendarGlobalSettings
import ch.nicolab.cadence.calendar.CalendarGraph
import ch.nicolab.cadence.calendar.CalendarRepository
import ch.nicolab.cadence.calendar.CalendarSurface
import ch.nicolab.cadence.calendar.EventInstanceKey
import ch.nicolab.cadence.calendar.EventWithDone
import ch.nicolab.cadence.calendar.TimeRange
import ch.nicolab.cadence.calendar.ofDays
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.model.InboxEntry
import ch.nicolab.cadence.tasks.model.NoteItem
import ch.nicolab.cadence.tasks.model.ProjectItem
import ch.nicolab.cadence.tasks.model.RecurringScope
import ch.nicolab.cadence.tasks.model.SyncStatus
import ch.nicolab.cadence.tasks.model.TagItem
import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskDraft
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskViews
import ch.nicolab.cadence.tasks.swipe.SchedulePreset
import ch.nicolab.cadence.tasks.swipe.SwipeAction
import ch.nicolab.cadence.tasks.swipe.UndoChanges
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

private const val STOP_TIMEOUT_MS = 5_000L

/** Délai avant qu'une suppression devienne définitive ; couvre la durée du bandeau « Annuler ». */
private const val DELETE_UNDO_WINDOW_MS = 5_000L

/** Durée où une ligne cochée reste visible et barrée avant de disparaître. */
private const val COMPLETE_HOLD_MS = 600L
private const val CALENDAR_PREFS = "tududi_calendar_notice"
private const val KEY_NOTICE_DISMISSED = "dismissed"

/** Date et instant courants ; rafraîchis chaque minute, ce qui couvre aussi minuit. */
internal data class Moment(val today: LocalDate, val now: Instant, val zone: ZoneId) {
    companion object {
        fun current(): Moment {
            val zoned = ZonedDateTime.now()
            return Moment(zoned.toLocalDate(), zoned.toInstant(), zoned.zone)
        }
    }
}

internal data class TodayState(
    val overdue: List<TaskItem> = emptyList(),
    val today: List<TaskItem> = emptyList(),
    val completed: List<TaskItem> = emptyList(),
)

internal data class ProjectRow(val project: ProjectItem, val openCount: Int)

/** Déplacement d'une tâche récurrente en attente du choix de portée. */
internal data class PendingMove(val taskUid: String, val date: LocalDate)

/** Bandeau avec « Annuler » pour un geste qui déplace ou supprime une tâche. */
internal class UndoNotice(val message: String, val undo: () -> Unit)

/** Feuille ouverte par un balayage ; porte la tâche visée. */
internal sealed interface SwipeSheet {
    val task: TaskItem

    data class Menu(override val task: TaskItem) : SwipeSheet
    data class Schedule(override val task: TaskItem) : SwipeSheet
    data class Project(override val task: TaskItem) : SwipeSheet
    data class Priority(override val task: TaskItem) : SwipeSheet
}

internal class TasksViewModel(
    application: Application,
    private val calendar: CalendarRepository,
) : AndroidViewModel(application) {
    constructor(application: Application) : this(application, CalendarGraph.repository(application))

    private val repository = TasksGraph.repository(application)
    private val calendarPrefs = application.getSharedPreferences(CALENDAR_PREFS, Context.MODE_PRIVATE)
    private val genericError = application.getString(R.string.tasks_error_generic)
    /** Tâches supprimées par geste, masquées le temps de pouvoir annuler. */
    private val hiddenUids = MutableStateFlow<Set<String>>(emptySet())
    private val pendingDeletes = HashMap<String, Job>()
    private val tasks: Flow<List<TaskItem>> =
        combine(repository.observeTasks(), hiddenUids) { all, hidden -> all.withoutHidden(hidden) }

    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 8)
    val messages: Flow<String> = _messages.asSharedFlow()

    private val _completed = MutableSharedFlow<TaskItem>(extraBufferCapacity = 4)

    /** Tâches terminées à l'instant, pour proposer « Annuler » ; une récurrente avance d'occurrence et n'en fait pas partie. */
    val completed: Flow<TaskItem> = _completed.asSharedFlow()

    private val _notices = MutableSharedFlow<UndoNotice>(extraBufferCapacity = 4)
    val notices: Flow<UndoNotice> = _notices.asSharedFlow()

    private val _sheet = MutableStateFlow<SwipeSheet?>(null)
    val sheet: StateFlow<SwipeSheet?> = _sheet.asStateFlow()

    private val _pendingDelete = MutableStateFlow<TaskItem?>(null)

    /** Suppression d'une tâche récurrente en attente du choix « cette occurrence / toute la série ». */
    val pendingDelete: StateFlow<TaskItem?> = _pendingDelete.asStateFlow()

    private val _pendingMove = MutableStateFlow<PendingMove?>(null)
    val pendingMove: StateFlow<PendingMove?> = _pendingMove.asStateFlow()

    val moment: StateFlow<Moment> = minuteTicks().stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), Moment.current(),
    )

    val today: StateFlow<TodayState> = combine(tasks, moment) { all, m -> todayState(all, m) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), TodayState())

    /** Événements de l'agenda pour le jour courant ; le flux ne se relance qu'au changement de jour ou de fuseau. */
    @OptIn(ExperimentalCoroutinesApi::class)
    val todayEvents: StateFlow<List<EventWithDone>> = moment
        .map { it.today to it.zone }
        .distinctUntilChanged()
        .flatMapLatest { (day, zone) -> calendar.events(TimeRange.ofDays(day, 1, zone), CalendarSurface.TASKS) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

    val calendarSettings: StateFlow<CalendarGlobalSettings> = calendar.globalSettings
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), CalendarGlobalSettings())

    private val calendarNoticeDismissed = MutableStateFlow(calendarPrefs.getBoolean(KEY_NOTICE_DISMISSED, false))

    /** Carte « Afficher vos agendas » : tant que la permission manque et que l'utilisateur ne l'a pas masquée. */
    val calendarNoticeVisible: StateFlow<Boolean> = combine(calendar.permissionMissing, calendarNoticeDismissed) { missing, dismissed ->
        missing && !dismissed
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), false)

    val upcoming: StateFlow<Map<LocalDate, List<TaskItem>>> = combine(tasks, moment) { all, m ->
        TaskViews.upcoming(all, m.today, m.now)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyMap())

    /** Tâches sans échéance ni projet : sans cette liste, elles n'apparaîtraient dans aucun onglet. */
    val unsorted: StateFlow<List<TaskItem>> = combine(tasks, moment) { all, m ->
        TaskViews.unsorted(all, m.now)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

    val projects: StateFlow<List<ProjectItem>> = repository.observeProjects()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

    val projectRows: StateFlow<List<ProjectRow>> = combine(projects, tasks) { ps, all ->
        ps.map { p -> ProjectRow(p, all.count { it.projectUid == p.uid && !it.isClosed }) }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

    val tags: StateFlow<List<TagItem>> = repository.observeTags()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

    val inbox: StateFlow<List<InboxEntry>> = repository.observeInbox()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

    val notes: StateFlow<List<NoteItem>> = repository.observeNotes()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

    /** Chaque tâche, sous-tâches comprises ; ne sert qu'à la recherche. */
    val everyTask: StateFlow<List<TaskItem>> = combine(repository.observeAllTasks(), hiddenUids) { all, hidden -> all.withoutHidden(hidden) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

    val syncStatus: StateFlow<SyncStatus> = repository.observeSyncStatus()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), SyncStatus.Idle(null, 0))

    fun observeTask(uid: String): Flow<TaskItem?> = repository.observeTask(uid)

    fun observeNote(uid: String): Flow<NoteItem?> = repository.observeNote(uid)

    fun observeSubtasks(parentUid: String): Flow<List<TaskItem>> = repository.observeSubtasks(parentUid)

    fun addSubtask(parentUid: String, name: String) =
        launchAction { repository.createTask(TaskDraft(name = name, parentTaskUid = parentUid)) }

    fun observeProjectTasks(projectUid: String): Flow<List<TaskItem>> =
        combine(tasks, moment) { all, m -> TaskViews.ofProject(all, projectUid, m.now) }

    /** [hold] laisse la ligne cochée et barrée un instant avant que la tâche quitte la liste. */
    fun toggle(task: TaskItem, hold: Boolean = false) = launchAction {
        if (task.isClosed) {
            repository.reopenTask(task.uid)
        } else {
            if (hold) delay(COMPLETE_HOLD_MS)
            repository.completeTask(task.uid)
            if (!task.isRecurring) _completed.tryEmit(task)
        }
    }

    fun undoComplete(uid: String) = launchAction { repository.reopenTask(uid) }

    fun skipOccurrence(task: TaskItem) = launchAction { repository.skipOccurrence(task.uid) }

    fun delete(task: TaskItem) = launchAction { repository.deleteTask(task.uid) }

    fun update(uid: String, change: TaskChange) = launchAction { repository.updateTask(uid, change) }

    /** Report à demain ; une tâche récurrente demande d'abord la portée. */
    fun postpone(task: TaskItem) = reschedule(task, moment.value.today.plusDays(1))

    /** Exécute l'action d'un balayage ou d'une action d'accessibilité sur [task]. */
    fun swipe(task: TaskItem, action: SwipeAction) {
        val current = moment.value
        when (action) {
            SwipeAction.COMPLETE -> toggle(task)
            SwipeAction.TODAY -> reschedule(task, current.today)
            SwipeAction.TOMORROW -> reschedule(task, current.today.plusDays(1))
            SwipeAction.NEXT_WEEK -> reschedule(task, SchedulePreset.plusOneWeek(task.dueDay, current.today))
            SwipeAction.SCHEDULE -> _sheet.value = SwipeSheet.Schedule(task)
            SwipeAction.MOVE_PROJECT -> _sheet.value = SwipeSheet.Project(task)
            SwipeAction.PRIORITY -> _sheet.value = SwipeSheet.Priority(task)
            SwipeAction.DELETE -> if (task.isRecurring) _pendingDelete.value = task else deleteWithUndo(task)
            SwipeAction.NONE -> Unit
        }
    }

    /** Menu contextuel d'une ligne (appui long). */
    fun openMenu(task: TaskItem) {
        _sheet.value = SwipeSheet.Menu(task)
    }

    fun dismissSheet() {
        _sheet.value = null
    }

    /** Nouvelle échéance ; null retire l'échéance. Une récurrente passe par le déplacement d'occurrence. */
    fun reschedule(task: TaskItem, date: LocalDate?) {
        _sheet.value = null
        if (date != null && task.isRecurring) {
            askRecurringMove(task.uid, date)
            return
        }
        val zone = moment.value.zone
        val change = if (date == null) TaskChange(clearDue = true) else TaskViews.postponeChange(task, date, zone)
        val message = getString(if (date == null) R.string.swipe_notice_unscheduled else R.string.swipe_notice_scheduled)
        changeWithUndo(task, change, UndoChanges.restoreDue(task, zone), message)
    }

    fun moveToProject(task: TaskItem, projectUid: String?) {
        _sheet.value = null
        if (projectUid == task.projectUid) return
        val change = if (projectUid == null) TaskChange(clearProject = true) else TaskChange(projectUid = projectUid)
        changeWithUndo(task, change, UndoChanges.restoreProject(task), getString(R.string.swipe_notice_moved))
    }

    fun setPriority(task: TaskItem, priority: Int?) {
        _sheet.value = null
        if (priority == task.priority) return
        val change = if (priority == null) TaskChange(clearPriority = true) else TaskChange(priority = priority)
        changeWithUndo(task, change, UndoChanges.restorePriority(task), getString(R.string.swipe_notice_priority))
    }

    /** Réponse à « Cette occurrence / Toute la série » pour une suppression ; null = annulé. */
    fun answerRecurringDelete(scope: RecurringScope?) {
        val task = _pendingDelete.value ?: return
        _pendingDelete.value = null
        when (scope) {
            null -> Unit
            RecurringScope.THIS -> skipOccurrence(task)
            else -> deleteWithUndo(task)
        }
    }

    private fun changeWithUndo(task: TaskItem, change: TaskChange, restore: TaskChange, message: String) {
        update(task.uid, change)
        _notices.tryEmit(UndoNotice(message) { update(task.uid, restore) })
    }

    /** Masque la tâche tout de suite et ne la supprime pour de bon qu'une fois le délai d'annulation écoulé. */
    private fun deleteWithUndo(task: TaskItem) {
        hiddenUids.value += task.uid
        pendingDeletes[task.uid] = viewModelScope.launch {
            delay(DELETE_UNDO_WINDOW_MS)
            pendingDeletes.remove(task.uid)
            try {
                repository.deleteTask(task.uid)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _messages.tryEmit(e.message ?: genericError)
            } finally {
                hiddenUids.value -= task.uid
            }
        }
        _notices.tryEmit(UndoNotice(getString(R.string.swipe_notice_deleted)) { undoDelete(task.uid) })
    }

    private fun undoDelete(uid: String) {
        pendingDeletes.remove(uid)?.cancel()
        hiddenUids.value -= uid
    }

    private fun getString(res: Int): String = getApplication<Application>().getString(res)

    fun askRecurringMove(uid: String, date: LocalDate) {
        _pendingMove.value = PendingMove(uid, date)
    }

    /** Réponse à la boîte « Déplacer une tâche récurrente » ; null = annulé. */
    fun answerRecurringMove(scope: RecurringScope?) {
        val move = _pendingMove.value ?: return
        _pendingMove.value = null
        if (scope != null) {
            launchAction { repository.moveRecurring(move.taskUid, scope, move.date).getOrThrow() }
        }
    }

    // Écritures des formulaires : suspendues, pour que l'écran ne se ferme qu'après succès.
    // Les erreurs remontent à l'appelant, qui garde les valeurs saisies.
    suspend fun saveChange(uid: String, change: TaskChange) = repository.updateTask(uid, change)

    suspend fun saveNewTask(draft: TaskDraft) {
        repository.createTask(draft)
    }

    suspend fun saveConversion(entry: InboxEntry, draft: TaskDraft) {
        repository.createTask(draft)
        repository.deleteInboxItem(entry.uid)
    }

    fun captureInbox(text: String) = launchAction { repository.captureInbox(text) }

    fun deleteInboxItem(uid: String) = launchAction { repository.deleteInboxItem(uid) }

    fun requestSync() = repository.requestSync()

    /** Coche ou décoche un événement, dans Cadence seulement : le fournisseur d'agendas n'est jamais modifié. */
    fun toggleEvent(key: EventInstanceKey) = launchAction { calendar.toggleDone(key) }

    /** À appeler après l'octroi de READ_CALENDAR, pour relire les agendas sans attendre le prochain changement. */
    fun refreshCalendar() = calendar.refresh()

    fun dismissCalendarNotice() {
        calendarPrefs.edit { putBoolean(KEY_NOTICE_DISMISSED, true) }
        calendarNoticeDismissed.value = true
    }

    private fun launchAction(block: suspend () -> Unit) {
        viewModelScope.launch {
            try {
                block()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _messages.tryEmit(e.message ?: genericError)
            }
        }
    }
}

private fun List<TaskItem>.withoutHidden(hidden: Set<String>): List<TaskItem> =
    if (hidden.isEmpty()) this else filterNot { it.uid in hidden }

private fun minuteTicks(): Flow<Moment> = flow {
    while (true) {
        val now = ZonedDateTime.now()
        emit(Moment(now.toLocalDate(), now.toInstant(), now.zone))
        delay(Duration.between(now, now.truncatedTo(ChronoUnit.MINUTES).plusMinutes(1)).toMillis())
    }
}

private fun todayState(all: List<TaskItem>, m: Moment): TodayState {
    val overdue = TaskViews.overdue(all, m.today, m.now)
    val overdueUids = overdue.mapTo(HashSet()) { it.uid }
    return TodayState(
        overdue = overdue,
        today = TaskViews.today(all, m.today, m.now).filterNot { it.uid in overdueUids },
        completed = TaskViews.completedToday(all, m.today, m.zone),
    )
}
