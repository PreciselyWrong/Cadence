package ch.nicolab.cadence.tasks.ui.brief

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.brief.AnticipateDto
import ch.nicolab.cadence.tasks.brief.BriefUndo
import ch.nicolab.cadence.tasks.brief.CachedBrief
import ch.nicolab.cadence.tasks.brief.MoveDto
import ch.nicolab.cadence.tasks.brief.QuestionDto
import ch.nicolab.cadence.tasks.model.TaskItem
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject

/** Message de l'écran, avec son annulation quand l'action en a une. */
internal class BriefNotice(val message: String, val undo: BriefUndo?)

/**
 * Résumé du jour : lit le brief (Room d'abord, serveur ensuite), les tâches et les réglages, et porte les actions.
 * Chaque action passe par [ch.nicolab.cadence.tasks.brief.BriefActions] ; l'écran n'écrit rien lui-même.
 */
internal class BriefViewModel(application: Application) : AndroidViewModel(application) {
    private val briefs = TasksGraph.brief(application)
    private val settingsRepository = TasksGraph.briefSettings(application)
    private val actions = TasksGraph.briefActions(application)
    private val tasksRepository = TasksGraph.repository(application)
    private val store = TasksGraph.briefStore(application)
    private val connection = TasksGraph.connection(application)

    val zone: StateFlow<ZoneId> = connection.observe()
        .map { it?.accountZone ?: ZoneId.systemDefault() }
        .stateIn(viewModelScope, SharingStarted.Eagerly, ZoneId.systemDefault())

    val today: StateFlow<LocalDate> = zone
        .map { LocalDate.now(it) }
        .stateIn(viewModelScope, SharingStarted.Eagerly, LocalDate.now())

    @OptIn(ExperimentalCoroutinesApi::class)
    val brief: StateFlow<CachedBrief?> = today
        .flatMapLatest { briefs.observe(it) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_MS), null)

    val tasks: StateFlow<Map<String, TaskItem>> = tasksRepository.observeAllTasks()
        .map { list -> list.associateBy { it.uid } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_MS), emptyMap())

    val settings: StateFlow<JsonObject?> = settingsRepository.settings

    val notifyReady: StateFlow<Boolean> = store.notifyReady

    private val _notices = MutableSharedFlow<BriefNotice>(extraBufferCapacity = 4)
    val notices: SharedFlow<BriefNotice> = _notices.asSharedFlow()

    /** Relit le brief du jour ; hors ligne, le dernier brief gardé reste affiché. */
    fun refresh() {
        viewModelScope.launch { briefs.refreshToday() }
    }

    fun complete(task: TaskItem) = act(getApplication<Application>().getString(R.string.brief_done_notice, task.name)) {
        actions.complete(task.uid)
    }

    fun move(date: LocalDate, task: TaskItem, move: MoveDto) {
        val target = runCatching { LocalDate.parse(move.to) }.getOrNull() ?: return
        act(getApplication<Application>().getString(R.string.brief_moved_notice, BriefFormat.chip(target))) {
            actions.move(date, move, task)
        }
    }

    fun refuseMove(date: LocalDate, move: MoveDto) = act(getApplication<Application>().getString(R.string.brief_refused_notice)) {
        actions.refuseMove(date, move)
    }

    fun answer(date: LocalDate, question: QuestionDto, answer: String) = act(getApplication<Application>().getString(R.string.brief_answered_notice)) {
        actions.answer(date, question, answer)
    }

    fun feedback(date: LocalDate, card: AnticipateDto, vote: String) = act(getApplication<Application>().getString(R.string.brief_feedback_notice)) {
        actions.feedback(date, card, vote)
    }

    /** Sauvegarde les réglages ; un refus du serveur est annoncé, la lecture gardée revient. */
    fun saveSettings(next: JsonObject) {
        viewModelScope.launch {
            settingsRepository.save(next).onFailure { error ->
                _notices.emit(BriefNotice(error.message ?: getApplication<Application>().getString(R.string.tasks_error_generic), null))
            }
        }
    }

    fun setNotifyReady(enabled: Boolean) = store.setNotifyReady(enabled)

    private fun act(message: String, block: suspend () -> BriefUndo) {
        viewModelScope.launch {
            try {
                _notices.emit(BriefNotice(message, block()))
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                _notices.emit(BriefNotice(getApplication<Application>().getString(R.string.tasks_error_generic), null))
            }
        }
    }

    private companion object {
        const val STOP_MS = 5_000L
    }
}
