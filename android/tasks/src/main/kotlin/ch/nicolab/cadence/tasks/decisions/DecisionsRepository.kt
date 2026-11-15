package ch.nicolab.cadence.tasks.decisions

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import ch.nicolab.cadence.tasks.sync.DeferredCall
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

/** Dernières cartes de décision lues, pour la lecture hors ligne. */
class DecisionsStore private constructor(private val prefs: SharedPreferences) {
    fun read(): String? = prefs.getString(KEY, null)

    fun write(json: String) = prefs.edit { putString(KEY, json) }

    companion object {
        private const val PREFS = "cadence_decisions"
        private const val KEY = "decisions"

        fun of(context: Context) = DecisionsStore(context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE))
    }
}

/** Cartes de décision des agents : lues en ligne (`GET /api/decisions`), gardées pour le hors ligne ; décisions par la file d'appels différés. */
class DecisionsRepository internal constructor(
    private val store: DecisionsStore,
    private val call: suspend (method: String, path: String, query: Map<String, String>, body: JsonObject?) -> JsonObject,
    private val pendingCalls: suspend () -> Set<String>,
    private val defer: suspend (DeferredCall) -> Unit,
) {
    private val _cards = MutableStateFlow(decode(store.read()))
    val cards: StateFlow<List<DecisionCardData>> = _cards.asStateFlow()

    suspend fun refresh(): Result<Unit> = try {
        val body = call("GET", "/api/decisions", emptyMap(), null)
        store.write(body.toString())
        _cards.value = DecisionPayload.parseList(body)
        Result.success(Unit)
    } catch (error: CancellationException) {
        throw error
    } catch (error: Exception) {
        Result.failure(error)
    }

    internal suspend fun send(call: DeferredCall) = defer(call)

    internal suspend fun pendingCallKeys(): Set<String> = pendingCalls()

    private fun decode(raw: String?): List<DecisionCardData> {
        raw ?: return emptyList()
        val obj = runCatching { JSON.decodeFromString<JsonObject>(raw) }.getOrNull() ?: return emptyList()
        return DecisionPayload.parseList(obj)
    }

    private companion object {
        val JSON = Json { ignoreUnknownKeys = true }
    }
}
