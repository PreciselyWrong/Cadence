package ch.nicolab.cadence.tasks.model

/** Durée d'estimation en français court : « 45 min », « 1 h », « 1 h 30 ». */
object EstimateFormat {
    val presets = listOf(15, 30, 45, 60, 90, 120, 180)

    fun format(minutes: Int): String {
        val hours = minutes / 60
        val rest = minutes % 60
        return when {
            hours == 0 -> "$rest min"
            rest == 0 -> "$hours h"
            else -> "$hours h $rest"
        }
    }
}

/**
 * Champs serveur d'une tâche que l'appareil affiche sans les modifier. Ne sont listés que ceux qui
 * ont une valeur ; leur libellé vient des ressources, d'après la clé.
 */
object TaskExtraRows {
    data class Row(val key: String, val value: String)

    private val order = listOf(
        "review_on",
        "reviewed_at",
        "week_of",
        "recurrence_end_date",
        "completion_based",
        "in_view_at",
        "created_at",
        "updated_at",
    )

    fun visible(extras: Map<String, String>): List<Row> =
        order.mapNotNull { key -> extras[key]?.takeIf { it.isNotBlank() }?.let { Row(key, it) } }
}
