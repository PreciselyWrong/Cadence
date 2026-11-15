package ch.nicolab.cadence.tasks.planning

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * « Planifier change l'échéance » (`alignDueToPlan`), un réglage du serveur partagé avec le web : poser une tâche sur
 * un jour y met aussi son échéance, le serveur l'écrit et la synchro la rapporte (docs/20-daily-plan.md). En ligne
 * seulement, comme sur le web.
 */
class AlignDueClient internal constructor(
    private val call: suspend (method: String, path: String, query: Map<String, String>, body: JsonObject?) -> JsonObject,
) {
    suspend fun read(): Boolean = parse(call("GET", PATH, emptyMap(), null))

    /** Enregistre [on] ; rend la valeur gardée par le serveur. */
    suspend fun write(on: Boolean): Boolean = parse(call("PUT", PATH, emptyMap(), JsonObject(mapOf(KEY to JsonPrimitive(on)))))

    private fun parse(body: JsonObject): Boolean =
        runCatching { body["settings"]?.jsonObject?.get(KEY)?.jsonPrimitive?.booleanOrNull }.getOrNull() ?: false

    private companion object {
        const val PATH = "/api/v1/daily-plan/suggestions"
        const val KEY = "alignDueToPlan"
    }
}
