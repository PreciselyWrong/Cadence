package ch.nicolab.cadence.tasks.data

import ch.nicolab.cadence.tasks.model.RecurrenceExpansion
import ch.nicolab.cadence.tasks.model.RecurrenceRule
import ch.nicolab.cadence.tasks.model.RecurringScope
import ch.nicolab.cadence.tasks.model.TaskStatus
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/** Fuseaux de l'utilisateur : le jour d'une occurrence est celui du compte, une heure d'horloge celle de l'appareil. */
internal data class Zones(val account: ZoneId, val device: ZoneId)

/**
 * Ce que l'utilisateur change sur une occurrence : [fields] au format serveur (hors échéance), le nouveau
 * [day] (null : même jour) et la nouvelle heure [time] "HH:mm" (null : heure inchangée).
 */
internal data class OccurrenceChange(
    val fields: Map<String, JsonElement> = emptyMap(),
    val day: LocalDate? = null,
    val time: String? = null,
)

/** La règle de la série n'est pas de celles que l'appareil sait suivre : seule « toute la série » se modifie. */
internal class UnsupportedRecurrence : IllegalStateException("Règle de répétition non prise en charge")

/** Une opération d'envoi : l'écriture locale correspondante est faite par le dépôt. */
internal sealed interface RecurringOp {
    data class Upsert(val uid: String, val fields: Map<String, JsonElement>) : RecurringOp
    data class Delete(val uid: String) : RecurringOp

    /** Saute l'occurrence courante, désignée par son échéance exacte (`skip_occurrence`). */
    data class Skip(val uid: String, val occurrenceDate: String) : RecurringOp
}

/** Opérations dans l'ordre d'envoi ; [editedUid] porte l'occurrence modifiée (nouvelle ligne pour « celle-ci »). */
internal class RecurringPlan(val ops: List<RecurringOp>, val editedUid: String)

/**
 * Modifier ou supprimer une occurrence d'une série hors ligne, par les opérations de
 * `docs/01-recurring-tasks-behavior.md` (« Offline: the same result with sync ops »). Pur : la série arrive
 * au format serveur, le plan repart en champs serveur.
 */
internal object RecurringEdits {
    private val COPIED = listOf("name", "note", "priority", "project_uid", "area_uid", "goal_uid", "estimated_minutes", "tag_uids")
    private val RULE_KEYS = listOf(
        "recurrence_type", "recurrence_interval", "recurrence_weekday", "recurrence_weekdays",
        "recurrence_month_day", "recurrence_week_of_month", "completion_based",
    )

    fun edit(
        series: JsonObject,
        scope: RecurringScope,
        occurrence: LocalDate,
        change: OccurrenceChange,
        newUid: String,
        zones: Zones,
        today: LocalDate,
        now: Instant,
    ): RecurringPlan {
        val t = Series(series, zones)
        val onSeries = scope == RecurringScope.ALL || (scope == RecurringScope.FOLLOWING && occurrence == t.currentDay)
        require(occurrence >= t.currentDay) { "Occurrence avant l'échéance de la série" }
        if (!onSeries && !RecurrenceExpansion.isSupported(t.type)) throw UnsupportedRecurrence()
        val target = change.day ?: occurrence
        val delta = ChronoUnit.DAYS.between(occurrence, target)
        val time = change.time?.let(LocalTime::parse)
        return when {
            onSeries -> RecurringPlan(listOf(RecurringOp.Upsert(t.uid, editSeries(t, change, time, delta))), t.uid)
            scope == RecurringScope.FOLLOWING -> {
                val created = newSeries(t, occurrence, target, change, time, delta)
                val ended = mapOf(
                    "recurrence_end_date" to JsonPrimitive(dayBefore(occurrence, zones)),
                    "recurrence_exdates" to days(t.rule.exdates.filter { it < occurrence }),
                )
                RecurringPlan(listOf(RecurringOp.Upsert(newUid, created), RecurringOp.Upsert(t.uid, ended)), newUid)
            }
            else -> {
                val created = oneOff(t, target, change, time)
                val rest = if (occurrence == t.currentDay) advance(t, today, now) else leaveOut(t, occurrence)
                RecurringPlan(listOf(RecurringOp.Upsert(newUid, created), RecurringOp.Upsert(t.uid, rest)), newUid)
            }
        }
    }

