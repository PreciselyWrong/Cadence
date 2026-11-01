package ch.nicolab.cadence.tasks.reminder

import ch.nicolab.cadence.tasks.planning.PlanEntry
import ch.nicolab.cadence.tasks.planning.ServerPlan
import java.time.Instant
import java.time.ZoneId
import kotlinx.serialization.json.JsonObject

/** Une tâche placée à une heure dans le plan du jour (`daily_plan_items.start_minute`) : elle sonne à [start]. */
data class PlanSlot(val uid: String, val start: Instant)

/**
 * Placements à heure du plan du jour du serveur ([ServerPlan], lu en ligne et gardé sur l'appareil pour que l'alarme
 * tienne hors ligne et après un redémarrage).
 */
object PlanSlots {
    /** Les placements à heure d'une réponse ; ni ceux sans heure, ni l'occurrence déjà faite d'une série. */
    fun parse(response: JsonObject, zone: ZoneId): List<PlanSlot> = of(ServerPlan.parse(response), zone)

    fun of(entries: List<PlanEntry>, zone: ZoneId): List<PlanSlot> =
        ServerPlan.timedStarts(entries, zone).map { (uid, start) -> PlanSlot(uid, start) }

    /** Ancien format gardé (avant le plan complet) : `uid|millis`, relu tant que le plan n'a pas été relu. */
    fun encode(slots: List<PlanSlot>): Set<String> = slots.mapTo(HashSet()) { "${it.uid}|${it.start.toEpochMilli()}" }

    fun decode(raw: Set<String>): List<PlanSlot> = raw.mapNotNull { entry ->
        val millis = entry.substringAfterLast('|', "").toLongOrNull() ?: return@mapNotNull null
        PlanSlot(entry.substringBeforeLast('|'), Instant.ofEpochMilli(millis))
    }
}
