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
    fun `demain devient l'échéance et retire les autres lignes du plan à venir`() {
        val late = task("pneus").copy(weekOf = weekStart)
        val plan = listOf(
            PlanEntry("pneus", today.minusDays(2), null, null),
            PlanEntry("pneus", today.plusDays(1), null, null),
            PlanEntry("pneus", today.plusDays(4), null, null),
        )
        val result = writes(late, ReplanChoice.TOMORROW, plan)
        assertEquals(today.plusDays(1), result.change?.dueDate)
        assertTrue(result.change!!.clearWeek)
        assertEquals(listOf(RemoveTask(today.plusDays(4), "pneus")), result.plan)
        assertEquals(false, result.skip)
    }

    @Test
    fun `semaine prochaine et plus tard vident l'échéance et posent l'horizon`() {
        val nextWeek = writes(task("a"), ReplanChoice.NEXT_WEEK)
        assertTrue(nextWeek.change!!.clearDue)
        assertEquals(weekStart.plusDays(7), nextWeek.change!!.weekOf)
        val later = writes(task("b"), ReplanChoice.LATER)
        assertTrue(later.change!!.clearDue)
        assertEquals(true, later.change!!.later)
    }

    @Test
    fun `abandonner annule la tâche et la retire du plan à venir`() {
        val plan = listOf(PlanEntry("c", today, null, null))
        val result = writes(task("c"), ReplanChoice.DROP, plan)
        assertEquals(TaskStatus.CANCELLED, result.change?.status)
        assertEquals(listOf(RemoveTask(today, "c")), result.plan)
    }

    @Test
    fun `une série se saute, sans rien écrire d'autre`() {
        val series = task("compta").copy(recurrenceType = "monthly")
        val result = writes(series, ReplanChoice.SKIP)
        assertNull(result.change)
        assertTrue(result.skip)
        assertEquals(emptyList<PlanEdit>(), result.plan)
    }

    @Test
    fun `une série ne propose que de passer, une tâche de fichier ne s'abandonne pas`() {
        assertEquals(listOf(ReplanChoice.SKIP), OverdueReplan.choices(task("s").copy(recurrenceType = "weekly")))
        assertEquals(
            listOf(ReplanChoice.TODAY, ReplanChoice.TOMORROW, ReplanChoice.NEXT_WEEK, ReplanChoice.LATER, ReplanChoice.DROP),
            OverdueReplan.choices(task("t")),
        )
        assertEquals(
            listOf(ReplanChoice.TODAY, ReplanChoice.TOMORROW, ReplanChoice.NEXT_WEEK, ReplanChoice.LATER),
            OverdueReplan.choices(task("f").copy(fileBacked = true)),
        )
    }

    @Test
    fun `annuler rend l'échéance, l'engagement et le statut d'avant`() {
        val late = task("d").copy(weekOf = weekStart)
        val restore = OverdueReplan.restore(late, zone)
        assertEquals(lastWeek, restore.dueDate)
        assertEquals(weekStart, restore.weekOf)
        assertEquals(TaskStatus.NOT_STARTED, restore.status)
    }
}
