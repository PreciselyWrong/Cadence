package ch.nicolab.cadence.tasks.planning

import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskStatus
import java.time.LocalDate
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Feuille « Replanifier » des échues d'Aujourd'hui : une échue replacée n'est plus échue. */
class OverdueReplanTest {
    private val zone = ZoneId.of("Europe/Zurich")
    // Samedi 14 novembre 2026 ; semaine du lundi 9.
    private val today = LocalDate.of(2026, 11, 14)
    private val weekStart = LocalDate.of(2026, 11, 9)
    private val lastWeek = LocalDate.of(2026, 11, 10)

    private fun task(uid: String, due: LocalDate? = lastWeek) =
        TaskItem(uid = uid, name = uid, dueDay = due, dueDate = due?.atTime(23, 59)?.atZone(zone)?.toInstant())

    private fun writes(task: TaskItem, choice: ReplanChoice, plan: List<PlanEntry> = emptyList()) =
        OverdueReplan.writes(task, choice, plan, today, weekStart, zone)

    @Test
    fun `un jour devient l'échéance et retire les autres lignes du plan à venir`() {
        val late = task("pneus").copy(weekOf = weekStart)
        val wednesday = today.plusDays(4)
        val plan = listOf(
            PlanEntry("pneus", today.minusDays(2), null, null),
            PlanEntry("pneus", today.plusDays(1), null, null),
            PlanEntry("pneus", wednesday, null, null),
        )
        val result = writes(late, ReplanChoice.Day(wednesday), plan)
        assertEquals(wednesday, result.change?.dueDate)
        assertTrue(result.change!!.clearWeek)
        assertEquals(listOf(RemoveTask(today.plusDays(1), "pneus")), result.plan)
        assertEquals(false, result.skip)
        assertEquals(false, result.complete)
    }

    @Test
    fun `cette semaine, semaine prochaine, ce mois-ci et plus tard vident l'échéance et posent l'horizon`() {
        assertEquals(weekStart, writes(task("a"), ReplanChoice.ThisWeek).change!!.weekOf)
        assertEquals(weekStart.plusDays(7), writes(task("b"), ReplanChoice.NextWeek).change!!.weekOf)
        assertEquals(today.withDayOfMonth(1), writes(task("c"), ReplanChoice.ThisMonth).change!!.monthOf)
        val later = writes(task("d"), ReplanChoice.Later).change!!
        assertEquals(true, later.later)
        listOf(ReplanChoice.ThisWeek, ReplanChoice.NextWeek, ReplanChoice.ThisMonth, ReplanChoice.Later).forEach {
            assertTrue(writes(task("e"), it).change!!.clearDue, it.toString())
        }
    }

    @Test
    fun `abandonner annule la tâche et la retire du plan à venir`() {
        val plan = listOf(PlanEntry("c", today, null, null))
        val result = writes(task("c"), ReplanChoice.Drop, plan)
        assertEquals(TaskStatus.CANCELLED, result.change?.status)
        assertEquals(listOf(RemoveTask(today, "c")), result.plan)
    }

    @Test
    fun `fait coche la tâche, sans rien écrire d'autre`() {
        val result = writes(task("f"), ReplanChoice.Done)
        assertNull(result.change)
        assertTrue(result.complete)
        assertEquals(emptyList<PlanEdit>(), result.plan)
    }

    @Test
    fun `une série se saute, sans rien écrire d'autre`() {
        val result = writes(task("compta").copy(recurrenceType = "monthly"), ReplanChoice.Skip)
        assertNull(result.change)
        assertTrue(result.skip)
    }

    @Test
    fun `une série se fait ou se saute, une tâche de fichier ne s'abandonne pas`() {
        assertEquals(setOf(ReplanKind.DONE, ReplanKind.SKIP), OverdueReplan.kinds(task("s").copy(recurrenceType = "weekly")))
        assertTrue(ReplanKind.DROP in OverdueReplan.kinds(task("t")))
        assertTrue(ReplanKind.DAY in OverdueReplan.kinds(task("t")))
        assertTrue(ReplanKind.DROP !in OverdueReplan.kinds(task("f").copy(fileBacked = true)))
    }

    @Test
    fun `tout à demain et étaler ne touchent pas aux séries`() {
        val a = task("a")
        val series = task("s").copy(recurrenceType = "weekly")
        assertEquals(listOf(a to ReplanChoice.Day(today.plusDays(1))), OverdueReplan.allTomorrow(listOf(a, series), today))
        val b = task("b").copy(priority = 2)
        val spread = OverdueReplan.spread(
            listOf(a, b, series),
            plan = listOf(PlanEntry("x", today, null, 120)),
            all = listOf(a, b, series),
            today = today,
        )
        // b (priorité haute) d'abord, au jour le moins chargé : demain, aujourd'hui portant déjà « x ».
        assertEquals(listOf(b to ReplanChoice.Day(today.plusDays(1)), a to ReplanChoice.Day(today.plusDays(2))), spread)
    }

    @Test
    fun `charge des sept prochains jours`() {
        val days = OverdueReplan.weekDays(today, mapOf(today to 3, today.plusDays(2) to 1))
        assertEquals(7, days.size)
        assertEquals(today to 3, days[0])
        assertEquals(today.plusDays(1) to 0, days[1])
        assertEquals(today.plusDays(2) to 1, days[2])
    }

    @Test
    fun `annuler rend l'échéance, l'engagement et le statut d'avant`() {
        val restore = OverdueReplan.restore(task("d").copy(weekOf = weekStart), zone)
        assertEquals(lastWeek, restore.dueDate)
        assertEquals(weekStart, restore.weekOf)
        assertEquals(TaskStatus.NOT_STARTED, restore.status)
    }
}
