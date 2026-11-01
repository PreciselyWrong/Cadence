package ch.nicolab.cadence.tasks.widget

import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Coche optimiste : la case est cochée dès le toucher ([held]), la ligne reste cochée
 * [holdMillis], puis la tâche est écrite et quitte la liste avec l'écriture en base.
 *
 * Toucher de nouveau pendant le maintien annule sans rien écrire ; pendant l'écriture, le
 * toucher est ignoré (une occurrence récurrente ne doit pas être terminée deux fois). Une
 * écriture en échec rend la case et remonte l'erreur. [graceMillis] garde la coche après
 * l'écriture, le temps que la liste relise la base : sans lui, la ligne reviendrait décochée
 * une image avant de disparaître.
 */
class HeldCompletion(
    private val holdMillis: Long,
    private val graceMillis: Long = 0,
) {
    enum class Outcome { WRITTEN, CANCELLED, IGNORED }

    private val _held = MutableStateFlow<Set<String>>(emptySet())

    /** Tâches cochées dont l'écriture n'est pas encore relue par les listes. */
    val held: StateFlow<Set<String>> = _held.asStateFlow()

    private val lock = Any()

    /** Maintiens en cours, annulables par un second toucher. */
    private val holding = HashMap<String, Job>()

    fun isHeld(uid: String): Boolean = uid in _held.value

    /**
     * [redraw] part juste après la coche, en parallèle du maintien : la case cochée s'affiche
     * sans attendre la base. [write] n'est appelé qu'après le maintien.
     */
    suspend fun toggle(
        uid: String,
        redraw: suspend () -> Unit = {},
        write: suspend (String) -> Unit,
    ): Outcome = coroutineScope {
        val hold: Job = synchronized(lock) {
            val running = holding.remove(uid)
            when {
                running != null -> {
                    running.cancel()
                    _held.update { it - uid }
                    null
                }
                uid in _held.value -> return@coroutineScope Outcome.IGNORED
                else -> launch(start = CoroutineStart.LAZY) { delay(holdMillis) }.also {
                    holding[uid] = it
                    _held.update { held -> held + uid }
                }
            }
        } ?: run {
            redraw()
            return@coroutineScope Outcome.CANCELLED
        }
        try {
            hold.start()
            redraw()
            hold.join()
            val stillHeld = synchronized(lock) { holding.remove(uid, hold) }
            if (hold.isCancelled || !stillHeld) return@coroutineScope Outcome.CANCELLED
            write(uid)
            delay(graceMillis)
            Outcome.WRITTEN
        } finally {
            synchronized(lock) {
                if (holding[uid] === hold) holding.remove(uid)
                // Un nouveau maintien a pu commencer après une annulation : ne pas lui retirer sa coche.
                if (uid !in holding) _held.update { it - uid }
            }
        }
    }
}
