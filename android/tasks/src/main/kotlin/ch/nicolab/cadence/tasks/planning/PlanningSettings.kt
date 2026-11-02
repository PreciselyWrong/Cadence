package ch.nicolab.cadence.tasks.planning

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeParseException
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive

/**
 * Plage protégée (travail de fond, repas…) : aucune tâche n'y est proposée. [id] est donné par le serveur ; vide
 * tant qu'une plage créée hors ligne n'y est pas arrivée.
 */
data class FocusBlock(
    val label: String,
    val start: LocalTime,
    val end: LocalTime,
    val days: Set<DayOfWeek> = WorkingHours.DEFAULT_DAYS,
    val id: String = "",
) {
    val slot: Slot get() = Slot(start.toSecondOfDay() / 60, end.toSecondOfDay() / 60)
}

/**
 * Exception (vacances, jour de congé) : du [start] au [end] inclus, les plages [blockIds] sont libres ; `null` les
 * libère toutes.
 */
data class FocusException(
    val start: LocalDate,
    val end: LocalDate,
    val blockIds: Set<String>? = null,
    val label: String = "",
    val id: String = "",
) {
    fun frees(day: LocalDate, block: FocusBlock): Boolean =
        !day.isBefore(start) && !day.isAfter(end) && (blockIds == null || block.id in blockIds)
}

/**
 * Réglages de la planification : heures de travail, heure de fin de journée (à partir de laquelle
 * « Terminer la journée » se propose) et plages protégées.
 */
data class PlanningSettings(
    val hours: WorkingHours = WorkingHours(),
    val shutdown: LocalTime = DEFAULT_SHUTDOWN,
    val focusBlocks: List<FocusBlock> = emptyList(),
    val focusExceptions: List<FocusException> = emptyList(),
) {
    /** Plages qui tiennent le jour [day] : celles de son jour de la semaine, moins celles qu'une exception libère. */
    fun focusBlocksOn(day: LocalDate): List<FocusBlock> = focusBlocks.filter { block ->
        day.dayOfWeek in block.days && focusExceptions.none { it.frees(day, block) }
    }

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

/**
 * Plages et exceptions au format du serveur (`/api/daily-plan/focus-blocks`, docs/20-daily-plan.md) : jours 0
 * (dimanche) à 6, minutes après minuit, dates `YYYY-MM-DD`. Le serveur en est la source ; le téléphone en garde la
 * dernière lecture.
 */
object FocusJson {
    fun parse(body: JsonObject): Pair<List<FocusBlock>, List<FocusException>> {
        val blocks = (body["blocks"] as? JsonArray).orEmpty().mapNotNull { element ->
            val item = element as? JsonObject ?: return@mapNotNull null
            val start = item.minute("start") ?: return@mapNotNull null
            val end = item.minute("end") ?: return@mapNotNull null
            val days = (item["days"] as? JsonArray).orEmpty()
                .mapNotNull { it.jsonPrimitive.intOrNull?.takeIf { d -> d in 0..6 }?.let(::dayOf) }.toSet()
            if (days.isEmpty() || end <= start) return@mapNotNull null
            FocusBlock(
                label = item.text("label").orEmpty(),
                start = LocalTime.MIN.plusMinutes(start.toLong()),
                // 24:00 n'existe pas en LocalTime : une plage jusqu'à minuit s'arrête à 23:59.
                end = if (end >= MINUTES_PER_DAY) LocalTime.MAX.withSecond(0).withNano(0) else LocalTime.MIN.plusMinutes(end.toLong()),
                days = days,
                id = item.text("id").orEmpty(),
            )
        }
        val exceptions = (body["exceptions"] as? JsonArray).orEmpty().mapNotNull { element ->
            val item = element as? JsonObject ?: return@mapNotNull null
            val start = item.date("start") ?: return@mapNotNull null
            val end = item.date("end") ?: return@mapNotNull null
            if (end.isBefore(start)) return@mapNotNull null
            val ids = (item["block_ids"] as? JsonArray)?.mapNotNull { it.jsonPrimitive.contentOrNull }?.toSet()
            FocusException(start, end, ids?.takeIf { it.isNotEmpty() }, item.text("label").orEmpty(), item.text("id").orEmpty())
        }
        return blocks to exceptions
    }

    fun body(blocks: List<FocusBlock>, exceptions: List<FocusException>): JsonObject = JsonObject(
        mapOf(
            "blocks" to JsonArray(blocks.map { block ->
                JsonObject(
                    buildMap {
                        if (block.id.isNotEmpty()) put("id", JsonPrimitive(block.id))
                        put("days", JsonArray(block.days.sorted().map { JsonPrimitive(it.value % 7) }))
                        put("start", JsonPrimitive(block.start.toSecondOfDay() / 60))
                        put("end", JsonPrimitive(minuteOfEnd(block.end)))
                        if (block.label.isNotBlank()) put("label", JsonPrimitive(block.label.trim()))
                    },
                )
            }),
            "exceptions" to JsonArray(exceptions.map { exception ->
                JsonObject(
                    buildMap {
                        if (exception.id.isNotEmpty()) put("id", JsonPrimitive(exception.id))
                        put("start", JsonPrimitive(exception.start.toString()))
                        put("end", JsonPrimitive(exception.end.toString()))
                        put("block_ids", exception.blockIds?.let { ids -> JsonArray(ids.sorted().map(::JsonPrimitive)) } ?: JsonNull)
                        if (exception.label.isNotBlank()) put("label", JsonPrimitive(exception.label.trim()))
                    },
                )
            }),
        ),
    )

    private fun minuteOfEnd(end: LocalTime): Int =
        if (end.hour == 23 && end.minute == 59) MINUTES_PER_DAY else end.toSecondOfDay() / 60

    private fun dayOf(js: Int): DayOfWeek = if (js == 0) DayOfWeek.SUNDAY else DayOfWeek.of(js)

    private fun JsonObject.minute(key: String): Int? = this[key]?.jsonPrimitive?.intOrNull?.takeIf { it in 0..MINUTES_PER_DAY }

    private fun JsonObject.text(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull

    private fun JsonObject.date(key: String): LocalDate? = text(key)?.let { runCatching { LocalDate.parse(it) }.getOrNull() }

    private const val MINUTES_PER_DAY = 24 * 60
}
