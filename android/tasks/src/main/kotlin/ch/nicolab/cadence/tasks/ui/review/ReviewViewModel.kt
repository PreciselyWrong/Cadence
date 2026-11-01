package ch.nicolab.cadence.tasks.ui.review

import android.app.Application
import android.content.Context
import androidx.core.content.edit
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.model.Decision
import ch.nicolab.cadence.tasks.model.DecisionContext
import ch.nicolab.cadence.tasks.model.Delivery
import ch.nicolab.cadence.tasks.model.Funnel
import ch.nicolab.cadence.tasks.model.ProjectStatus
import ch.nicolab.cadence.tasks.model.ReviewDecisions
import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskDraft
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.review.Loaded
import ch.nicolab.cadence.tasks.review.ReviewInboxItem
import ch.nicolab.cadence.tasks.review.ReviewLists
import ch.nicolab.cadence.tasks.review.ReviewPage
import ch.nicolab.cadence.tasks.review.ReviewProject
import ch.nicolab.cadence.tasks.review.ReviewStep
import ch.nicolab.cadence.tasks.review.ReviewSummary
import ch.nicolab.cadence.tasks.review.ReviewBacklog
import ch.nicolab.cadence.tasks.review.ReviewTask
import ch.nicolab.cadence.tasks.ui.UndoNotice
import ch.nicolab.cadence.tasks.review.ReviewWeek
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

private const val PREFS = "tududi_review"
private const val KEY_STEP = "step"
private const val KEY_LATER_SKIPPED = "later_skipped"
private const val STOP_TIMEOUT_MS = 5_000L

/** Contenu d'une étape tel que servi ; [fetchedAt] et [fromCache] disent d'où il vient. */
internal sealed interface StepContent {
    data object Loading : StepContent
    data object Unavailable : StepContent
    data class Tasks(val page: ReviewPage<ReviewTask>, val fetchedAt: Instant, val fromCache: Boolean) : StepContent
    data class Inbox(val page: ReviewPage<ReviewInboxItem>, val fetchedAt: Instant, val fromCache: Boolean) : StepContent
    data class Projects(val page: ReviewPage<ReviewProject>, val fetchedAt: Instant, val fromCache: Boolean) : StepContent
    data class Week(val week: ReviewWeek, val fetchedAt: Instant, val fromCache: Boolean) : StepContent
}

/**
 * Revue : une étape à la fois, mémorisée entre les sessions. Les listes viennent du serveur ; chaque
 * décision sur une tâche s'écrit sur la tâche (file d'envoi, hors ligne compris) et retire la ligne.
 */
internal class ReviewViewModel(application: Application) : AndroidViewModel(application) {
    private val tasks = TasksGraph.repository(application)
    private val review = TasksGraph.review(application)
    private val connection = TasksGraph.connection(application)
    private val prefs = application.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private val _step = MutableStateFlow(ReviewStep.restore(prefs.getString(KEY_STEP, null)))
    val step: StateFlow<ReviewStep> = _step.asStateFlow()

    private val _summary = MutableStateFlow<Loaded<ReviewSummary>?>(null)
    val summary: StateFlow<Loaded<ReviewSummary>?> = _summary.asStateFlow()

    private val _routineMissing = MutableStateFlow(false)

    /** Vrai tant que le serveur dit qu'aucune routine du vendredi n'existe ; faux hors ligne (rien n'est proposé). */
    val routineMissing: StateFlow<Boolean> = _routineMissing.asStateFlow()

    private val _content = MutableStateFlow<StepContent>(StepContent.Loading)

    /** Lignes traitées ici qui ne portent pas de `reviewed_at` (boîte, projets) : masquées jusqu'au prochain chargement. */
    private val handled = MutableStateFlow<Set<String>>(emptySet())

    /** Décisions défaites par « Annuler » : `reviewed_at` reste horodaté, la ligne doit pourtant revenir. */
    private val undone = MutableStateFlow<Set<String>>(emptySet())

    val local: StateFlow<Map<String, TaskItem>> = tasks.observeAllTasks().map { all -> all.associateBy { it.uid } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyMap())

    /** Étape affichée, sans ce que le téléphone vient de décider. */
    val content: StateFlow<StepContent> = combine(_content, local, handled, undone) { content, local, gone, back ->
        fun pending(items: List<ReviewTask>) = ReviewLists.pending(items, local).let { kept ->
            if (back.isEmpty()) kept else items.filter { it in kept || (it.uid in back && local[it.uid]?.isClosed != true) }
        }
        when (content) {
            is StepContent.Tasks -> content.copy(page = content.page.copy(items = pending(content.page.items)))
            is StepContent.Week -> content.copy(
                week = content.week.copy(
                    committed = pending(content.week.committed),
                    inView = pending(content.week.inView),
                ),
            )
            is StepContent.Inbox -> content.copy(page = content.page.copy(items = content.page.items.filterNot { "inbox:${it.uid}" in gone }))
            is StepContent.Projects -> content.copy(page = content.page.copy(items = content.page.items.filterNot { "project:${it.uid}" in gone }))
            else -> content
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), StepContent.Loading)

    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val messages: SharedFlow<String> = _messages.asSharedFlow()