    fun delete(series: JsonObject, scope: RecurringScope, occurrence: LocalDate, zones: Zones): RecurringPlan {
        val t = Series(series, zones)
        require(occurrence >= t.currentDay) { "Occurrence avant l'échéance de la série" }
        val current = occurrence == t.currentDay
        val op = when {
            scope == RecurringScope.ALL || (scope == RecurringScope.FOLLOWING && current) -> RecurringOp.Delete(t.uid)
            scope == RecurringScope.FOLLOWING -> RecurringOp.Upsert(
                t.uid,
                mapOf(
                    "recurrence_end_date" to JsonPrimitive(dayBefore(occurrence, zones)),
                    "recurrence_exdates" to days(t.rule.exdates.filter { it < occurrence }),
                ),
            )
            current -> RecurringOp.Skip(t.uid, t.dueRaw ?: error("Pas d'échéance à sauter"))
            else -> RecurringOp.Upsert(t.uid, leaveOut(t, occurrence))
        }
        return RecurringPlan(listOf(op), t.uid)
    }

    /** « Toutes » et « celle-ci et les suivantes » sur l'occurrence courante : la série elle-même change. */
    private fun editSeries(t: Series, change: OccurrenceChange, time: LocalTime?, delta: Long): Map<String, JsonElement> =
        buildMap {
            putAll(change.fields)
            val day = t.currentDay.plusDays(delta)
            if (delta != 0L || time != null) putAll(due(t, day, time))
            if (delta != 0L) {
                putAll(shiftPattern(t, delta, day))
                t.reminder?.let { put("reminder_at", JsonPrimitive(shiftDays(it, delta, t.zones.account))); put("reminder_sent_at", JsonNull) }
                put("recurrence_exdates", days(t.rule.exdates.map { it.plusDays(delta) }))
                t.endRaw?.let { put("recurrence_end_date", JsonPrimitive(shiftDays(it, delta, t.zones.account))) }
            }
        }

    /** « Celle-ci et les suivantes » plus tard : une nouvelle série reprend la règle à partir de l'occurrence. */
    private fun newSeries(
        t: Series,
        occurrence: LocalDate,
        target: LocalDate,
        change: OccurrenceChange,
        time: LocalTime?,
        delta: Long,
    ): Map<String, JsonElement> = buildMap {
        putAll(copied(t))
        RULE_KEYS.forEach { put(it, t.raw[it] ?: JsonNull) }
        putAll(shiftPattern(t, delta, target))
        put("recurrence_end_date", t.endRaw?.let { JsonPrimitive(it) } ?: JsonNull)
        put("recurrence_exdates", days(t.rule.exdates.filter { it > occurrence }.map { it.plusDays(delta) }))
        put("status", JsonPrimitive(TaskStatus.NOT_STARTED))
        putAll(due(t, target, time))
        reminderOn(t, target)?.let { put("reminder_at", it) }
        putAll(change.fields)
    }

    /** « Seulement celle-ci » : une tâche simple reçoit l'occurrence et ses changements. */
    private fun oneOff(t: Series, target: LocalDate, change: OccurrenceChange, time: LocalTime?): Map<String, JsonElement> =
        buildMap {
            putAll(copied(t))
            put("recurrence_type", JsonPrimitive("none"))
            put("status", JsonPrimitive(TaskStatus.NOT_STARTED))
            putAll(due(t, target, time))
            reminderOn(t, target)?.let { put("reminder_at", it) }
            putAll(change.fields)
        }

    /** La série passe à son occurrence suivante, ou se termine quand il n'y en a plus. */
    private fun advance(t: Series, today: LocalDate, now: Instant): Map<String, JsonElement> {
        val base = if (t.rule.completionBased) today else t.currentDay
        val next = RecurrenceExpansion.nextAfter(t.type, t.rule, base)
            ?: return mapOf(
                "status" to JsonPrimitive(TaskStatus.DONE),
                "completed_at" to JsonPrimitive(now.toString()),
            )
        return buildMap {
            putAll(due(t, next, null))
            t.reminder?.let {
                put("reminder_at", JsonPrimitive(shiftDays(it, ChronoUnit.DAYS.between(t.currentDay, next), t.zones.account)))
                put("reminder_sent_at", JsonNull)
            }
        }
    }

