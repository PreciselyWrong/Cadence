package ch.nicolab.cadence.tasks.ui

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import ch.nicolab.cadence.calendar.CalendarGlobalSettings
import ch.nicolab.cadence.calendar.CalendarGraph
import ch.nicolab.cadence.calendar.CalendarRepository
import ch.nicolab.cadence.calendar.CalendarSurface
import ch.nicolab.cadence.calendar.EventInstanceKey
import ch.nicolab.cadence.calendar.EventWithDone
import ch.nicolab.cadence.calendar.HiddenEvent
import ch.nicolab.cadence.calendar.TimeRange
import ch.nicolab.cadence.calendar.ofDays
import ch.nicolab.cadence.calendar.toHidden
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.data.UnsupportedRecurrence
import ch.nicolab.cadence.tasks.links.LinkExtractor
import ch.nicolab.cadence.tasks.links.LinkPreviews
import ch.nicolab.cadence.tasks.model.AreaFilter
import ch.nicolab.cadence.tasks.model.AreaItem
import ch.nicolab.cadence.tasks.model.AreaSuggestions
import ch.nicolab.cadence.tasks.model.DecisionContext
import ch.nicolab.cadence.tasks.model.Delivery
import ch.nicolab.cadence.tasks.model.Funnel
import ch.nicolab.cadence.tasks.model.FunnelStage
import ch.nicolab.cadence.tasks.model.GoalBucket
import ch.nicolab.cadence.tasks.model.GoalChange
import ch.nicolab.cadence.tasks.model.GoalItem
import ch.nicolab.cadence.tasks.model.GoalOverview
import ch.nicolab.cadence.tasks.model.GoalStatus
import ch.nicolab.cadence.tasks.model.Goals
import ch.nicolab.cadence.tasks.model.IdeaNotes
import ch.nicolab.cadence.tasks.model.IdeaTasks
import ch.nicolab.cadence.tasks.model.InboxEntry
import ch.nicolab.cadence.tasks.model.LinkItem
import ch.nicolab.cadence.tasks.model.NextAction
import ch.nicolab.cadence.tasks.model.NoteChange
import ch.nicolab.cadence.tasks.model.NoteItem
import ch.nicolab.cadence.tasks.model.OccurrenceFields
import ch.nicolab.cadence.tasks.model.Outline
import ch.nicolab.cadence.tasks.model.OutlineNode
import ch.nicolab.cadence.tasks.model.ProjectItem
import ch.nicolab.cadence.tasks.model.ProjectStatus
import ch.nicolab.cadence.tasks.model.RecurringScope
import ch.nicolab.cadence.tasks.model.ReviewDecisions
import ch.nicolab.cadence.tasks.model.Subtasks
import ch.nicolab.cadence.tasks.model.SyncStatus
import ch.nicolab.cadence.tasks.model.TagEditProblem
import ch.nicolab.cadence.tasks.model.TagItem
import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskDraft
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskViews
import ch.nicolab.cadence.tasks.model.TodayOrder
import ch.nicolab.cadence.tasks.notes.Autosaver
import ch.nicolab.cadence.tasks.notes.NoteEditSession
import ch.nicolab.cadence.tasks.notes.NoteFields
import ch.nicolab.cadence.tasks.notes.NotePatch
import ch.nicolab.cadence.tasks.planning.PlanEntry
import ch.nicolab.cadence.tasks.planning.ServerPlan
import ch.nicolab.cadence.tasks.reminder.PlanSlotsStore
import ch.nicolab.cadence.tasks.swipe.FileBackedActions
import ch.nicolab.cadence.tasks.swipe.SchedulePreset
import ch.nicolab.cadence.tasks.swipe.SwipeAction
import ch.nicolab.cadence.tasks.swipe.UndoChanges
import ch.nicolab.cadence.tasks.widget.HeldCompletion
import java.time.DayOfWeek
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit
import java.util.UUID
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
private const val UNDO_WINDOW_MS = 4_500L
private const val NOTE_SAVE_DELAY_MS = 700L
private const val FILTER_PREFS = "tududi_tasks_filter"
private const val KEY_AREA = "area"

/** Date et instant courants ; rafraîchis chaque minute, ce qui couvre aussi minuit. */
internal data class Moment(val today: LocalDate, val now: Instant, val zone: ZoneId) {
    companion object {
        fun current(): Moment {
            val zoned = ZonedDateTime.now()
            return Moment(zoned.toLocalDate(), zoned.toInstant(), zoned.zone)
        }
    }
}

private fun funnelNotice(stage: FunnelStage, on: Boolean): Int = when (stage) {
    FunnelStage.IN_VIEW -> if (on) R.string.funnel_notice_in_view else R.string.funnel_notice_out_of_view
    FunnelStage.THIS_WEEK -> if (on) R.string.funnel_notice_this_week else R.string.funnel_notice_not_this_week
    FunnelStage.LATER -> if (on) R.string.funnel_notice_later else R.string.funnel_notice_not_later
}

/**
 * [planStarts] : heure où le plan du jour du serveur place une tâche d'[today] ; [plan] : ce plan pour aujourd'hui,
 * dernière lecture gardée sur l'appareil ([ServerPlan]).
 */