    private val _notices = MutableSharedFlow<UndoNotice>(extraBufferCapacity = 4)

    /** Chaque décision sur une tâche se défait depuis la bannière « Annuler ». */
    val notices: SharedFlow<UndoNotice> = _notices.asSharedFlow()

    private val _laterQuery = MutableStateFlow("")

    /** Filtre de « Plus tard », gardé le temps de l'écran. */
    val laterQuery: StateFlow<String> = _laterQuery.asStateFlow()

    fun filterLater(query: String) {
        _laterQuery.value = query
    }

    private val _openGroups = MutableStateFlow<Set<String>?>(null)

    /** Groupes de « Plus tard » ouverts ; null : le choix par défaut ([ch.nicolab.cadence.tasks.review.ReviewBacklog.defaultOpen]). */
    val openGroups: StateFlow<Set<String>?> = _openGroups.asStateFlow()

    fun toggleGroup(key: String, current: Set<String>) {
        _openGroups.value = if (key in current) current - key else current + key
    }

    private val _skipped = MutableStateFlow(prefs.getString(KEY_LATER_SKIPPED, null)?.split(',')?.filter { it.isNotEmpty() }.orEmpty())

    /** Tâches passées dans « Trier un par un », dans l'ordre : elles repartent au bout, même après fermeture. */
    val skipped: StateFlow<List<String>> = _skipped.asStateFlow()

    fun skip(uid: String) {
        val next = _skipped.value.filterNot { it == uid } + uid
        _skipped.value = next
        prefs.edit { putString(KEY_LATER_SKIPPED, next.joinToString(",")) }
    }

    /** Oublie les tâches passées qui ont quitté la liste (décidées ici ou ailleurs). */
    fun pruneSkipped(live: Set<String>) {
        val next = _skipped.value.filter { it in live }
        if (next.size == _skipped.value.size) return
        _skipped.value = next
        prefs.edit { putString(KEY_LATER_SKIPPED, next.joinToString(",")) }
    }

    private val _busy = MutableStateFlow<String?>(null)
    val busy: StateFlow<String?> = _busy.asStateFlow()

    init {
        load()
        viewModelScope.launch { review.weeklyRoutineExists().onSuccess { _routineMissing.value = !it } }
    }

    /** « Planifier une revue le vendredi » : tâche récurrente sans rappel, créée au toucher seulement (hors ligne : au retour du réseau). */
    fun planRoutine() = run("routine") {
        review.planWeeklyRoutine(getString(R.string.review_routine_name))
            .onSuccess { delivery ->
                _routineMissing.value = false
                _messages.tryEmit(sentOrQueued(delivery, R.string.review_routine_planned))
            }
            .onFailure { _messages.tryEmit(getString(R.string.review_online_only)) }
    }

    fun select(step: ReviewStep) {
        if (step == _step.value) return
        _step.value = step
        prefs.edit { putString(KEY_STEP, step.wire) }
        load()
    }

    fun load() {
        val step = _step.value
        _content.value = StepContent.Loading
        handled.value = emptySet()
        undone.value = emptySet()
        viewModelScope.launch {
            review.summary().onSuccess { _summary.value = it }
            _content.value = when (step) {
                ReviewStep.UNDECIDED -> review.inbox().fold({ StepContent.Inbox(it.value, it.fetchedAt, it.fromCache) }, { StepContent.Unavailable })
                ReviewStep.PROJECTS -> review.projects().fold({ StepContent.Projects(it.value, it.fetchedAt, it.fromCache) }, { StepContent.Unavailable })
                ReviewStep.WEEK -> review.week().fold({ StepContent.Week(it.value, it.fetchedAt, it.fromCache) }, { StepContent.Unavailable })
                else -> review.tasks(step).fold({ StepContent.Tasks(it.value, it.fetchedAt, it.fromCache) }, { StepContent.Unavailable })
            }
        }
    }

    /**
     * Décision prise sur une tâche servie : écrite tout de suite sur la tâche, `reviewed_at` compris (une
     * revue quittée garde ce qui a été décidé), puis « Annuler » remet ce que la décision a changé.
     */
    fun decide(item: ReviewTask, decision: Decision, label: String? = null) = run(item.uid) {
        val task = local.value[item.uid]
        if (task == null) {
            _messages.tryEmit(getString(R.string.review_not_synced, item.name))
            return@run
        }
        val ctx = context()
        undone.value -= task.uid
        tasks.updateTask(task.uid, ReviewDecisions.change(decision, task, ctx))
        label?.let {
            val restore = ReviewBacklog.undo(decision, task, ctx.zone)
            _notices.tryEmit(UndoNotice(getString(R.string.review_saved, item.name, it)) { undo(task.uid) { tasks.updateTask(task.uid, restore) } })
        }
    }