    private fun leaveOut(t: Series, occurrence: LocalDate): Map<String, JsonElement> =
        mapOf("recurrence_exdates" to days(t.rule.exdates + occurrence))

    private fun copied(t: Series): Map<String, JsonElement> =
        COPIED.mapNotNull { key -> t.raw[key]?.let { key to it } }.toMap()

    private fun reminderOn(t: Series, target: LocalDate): JsonElement? =
        t.reminder?.let { JsonPrimitive(shiftDays(it, ChronoUnit.DAYS.between(t.currentDay, target), t.zones.account)) }

    /**
     * Échéance au jour [day] : heure d'horloge de la série (ou [time]) sans changer de mur à un passage d'heure,
     * ou l'instant habituel d'une journée entière.
     */
    private fun due(t: Series, day: LocalDate, time: LocalTime?): Map<String, JsonElement> {
        val clock = time ?: t.clock
        val instant = if (clock == null) {
            dueInstant(day, null, t.zones.account, t.zones.device)
        } else {
            day.atTime(clock).atZone(t.zones.device).toInstant()
        }
        return mapOf("due_date" to JsonPrimitive(instant.toString()), "due_has_time" to JsonPrimitive(clock != null))
    }

    /** Champs de règle qui suivent un décalage de [delta] jours (`shiftPattern` du serveur). */
    private fun shiftPattern(t: Series, delta: Long, anchor: LocalDate): Map<String, JsonElement> {
        if (delta == 0L) return emptyMap()
        fun weekday(value: Int) = JsonPrimitive((((value + delta) % 7 + 7) % 7).toInt())
        return buildMap {
            when (t.type) {
                "weekly" -> {
                    t.rule.weekday?.let { put("recurrence_weekday", weekday(it)) }
                    if (t.rule.weekdays.isNotEmpty()) put("recurrence_weekdays", JsonArray(t.rule.weekdays.map(::weekday)))
                }
                "monthly" -> put("recurrence_month_day", JsonPrimitive(anchor.dayOfMonth))
                "monthly_weekday" -> t.rule.weekday?.let { put("recurrence_weekday", weekday(it)) }
            }
        }
    }

    /** Fin de la veille de [day] dans le fuseau du compte : le dernier instant de la série coupée. */
    private fun dayBefore(day: LocalDate, zones: Zones): String =
        day.atStartOfDay(zones.account).toInstant().minusMillis(1).toString()

    private fun days(values: Collection<LocalDate>): JsonArray =
        JsonArray(values.toSortedSet().map { JsonPrimitive(it.toString()) })

    /** Décalage en jours civils du fuseau du compte : l'heure d'horloge est gardée au passage d'heure. */
    private fun shiftDays(raw: String, days: Long, zone: ZoneId): String =
        (parseInstant(raw) ?: error("Date illisible : $raw")).atZone(zone).plusDays(days).toInstant().toString()

    /** Lecture de la série au format serveur. */
    private class Series(val raw: JsonObject, val zones: Zones) {
        val uid = text("uid") ?: error("Série sans uid")
        val type = text("recurrence_type")
        val dueRaw = text("due_date")
        val endRaw = text("recurrence_end_date")
        val reminder = text("reminder_at")
        val rule: RecurrenceRule = TaskExtras.recurrenceRule(raw.toString(), zones.account)
        val currentDay: LocalDate = occurrenceDayOf(dueRaw, zones.account) ?: error("Pas d'échéance")

        /** Heure d'horloge de l'appareil ; null pour une journée entière. */
        val clock: LocalTime? =
            if ((raw["due_has_time"] as? JsonPrimitive)?.contentOrNull == "true") {
                parseInstant(dueRaw)?.atZone(zones.device)?.toLocalTime()
            } else {
                null
            }

        private fun text(key: String): String? = (raw[key] as? JsonPrimitive)?.contentOrNull
    }
}
