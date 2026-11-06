package ch.nicolab.cadence.tasks.triage

import ch.nicolab.cadence.tasks.sync.DeferredCall
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Gestes de la file « À trier » : l'appel attend la fin de la fenêtre d'annulation, car une suppression ou une
 * conversion ne se rattrape plus une fois envoyée. La carte reste masquée tant que son appel n'a pas abouti.
 */
internal class TriageHolds(
    private val scope: CoroutineScope,
    private val windowMs: Long,
    private val send: suspend (DeferredCall) -> Unit,
) {
    private class Held(val call: DeferredCall, val job: Job)

    private val held = mutableMapOf<String, Held>()
    private val sent = mutableMapOf<String, String>()
    private val _hidden = MutableStateFlow<Set<String>>(emptySet())
    val hidden: StateFlow<Set<String>> = _hidden.asStateFlow()

    /** Retient [call] pour la carte [itemKey] ; le résultat l'annule tant qu'il n'est pas parti. */
    fun hold(itemKey: String, call: DeferredCall): () -> Unit {
        val job = scope.launch {
            delay(windowMs)
            held.remove(itemKey)
            sent[itemKey] = call.key
            send(call)
        }
        held[itemKey] = Held(call, job)
        publish()
        return {
            job.cancel()
            if (held.remove(itemKey) != null) publish()
        }
    }

    /** Arrête les fenêtres ouvertes et rend leurs appels, à envoyer sans attendre. */
    fun takeHeld(): List<DeferredCall> {
        val calls = held.values.map { it.job.cancel(); it.call }
        held.clear()
        publish()
        return calls
    }

    /** Après une relecture de la file : un appel qui n'est plus en attente a abouti ou été refusé, sa carte suit le serveur. */
    fun settle(pending: Set<String>) {
        sent.values.retainAll(pending)
        publish()
    }

    private fun publish() {
        _hidden.value = held.keys + sent.keys
    }
}
