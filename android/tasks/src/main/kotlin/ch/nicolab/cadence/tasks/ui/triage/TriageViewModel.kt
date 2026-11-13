package ch.nicolab.cadence.tasks.ui.triage

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.autoclassify.AutoClassifyRequests
import ch.nicolab.cadence.tasks.triage.QuestionDto
import ch.nicolab.cadence.tasks.triage.questionAnswerCall
import ch.nicolab.cadence.tasks.sync.DeferredCall
import ch.nicolab.cadence.tasks.triage.MailDecision
import ch.nicolab.cadence.tasks.triage.MailPayload
import ch.nicolab.cadence.tasks.triage.MailRequests
import ch.nicolab.cadence.tasks.triage.TriageActions
import ch.nicolab.cadence.tasks.triage.TriageHolds
import ch.nicolab.cadence.tasks.triage.TriageItemDto
import ch.nicolab.cadence.tasks.triage.TriageQueueDto
import ch.nicolab.cadence.tasks.triage.TriageRequests
import ch.nicolab.cadence.tasks.triage.slotAnswerCall
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/** Annonce d'un geste, avec son annulation tant qu'il n'est pas parti. */
internal class TriageNotice(val message: String, val undo: () -> Unit)

/**
 * File « À trier » : une proposition à la fois. Un geste retire la carte tout de suite et ne part qu'après la fenêtre
 * d'annulation : une suppression ou une conversion ne se rattrape plus une fois envoyée.
 */
internal class TriageViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = TasksGraph.triage(application)
    private val holds = TriageHolds(viewModelScope, UNDO_WINDOW_MS) { call -> repository.send(call) }
    private val skipped = MutableStateFlow<List<String>>(emptyList())
    private val _notices = MutableSharedFlow<TriageNotice>(extraBufferCapacity = 1)
    val notices: SharedFlow<TriageNotice> = _notices

    /** Les propositions à traiter ; celles passées reviennent en fin de file. */
    val items: StateFlow<List<TriageItemDto>> = combine(repository.queue, holds.hidden, skipped) { queue, gone, later ->
        order(queue, gone, later)
    }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    val queue: StateFlow<TriageQueueDto?> = repository.queue

    private val _online = MutableStateFlow(false)

    /** Vrai après une lecture réussie de la file ; hors ligne, la file gardée n'est pas montrée comme à jour. */
    val online: StateFlow<Boolean> = _online.asStateFlow()

    fun refresh() {
        viewModelScope.launch {
            val result = repository.refresh()
            _online.value = result.isSuccess
            if (result.isSuccess) holds.settle(repository.pendingCallKeys())
        }
    }

    fun skip(item: TriageItemDto) {
        skipped.value = skipped.value - item.key + item.key
    }

    fun apply(item: TriageItemDto, action: String, payload: JsonElement?) {
        val taskUid = item.taskUid ?: return
        val key = UUID.randomUUID().toString()
        hold(item, string(R.string.triage_applied), TriageRequests.apply(taskUid, action, payload, key, string(R.string.triage_title)))
    }

    fun keep(item: TriageItemDto) {
        val taskUid = item.taskUid ?: return
        val key = UUID.randomUUID().toString()
        hold(item, string(R.string.triage_kept), TriageRequests.keep(taskUid, key, string(R.string.triage_title)))
    }

    fun answerSlot(item: TriageItemDto, slotId: String, accept: Boolean) {
        hold(
            item,
            string(if (accept) R.string.triage_applied else R.string.triage_slot_refused),
            slotAnswerCall(slotId, accept, string(R.string.triage_title)),
        )
    }

    fun answer(item: TriageItemDto, question: QuestionDto, answer: String) {
        val key = UUID.randomUUID().toString()
        hold(
            item,
            string(R.string.triage_answered),
            questionAnswerCall(key, question, answer, string(R.string.triage_title)),
        )
    }

    /** Décision sur un mail : la carte disparaît, la décision part après la fenêtre d'annulation (hors ligne compris). */
    fun decideMail(item: TriageItemDto, decision: MailDecision, payload: JsonObject, archive: Boolean) {
        val card = MailPayload.parse(item.payload) ?: return
        val message = string(
            when (decision) {
                MailDecision.TASK -> R.string.triage_mail_task_created
                MailDecision.REPLY -> R.string.triage_mail_replied
                MailDecision.EVENT -> R.string.triage_mail_event_requested
                MailDecision.LATER -> R.string.triage_mail_postponed
                MailDecision.DISMISS -> R.string.triage_mail_dismissed
            },
        )
        val key = UUID.randomUUID().toString()
        hold(item, message, MailRequests.decide(card.mailUid, decision, payload, archive, key, string(R.string.triage_title)))
    }

    /** Réponse à une carte du classement automatique (`choice` : `all`, ou un objet projet/tags/priorité, ou un doublon). */
    fun answerSuggestion(item: TriageItemDto, choice: JsonElement) {
        val suggestion = suggestionOf(item) ?: return
        hold(item, string(R.string.auto_classify_applied), AutoClassifyRequests.apply(suggestion, choice, string(R.string.triage_title)))
    }

    /** « Aucun » : la suggestion est classée sans rien changer. */
    fun dismissSuggestion(item: TriageItemDto) {
        val suggestion = suggestionOf(item) ?: return
        hold(item, string(R.string.auto_classify_applied), AutoClassifyRequests.dismiss(suggestion, string(R.string.triage_title)))
    }

    private fun suggestionOf(item: TriageItemDto): String? =
        TriageActions.field(item.payload, "suggestion_uid").takeIf { it.isNotBlank() }

    private fun hold(item: TriageItemDto, message: String, call: DeferredCall) {
        _notices.tryEmit(TriageNotice(message, holds.hold(item.key, call)))
    }

    /** Quitter l'écran n'annule pas un geste validé : la fenêtre d'annulation s'arrête là et l'appel part. */
    override fun onCleared() {
        val calls = holds.takeHeld()
        if (calls.isNotEmpty()) LEAVING.launch { calls.forEach { repository.send(it) } }
    }

    private fun string(id: Int) = getApplication<Application>().getString(id)

    companion object {
        private const val UNDO_WINDOW_MS = 4_500L
        private val LEAVING = CoroutineScope(SupervisorJob() + Dispatchers.Default)

        internal fun order(queue: TriageQueueDto?, gone: Set<String>, later: List<String>): List<TriageItemDto> {
            val open = queue?.items.orEmpty().filterNot { it.key in gone }
            return open.sortedBy { item -> later.indexOf(item.key) }
        }
    }
}
