package ch.nicolab.cadence.tasks.history

import java.time.Instant
import java.time.LocalDate
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.longOrNull

enum class HistoryLabel {
    CREATED, DUE_DATE, NAME, NOTE, PROJECT, STATUS, COMPLETED, ARCHIVED, PRIORITY, TAGS, DEFERRED, COMMENT,
    RELATION_ADDED, RELATION_REMOVED, OCCURRENCE_DONE, OCCURRENCE_SKIPPED, OTHER,
}

enum class HistorySource { WEB, API, DEVICE, AI, SUGGESTION, IMPORT }

/** Une ligne de l'historique ; [dueFrom] et [dueTo] ne servent qu'à [HistoryLabel.DUE_DATE] (`null` = aucune échéance). */
data class HistoryLine(
    val id: Long,
    val label: HistoryLabel,
    val source: HistorySource?,
    val at: Instant?,
    val dueFrom: LocalDate? = null,
    val dueTo: LocalDate? = null,
)

/** Historique d'une tâche (`GET /api/task/:uid/timeline`, plus ancien d'abord) lu en ligne, rendu du plus récent au plus ancien. */
object TaskHistory {
    private val labels = mapOf(
        "created" to HistoryLabel.CREATED,
        "due_date_changed" to HistoryLabel.DUE_DATE,
        "name_changed" to HistoryLabel.NAME,
        "note_changed" to HistoryLabel.NOTE,
        "project_id_changed" to HistoryLabel.PROJECT,
        "project_changed" to HistoryLabel.PROJECT,
        "status_changed" to HistoryLabel.STATUS,
        "completed" to HistoryLabel.COMPLETED,
        "archived" to HistoryLabel.ARCHIVED,
        "priority_changed" to HistoryLabel.PRIORITY,
        "tags_changed" to HistoryLabel.TAGS,
        "defer_until_changed" to HistoryLabel.DEFERRED,
        "comment_added" to HistoryLabel.COMMENT,
        "relation_added" to HistoryLabel.RELATION_ADDED,
        "relation_removed" to HistoryLabel.RELATION_REMOVED,
        "recurring_occurrence_completed" to HistoryLabel.OCCURRENCE_DONE,
        "recurring_occurrence_skipped" to HistoryLabel.OCCURRENCE_SKIPPED,
    )

    private val sources = mapOf(
        "web" to HistorySource.WEB,
        "api" to HistorySource.API,
        "device" to HistorySource.DEVICE,
        "ai" to HistorySource.AI,
        "suggestion" to HistorySource.SUGGESTION,
        "import" to HistorySource.IMPORT,
    )

    fun parse(response: JsonElement): List<HistoryLine> {
        val lines = (response as? JsonArray).orEmpty().mapNotNull { line(it as? JsonObject ?: return@mapNotNull null) }
        return lines.sortedWith(compareByDescending<HistoryLine> { it.at ?: Instant.MIN }.thenByDescending { it.id })
    }

    private fun line(item: JsonObject): HistoryLine? {
        val id = (item["id"] as? JsonPrimitive)?.longOrNull ?: return null
        val label = labels[text(item["event_type"])] ?: HistoryLabel.OTHER
        val source = sources[text((item["metadata"] as? JsonObject)?.get("source"))]
        val at = runCatching { Instant.parse(text(item["created_at"]) ?: return@runCatching null) }.getOrNull()
        if (label != HistoryLabel.DUE_DATE) return HistoryLine(id, label, source, at)
        return HistoryLine(id, label, source, at, day(item["old_value"]), day(item["new_value"]))
    }

    private fun text(element: JsonElement?): String? = (element as? JsonPrimitive)?.takeIf { it !is JsonNull }?.contentOrNull

    private fun day(value: JsonElement?): LocalDate? {
        val raw = text((value as? JsonObject)?.get("due_date")) ?: return null
        return runCatching { LocalDate.parse(raw.take(10)) }.getOrNull()
    }
}
