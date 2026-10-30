package ch.nicolab.cadence.tasks.sync

import ch.nicolab.cadence.tasks.model.TaskStatus
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Pose les modifications locales encore envoyées sur une ligne reçue du serveur,
 * pour qu'un pull ne les efface pas avant l'envoi.
 */
object PendingOverlay {
    /** Null si une suppression attend d'être envoyée : la ligne ne doit pas revenir. */
    fun apply(server: JsonObject, pending: List<OutboxOp>): JsonObject? {
        val row = server.toMutableMap()
        for (op in pending) {
            when (op.action) {
                "delete" -> return null
                "upsert" -> (op.payload["fields"] as? JsonObject)?.forEach { (name, field) ->
                    row[name] = (field as? JsonObject)?.get("value") ?: JsonNull
                }
                // Une occurrence déjà terminée localement reste masquée tant que le serveur
                // n'a pas avancé la date ; une date plus récente ne doit pas être masquée.
                "complete_occurrence", "skip_occurrence" -> {
                    val occurrence = op.payload["occurrence_date"]
                    if (occurrence != null && row["due_date"] == occurrence) {
                        row["status"] = JsonPrimitive(TaskStatus.DONE)
                    }
                }
            }
        }
        return JsonObject(row)
    }
}
