package ch.nicolab.cadence.tasks.review

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/**
 * « Session courte aujourd'hui » de l'étape Repoussées, reprise du web (`ReviewPage.tsx`, docs/34-review.md) : la
 * tâche rejoint le plan du jour du serveur, à la fin, pour [MINUTES] minutes et sans heure ; ni son échéance ni son
 * estimation ne changent. Le plan est remplacé en entier (`PUT /api/daily-plan/:date`), donc l'écriture se fait en
 * ligne, jamais rejouée plus tard sur un plan qui aurait changé.
 */
object ShortSession {
    const val MINUTES = 25

    /** Jour du plan lu (`date`, aujourd'hui dans le fuseau du compte). */
    fun date(response: JsonObject): String? = response["date"]?.jsonPrimitive?.contentOrNull

    /** Corps du `PUT` : les éléments du plan sans la tâche, puis la tâche. */
    fun body(response: JsonObject, taskUid: String): JsonObject {
        val items = ((response["plan"] as? JsonObject)?.get("items") as? JsonArray).orEmpty()
            .mapNotNull { it as? JsonObject }
            .filter { (it["task_uid"] as? JsonPrimitive)?.contentOrNull != taskUid }
            .map { item ->
                JsonObject(
                    mapOf(
                        "task_uid" to (item["task_uid"] ?: JsonNull),
                        "start_minute" to (item["start_minute"] ?: JsonNull),
                        "duration_minutes" to (item["duration_minutes"] ?: JsonNull),
                    ),
                )
            }
        val session = JsonObject(
            mapOf("task_uid" to JsonPrimitive(taskUid), "start_minute" to JsonNull, "duration_minutes" to JsonPrimitive(MINUTES)),
        )
        return JsonObject(mapOf("items" to JsonArray(items + session)))
    }
}
