package ch.nicolab.cadence.tasks.reminder

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Une tâche placée à une heure dans le plan du jour (`daily_plan_items.start_minute`) : elle sonne à [start]. */
data class PlanSlot(val uid: String, val start: Instant)

/**
 * Placements à heure du plan du jour, lus en ligne (`GET /api/v1/daily-plan?date=`, docs/20-daily-plan.md) : le plan
 * n'est pas une entité de la synchro hors ligne. La dernière lecture est gardée sur l'appareil pour que l'alarme
 * tienne hors ligne et après un redémarrage.
 */
object PlanSlots {
    /** Les placements à heure d'une réponse ; ni ceux sans heure, ni l'occurrence déjà faite d'une série. */
    fun parse(response: JsonObject, zone: ZoneId): List<PlanSlot> {
        val plan = response["plan"] as? JsonObject ?: return emptyList()
        val day = plan["date"]?.jsonPrimitive?.contentOrNull?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
            ?: return emptyList()
        val midnight = day.atStartOfDay(zone)
        return (plan["items"]?.jsonArray ?: return emptyList()).mapNotNull { element ->
            val item = element.jsonObject
            val uid = item["task_uid"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
            val minute = item["start_minute"]?.jsonPrimitive?.intOrNull ?: return@mapNotNull null
            if (item["occurrence_done"]?.jsonPrimitive?.booleanOrNull == true) return@mapNotNull null
            PlanSlot(uid, midnight.plusMinutes(minute.toLong()).toInstant())
        }
    }

    fun encode(slots: List<PlanSlot>): Set<String> = slots.mapTo(HashSet()) { "${it.uid}|${it.start.toEpochMilli()}" }

    fun decode(raw: Set<String>): List<PlanSlot> = raw.mapNotNull { entry ->
        val millis = entry.substringAfterLast('|', "").toLongOrNull() ?: return@mapNotNull null
        PlanSlot(entry.substringBeforeLast('|'), Instant.ofEpochMilli(millis))
    }
}
