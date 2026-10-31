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
import ch.nicolab.cadence.tasks.model.Funnel
import ch.nicolab.cadence.tasks.model.ProjectStatus
import ch.nicolab.cadence.tasks.model.ReviewDecisions
import ch.nicolab.cadence.tasks.model.TaskDraft
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.review.Loaded
import ch.nicolab.cadence.tasks.review.ReviewInboxItem
import ch.nicolab.cadence.tasks.review.ReviewLists
import ch.nicolab.cadence.tasks.review.ReviewPage
import ch.nicolab.cadence.tasks.review.ReviewProject
import ch.nicolab.cadence.tasks.review.ReviewStep
import ch.nicolab.cadence.tasks.review.ReviewSummary
import ch.nicolab.cadence.tasks.review.ReviewTask
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

    val local: StateFlow<Map<String, TaskItem>> = tasks.observeAllTasks().map { all -> all.associateBy { it.uid } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyMap())

    /** Étape affichée, sans ce que le téléphone vient de décider. */
    val content: StateFlow<StepContent> = combine(_content, local, handled) { content, local, gone ->
        when (content) {
            is StepContent.Tasks -> content.copy(page = content.page.copy(items = ReviewLists.pending(content.page.items, local)))
            is StepContent.Week -> content.copy(
                week = content.week.copy(
                    committed = ReviewLists.pending(content.week.committed, local),
                    inView = ReviewLists.pending(content.week.inView, local),
                ),
            )
            is StepContent.Inbox -> content.copy(page = content.page.copy(items = content.page.items.filterNot { "inbox:${it.uid}" in gone }))
            is StepContent.Projects -> content.copy(page = content.page.copy(items = content.page.items.filterNot { "project:${it.uid}" in gone }))
            else -> content
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), StepContent.Loading)

    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val messages: SharedFlow<String> = _messages.asSharedFlow()

    private val _busy = MutableStateFlow<String?>(null)
    val busy: StateFlow<String?> = _busy.asStateFlow()

    init {
        load()
        viewModelScope.launch { review.weeklyRoutineExists().onSuccess { _routineMissing.value = !it } }
    }

    /** « Planifier une revue le vendredi » : tâche récurrente sans rappel, créée au toucher seulement, en ligne. */
    fun planRoutine() = run("routine") {
        review.planWeeklyRoutine(getString(R.string.review_routine_name))
            .onSuccess {
                _routineMissing.value = false
                _messages.tryEmit(getString(R.string.review_routine_planned))
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

    /** Décision prise sur une tâche servie : écrite sur la tâche, `reviewed_at` compris. */
    fun decide(item: ReviewTask, decision: Decision) = run(item.uid) {
        val task = local.value[item.uid]
        if (task == null) {
            _messages.tryEmit(getString(R.string.review_not_synced, item.name))
            return@run
        }
        tasks.updateTask(task.uid, ReviewDecisions.change(decision, task, context()))
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

    /** « Garder tel quel » : `projects.reviewed_at` n'est pas synchronisé, l'appel demande le réseau. */
    fun keepProject(project: ReviewProject) = run("project:${project.uid}") {
        review.keepProject(project.uid)
            .onSuccess { handled.value += "project:${project.uid}" }
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
            .onSuccess {
                _messages.tryEmit(getString(R.string.review_capacity_saved))
                load()
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
}
