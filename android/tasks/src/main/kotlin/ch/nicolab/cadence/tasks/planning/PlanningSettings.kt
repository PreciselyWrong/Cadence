package ch.nicolab.cadence.tasks.planning

import java.time.DayOfWeek
import java.time.LocalTime
import java.time.format.DateTimeParseException

/** Plage protégée (travail de fond, repas…) : aucune tâche n'y est proposée. */
data class FocusBlock(
    val label: String,
    val start: LocalTime,
    val end: LocalTime,
    val days: Set<DayOfWeek> = WorkingHours.DEFAULT_DAYS,
) {
    val slot: Slot get() = Slot(start.toSecondOfDay() / 60, end.toSecondOfDay() / 60)
}

/**
 * Réglages de la planification : heures de travail, heure de fin de journée (à partir de laquelle
 * « Terminer la journée » se propose) et plages protégées.
 */
data class PlanningSettings(
    val hours: WorkingHours = WorkingHours(),
    val shutdown: LocalTime = DEFAULT_SHUTDOWN,
    val focusBlocks: List<FocusBlock> = emptyList(),
) {
    companion object {
        val DEFAULT_SHUTDOWN: LocalTime = LocalTime.of(18, 0)
    }
}

/** Texte des réglages tel que stocké ; toute valeur illisible retombe sur la valeur par défaut. */
object PlanningSettingsCodec {
    fun encodeTime(time: LocalTime): String = "%02d:%02d".format(time.hour, time.minute)

    fun decodeTime(text: String?, fallback: LocalTime): LocalTime =
        try {
            text?.let(LocalTime::parse) ?: fallback
        } catch (_: DateTimeParseException) {
            fallback
        }

    fun encodeDays(days: Set<DayOfWeek>): String = days.sorted().joinToString(",") { it.value.toString() }

    fun decodeDays(text: String?, fallback: Set<DayOfWeek>): Set<DayOfWeek> {
        if (text == null) return fallback
        return text.split(',').mapNotNull { it.trim().toIntOrNull()?.takeIf { v -> v in 1..7 }?.let(DayOfWeek::of) }.toSet()
    }

    fun encodeFocus(blocks: List<FocusBlock>): String = blocks.joinToString(BLOCK_SEPARATOR) {
        listOf(it.label.replace(FIELD_SEPARATOR, " ").replace(BLOCK_SEPARATOR, " "), encodeTime(it.start), encodeTime(it.end), encodeDays(it.days))
            .joinToString(FIELD_SEPARATOR)
    }

    fun decodeFocus(text: String?): List<FocusBlock> {
        if (text.isNullOrBlank()) return emptyList()
        return text.split(BLOCK_SEPARATOR).mapNotNull { entry ->
            val parts = entry.split(FIELD_SEPARATOR)
            if (parts.size != 4) return@mapNotNull null
            val start = decodeTime(parts[1], FALLBACK)
            val end = decodeTime(parts[2], FALLBACK)
            if (start == FALLBACK || end == FALLBACK || !end.isAfter(start)) return@mapNotNull null
            FocusBlock(parts[0], start, end, decodeDays(parts[3], emptySet()))
        }
    }

    private const val FIELD_SEPARATOR = "|"
    private const val BLOCK_SEPARATOR = ";"
    private val FALLBACK: LocalTime = LocalTime.MAX
}