internal data class TodayState(
    val overdue: List<TaskItem> = emptyList(),
    val today: List<TaskItem> = emptyList(),
    val completed: List<TaskItem> = emptyList(),
    val planStarts: Map<String, Instant> = emptyMap(),
    val plan: List<PlanEntry> = emptyList(),
)

internal enum class DeletionKind { Note, Idea, Goal }

/** Suppression en attente de confirmation, annulable par [TasksViewModel.undoDeletion] ; [title] nomme un objectif. */
internal data class PendingDeletion(
    val kind: DeletionKind,
    val uid: String,
    val title: String? = null,
)

/**
 * Question « cette tâche ou la série ? » en attente sur une tâche récurrente. [occurrence] est le jour de
 * l'occurrence touchée (une occurrence à venir de l'Agenda), null pour l'occurrence courante.
 */
internal sealed interface PendingScope {
    val task: TaskItem

    data class Edit(override val task: TaskItem, val change: TaskChange, val occurrence: LocalDate? = null) : PendingScope
    data class Delete(override val task: TaskItem) : PendingScope
}

/** Bandeau avec « Annuler » pour un geste qui déplace ou supprime une tâche. */
internal class UndoNotice(val message: String, val undo: () -> Unit)

/** Feuille ouverte par un balayage ; porte la tâche visée. */
internal sealed interface SwipeSheet {
    val task: TaskItem

    /** [todayList] : la liste Aujourd'hui quand le menu vient de là ; on peut alors y déplacer la tâche. */
    data class Menu(override val task: TaskItem, val todayList: List<TaskItem> = emptyList()) : SwipeSheet
    data class Schedule(override val task: TaskItem) : SwipeSheet
    data class Project(override val task: TaskItem) : SwipeSheet
    data class Priority(override val task: TaskItem) : SwipeSheet
}

/** Fiche ou menu ouvert sur un événement d'agenda ; porte sa clé, la fiche relit l'état courant. */
internal sealed interface EventSheet {
    val key: EventInstanceKey

    data class Menu(override val key: EventInstanceKey) : EventSheet
    data class Detail(override val key: EventInstanceKey) : EventSheet
}

