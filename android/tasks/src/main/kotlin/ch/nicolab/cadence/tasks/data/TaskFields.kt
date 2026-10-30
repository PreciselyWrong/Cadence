package ch.nicolab.cadence.tasks.data

import ch.nicolab.cadence.tasks.model.RepeatType
import ch.nicolab.cadence.tasks.model.Repetition
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject

/** Lecture des champs serveur gardés dans `extrasJson` : seuls les scalaires sont exposés, en texte. */
internal object TaskExtras {
    fun parse(extrasJson: String): Map<String, String> = runCatching {
        Json.parseToJsonElement(extrasJson).jsonObject
            .mapNotNull { (key, value) -> (value as? JsonPrimitive)?.contentOrNull?.let { key to it } }
            .toMap()
    }.getOrDefault(emptyMap())
}

/** Valeurs envoyées au serveur pour les champs que l'appareil écrit sans colonne dédiée. */
internal object TaskFields {
    /** Début sans heure : début du jour dans le fuseau du compte ; avec heure "HH:mm" : heure de l'appareil, comme l'échéance. */
    fun start(date: LocalDate?, time: String?, accountZone: ZoneId, deviceZone: ZoneId): Map<String, JsonElement> {
        if (date == null) return mapOf("start_date" to JsonNull, "start_has_time" to JsonPrimitive(false))
        val instant = if (time == null) {
            date.atStartOfDay(accountZone).toInstant()
        } else {
            date.atTime(LocalTime.parse(time)).atZone(deviceZone).toInstant()
        }
        return mapOf("start_date" to JsonPrimitive(instant.toString()), "start_has_time" to JsonPrimitive(time != null))
    }

    fun estimate(minutes: Int?): Map<String, JsonElement> =
        mapOf("estimated_minutes" to (minutes?.let { JsonPrimitive(it) } ?: JsonNull))

    /**
     * Règle de répétition ancrée sur l'échéance : le jour de semaine (0 = dimanche, comme le serveur) pour
     * une règle hebdomadaire, le quantième pour une règle mensuelle. Sans échéance, seule la fréquence est écrite.
     */
    fun repetition(repetition: Repetition, due: LocalDate?): Map<String, JsonElement> {
        val type = if (repetition.type == RepeatType.OTHER) RepeatType.NONE else repetition.type
        val weekday = due?.takeIf { type == RepeatType.WEEKLY }?.dayOfWeek?.value?.rem(7)
        val monthDay = due?.takeIf { type == RepeatType.MONTHLY }?.dayOfMonth
        return mapOf(
            "recurrence_type" to JsonPrimitive(type.wire),
            "recurrence_interval" to JsonPrimitive(repetition.interval.coerceAtLeast(1)),
            "recurrence_weekday" to (weekday?.let { JsonPrimitive(it) } ?: JsonNull),
            "recurrence_month_day" to (monthDay?.let { JsonPrimitive(it) } ?: JsonNull),
        )
    }
}
