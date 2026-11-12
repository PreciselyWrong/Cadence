package ch.nicolab.cadence.tasks.data

import ch.nicolab.cadence.tasks.model.RecurrenceRule
import ch.nicolab.cadence.tasks.model.RepeatType
import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.Repetition
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
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

    /**
     * Règle de la série d'après les champs serveur `recurrence_*` gardés dans les extras. Les tableaux
     * (`recurrence_weekdays`, `recurrence_exdates`) arrivent en liste JSON ou en texte JSON ; une valeur illisible est ignorée.
     */
    fun recurrenceRule(extrasJson: String, zone: ZoneId? = null): RecurrenceRule {
        val extras = runCatching { Json.parseToJsonElement(extrasJson).jsonObject }.getOrNull() ?: return RecurrenceRule()
        fun scalar(key: String) = (extras[key] as? JsonPrimitive)?.contentOrNull
        fun list(key: String): List<String> {
            val element = extras[key]
            val array = element as? JsonArray
                ?: (element as? JsonPrimitive)?.contentOrNull?.let { runCatching { Json.parseToJsonElement(it) as? JsonArray }.getOrNull() }
            return array?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.orEmpty()
        }
        return RecurrenceRule(
            interval = scalar("recurrence_interval")?.toIntOrNull()?.coerceAtLeast(1) ?: 1,
            weekday = scalar("recurrence_weekday")?.toIntOrNull(),
            weekdays = list("recurrence_weekdays").mapNotNull { it.toIntOrNull() },
            monthDay = scalar("recurrence_month_day")?.toIntOrNull(),
            weekOfMonth = scalar("recurrence_week_of_month")?.toIntOrNull(),
            endDay = scalar("recurrence_end_date")?.let { endDay(it, zone) },
            exdates = list("recurrence_exdates").mapNotNull { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }.toSet(),
            completionBased = scalar("completion_based").let { it == "true" || it == "1" },
        )
    }
}

/**
 * Dernier jour d'une série. Le serveur stocke un instant (la veille d'une coupe, « début du jour moins 1 ms ») :
 * lu dans le fuseau du compte il donne le bon jour, lu en UTC il dérive d'un jour à l'ouest de Greenwich.
 */
private fun endDay(raw: String, zone: ZoneId?): LocalDate? {
    if (zone != null) {
        parseInstant(raw)?.let { return it.atZone(zone).toLocalDate() }
    }
    return runCatching { LocalDate.parse(raw.take(10)) }.getOrNull()
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

    /**
     * Champs de l'entonnoir (docs/34-review.md), comme `applyDecisionFields` du serveur : la mise en vue garde
     * l'instant déjà posé, « Plus tard » ([TaskChange.later]) passe par l'étiquette [somedayUid] et l'emporte sur
     * la vue et la semaine. Aucun de ces champs ne touche l'échéance.
     */
    fun decision(
        change: TaskChange,
        inViewAtRaw: String?,
        tagUids: List<String>,
        somedayUid: String?,
        nowIso: String,
    ): Map<String, JsonElement> = buildMap {
        when (change.inView) {
            true -> if (inViewAtRaw == null) put("in_view_at", JsonPrimitive(nowIso))
            false -> put("in_view_at", JsonNull)
            null -> Unit
        }
        when {
            change.clearWeek -> put("week_of", JsonNull)
            change.weekOf != null -> put("week_of", JsonPrimitive(change.weekOf.toString()))
        }
        when {
            change.clearMonth -> put("month_of", JsonNull)
            change.monthOf != null -> put("month_of", JsonPrimitive(change.monthOf.withDayOfMonth(1).toString()))
        }
        when {
            change.clearReviewOn -> put("review_on", JsonNull)
            change.reviewOn != null -> put("review_on", JsonPrimitive(change.reviewOn.toString()))
        }
        if (change.reviewed) put("reviewed_at", JsonPrimitive(nowIso))
        if (change.later == true) {
            put("in_view_at", JsonNull)
            put("week_of", JsonNull)
            put("month_of", JsonNull)
        }
        val tags = when {
            change.later == null || somedayUid == null || change.tagUids != null -> null
            change.later -> if (somedayUid in tagUids) null else tagUids + somedayUid
            else -> if (somedayUid in tagUids) tagUids - somedayUid else null
        }
        tags?.let { put("tag_uids", JsonArray(it.map(::JsonPrimitive))) }
    }
}
