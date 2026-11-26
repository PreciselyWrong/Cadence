package ch.nicolab.cadence.tasks.breakdown

import ch.nicolab.cadence.tasks.data.TasksRuntime
import ch.nicolab.cadence.tasks.sync.encodePath
import android.content.Context
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull

private const val SETTINGS = "/api/v1/breakdown/settings"

private fun taskPath(uid: String) = "/api/v1/task/${encodePath(uid)}/breakdown"

/** Réglages de « Découper en étapes » tels que le serveur les renvoie, avec ses valeurs par défaut. */
class BreakdownSettings(val values: JsonObject, val defaults: JsonObject, val aiConfigured: Boolean) {
    companion object {
        fun of(body: JsonObject) = BreakdownSettings(
            values = body["settings"] as? JsonObject ?: JsonObject(emptyMap()),
            defaults = body["defaults"] as? JsonObject ?: JsonObject(emptyMap()),
            aiConfigured = (body["ai_configured"] as? JsonPrimitive)?.booleanOrNull == true,
        )
    }
}

/**
 * « Découper en étapes » (`../docs/13-ai-assistant.md`, serveur fait foi), en ligne seulement : la proposition ne
 * crée rien, l'envoi crée les sous-tâches côté serveur (elles arrivent ensuite par la synchro).
 */
class BreakdownRepository internal constructor(
    private val call: suspend (method: String, path: String, query: Map<String, String>, body: JsonObject?) -> JsonObject,
) {
    suspend fun propose(taskUid: String): Result<BreakdownProposal> =
        attempt { BreakdownProposal.parse(call("POST", taskPath(taskUid), emptyMap(), JsonObject(emptyMap()))) }

    /** Crée les étapes en sous-tâches ; renvoie leur nombre. */
    suspend fun apply(taskUid: String, body: JsonObject): Result<Int> = attempt {
        val created = call("POST", taskPath(taskUid) + "/apply", emptyMap(), body)
        (created["subtasks"] as? JsonArray)?.size ?: 0
    }

    suspend fun settings(): Result<BreakdownSettings> = attempt { BreakdownSettings.of(call("GET", SETTINGS, emptyMap(), null)) }

    /** [patch] : le serveur valide chaque valeur (400 sinon). */
    suspend fun save(patch: JsonObject): Result<BreakdownSettings> =
        attempt { BreakdownSettings.of(call("PUT", SETTINGS, emptyMap(), patch)) }

    private suspend fun <T> attempt(block: suspend () -> T): Result<T> = try {
        Result.success(block())
    } catch (error: CancellationException) {
        throw error
    } catch (error: Exception) {
        Result.failure(error)
    }
}

/** Le dépôt, câblé sur l'API du processus. */
internal fun breakdownRepository(context: Context): BreakdownRepository =
    BreakdownRepository(TasksRuntime.get(context.applicationContext).api::call)