    /**
     * « Session courte aujourd'hui » (Repoussées), comme le web : la tâche rejoint le plan d'aujourd'hui pour 25 min,
     * sans heure, puis compte comme revue. Pas d'« Annuler » : le plan du jour appartient à la journée, comme
     * « Faire aujourd'hui » sur le web. Le plan s'écrit en ligne ; hors ligne, rien n'est écrit.
     */
    fun shortSession(item: ReviewTask, label: String) = run(item.uid) {
        val task = local.value[item.uid]
        if (task == null) {
            _messages.tryEmit(getString(R.string.review_not_synced, item.name))
            return@run
        }
        review.shortSession(task.uid)
            .onSuccess {
                undone.value -= task.uid
                tasks.updateTask(task.uid, TaskChange(reviewed = true))
                _messages.tryEmit(getString(R.string.review_saved, item.name, label))
            }
            .onFailure { _messages.tryEmit(getString(R.string.review_short_session_offline)) }
    }

    /** « Terminer » : la tâche est fermée comme d'une coche ; « Annuler » la rouvre. */
    fun complete(item: ReviewTask, label: String) = run(item.uid) {
        val task = local.value[item.uid]
        if (task == null) {
            _messages.tryEmit(getString(R.string.review_not_synced, item.name))
            return@run
        }
        undone.value -= task.uid
        tasks.completeTask(task.uid)
        _notices.tryEmit(UndoNotice(getString(R.string.review_saved, item.name, label)) { undo(task.uid) { tasks.reopenTask(task.uid) } })
    }

    private fun undo(uid: String, write: suspend () -> Unit) = run(uid) {
        undone.value += uid
        write()
    }

    fun toTask(item: ReviewInboxItem, decision: Decision?) = run("inbox:${item.uid}") {
        val uid = tasks.createTask(TaskDraft(name = item.text))
        decision?.let { chosen ->
            val created = tasks.observeTask(uid).first() ?: return@let
            // Comme sur le web, une idée transformée n'est pas comptée comme décision de revue.
            tasks.updateTask(uid, ReviewDecisions.change(chosen, created, context()).copy(reviewed = false))
        }
        tasks.deleteInboxItem(item.uid)
        handled.value += "inbox:${item.uid}"
    }

    fun discard(item: ReviewInboxItem) = run("inbox:${item.uid}") {
        tasks.deleteInboxItem(item.uid)
        handled.value += "inbox:${item.uid}"
    }

    fun holdProject(project: ReviewProject) = run("project:${project.uid}") {
        tasks.setProjectStatus(project.uid, ProjectStatus.WAITING)
        handled.value += "project:${project.uid}"
    }

    /** « Garder tel quel » : `projects.reviewed_at` n'est pas synchronisé ; hors ligne, l'appel attend le réseau. */
    fun keepProject(project: ReviewProject) = run("project:${project.uid}") {
        review.keepProject(project.uid, project.name)
            .onSuccess { delivery ->
                handled.value += "project:${project.uid}"
                if (delivery == Delivery.QUEUED) _messages.tryEmit(getString(R.string.tasks_sync_offline_queued))
            }
            .onFailure { _messages.tryEmit(getString(R.string.review_online_only)) }
    }

    fun addNextTask(project: ReviewProject, name: String) = run("project:${project.uid}") {
        val trimmed = name.trim()
        if (trimmed.isEmpty()) return@run
        tasks.createTask(TaskDraft(name = trimmed, projectUid = project.uid))
        handled.value += "project:${project.uid}"
    }

    fun saveCapacity(minutes: Int?) = run("capacity") {
        review.saveWeekCapacity(minutes)
            .onSuccess { delivery ->
                _messages.tryEmit(sentOrQueued(delivery, R.string.review_capacity_saved))
                if (delivery == Delivery.SENT) load()
            }
            .onFailure { _messages.tryEmit(getString(R.string.review_online_only)) }
    }

    /** Choix de « Aide-moi à choisir » : la tâche gagnante passe à aujourd'hui. */
    fun chooseToday(item: ReviewTask) = decide(item, Decision.Today)

    private suspend fun context(): DecisionContext {
        val zone = ZoneId.systemDefault()
        val today = LocalDate.now(zone)
        val first = connection.observe().first()?.firstDayOfWeek ?: DayOfWeek.MONDAY
        return DecisionContext(today, Funnel.weekStart(today, first), zone)
    }

    private fun run(key: String, block: suspend () -> Unit) {
        viewModelScope.launch {
            _busy.value = key
            try {
                block()
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                _messages.tryEmit(error.message ?: getString(R.string.tasks_error_generic))
            } finally {
                _busy.value = null
            }
        }
    }

    private fun getString(res: Int, vararg args: Any): String = getApplication<Application>().getString(res, *args)

    /** Envoyé : le message de l'action. Gardé hors ligne : il partira au retour du réseau. */
    private fun sentOrQueued(delivery: Delivery, sent: Int): String =
        if (delivery == Delivery.SENT) getString(sent) else getString(R.string.tasks_sync_offline_queued)
}
