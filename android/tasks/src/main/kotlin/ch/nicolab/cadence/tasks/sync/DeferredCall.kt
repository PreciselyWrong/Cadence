package ch.nicolab.cadence.tasks.sync

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Appel à l'API hors du protocole de synchro (revue, routine, déplacement d'occurrence), gardé tant que le
 * serveur ne l'a pas reçu. [key] regroupe les appels qui se remplacent : seul le dernier temps disponible
 * de la semaine compte, un projet n'est gardé tel quel qu'une fois.
 */
data class DeferredCall(
    val key: String,
    val method: String,
    val path: String,
    val body: JsonObject?,
    /** Ce que l'appel fait, pour la liste des refus : « Garder tel quel : Maison ». */
    val label: String,
    val attempts: Int = 0,
)

internal fun moveOccurrenceCall(uid: String, scope: String, occurrenceDate: String, dueDate: String) = DeferredCall(
    key = "move-occurrence:$uid:$occurrenceDate",
    method = "POST",
    path = "/api/v1/task/${encodePath(uid)}/move-occurrence",
    body = JsonObject(
        mapOf(
            "scope" to JsonPrimitive(scope),
            "occurrence_date" to JsonPrimitive(occurrenceDate),
            "due_date" to JsonPrimitive(dueDate),
        ),
    ),
    label = "Déplacer une occurrence",
)

internal fun encodePath(value: String): String = java.net.URLEncoder.encode(value, "UTF-8")