internal class TasksViewModel(
    application: Application,
    private val calendar: CalendarRepository,
) : AndroidViewModel(application) {
    constructor(application: Application) : this(application, CalendarGraph.repository(application))

    private val repository = TasksGraph.repository(application)
    private val connection = TasksGraph.connection(application)
    private val genericError = application.getString(R.string.tasks_error_generic)
    /** Tâches supprimées par geste, masquées le temps de pouvoir annuler. */
    private val hiddenUids = MutableStateFlow<Set<String>>(emptySet())
    private val pendingDeletes = HashMap<String, Job>()
    private val filterPrefs = application.getSharedPreferences(FILTER_PREFS, Context.MODE_PRIVATE)

    val projects: StateFlow<List<ProjectItem>> = repository.observeProjects()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

    val areas: StateFlow<List<AreaItem>> = repository.observeAreas()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

    private val chosenArea = MutableStateFlow(filterPrefs.getString(KEY_AREA, null))

    private val _areaFilter: Flow<String?> = combine(chosenArea, areas, AreaFilter::effective)

    /** Domaine filtré sur les listes de tâches et de projets, gardé entre les sessions ; null = tous. */
    val areaFilter: StateFlow<String?> = _areaFilter
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), chosenArea.value)

    private val tasks: Flow<List<TaskItem>> =
        combine(repository.observeTasks(), hiddenUids) { all, hidden -> all.withoutHidden(hidden) }

    /** Tâches du domaine filtré : Aujourd'hui, À venir et les suggestions ; les projets et le Bilan gardent [tasks]. */
    private val scopedTasks: Flow<List<TaskItem>> = scopedAllTasks()

    private fun scopedAllTasks(): Flow<List<TaskItem>> =
        combine(tasks, _areaFilter, projects) { all, area, projects -> AreaFilter.tasks(all, projects, area) }

    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 8)
    val messages: Flow<String> = _messages.asSharedFlow()

    private val _completed = MutableSharedFlow<TaskItem>(extraBufferCapacity = 4)
    private val heldCompletion = HeldCompletion(COMPLETE_HOLD_MS)

    /** Tâches terminées à l'instant, pour proposer « Annuler » ; une récurrente avance d'occurrence et n'en fait pas partie. */
    val completed: Flow<TaskItem> = _completed.asSharedFlow()

    private val _notices = MutableSharedFlow<UndoNotice>(extraBufferCapacity = 4)
    val notices: Flow<UndoNotice> = _notices.asSharedFlow()

    private val _sheet = MutableStateFlow<SwipeSheet?>(null)
    val sheet: StateFlow<SwipeSheet?> = _sheet.asStateFlow()

    private val _pendingScope = MutableStateFlow<PendingScope?>(null)

    /** Modification ou suppression d'une tâche récurrente en attente du choix de portée. */
    val pendingScope: StateFlow<PendingScope?> = _pendingScope.asStateFlow()

    val moment: StateFlow<Moment> = minuteTicks().stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), Moment.current(),
    )

    val today: StateFlow<TodayState> = combine(scopedTasks, moment, PlanSlotsStore(application).entryChanges()) { all, m, plan ->
        todayState(all, m, plan)
    }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), TodayState())

    /** Premier jour de la semaine en cours, selon le premier jour du compte : « Cette semaine ». */
    val weekStart: StateFlow<LocalDate> = combine(moment, connection.observe()) { m, info ->
        Funnel.weekStart(m.today, info?.firstDayOfWeek ?: DayOfWeek.MONDAY)
    }.distinctUntilChanged()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), Funnel.weekStart(LocalDate.now(), DayOfWeek.MONDAY))

    /** Suggestions du jour : Cette semaine puis En vue, hors « Plus tard ». */
    val suggestions: StateFlow<List<TaskItem>> = combine(scopedTasks, moment, weekStart, projects) { all, m, week, projects ->
        TaskViews.suggestions(all, m.today, m.now, week, NextAction.byProject(projects))
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

    /** Événements de l'agenda pour le jour courant ; le flux ne se relance qu'au changement de jour ou de fuseau. */
    @OptIn(ExperimentalCoroutinesApi::class)
    val todayEvents: StateFlow<List<EventWithDone>> = moment
        .map { it.today to it.zone }
        .distinctUntilChanged()
        .flatMapLatest { (day, zone) -> calendar.events(TimeRange.ofDays(day, 1, zone), CalendarSurface.TASKS) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

    val calendarSettings: StateFlow<CalendarGlobalSettings> = calendar.globalSettings
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), CalendarGlobalSettings())

    val upcoming: StateFlow<Map<LocalDate, List<TaskItem>>> = combine(scopedTasks, moment) { all, m ->
        TaskViews.upcoming(all, m.today, m.now, m.zone)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyMap())

    /** Tâches sans échéance ni projet : sans cette liste, elles n'apparaîtraient dans aucun onglet. */
    val unsorted: StateFlow<List<TaskItem>> = combine(scopedTasks, moment, weekStart) { all, m, week ->
        TaskViews.unsorted(all, m.now, week)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

    /** Projets du domaine filtré : la liste de l'onglet Projets ; les sélecteurs gardent [projects]. */
    val visibleProjects: StateFlow<List<ProjectItem>> = combine(projects, _areaFilter) { all, area ->
        AreaFilter.projects(all, area)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

    /** Tâches de premier niveau, ouvertes et fermées : Projets, Étiquettes, Terminées et le Bilan en dérivent. */
    val allTasks: StateFlow<List<TaskItem>> = tasks
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

    /** [allTasks] du domaine filtré : comptes et listes des Étiquettes, et Terminées. */
    val areaTasks: StateFlow<List<TaskItem>> = scopedAllTasks()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

    val tags: StateFlow<List<TagItem>> = repository.observeTags()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

    /** Éléments masqués pendant la fenêtre d'annulation d'une suppression ; supprimés pour de bon ensuite. */
    private val hidden = MutableStateFlow<Set<String>>(emptySet())

    private val _deletions = MutableSharedFlow<PendingDeletion>(extraBufferCapacity = 4)

    /** Suppressions annulables en cours : l'écran propose « Annuler » pendant [UNDO_WINDOW_MS]. */
    val deletions: Flow<PendingDeletion> = _deletions.asSharedFlow()

    val linkPreviews: LinkPreviews = TasksGraph.linkPreviews(application)

    val inbox: StateFlow<List<InboxEntry>> = combine(repository.observeInbox(), hidden) { entries, gone ->
        entries.filterNot { it.uid in gone }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

    /** Liens enregistrés : l'Inbox y lit le titre d'une page déjà enregistrée. */
    val links: StateFlow<List<LinkItem>> = repository.observeLinks()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

    fun setLinkNote(uid: String, note: String?) = launchAction { repository.setLinkNote(uid, note) }

    /** Met dans les liens une adresse d'une tâche ou d'une note (`task`, `note`), par un appel différé. */
    fun addLinkFrom(url: String, sourceType: String, sourceUid: String) = launchAction {
        repository.addLinkFrom(url, sourceType, sourceUid, getApplication<Application>().getString(R.string.links_add_call))
    }

    fun setLinkTags(uid: String, tagUids: List<String>) = launchAction { repository.setLinkTags(uid, tagUids) }

    /**
     * Range une idée qui porte une adresse dans les liens, avec les étiquettes et le projet choisis : appel différé
     * `POST /api/v1/links` (source : l'idée), puis l'idée passe en traitée, tout de suite et hors ligne compris.
     * « Annuler » retire l'appel (ou le lien revenu de la synchro) et rend l'idée à l'Inbox.
     */
    fun saveIdeaToLinks(entry: InboxEntry, pageTitle: String?, tagUids: List<String>, projectUid: String?) = launchAction {
        val names = IdeaTasks.tagNames(tagUids, tags.value)
        val draft = IdeaTasks.linkDraft(entry.content, pageTitle, names, projectUid, sourceUid = entry.uid) ?: return@launchAction
        repository.addLink(draft, getString(R.string.links_add_call))
        repository.processInboxItem(entry.uid)
        val name = draft.title ?: LinkExtractor.domain(draft.url) ?: draft.url
        _notices.tryEmit(
            UndoNotice(getString(R.string.tasks_idea_to_links_notice, name)) {
                launchAction {
                    if (!repository.withdrawLink(draft)) _messages.tryEmit(getString(R.string.tasks_idea_link_already_sent))
                    repository.reopenInboxItem(entry.uid)
                }
            },
        )
    }

    val notes: StateFlow<List<NoteItem>> = combine(repository.observeNotes(), hidden) { all, gone ->
        all.filterNot { it.uid in gone }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

    /** Objectifs, résultats clés et envies ; un but en cours de suppression (et ses résultats clés) est masqué. */
    val goals: StateFlow<List<GoalItem>> = combine(repository.observeGoals(), hidden) { all, gone ->
        all.filterNot { it.uid in gone || it.parentGoalUid in gone }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

    /** Progression et liste d'envies, calculées sur ce qui est déjà synchronisé ; null avant la première lecture. */
    val goalOverview: StateFlow<GoalOverview?> =
        combine(goals, repository.observeAllTasks(), repository.observeProjects()) { goals, tasks, projects ->
            Goals.overview(goals, tasks, projects)
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), null)

    private val _goalQuery = MutableStateFlow("")

    /** Recherche de l'écran Objectifs : titre ou note, sans casse ni accents. */
    val goalQuery: StateFlow<String> = _goalQuery

    fun searchGoals(query: String) {
        _goalQuery.value = query
    }

    /** [goalOverview] restreint à [goalQuery]. */
    val visibleGoals: StateFlow<GoalOverview?> = combine(goalOverview, _goalQuery) { overview, query ->
        overview?.let { Goals.filter(it, query) }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), null)

    fun updateGoal(uid: String, change: GoalChange) = launchAction { repository.updateGoal(uid, change) }

    fun createWish(title: String, bucket: GoalBucket) = launchAction { repository.createWish(title, bucket) }

    /** « Faite » : l'envie passe en réalisée et quitte son groupe ; « Annuler » la rend active. */
    fun markWishDone(wish: GoalItem) = launchAction {
        repository.updateGoal(wish.uid, GoalChange(status = GoalStatus.ACHIEVED))
        _notices.tryEmit(UndoNotice(getString(R.string.goals_wish_done_notice, wish.title)) { reopenWish(wish.uid) })
    }

    fun reopenWish(uid: String) = launchAction { repository.updateGoal(uid, GoalChange(status = GoalStatus.ACTIVE)) }

    fun deleteGoalWithUndo(goal: GoalItem) =
        deleteWithUndo(PendingDeletion(DeletionKind.Goal, goal.uid, title = goal.title)) { repository.deleteGoal(goal.uid) }

    /** Tâche créée depuis une envie ou un objectif : son prochain pas, liée par `goal_uid` ; le but reste. */
    suspend fun createTaskForGoal(goalUid: String, draft: TaskDraft): String = repository.createTask(draft.copy(goalUid = goalUid))

    /** Chaque tâche, sous-tâches comprises ; ne sert qu'à la recherche. */
    val everyTask: StateFlow<List<TaskItem>> = combine(repository.observeAllTasks(), hiddenUids) { all, hidden -> all.withoutHidden(hidden) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

    val syncStatus: StateFlow<SyncStatus> = repository.observeSyncStatus()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), SyncStatus.Idle(null, 0))

    fun observeTask(uid: String): Flow<TaskItem?> = repository.observeTask(uid)

    fun observeNote(uid: String): Flow<NoteItem?> = repository.observeNote(uid)

    fun observeSubtasks(parentUid: String): Flow<List<TaskItem>> =
        combine(repository.observeSubtasks(parentUid), hiddenUids) { all, hidden -> Subtasks.visible(all, hidden) }

    fun addSubtask(parentUid: String, name: String) =
        launchAction { repository.createTask(TaskDraft(name = name, parentTaskUid = parentUid)) }

    /** Renomme une sous-tâche ; un nom vide ou inchangé n'écrit rien. */
    fun renameSubtask(task: TaskItem, raw: String) {
        val name = Subtasks.cleanName(raw) ?: return
        if (name != task.name) update(task.uid, TaskChange(name = name))
    }

    fun observeProjectTasks(projectUid: String): Flow<List<TaskItem>> =
        combine(tasks, moment) { all, m -> TaskViews.ofProject(all, projectUid, m.now) }

    /** Outliner : écrit les parents et rangs qui passent de [before] à [after], par la file d'envoi. */
    fun applyOutline(before: List<OutlineNode>, after: List<OutlineNode>) = launchAction {
        Outline.changes(before, after).forEach { repository.updateTask(it.uid, it.change) }
    }

    /** Outliner : ajoute [name] juste après [afterUid], au même retrait, dans le projet. */
    fun addOutlineSibling(projectUid: String, tree: List<OutlineNode>, afterUid: String, name: String) = launchAction {
        val slot = Outline.siblingSlot(tree, afterUid)
        slot.shifts.forEach { repository.updateTask(it.uid, it.change) }
        repository.createTask(TaskDraft(name = name, projectUid = projectUid, parentTaskUid = slot.parentUid, order = slot.order))
    }

    /**
     * [hold] laisse la ligne cochée et barrée un instant avant que la tâche quitte la liste ;
     * un second toucher pendant ce temps annule la coche sans rien écrire.
     */
    fun toggle(task: TaskItem, hold: Boolean = false) = launchAction {
        when {
            task.isClosed -> repository.reopenTask(task.uid)
            hold -> {
                val outcome = heldCompletion.toggle(task.uid) { repository.completeTask(it) }
                if (outcome == HeldCompletion.Outcome.WRITTEN && !task.isRecurring) _completed.tryEmit(task)
            }
            else -> {
                repository.completeTask(task.uid)
                if (!task.isRecurring) _completed.tryEmit(task)
            }
        }
    }

    fun undoComplete(uid: String) = launchAction { repository.reopenTask(uid) }

    fun skipOccurrence(task: TaskItem) = launchAction { repository.skipOccurrence(task.uid) }

    fun delete(task: TaskItem) = launchAction { repository.deleteTask(task.uid) }

    fun update(uid: String, change: TaskChange) = launchAction { repository.updateTask(uid, change) }

    fun duplicate(task: TaskItem) = launchAction { repository.duplicateTask(task.uid) }

    /**
     * Enregistre [change] sur [task]. Pour une tâche récurrente, un champ d'occurrence (titre, note, priorité,
     * heure, durée, projet, étiquettes, statut) demande d'abord la portée ; le reste s'écrit sur la série.
     */
    fun edit(task: TaskItem, change: TaskChange) {
        if (task.isRecurring && OccurrenceFields.isScoped(change)) {
            _pendingScope.value = PendingScope.Edit(task, change)
        } else {
            update(task.uid, change)
        }
    }

    /** Suppression : une tâche récurrente demande la portée, une tâche simple part avec « Annuler ». */
    fun askDelete(task: TaskItem) {
        if (task.isRecurring) _pendingScope.value = PendingScope.Delete(task) else deleteWithUndo(task)
    }

    /** Report à demain ; une tâche récurrente demande d'abord la portée. */
    fun postpone(task: TaskItem) = reschedule(task, moment.value.today.plusDays(1))

    /** Exécute l'action d'un balayage ou d'une action d'accessibilité sur [task]. */
    fun swipe(task: TaskItem, action: SwipeAction) {
        if (!FileBackedActions.allowsSwipe(task, action)) return
        val current = moment.value
        when (action) {
            SwipeAction.COMPLETE -> toggle(task)
            SwipeAction.TODAY -> reschedule(task, current.today)
            SwipeAction.TOMORROW -> reschedule(task, current.today.plusDays(1))
            SwipeAction.NEXT_WEEK -> reschedule(task, SchedulePreset.plusOneWeek(task.dueDay, current.today))
            SwipeAction.SCHEDULE -> _sheet.value = SwipeSheet.Schedule(task)
            SwipeAction.MOVE_PROJECT -> _sheet.value = SwipeSheet.Project(task)
            SwipeAction.PRIORITY -> _sheet.value = SwipeSheet.Priority(task)
            SwipeAction.IN_VIEW -> funnel(task, FunnelStage.IN_VIEW)
            SwipeAction.THIS_WEEK -> funnel(task, FunnelStage.THIS_WEEK)
            SwipeAction.LATER -> funnel(task, FunnelStage.LATER)
            SwipeAction.DELETE -> askDelete(task)
            SwipeAction.NONE -> Unit
        }
    }

    /** Allume ou éteint une étape de l'entonnoir, avec « Annuler » ; l'échéance n'est jamais touchée. */
    fun funnel(task: TaskItem, stage: FunnelStage) {
        _sheet.value = null
        if (!FileBackedActions.canEdit(task)) return
        val ctx = DecisionContext(moment.value.today, weekStart.value, moment.value.zone)
        val on = !Funnel.has(task, stage, ctx.weekStart)
        val message = getString(funnelNotice(stage, on), task.name)
        changeWithUndo(task, ReviewDecisions.toggle(stage, task, ctx), UndoChanges.restoreFunnel(task), message)
    }

    /** « Quand ? » → « Sans date » : la tâche garde son projet ou son domaine et sort de « À classer » ; annulable. */
    fun clearWhen(task: TaskItem) {
        if (!FileBackedActions.canEdit(task)) return
        val message = getString(R.string.swipe_notice_unscheduled, task.name)
        changeWithUndo(task, TaskChange(needsWhen = false), TaskChange(needsWhen = true), message)
    }

    /** Date de réexamen d'une idée mise de côté ; null la retire. Ni rappel ni agenda. */
    fun reviewOn(task: TaskItem, day: LocalDate?) {
        if (!FileBackedActions.canEdit(task)) return
        update(task.uid, if (day == null) TaskChange(clearReviewOn = true) else TaskChange(reviewOn = day))
    }

    /** Menu contextuel d'une ligne (appui long). */
    fun openMenu(task: TaskItem, todayList: List<TaskItem> = emptyList()) {
        _sheet.value = SwipeSheet.Menu(task, todayList)
    }

    /** Monte ou descend la tâche dans la liste Aujourd'hui : l'ordre écrit vaut pour toute la liste, comme sur le web. */
    fun moveInToday(task: TaskItem, list: List<TaskItem>, delta: Int) {
        val byUid = list.associateBy { it.uid }
        val moved = TodayOrder.moved(list.map { it.uid }, task.uid, delta).mapNotNull { byUid[it] }
        launchAction {
            TodayOrder.changes(moved).forEach { (uid, rank) -> repository.updateTask(uid, TaskChange(todayOrder = rank)) }
        }
    }

    fun dismissSheet() {
        _sheet.value = null
    }

    /** Nouvelle échéance ; null retire l'échéance. Une récurrente passe par le déplacement d'occurrence. */
    fun reschedule(task: TaskItem, date: LocalDate?) {
        _sheet.value = null
        if (!FileBackedActions.canEdit(task)) return
        if (date != null && task.isRecurring) {
            edit(task, TaskChange(dueDate = date))
            return
        }
        val zone = moment.value.zone
        val change = if (date == null) TaskChange(clearDue = true) else TaskViews.postponeChange(task, date, zone)
        val message = getString(if (date == null) R.string.swipe_notice_unscheduled else R.string.swipe_notice_scheduled, task.name)
        changeWithUndo(task, change, UndoChanges.restoreDue(task, zone), message)
    }

    fun moveToProject(task: TaskItem, projectUid: String?) {
        _sheet.value = null
        if (!FileBackedActions.canEdit(task)) return
        if (projectUid == task.projectUid) return
        val change = if (projectUid == null) TaskChange(clearProject = true) else TaskChange(projectUid = projectUid)
        changeWithUndo(task, change, UndoChanges.restoreProject(task), getString(R.string.swipe_notice_moved, task.name))
    }

    fun setPriority(task: TaskItem, priority: Int?) {
        _sheet.value = null
        if (!FileBackedActions.canEdit(task)) return
        if (priority == task.priority) return
        val change = if (priority == null) TaskChange(clearPriority = true) else TaskChange(priority = priority)
        changeWithUndo(task, change, UndoChanges.restorePriority(task), getString(R.string.swipe_notice_priority, task.name))
    }

    /** Réponse à « Cette tâche ou la série ? » ; null = annulé, rien n'est écrit. */
    fun answerScope(scope: RecurringScope?) {
        val pending = _pendingScope.value ?: return
        _pendingScope.value = null
        if (scope == null) return
        when (pending) {
            is PendingScope.Edit -> applyEdit(pending, scope)
            is PendingScope.Delete -> applyDelete(pending.task, scope)
        }
    }

    private fun applyEdit(pending: PendingScope.Edit, scope: RecurringScope) = launchAction {
        val uid = pending.task.uid
        val scoped = OccurrenceFields.scoped(pending.change)
        // Le jour seul se décale sur le serveur (il déplace aussi la règle) ; le reste s'écrit hors ligne.
        val moveDate = scoped.dueDate.takeIf { pending.occurrence == null && OccurrenceFields.isDateOnly(pending.change) }
        if (moveDate != null) {
            // Hors ligne, le déplacement attend le réseau : la personne le sait, la date changera à l'envoi.
            if (repository.moveRecurring(uid, scope, moveDate).getOrThrow() == Delivery.QUEUED) {
                _messages.tryEmit(getString(R.string.tasks_sync_offline_queued))
            }
        } else {
            repository.editRecurring(uid, scope, pending.occurrence, pending.change).getOrElse { throw recurringFailure(it) }
        }
        OccurrenceFields.rest(pending.change).takeIf { it != TaskChange() }?.let { repository.updateTask(uid, it) }
    }

    private fun applyDelete(task: TaskItem, scope: RecurringScope) {
        // « Toutes » et « celle-ci et les suivantes » sur l'occurrence courante suppriment la série : avec « Annuler ».
        if (scope == RecurringScope.ALL || scope == RecurringScope.FOLLOWING) {
            deleteWithUndo(task)
        } else {
            launchAction { repository.deleteRecurring(task.uid, scope, null).getOrThrow() }
        }
    }

    private fun recurringFailure(error: Throwable): Throwable =
        if (error is UnsupportedRecurrence) {
            IllegalStateException(getString(R.string.recurring_unsupported), error)
        } else {
            error
        }

    /** Une série ne se défait pas d'un geste : la portée vient d'être choisie, pas d'« Annuler ». */
    private fun changeWithUndo(task: TaskItem, change: TaskChange, restore: TaskChange, message: String) {
        edit(task, change)
        val askedScope = task.isRecurring && OccurrenceFields.isScoped(change)
        if (!askedScope) _notices.tryEmit(UndoNotice(message) { update(task.uid, restore) })
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
        _notices.tryEmit(UndoNotice(getString(R.string.swipe_notice_deleted, task.name)) { undoDelete(task.uid) })
    }

    private fun undoDelete(uid: String) {
        pendingDeletes.remove(uid)?.cancel()
        hiddenUids.value -= uid
    }

    private fun getString(res: Int): String = getApplication<Application>().getString(res)

    private fun getString(res: Int, arg: String): String = getApplication<Application>().getString(res, arg)

    // Écritures des formulaires : suspendues, pour que l'écran ne se ferme qu'après succès.
    // Les erreurs remontent à l'appelant, qui garde les valeurs saisies.
    suspend fun saveChange(uid: String, change: TaskChange) = repository.updateTask(uid, change)

    /** Crée la tâche et retourne son uid, pour l'annuler dans la saisie rapide. */
    suspend fun saveNewTask(draft: TaskDraft): String = repository.createTask(draft)

    suspend fun captureIdea(text: String) {
        repository.captureInbox(text)
    }

    /** Crée la note avec ce titre et retourne son uid, pour ouvrir son éditeur. */
    suspend fun createNote(title: String): String {
        val uid = UUID.randomUUID().toString()
        repository.saveNote(uid, NoteChange(title = title))
        return uid
    }

    /**
     * Une idée devient une tâche : la tâche est créée et l'idée passe en traitée (jamais supprimée), tout de suite.
     * « Annuler » supprime la tâche et rend l'idée à l'Inbox.
     */
    suspend fun saveConversion(entry: InboxEntry, draft: TaskDraft) {
        val uid = repository.createTask(draft)
        repository.processInboxItem(entry.uid)
        _notices.tryEmit(
            UndoNotice(getString(R.string.tasks_idea_to_task_notice, draft.name)) {
                launchAction {
                    repository.deleteTask(uid)
                    repository.reopenInboxItem(entry.uid)
                }
            },
        )
    }

    private val noteSessions = HashMap<String, NoteEditSession>()
    private val noteSavers = HashMap<String, Autosaver<NotePatch>>()

    /** Session de saisie d'une note, conservée tant que l'éditeur est ouvert (survit à une rotation). */
    fun noteSession(uid: String, initial: NoteFields): NoteEditSession = noteSessions.getOrPut(uid) { NoteEditSession(initial) }

    /** À appeler après chaque saisie : la sauvegarde part [NOTE_SAVE_DELAY_MS] après la dernière. */
    fun noteEdited(uid: String) {
        val session = noteSessions[uid] ?: return
        val patch = session.pending() ?: return
        noteSaver(uid, session).submit(patch)
    }

    /** Envoie tout de suite la saisie en attente, par exemple après une case cochée. */
    fun flushNote(uid: String) {
        val session = noteSessions[uid] ?: return
        noteEdited(uid)
        viewModelScope.launch { runSaving { noteSavers[uid]?.flush() } }
    }

    /** Ferme l'éditeur : la saisie en attente est enregistrée avant d'oublier la session. */
    fun closeNote(uid: String) {
        viewModelScope.launch {
            noteEdited(uid)
            runSaving { noteSavers[uid]?.flush() }
            noteSavers.remove(uid)
            noteSessions.remove(uid)
        }
    }

    fun saveNoteAttributes(uid: String, change: NoteChange) = launchAction { repository.saveNote(uid, change) }

    fun setProjectStatus(uid: String, status: ProjectStatus) = launchAction { repository.setProjectStatus(uid, status) }

    fun setProjectIcon(uid: String, icon: String?) = launchAction { repository.setProjectIcon(uid, icon) }

    fun setProjectPinned(uid: String, pinned: Boolean) = launchAction { repository.setProjectPinned(uid, pinned) }

    fun setTagIcon(uid: String, icon: String?) = launchAction { repository.setTagIcon(uid, icon) }

    fun setTagColor(uid: String, color: String?) = launchAction { repository.setTagColor(uid, color) }

    fun moveProject(uid: String, parentUid: String?) = launchAction {
        if (!repository.moveProject(uid, parentUid)) _messages.tryEmit(getString(R.string.tasks_project_move_refused))
    }

    /** [onDone] reçoit true quand le nom est écrit (ou inchangé) : la feuille peut se fermer. */
    fun renameTag(uid: String, name: String, onDone: (Boolean) -> Unit = {}) = launchAction {
        reportTagProblem(repository.renameTag(uid, name), onDone)
    }

    fun moveTag(uid: String, parentUid: String?) = launchAction {
        reportTagProblem(repository.moveTag(uid, parentUid)) {}
    }

    private fun reportTagProblem(problem: TagEditProblem?, onDone: (Boolean) -> Unit) {
        val message = when (problem) {
            null, TagEditProblem.UNCHANGED -> null
            TagEditProblem.INVALID -> R.string.tasks_tag_problem_invalid
            TagEditProblem.CLASH -> R.string.tasks_tag_problem_clash
            TagEditProblem.INTO_SELF -> R.string.tasks_tag_problem_into_self
            TagEditProblem.RESERVED -> R.string.tasks_tag_problem_reserved
            TagEditProblem.UNKNOWN -> R.string.tasks_error_generic
        }
        message?.let { _messages.tryEmit(getString(it)) }
        onDone(message == null)
    }

    /** Choisit ou retire la prochaine action de son projet ; une seule par projet. */
    fun toggleNextAction(task: TaskItem) {
        _sheet.value = null
        val projectUid = task.projectUid ?: return
        if (!NextAction.canDesignate(task)) return
        val designated = NextAction.isDesignated(task, projects.value)
        launchAction { repository.setNextAction(projectUid, if (designated) null else task.uid) }
    }

    fun selectArea(uid: String?) {
        chosenArea.value = uid
        filterPrefs.edit().apply { if (uid == null) remove(KEY_AREA) else putString(KEY_AREA, uid) }.apply()
    }

    /** « Proposer 5 domaines » : crée les domaines absents (noms déjà traduits), sans doublon. */
    fun suggestAreas(names: List<String>) = launchAction {
        AreaSuggestions.missing(areas.value, names).forEach { repository.createArea(it) }
    }

    fun deleteNoteWithUndo(uid: String) = deleteWithUndo(PendingDeletion(DeletionKind.Note, uid)) { repository.deleteNote(uid) }

    fun deleteIdeaWithUndo(uid: String) = deleteWithUndo(PendingDeletion(DeletionKind.Idea, uid)) { repository.deleteInboxItem(uid) }

    fun undoDeletion(deletion: PendingDeletion) {
        hidden.value = hidden.value - deletion.uid
    }

    /**
     * Masque l'élément tout de suite ; la suppression réelle attend la fin de la fenêtre d'annulation, car le serveur
     * refuse de recréer un uid supprimé : une suppression ne se défait pas en réécrivant l'élément. Si l'app est tuée
     * pendant la fenêtre, rien n'est perdu : l'élément revient.
     */
    private fun deleteWithUndo(deletion: PendingDeletion, commit: suspend () -> Unit) {
        hidden.value = hidden.value + deletion.uid
        _deletions.tryEmit(deletion)
        launchAction {
            delay(UNDO_WINDOW_MS)
            if (deletion.uid in hidden.value) {
                commit()
                hidden.value = hidden.value - deletion.uid
            }
        }
    }

    private fun noteSaver(uid: String, session: NoteEditSession) = noteSavers.getOrPut(uid) {
        Autosaver(viewModelScope, NOTE_SAVE_DELAY_MS) { patch ->
            runSaving {
                repository.saveNote(uid, NoteChange(title = patch.title, content = patch.content))
                session.markSaved(patch)
            }
        }
    }

    private suspend fun runSaving(block: suspend () -> Unit) {
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            _messages.tryEmit(e.message ?: genericError)
        }
    }

    /**
     * Une idée devient une note (créée par la voie d'écriture des notes) et passe en traitée, tout de suite.
     * « Annuler » supprime la note et rend l'idée à l'Inbox.
     */
    fun convertIdeaToNote(entry: InboxEntry) = launchAction {
        val uid = UUID.randomUUID().toString()
        val change = IdeaNotes.change(entry.content)
        repository.saveNote(uid, change)
        repository.processInboxItem(entry.uid)
        _notices.tryEmit(
            UndoNotice(getString(R.string.tasks_idea_to_note_notice, change.title.orEmpty())) {
                launchAction {
                    repository.deleteNote(uid)
                    repository.reopenInboxItem(entry.uid)
                }
            },
        )
    }

    fun renameIdea(uid: String, text: String) = launchAction { repository.renameInboxItem(uid, text) }

    fun captureInbox(text: String) = launchAction { repository.captureInbox(text) }

    fun createTag(name: String) = launchAction { repository.createTag(name) }

    fun deleteInboxItem(uid: String) = launchAction { repository.deleteInboxItem(uid) }

    fun requestSync() = repository.requestSync()

    private val _eventSheet = MutableStateFlow<EventSheet?>(null)
    val eventSheet: StateFlow<EventSheet?> = _eventSheet.asStateFlow()

    fun openEventMenu(key: EventInstanceKey) {
        _eventSheet.value = EventSheet.Menu(key)
    }

    fun openEventDetail(key: EventInstanceKey) {
        _eventSheet.value = EventSheet.Detail(key)
    }

    fun dismissEventSheet() {
        _eventSheet.value = null
    }

    /** Balayage d'une ligne d'événement : seules les actions de [EventActions] ont un effet. */
    fun swipeEvent(item: EventWithDone, action: SwipeAction) {
        when (action) {
            SwipeAction.COMPLETE -> toggleEvent(item.event.key)
            SwipeAction.DELETE -> hideEvent(item.event.toHidden())
            else -> Unit
        }
    }

    /** Masque l'occurrence dans Cadence seulement ; « Annuler » la rend. */
    fun hideEvent(event: HiddenEvent) = launchAction {
        calendar.hideEvent(event)
        _notices.tryEmit(UndoNotice(getString(R.string.tasks_event_hidden_notice)) { restoreEvent(event.key) })
    }

    fun restoreEvent(key: EventInstanceKey) = launchAction { calendar.restoreEvent(key) }

    /** Coche ou décoche un événement, dans Cadence seulement : le fournisseur d'agendas n'est jamais modifié. */
    fun toggleEvent(key: EventInstanceKey) = launchAction { calendar.toggleDone(key) }

    /** À appeler après l'octroi de READ_CALENDAR, pour relire les agendas sans attendre le prochain changement. */
    fun refreshCalendar() = calendar.refresh()

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

/** Aujourd'hui calculé sur l'appareil, plus les tâches que le plan du jour du serveur ([plan]) y place. */
private fun todayState(all: List<TaskItem>, m: Moment, plan: List<PlanEntry>): TodayState {
    val overdue = TaskViews.overdue(all, m.today, m.now)
    val overdueUids = overdue.mapTo(HashSet()) { it.uid }
    val today = TaskViews.today(all, m.today, m.now).filterNot { it.uid in overdueUids }
    val planned = ServerPlan.apply(overdue, today, all, plan, m.today, m.zone)
    return TodayState(
        overdue = planned.overdue,
        today = planned.today,
        completed = TaskViews.completedToday(all, m.today, m.zone),
        planStarts = planned.starts,
        plan = plan.filter { it.day == m.today },
    )
}
