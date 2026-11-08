package ch.nicolab.cadence.tasks.data

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Champs d'une copie de tâche : contenu, dates, durée, projet, domaine et étiquettes. L'identité, l'épingle,
 * les décisions de revue, le rappel (il sonnerait deux fois) et le parent restent à la tâche d'origine.
 */
internal object TaskCopy {
    private val notCopied = setOf(
        "uid", "parent_task_uid", "pinned_at", "in_view_at", "week_of", "needs_when", "review_on", "reviewed_at",
        "reminder_at", "recurrence_exdates", "field_clocks", "completed_at", "status", "created_at", "updated_at",
    )

    /** Une copie repart à faire : la tâche d'origine peut être terminée sans que sa copie le soit. */
    fun fields(source: JsonObject): Map<String, JsonElement> =
        source.filterKeys { it !in notCopied }.toMap() + mapOf(
            "status" to JsonPrimitive(0),
            "completed_at" to JsonNull,
        )
}
