package ch.nicolab.cadence.tasks.model

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject

/**
 * Plage horaire visible de la grille de l'Agenda (`ui_settings.calendar.visibleHours`).
 * [startHour] est la première heure affichée (0..23), [endHour] l'heure de fin exclusive (1..24).
 */
data class VisibleHours(
    val startHour: Int = 0,
    val endHour: Int = 24,
) {
    val hourCount: Int get() = endHour - startHour

    companion object {
        val WHOLE_DAY = VisibleHours(0, 24)

        fun of(start: Int?, end: Int?): VisibleHours {
            if (start == null || end == null) return WHOLE_DAY
            if (start !in 0..23 || end !in 1..24 || end <= start) return WHOLE_DAY
            return VisibleHours(start, end)
        }

        fun fromUiSettings(uiSettings: JsonObject?): VisibleHours {
            val cal = uiSettings?.get("calendar") as? JsonObject ?: return WHOLE_DAY
            val hours = cal["visibleHours"] as? JsonObject ?: return WHOLE_DAY
            return of(intOrNull(hours["start"]), intOrNull(hours["end"]))
        }
    }
}

/**
 * Journée de travail configurée (`ui_settings.planning.dayHours`), en minutes depuis minuit.
 */
data class DayHoursRange(
    val startMinute: Int,
    val endMinute: Int,
) {
    companion object {
        fun of(start: Int?, end: Int?): DayHoursRange? {
            if (start == null || end == null) return null
            if (start !in 0..1439 || end !in 1..1440 || end <= start) return null
            return DayHoursRange(start, end)
        }

        fun fromUiSettings(uiSettings: JsonObject?): DayHoursRange? {
            val planning = uiSettings?.get("planning") as? JsonObject ?: return null
            val hours = planning["dayHours"] as? JsonObject ?: return null
            return of(intOrNull(hours["start"]), intOrNull(hours["end"]))
        }
    }
}

private fun intOrNull(element: kotlinx.serialization.json.JsonElement?): Int? {
    val primitive = element as? JsonPrimitive ?: return null
    if (primitive.isString) return null
    return primitive.intOrNull
}
