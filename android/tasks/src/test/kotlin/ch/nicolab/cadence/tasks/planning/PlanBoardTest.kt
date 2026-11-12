package ch.nicolab.cadence.tasks.planning

import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskStatus
import java.time.LocalDate
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Page Planifier : membres des jours, horizons, écritures (jamais l'échéance). */
class PlanBoardTest {
    private val zone = ZoneId.of("Europe/Zurich")
    // Jeudi 12 novembre 2026 ; semaine du lundi 9.
    private val today = LocalDate.of(2026, 11, 12)
    private val weekStart = LocalDate.of(2026, 11, 9)
    private val tomorrow = today.plusDays(1)

    private fun task(uid: String, due: LocalDate? = null, minutes: Int? = null) =
        TaskItem(uid = uid, name = uid, dueDay = due, dueDate = due?.atTime(23, 59)?.atZone(zone)?.toInstant(), estimatedMinutes = minutes)

    @Test
    fun `un jour réunit ses tâches prévues puis celles seulement dues, sauf une due prévue un autre jour`() {
        val planned = task("prevue")
        val due = task("due", due = tomorrow)
        val dueElsewhere = task("ailleurs", due = tomorrow)
        val plan = listOf(PlanEntry("prevue", tomorrow, null, 45), PlanEntry("ailleurs", today.plusDays(3), null, null))
        val days = PlanBoard.days(
            tasks = listOf(planned, due, dueElsewhere),
            plan = plan,
            today = today,
            todayDue = emptyList(),
            dueByDay = mapOf(tomorrow to listOf(due, dueElsewhere)),
            zone = zone,
        )
        assertEquals(PlanBoard.DAYS, days.size)
        val day = days[1]
        assertEquals(listOf("prevue", "due"), day.open.map { it.task.uid })
        assertEquals(45, day.minutes)
        assertEquals(listOf("ailleurs"), days[3].open.map { it.task.uid })
    }

    @Test
    fun `les cartes à heure passent devant, dans l'ordre des heures, et les faites sont à part`() {
        val plan = listOf(
            PlanEntry("libre", today, null, null),
            PlanEntry("dix", today, 600, 30),
            PlanEntry("neuf", today, 540, 30),
            PlanEntry("faite", today, null, null),
        )
        val tasks = listOf(task("libre"), task("dix"), task("neuf"), task("faite").copy(status = TaskStatus.DONE))
        val day = PlanBoard.days(tasks, plan, today, emptyList(), emptyMap(), zone, count = 1).single()
        assertEquals(listOf("neuf", "dix", "libre"), day.open.map { it.task.uid })
        assertEquals(listOf("faite"), day.done.map { it.task.uid })
    }

    @Test
    fun `déplacer une carte écrit le plan, jamais l'échéance`() {
        val t = task("t", due = today)
        assertEquals(listOf(AddTask(tomorrow, "t")), PlanBoard.moveWrites(PlanCard(t, today, null), tomorrow))
        assertEquals(
            listOf(MoveTask(today, "t", tomorrow)),
            PlanBoard.moveWrites(PlanCard(t, today, PlanEntry("t", today, null, 30)), tomorrow),
        )
        assertEquals(
            listOf(SlotTask(tomorrow, "t", 540, 45), RemoveTask(today, "t")),
            PlanBoard.moveWrites(PlanCard(t, today, PlanEntry("t", today, 540, 45)), tomorrow),
        )
        assertTrue(PlanBoard.moveWrites(PlanCard(t, today, PlanEntry("t", today, null, 30)), today).isEmpty())
        assertTrue(PlanBoard.removeWrites(PlanCard(t, today, null)).isEmpty())
    }

    @Test
    fun `le retard ne garde pas une tâche reprise par le plan`() {
        val late = listOf(task("a", due = today.minusDays(2)), task("b", due = today.minusDays(1)))
        assertEquals(listOf("b"), PlanBoard.overdue(late, listOf(PlanEntry("a", tomorrow, null, null)), today).map { it.uid })
    }

    @Test
    fun `horizons, engagement d abord puis la date déduite, rien pour un mois passé`() {
        val tasks = listOf(
            task("un-jour").copy(someday = true, weekOf = weekStart),
            task("semaine").copy(weekOf = weekStart),
            task("ce-mois").copy(monthOf = LocalDate.of(2026, 11, 1)),
            task("mois-prochain").copy(monthOf = LocalDate.of(2026, 12, 1)),
            task("mois-passe").copy(monthOf = LocalDate.of(2026, 10, 1)),
            task("due-fin-mois", due = LocalDate.of(2026, 11, 27)),
            task("due-decembre", due = LocalDate.of(2026, 12, 3)),
            task("due-passee", due = LocalDate.of(2026, 11, 10)),
            task("prevue-semaine"),
            task("prevue-mois-prochain"),
            task("serie", due = LocalDate.of(2026, 11, 20)).copy(recurrenceType = "weekly"),
        )
        val plan = listOf(PlanEntry("prevue-semaine", tomorrow, null, null), PlanEntry("prevue-mois-prochain", LocalDate.of(2026, 12, 8), null, null))
        val horizons = PlanBoard.horizons(tasks, plan, today, weekStart)
        assertEquals(listOf("semaine"), horizons.buckets[Horizon.WEEK]?.map { it.uid })
        assertEquals(listOf("ce-mois", "due-fin-mois"), horizons.buckets[Horizon.THIS_MONTH]?.map { it.uid })
        assertEquals(listOf("mois-prochain", "due-decembre", "prevue-mois-prochain"), horizons.buckets[Horizon.NEXT_MONTH]?.map { it.uid })
        assertEquals(listOf("un-jour"), horizons.buckets[Horizon.SOMEDAY]?.map { it.uid })
        assertEquals(listOf("prevue-semaine" to tomorrow), horizons.plannedThisWeek.map { it.first.uid to it.second })
        assertNull(horizons.of("mois-passe"))
    }

    @Test
    fun `changer d'horizon écrit la semaine, le mois ou someday, et retire l'autre engagement`() {
        val t = task("t")
        assertNull(PlanBoard.horizonChange(t, Horizon.WEEK, Horizon.WEEK, today, weekStart))
        assertEquals(TaskChange(weekOf = weekStart, clearMonth = true), PlanBoard.horizonChange(t, null, Horizon.WEEK, today, weekStart))
        assertEquals(
            TaskChange(monthOf = LocalDate.of(2026, 12, 1), clearWeek = true, later = false),
            PlanBoard.horizonChange(t, Horizon.SOMEDAY, Horizon.NEXT_MONTH, today, weekStart),
        )
        assertEquals(TaskChange(later = true), PlanBoard.horizonChange(t, Horizon.THIS_MONTH, Horizon.SOMEDAY, today, weekStart))
        assertEquals(false, PlanBoard.horizonChange(t.copy(needsWhen = true), null, Horizon.THIS_MONTH, today, weekStart)?.needsWhen)
    }
}
