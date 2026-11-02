package ch.nicolab.cadence.tasks.planning

import ch.nicolab.cadence.tasks.sync.HttpError
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonObject

/** Ce que le téléphone doit encore envoyer au serveur ; gardé sur l'appareil, donc survit à l'arrêt de l'app. */
enum class FocusPending {
    NONE,

    /** Plages d'avant la synchro : envoyées seulement si le serveur n'en a aucune, sinon celles du serveur l'emportent. */
    LEGACY,

    /** Modifiées sur le téléphone : envoyées telles quelles au prochain passage. */
    EDITED,
}

data class FocusState(
    val blocks: List<FocusBlock>,
    val exceptions: List<FocusException>,
    val pending: FocusPending,
)

/** Plages protégées et exceptions gardées sur l'appareil ([PlanningStore]). */
interface FocusCache {
    fun focus(): FocusState
    fun setFocus(blocks: List<FocusBlock>, exceptions: List<FocusException>, pending: FocusPending)
}

/**
 * Plages protégées et exceptions, dont le serveur est la source (`/api/daily-plan/focus-blocks`) : le web, l'IA du
 * plan et le téléphone évitent les mêmes heures. Une modification est gardée tout de suite sur l'appareil, marquée
 * à envoyer, puis envoyée une fois l'édition posée ; sans serveur joignable, elle part au passage de synchro suivant
 * ([sync], appelé après chaque synchro). La dernière écriture l'emporte, comme sur le web.
 */
class FocusRepository internal constructor(
    private val cache: FocusCache,
    private val call: suspend (method: String, path: String, query: Map<String, String>, body: JsonObject?) -> JsonObject,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
    private val saveDelayMs: Long = SAVE_DELAY_MS,
) {
    private val mutex = Mutex()
    // Une réponse partie avant la dernière modification ne remplace pas celle-ci.
    private val edits = AtomicInteger()
    private var pendingSave: Job? = null

    private val _error = MutableStateFlow<String?>(null)
    /** Dernier refus du serveur (modification annulée), effacé au premier envoi réussi. */
    val error: StateFlow<String?> = _error.asStateFlow()

    fun edit(blocks: List<FocusBlock>, exceptions: List<FocusException>) {
        val pending = if (cache.focus().pending == FocusPending.LEGACY) FocusPending.LEGACY else FocusPending.EDITED
        cache.setFocus(blocks, exceptions, pending)
        edits.incrementAndGet()
        pendingSave?.cancel()
        pendingSave = scope.launch {
            delay(saveDelayMs)
            sync()
        }
    }

    /** Envoie ce qui attend, sinon relit le serveur. Hors ligne ou sans serveur, rien ne change. */
    suspend fun sync() = mutex.withLock {
        val seen = edits.get()
        val local = cache.focus()
        try {
            val result = when (local.pending) {
                FocusPending.EDITED -> withLocalText(local, put(local.blocks, local.exceptions))
                FocusPending.LEGACY -> {
                    val server = get()
                    if (server.first.isEmpty() && local.blocks.isNotEmpty()) {
                        withLocalText(local.copy(exceptions = server.second), put(local.blocks, server.second))
                    } else {
                        server
                    }
                }
                FocusPending.NONE -> get()
            }
            if (seen == edits.get()) cache.setFocus(result.first, result.second, FocusPending.NONE)
            _error.value = null
        } catch (error: CancellationException) {
            throw error
        } catch (error: HttpError) {
            if (!error.isClientError) return@withLock
            // Refusée : la modification est abandonnée, le téléphone reprend la version du serveur.
            _error.value = error.message
            val server = runCatching { get() }.getOrNull()
            if (seen == edits.get()) {
                if (server != null) cache.setFocus(server.first, server.second, FocusPending.NONE)
                else cache.setFocus(local.blocks, local.exceptions, FocusPending.NONE)
            }
        } catch (_: Exception) {
            // Serveur injoignable ou absent : la modification reste à envoyer.
        }
    }

    private suspend fun get() = FocusJson.parse(call("GET", PATH, emptyMap(), null))

    private suspend fun put(blocks: List<FocusBlock>, exceptions: List<FocusException>) =
        FocusJson.parse(call("PUT", PATH, emptyMap(), FocusJson.body(blocks, exceptions)))

    /**
     * Garde ce qui a été saisi sur le téléphone (un libellé en cours de frappe, que le serveur rogne) et n'en prend
     * que les identifiants qu'il a donnés ; si le serveur a rendu autre chose, sa version l'emporte.
     */
    private fun withLocalText(
        local: FocusState,
        saved: Pair<List<FocusBlock>, List<FocusException>>,
    ): Pair<List<FocusBlock>, List<FocusException>> {
        if (saved.first.size != local.blocks.size || saved.second.size != local.exceptions.size) return saved
        val ids = local.blocks.zip(saved.first).associate { (mine, theirs) -> mine.id to theirs.id }
        return local.blocks.zip(saved.first) { mine, theirs -> mine.copy(id = theirs.id) } to
            local.exceptions.zip(saved.second) { mine, theirs ->
                mine.copy(id = theirs.id, blockIds = mine.blockIds?.map { ids[it] ?: it }?.toSet())
            }
    }

    private companion object {
        const val PATH = "/api/v1/daily-plan/focus-blocks"
        // Une saisie (nom, pas de 30 minutes) part au serveur une fois l'édition posée.
        const val SAVE_DELAY_MS = 700L
    }
}
