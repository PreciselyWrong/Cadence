package ch.nicolab.cadence.tasks.planning

import ch.nicolab.cadence.tasks.model.TaskItem
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

/** Un élément du plan du jour du serveur (`daily_plan_items`) : [startMinute] nul pour une tâche placée sans heure. */
data class PlanEntry(val uid: String, val day: LocalDate, val startMinute: Int?, val durationMinutes: Int?)

/** Aujourd'hui une fois le plan du serveur ajouté : retard, tâches du jour, heure du plan de chaque tâche placée. */
data class PlannedToday(val overdue: List<TaskItem>, val today: List<TaskItem>, val starts: Map<String, Instant>)

/**
 * Plan du jour du serveur (`GET /api/v1/daily-plan?date=`, docs/20-daily-plan.md), lu en ligne après chaque synchro
 * et gardé sur l'appareil : le plan n'est pas une entité de la synchro hors ligne. Il sert aux alarmes (placements à
 * heure) et à Aujourd'hui (tâches placées sur le web ou par la revue).
 */
object ServerPlan {
    /** Les éléments d'une réponse, dans l'ordre du plan ; l'occurrence déjà faite d'une série est écartée. */
    fun parse(response: JsonObject): List<PlanEntry> {
        val plan = response["plan"] as? JsonObject ?: return emptyList()
        val day = plan["date"]?.jsonPrimitive?.contentOrNull?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
            ?: return emptyList()
        return (plan["items"]?.jsonArray ?: return emptyList()).mapNotNull { element ->
            val item = element.jsonObject
            val uid = item["task_uid"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
            if (item["occurrence_done"]?.jsonPrimitive?.booleanOrNull == true) return@mapNotNull null
            PlanEntry(uid, day, item["start_minute"]?.jsonPrimitive?.intOrNull, item["duration_minutes"]?.jsonPrimitive?.intOrNull)
        }
    }

    /** Une ligne par élément, ordre gardé : `uid`, jour, minute de début, durée (vide si absente), séparés par une tabulation. */
    fun encode(entries: List<PlanEntry>): String = entries.joinToString("\n") { entry ->
        listOf(entry.uid, entry.day.toString(), entry.startMinute?.toString().orEmpty(), entry.durationMinutes?.toString().orEmpty())
            .joinToString(SEPARATOR)
    }

    fun decode(raw: String?): List<PlanEntry> = raw.orEmpty().lineSequence().mapNotNull { line ->
        val parts = line.split(SEPARATOR)
        if (parts.size != FIELDS || parts[0].isEmpty()) return@mapNotNull null
        val day = runCatching { LocalDate.parse(parts[1]) }.getOrNull() ?: return@mapNotNull null
        PlanEntry(parts[0], day, parts[2].toIntOrNull(), parts[3].toIntOrNull())
    }.toList()

    /** Heure de chaque placement à heure, dans le fuseau [zone]. */
    fun timedStarts(entries: List<PlanEntry>, zone: ZoneId): List<Pair<String, Instant>> = entries.mapNotNull { entry ->
        entry.startMinute?.let { entry.uid to start(entry.day, it, zone) }
    }

    /**
     * Ajoute à Aujourd'hui les tâches ouvertes que le plan du serveur place le jour [day] : une tâche déjà listée garde
     * sa place (jamais deux fois), une tâche en retard quitte le retard, les autres suivent dans l'ordre du plan.
     * [all] : les tâches où chercher celles du plan (déjà filtrées par domaine). Le reste d'Aujourd'hui ne change pas.
     */
    fun apply(
        overdue: List<TaskItem>,
        today: List<TaskItem>,
        all: List<TaskItem>,
        entries: List<PlanEntry>,
        day: LocalDate,
        zone: ZoneId,
    ): PlannedToday {
        val byUid = all.associateBy { it.uid }
        val planned = entries.filter { it.day == day }.mapNotNull { entry ->
            byUid[entry.uid]?.takeIf { !it.isClosed }?.let { entry to it }
        }.distinctBy { it.first.uid }
        if (planned.isEmpty()) return PlannedToday(overdue, today, emptyMap())
        val plannedUids = planned.mapTo(HashSet()) { it.first.uid }
        val listed = today.mapTo(HashSet()) { it.uid }
        return PlannedToday(
            overdue = overdue.filterNot { it.uid in plannedUids },
            today = today + planned.map { it.second }.filterNot { it.uid in listed },
            starts = planned.mapNotNull { (entry, _) -> entry.startMinute?.let { entry.uid to start(day, it, zone) } }.toMap(),
        )
    }

    private fun start(day: LocalDate, minute: Int, zone: ZoneId): Instant =
        day.atStartOfDay(zone).plusMinutes(minute.toLong()).toInstant()

    private const val SEPARATOR = "\t"
    private const val FIELDS = 4
}
