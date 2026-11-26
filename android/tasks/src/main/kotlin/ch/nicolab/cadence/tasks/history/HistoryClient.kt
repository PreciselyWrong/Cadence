package ch.nicolab.cadence.tasks.history

import kotlinx.serialization.json.JsonElement

/** Historique d'une tâche lu en ligne (`GET /api/task/:uid/timeline`) ; rien n'est gardé sur l'appareil. */
class HistoryClient internal constructor(
    private val call: suspend (method: String, path: String, query: Map<String, String>) -> JsonElement,
) {
    suspend fun of(taskUid: String): List<HistoryLine> =
        TaskHistory.parse(call("GET", "/api/task/${java.net.URLEncoder.encode(taskUid, "UTF-8")}/timeline", emptyMap()))
}
