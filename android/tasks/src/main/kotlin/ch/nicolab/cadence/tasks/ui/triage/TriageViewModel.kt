package ch.nicolab.cadence.tasks.ui.triage

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.brief.BriefRequests
import ch.nicolab.cadence.tasks.brief.QuestionDto
import ch.nicolab.cadence.tasks.sync.DeferredCall
import ch.nicolab.cadence.tasks.triage.TriageItemDto
import ch.nicolab.cadence.tasks.triage.TriageQueueDto
import ch.nicolab.cadence.tasks.triage.TriageRequests
import java.time.LocalDate
import java.util.UUID
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement

/** Annonce d'un geste, avec son annulation tant qu'il n'est pas parti. */
internal class TriageNotice(val message: String, val undo: () -> Unit)

/**
 * File « À trier » : une proposition à la fois. Un geste retire la carte tout de suite et ne part qu'après la fenêtre
 * d'annulation : une suppression ou une conversion ne se rattrape plus une fois envoyée.
 */
internal class TriageViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = TasksGraph.triage(application)
    private val hidden = MutableStateFlow<Set<String>>(emptySet())
    private val skipped = MutableStateFlow<List<String>>(emptyList())
    private val _notices = MutableSharedFlow<TriageNotice>(extraBufferCapacity = 1)
    val notices: SharedFlow<TriageNotice> = _notices

    /** Les propositions à traiter ; celles passées reviennent en fin de file. */
    val items: StateFlow<List<TriageItemDto>> = combine(repository.queue, hidden, skipped) { queue, gone, later ->
        order(queue, gone, later)
    }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    val queue: StateFlow<TriageQueueDto?> = repository.queue

    fun refresh() {
        viewModelScope.launch { repository.refresh() }
    }

    fun skip(item: TriageItemDto) {
        skipped.value = skipped.value - item.key + item.key
    }

    fun apply(item: TriageItemDto, action: String, payload: JsonElement?) {
        val taskUid = item.taskUid ?: return
        val key = UUID.randomUUID().toString()
        hold(item, string(R.string.triage_applied)) {
            TriageRequests.apply(taskUid, action, payload, key, string(R.string.triage_title))
        }
    }

    fun keep(item: TriageItemDto) {
        val taskUid = item.taskUid ?: return
        val key = UUID.randomUUID().toString()
        hold(item, string(R.string.triage_kept)) { TriageRequests.keep(taskUid, key, string(R.string.triage_title)) }
    }

    fun answer(item: TriageItemDto, question: QuestionDto, answer: String, date: LocalDate) {
        val key = UUID.randomUUID().toString()
        hold(item, string(R.string.triage_answered)) {
            BriefRequests.answer(date, key, question.key, question.target.scope, question.target.ref, answer, string(R.string.triage_title))
        }
    }

    private fun hold(item: TriageItemDto, message: String, call: () -> DeferredCall) {
        hidden.value = hidden.value + item.key
        val job: Job = viewModelScope.launch {
            delay(UNDO_WINDOW_MS)
            repository.send(call())
        }
        _notices.tryEmit(
            TriageNotice(message) {
                job.cancel()
                hidden.value = hidden.value - item.key
            },
        )
    }

    private fun string(id: Int) = getApplication<Application>().getString(id)

    companion object {
        private const val UNDO_WINDOW_MS = 4_500L

        internal fun order(queue: TriageQueueDto?, gone: Set<String>, later: List<String>): List<TriageItemDto> {
            val open = queue?.items.orEmpty().filterNot { it.key in gone }
            return open.sortedBy { item -> later.indexOf(item.key) }
        }
    }
}
