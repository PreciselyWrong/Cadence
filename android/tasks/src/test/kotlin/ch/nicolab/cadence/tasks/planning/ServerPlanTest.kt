package ch.nicolab.cadence.tasks.planning

import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskStatus
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Le plan du jour du serveur (lu après chaque synchro, gardé sur l'appareil) rejoint Aujourd'hui sans doublon. */
class ServerPlanTest {
    private val zone = ZoneId.of("Europe/Zurich")
    private val day = LocalDate.of(2026, 11, 1)
    private val at1630 = day.atTime(16, 30).atZone(zone).toInstant()

    private val response = Json.parseToJsonElement(
        """
        {"date":"2026-11-01","plan":{"date":"2026-11-01","items":[
          {"task_uid":"web","position":0,"start_minute":990,"duration_minutes":45,"occurrence_done":false},
          {"task_uid":"short","position":1,"start_minute":null,"duration_minutes":25,"occurrence_done":false},
          {"task_uid":"done-occ","position":2,"start_minute":600,"duration_minutes":30,"occurrence_done":true}
        ]}}
        """.trimIndent(),
    ).jsonObject

    private fun task(uid: String, dueDay: LocalDate? = null, status: Int = TaskStatus.NOT_STARTED) =
        TaskItem(uid = uid, name = uid, dueDay = dueDay, dueDate = dueDay?.atTime(23, 59)?.atZone(zone)?.toInstant(), status = status)

    @Test
    fun `lit chaque élément du plan, avec ou sans heure, sans l'occurrence déjà faite`() {
        assertEquals(
            listOf(PlanEntry("web", day, 990, 45), PlanEntry("short", day, null, 25)),
            ServerPlan.parse(response),
        )
        assertEquals(emptyList<PlanEntry>(), ServerPlan.parse(Json.parseToJsonElement("""{"plan":null}""").jsonObject))
    }

    @Test
    fun `la lecture gardée sur l'appareil se relit à l'identique, dans l'ordre`() {
        val entries = listOf(PlanEntry("b", day, 990, 45), PlanEntry("a", day, null, null), PlanEntry("c", day.plusDays(1), 0, 30))
        assertEquals(entries, ServerPlan.decode(ServerPlan.encode(entries)))
        assertEquals(emptyList<PlanEntry>(), ServerPlan.decode(null))
    }

    @Test
    fun `une tâche sans échéance placée sur le web à 16 h 30 rejoint Aujourd'hui à son heure`() {
        val web = task("web")
        val result = ServerPlan.apply(emptyList(), emptyList(), listOf(web), ServerPlan.parse(response), day, zone)
        assertEquals(listOf("web"), result.today.map { it.uid })
        assertEquals(mapOf("web" to at1630), result.starts)
    }

    @Test
    fun `une tâche placée sans heure (session courte) rejoint la partie sans heure`() {
        val short = task("short")
        val result = ServerPlan.apply(emptyList(), emptyList(), listOf(short), ServerPlan.parse(response), day, zone)
        assertEquals(listOf("short"), result.today.map { it.uid })
        assertTrue(result.starts.isEmpty())
    }

    @Test
    fun `une tâche déjà dans Aujourd'hui n'est pas répétée et garde sa place, avec l'heure du plan`() {
        val web = task("web", dueDay = day)
        val other = task("other", dueDay = day)
        val result = ServerPlan.apply(emptyList(), listOf(other, web), listOf(other, web), ServerPlan.parse(response), day, zone)
        assertEquals(listOf("other", "web"), result.today.map { it.uid })
        assertEquals(at1630, result.starts["web"])
    }

    @Test
    fun `une tâche en retard placée aujourd'hui quitte le retard pour Aujourd'hui`() {
        val late = task("web", dueDay = day.minusDays(3))
        val result = ServerPlan.apply(listOf(late), emptyList(), listOf(late), ServerPlan.parse(response), day, zone)
        assertTrue(result.overdue.isEmpty())
        assertEquals(listOf("web"), result.today.map { it.uid })
    }

    @Test
    fun `ni tâche close, ni tâche inconnue, ni plan d'un autre jour`() {
        val closed = task("web", status = TaskStatus.DONE)
        val tomorrow = listOf(PlanEntry("short", day.plusDays(1), 600, 30))
        assertTrue(ServerPlan.apply(emptyList(), emptyList(), listOf(closed), ServerPlan.parse(response), day, zone).today.isEmpty())
        assertTrue(ServerPlan.apply(emptyList(), emptyList(), emptyList(), ServerPlan.parse(response), day, zone).today.isEmpty())
        val result = ServerPlan.apply(emptyList(), emptyList(), listOf(task("short")), tomorrow, day, zone)
        assertTrue(result.today.isEmpty())
        assertFalse("short" in result.starts)
    }

    @Test
    fun `les placements à heure servent de repères d'alarme`() {
        assertEquals(listOf("web" to at1630), ServerPlan.timedStarts(ServerPlan.parse(response), zone))
    }

    @Test
    fun `un placement à heure occupe sa durée et n'est plus à placer`() {
        val web = task("web", dueDay = day)
        val free = task("free", dueDay = day)
        val plan = DayPlans.of(
            day = day, zone = zone, settings = PlanningSettings(), events = emptyList(), dayTasks = listOf(web, free),
            planned = listOf(PlanEntry("web", day, 990, 45)),
        )
        assertEquals(listOf("free"), plan.toPlace.map { it.uid })
        val placement = plan.propose(listOf(free, task("x", dueDay = day, ).copy(estimatedMinutes = 60)))
        placement.blocks.forEach { block -> assertTrue(block.end <= 990 || block.start >= 990 + 45, "$block") }
    }
}
