package ch.nicolab.cadence.tasks.ui.triage

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.autoclassify.AutoClassifyRequests
import ch.nicolab.cadence.tasks.decisions.DecisionCardData
import ch.nicolab.cadence.tasks.decisions.DecisionDeck
import ch.nicolab.cadence.tasks.decisions.DecisionRequests
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
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
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

/** Annonce d'un geste, avec son annulation tant qu'il n'est pas parti (null quand le geste est déjà confirmé). */
internal class TriageNotice(val message: String, val undo: (() -> Unit)? = null)

/**
 * File « À trier » : une proposition à la fois. Un geste retire la carte tout de suite et ne part qu'après la fenêtre
 * d'annulation : une suppression ou une conversion ne se rattrape plus une fois envoyée.
 */
internal class TriageViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = TasksGraph.triage(application)
    private val decisionsRepository = TasksGraph.decisions(application)
    private val holds = TriageHolds(viewModelScope, UNDO_WINDOW_MS) { call -> repository.send(call) }
    private val decisionHolds = TriageHolds(viewModelScope, UNDO_WINDOW_MS) { call -> decisionsRepository.send(call) }
    private val skipped = MutableStateFlow<List<String>>(emptyList())
    private val skippedDecisions = MutableStateFlow<List<String>>(emptyList())
    private val _notices = MutableSharedFlow<TriageNotice>(extraBufferCapacity = 1)
    val notices: SharedFlow<TriageNotice> = _notices

    private var lastUndo: (() -> Unit)? = null
    private var undoWindow: Job? = null
    private val _undoable = MutableStateFlow(false)

    private var lastDecisionUndo: (() -> Unit)? = null
    private var decisionUndoWindow: Job? = null
    private val _decisionUndoable = MutableStateFlow(false)

    /** Vrai tant que la dernière décision est encore dans sa fenêtre d'annulation. */
    val undoable: StateFlow<Boolean> = _undoable.asStateFlow()

    /** Vrai tant que la dernière décision d'agent est encore dans sa fenêtre d'annulation. */
    val decisionUndoable: StateFlow<Boolean> = _decisionUndoable.asStateFlow()

    /** Les propositions à traiter ; celles passées reviennent en fin de file. */
    val items: StateFlow<List<TriageItemDto>> = combine(repository.queue, holds.hidden, skipped) { queue, gone, later ->
        order(queue, gone, later)
    }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    val skippedKeys: StateFlow<List<String>> = skipped.asStateFlow()

    /** Les cartes de décision d'agent ordonnées ; celles passées reviennent en fin de paquet. */
    val decisions: StateFlow<List<DecisionCardData>> = combine(
        decisionsRepository.cards,
        decisionHolds.hidden,
        skippedDecisions,
    ) { cards, gone, later ->
        DecisionDeck.cards(cards, gone, later)
    }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    val queue: StateFlow<TriageQueueDto?> = repository.queue

    private val _online = MutableStateFlow(false)

    /** Vrai après une lecture réussie de la file ; hors ligne, la file gardée n'est pas montrée comme à jour. */
    val online: StateFlow<Boolean> = _online.asStateFlow()

    fun refresh() {
        viewModelScope.launch {
            coroutineScope {
                val triageJob = async { repository.refresh() }
                val decisionsJob = async { decisionsRepository.refresh() }
                val result = triageJob.await()
                val decisionsResult = decisionsJob.await()
                _online.value = result.isSuccess
                if (result.isSuccess) holds.settle(repository.pendingCallKeys())
                if (decisionsResult.isSuccess) decisionHolds.settle(decisionsRepository.pendingCallKeys())
            }
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
    fun decideMail(
        item: TriageItemDto,
        decision: MailDecision,
        payload: JsonObject,
        archive: Boolean,
        alwaysArchive: Boolean = false,
    ) {
        val card = MailPayload.parse(item.payload) ?: return
        val message = string(
            when (decision) {
                MailDecision.TASK -> R.string.triage_mail_task_created
                MailDecision.REPLY -> R.string.triage_mail_replied
                MailDecision.EVENT -> R.string.triage_mail_event_requested
                MailDecision.LATER -> R.string.triage_mail_postponed
                MailDecision.DISMISS -> R.string.triage_mail_dismissed
                MailDecision.DRAFT -> R.string.triage_mail_drafting
                MailDecision.ARCHIVE -> R.string.triage_mail_archiving
                MailDecision.TRASH -> R.string.triage_mail_trashing
                MailDecision.NOTE -> R.string.triage_mail_noted
            },
        )
        val key = UUID.randomUUID().toString()
        hold(
            item,
            message,
            MailRequests.decide(card.mailUid, decision, payload, archive, key, string(R.string.triage_title), alwaysArchive = alwaysArchive),
        )
    }

    /** Archivage en lot depuis le paquet : confirmé par la liste cochée, donc envoyé sans fenêtre d'annulation. */
    fun archiveMailBatch(items: List<TriageItemDto>) {
        var count = 0
        val empty = JsonObject(emptyMap())
        val label = string(R.string.triage_title)
        items.forEach { item ->
            val card = MailPayload.parse(item.payload) ?: return@forEach
            val key = UUID.randomUUID().toString()
            holds.sendNow(
                item.key,
                MailRequests.decide(card.mailUid, MailDecision.ARCHIVE, empty, archive = false, key = key, label = label),
            )
            count++
        }
        if (count > 0) {
            val message = getApplication<Application>().resources.getQuantityString(R.plurals.triage_batch_archived, count, count)
            _notices.tryEmit(TriageNotice(message))
        }
    }

    /** « Annuler » du paquet : rend la dernière décision encore dans sa fenêtre, sa carte revient en tête. */
    fun undoLast() {
        lastUndo?.invoke()
        clearUndo()
    }

    private fun clearUndo() {
        lastUndo = null
        undoWindow?.cancel()
        _undoable.value = false
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
        val undo = holds.hold(item.key, call)
        _notices.tryEmit(TriageNotice(message, undo))
        lastUndo = undo
        undoWindow?.cancel()
        _undoable.value = true
        undoWindow = viewModelScope.launch {
            delay(UNDO_WINDOW_MS)
            lastUndo = null
            _undoable.value = false
        }
    }

    fun skipDecision(card: DecisionCardData) {
        skippedDecisions.value = skippedDecisions.value - card.uid + card.uid
    }

    fun decideDecision(card: DecisionCardData, decision: String, note: String? = null) {
        val message = string(
            when (decision) {
                DecisionRequests.DECISION_LATER -> R.string.decisions_sent_later
                DecisionRequests.DECISION_NOTE -> R.string.decisions_sent_note
                else -> R.string.decisions_sent_choice
            },
        )
        val key = UUID.randomUUID().toString()
        val call = DecisionRequests.decide(
            uid = card.uid,
            decision = decision,
            note = note,
            key = key,
            label = string(R.string.decisions_deck_title),
        )
        val undo = decisionHolds.hold(card.uid, call)
        _notices.tryEmit(TriageNotice(message, undo))
        lastDecisionUndo = undo
        decisionUndoWindow?.cancel()
        _decisionUndoable.value = true
        decisionUndoWindow = viewModelScope.launch {
            delay(UNDO_WINDOW_MS)
            lastDecisionUndo = null
            _decisionUndoable.value = false
        }
    }

    fun undoLastDecision() {
        lastDecisionUndo?.invoke()
        lastDecisionUndo = null
        decisionUndoWindow?.cancel()
        _decisionUndoable.value = false
    }

    /** Quitter l'écran n'annule pas un geste validé : la fenêtre d'annulation s'arrête là et l'appel part. */
    override fun onCleared() {
        val calls = holds.takeHeld()
        if (calls.isNotEmpty()) LEAVING.launch { calls.forEach { repository.send(it) } }
        val decisionCalls = decisionHolds.takeHeld()
        if (decisionCalls.isNotEmpty()) LEAVING.launch { decisionCalls.forEach { decisionsRepository.send(it) } }
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
