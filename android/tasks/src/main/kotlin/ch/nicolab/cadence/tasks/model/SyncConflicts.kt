package ch.nicolab.cadence.tasks.model

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull

/**
 * Conflit perdu par le téléphone, tel que Réglages le montre : le serveur avait une valeur plus récente et l'a
 * gardée ; [localText] est ce que le téléphone avait écrit. [canKeepLocal] : la valeur du téléphone peut être
 * renvoyée (tâches, projets, notes… ; pas les habitudes, dont l'écriture passe par leur propre file).
 */
data class SyncConflictItem(
    val id: String,
    val entityLabel: String,
    val name: String?,
    val fieldLabel: String,
    val localText: String,
    val serverText: String?,
    val atMs: Long,
    val canKeepLocal: Boolean,
    /** `entité|uid|champ` ([SyncConflictMerge.key]) : rapproche la ligne d'un conflit lu sur le serveur. */
    val key: String = "",
)

/** Opération refusée par le serveur : la ligne, l'entité et la raison donnée. */
data class RefusedItem(val entityLabel: String, val name: String?, val reason: String?, val atMs: Long)

/** Libellés et rendu des valeurs d'un conflit, sans Android : testés sur la JVM. */
object SyncConflictText {
    /** Entités dont la valeur du téléphone peut être renvoyée par la file d'envoi des tâches. */
    val REAPPLICABLE = setOf("task", "project", "area", "goal", "tag", "note", "inbox_item", "link")

    /** Champ qui désigne une autre ligne : son uid se lit par le nom de cette ligne. */
    val REFERENCES = mapOf(
        "project_uid" to "project",
        "parent_project_uid" to "project",
        "area_uid" to "area",
        "goal_uid" to "goal",
        "parent_goal_uid" to "goal",
        "parent_task_uid" to "task",
        "next_task_uid" to "task",
        "parent_uid" to "tag",
        "tag_uids" to "tag",
    )

    private val ENTITIES = mapOf(
        "task" to "Tâche",
        "project" to "Projet",
        "area" to "Domaine",
        "goal" to "Objectif",
        "tag" to "Étiquette",
        "note" to "Note",
        "inbox_item" to "Idée",
        "link" to "Lien",
    )

    private val FIELDS = mapOf(
        "name" to "Titre",
        "title" to "Titre",
        "note" to "Note",
        "content" to "Contenu",
        "description" to "Description",
        "priority" to "Priorité",
        "status" to "Statut",
        "due_date" to "Échéance",
        "due_date_at" to "Échéance",
        "start_date" to "Début",
        "start_date_at" to "Début",
        "completed_at" to "Terminée le",
        "project_uid" to "Projet",
        "parent_project_uid" to "Projet parent",
        "area_uid" to "Domaine",
        "goal_uid" to "Objectif",
        "parent_task_uid" to "Tâche parente",
        "next_task_uid" to "Prochaine action",
        "tag_uids" to "Étiquettes",
        "color" to "Couleur",
        "icon" to "Icône",
        "pin_to_sidebar" to "Épinglée",
        "recurrence_type" to "Répétition",
        "estimated_minutes" to "Durée",
        "week_of" to "Semaine",
        "month_of" to "Mois",
        "source" to "Origine",
        "source_url" to "Page d'origine",
        "needs_when" to "Quand ?",
        "in_view_at" to "En vue",
        "review_on" to "À revoir le",
    )

    private val DATE_TIME = DateTimeFormatter.ofPattern("d MMM yyyy HH:mm", Locale.FRENCH)

    fun entityLabel(entity: String): String = ENTITIES[entity] ?: entity.replace('_', ' ')

    fun fieldLabel(field: String): String = FIELDS[field] ?: field.replace('_', ' ')

    /**
     * Valeur lisible : texte tel quel, vide nommé, oui/non, date et heure locales, une référence par le nom
     * de la ligne qu'elle désigne ([nameOf] reçoit l'entité et l'uid).
     */
    fun render(
        field: String,
        value: JsonElement?,
        zone: ZoneId = ZoneId.systemDefault(),
        nameOf: (entity: String, uid: String) -> String? = { _, _ -> null },
    ): String {
        val target = REFERENCES[field]
        return when (value) {
            null, JsonNull -> "(vide)"
            is JsonArray -> if (value.isEmpty()) "(vide)" else value.joinToString(", ") { render(field, it, zone, nameOf) }
            is JsonObject -> value.toString()
            is JsonPrimitive -> {
                val text = value.contentOrNull ?: return "(vide)"
                when {
                    !value.isString && value.booleanOrNull != null -> if (value.booleanOrNull == true) "oui" else "non"
                    target != null -> nameOf(target, text) ?: text
                    text.isBlank() -> "(vide)"
                    else -> asDateTime(text, zone) ?: text.take(MAX_LENGTH)
                }
            }
        }
    }

    private fun asDateTime(text: String, zone: ZoneId): String? {
        if (text.length < 20 || text[4] != '-' || !text.contains('T')) return null
        return runCatching { DATE_TIME.format(Instant.parse(text).atZone(zone)) }.getOrNull()
    }

    private const val MAX_LENGTH = 200
}
