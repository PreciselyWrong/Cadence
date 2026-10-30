package ch.nicolab.cadence.tasks.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.model.InboxEntry
import ch.nicolab.cadence.tasks.model.ProjectItem
import ch.nicolab.cadence.tasks.model.RecurringScope
import ch.nicolab.cadence.tasks.model.SyncStatus
import ch.nicolab.cadence.tasks.model.TagItem
import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskDraft
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskViews
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

private const val STOP_TIMEOUT_MS = 5_000L

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

internal class TasksViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = TasksGraph.repository(application)
    private val genericError = application.getString(R.string.tasks_error_generic)
    private val tasks: Flow<List<TaskItem>> = repository.observeTasks()

    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 8)
    val messages: Flow<String> = _messages.asSharedFlow()

    private val _pendingMove = MutableStateFlow<PendingMove?>(null)
    val pendingMove: StateFlow<PendingMove?> = _pendingMove.asStateFlow()

    val moment: StateFlow<Moment> = minuteTicks().stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), Moment.current(),
    )

    val today: StateFlow<TodayState> = combine(tasks, moment) { all, m -> todayState(all, m) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), TodayState())

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

    val syncStatus: StateFlow<SyncStatus> = repository.observeSyncStatus()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), SyncStatus.Idle(null, 0))

    fun observeTask(uid: String): Flow<TaskItem?> = repository.observeTask(uid)

    fun observeProjectTasks(projectUid: String): Flow<List<TaskItem>> =
        combine(tasks, moment) { all, m -> TaskViews.ofProject(all, projectUid, m.now) }

    fun toggle(task: TaskItem) = launchAction {
        if (task.isClosed) repository.reopenTask(task.uid) else repository.completeTask(task.uid)
    }

    fun skipOccurrence(task: TaskItem) = launchAction { repository.skipOccurrence(task.uid) }

    fun delete(task: TaskItem) = launchAction { repository.deleteTask(task.uid) }

    fun update(uid: String, change: TaskChange) = launchAction { repository.updateTask(uid, change) }

    /** Report à demain ; une tâche récurrente demande d'abord la portée. */
    fun postpone(task: TaskItem) {
        val current = moment.value
        val tomorrow = current.today.plusDays(1)
        if (task.isRecurring) {
            askRecurringMove(task.uid, tomorrow)
        } else {
            update(task.uid, TaskViews.postponeChange(task, tomorrow, current.zone))
        }
    }

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
