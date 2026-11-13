package ch.nicolab.cadence.tasks.planning

import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskStatus
import java.time.LocalDate
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Engagements de semaine et de mois : « Semaine prochaine », « À planifier », horizon choisi depuis la date. */
class PlanCommitmentsTest {
    private val zone = ZoneId.of("Europe/Zurich")
    // Jeudi 12 novembre 2026 ; semaine du lundi 9.
    private val today = LocalDate.of(2026, 11, 12)
    private val weekStart = LocalDate.of(2026, 11, 9)
    private val nextWeek = weekStart.plusDays(7)
    private val november = LocalDate.of(2026, 11, 1)

    private fun task(uid: String, due: LocalDate? = null) =
        TaskItem(uid = uid, name = uid, dueDay = due, dueDate = due?.atTime(23, 59)?.atZone(zone)?.toInstant())

    private fun schedule(tasks: List<TaskItem>, plan: List<PlanEntry> = emptyList()): ToSchedule =
        PlanBoard.toSchedule(tasks, plan, today, weekStart, PlanBoard.horizons(tasks, plan, today, weekStart))

    @Test
    fun `semaine prochaine est un horizon, écrit comme le web`() {
        val t = task("t").copy(weekOf = nextWeek)
        assertEquals(listOf("t"), PlanBoard.horizons(listOf(t), emptyList(), today, weekStart).buckets[Horizon.NEXT_WEEK]?.map { it.uid })
        assertEquals(
            TaskChange(weekOf = nextWeek, clearMonth = true),
            PlanBoard.horizonChange(task("u"), null, Horizon.NEXT_WEEK, today, weekStart),
        )
    }

    @Test
    fun `à replanifier - engagement passé que rien ne place, hors série, someday, sous-tâche et plan à venir`() {
        val tasks = listOf(
            task("semaine-passee").copy(weekOf = weekStart.minusDays(7)),
            task("mois-passe").copy(monthOf = LocalDate.of(2026, 10, 1)),
            task("serie").copy(weekOf = weekStart.minusDays(7), recurrenceType = "weekly"),
            task("plus-tard").copy(weekOf = weekStart.minusDays(7), someday = true),
            task("sous-tache").copy(weekOf = weekStart.minusDays(7), parentTaskUid = "p"),
            task("faite").copy(weekOf = weekStart.minusDays(7), status = TaskStatus.DONE),
            task("prevue").copy(weekOf = weekStart.minusDays(7)),
            task("due-semaine", due = today.plusDays(1)).copy(monthOf = LocalDate.of(2026, 10, 1)),
            task("encore-ce-mois").copy(weekOf = weekStart.minusDays(7), monthOf = november),
        )
        val result = schedule(tasks, listOf(PlanEntry("prevue", today.plusDays(3), null, null)))
        assertEquals(listOf("semaine-passee", "mois-passe"), result.stale.map { it.uid })
    }

    @Test
    fun `cette semaine et ce mois-ci - engagés et pas encore posés sur un jour de la semaine`() {
        val tasks = listOf(
            task("semaine").copy(weekOf = weekStart),
            task("semaine-posee").copy(weekOf = weekStart),
            task("due-semaine", due = today.plusDays(1)),
            task("mois").copy(monthOf = november),
            task("mois-pose").copy(monthOf = november),
            task("mois-plus-tard").copy(monthOf = november),
            task("mois-prochain").copy(monthOf = LocalDate.of(2026, 12, 1)),
        )
        val plan = listOf(
            PlanEntry("semaine-posee", today.plusDays(2), null, null),
            PlanEntry("mois-pose", today, null, null),
            PlanEntry("mois-plus-tard", LocalDate.of(2026, 11, 20), null, null),
        )
        val result = schedule(tasks, plan)
        assertEquals(listOf("semaine"), result.week.map { it.uid })
        assertEquals(listOf("mois", "mois-plus-tard"), result.month.map { it.uid })
        assertTrue(result.stale.isEmpty())
        assertFalse(result.isEmpty)
        assertTrue(schedule(listOf(task("rien"))).isEmpty)
    }

    @Test
    fun `tout planifié - la section est vide, dès la dernière tâche posée`() {
        val tasks = listOf(
            task("passee").copy(weekOf = weekStart.minusDays(7)),
            task("semaine").copy(weekOf = weekStart),
            task("mois").copy(monthOf = november),
        )
        val partly = listOf(PlanEntry("semaine", today, null, null), PlanEntry("mois", today.plusDays(1), null, null))
        assertFalse(schedule(tasks, partly).isEmpty)
        val all = partly + PlanEntry("passee", today.plusDays(2), null, null)
        assertTrue(schedule(tasks, all).isEmpty)
        assertTrue(schedule(emptyList()).isEmpty)
    }

    @Test
    fun `retirer l'engagement efface la semaine et le mois posés`() {
        assertEquals(TaskChange(clearWeek = true), PlanBoard.dropCommitment(task("t").copy(weekOf = weekStart)))
        assertEquals(
            TaskChange(clearWeek = true, clearMonth = true),
            PlanBoard.dropCommitment(task("t").copy(weekOf = weekStart, monthOf = november)),
        )
        assertNull(PlanBoard.dropCommitment(task("t")))
    }

    @Test
    fun `un horizon choisi depuis la date vide l'échéance et retire les lignes du plan à venir`() {
        val t = task("t", due = today.plusDays(3)).copy(dueHasTime = true)
        val plan = listOf(
            PlanEntry("t", today.minusDays(1), null, null),
            PlanEntry("t", today, 540, 30),
            PlanEntry("t", today.plusDays(4), null, null),
            PlanEntry("autre", today, null, null),
        )
        val writes = PlanBoard.horizonFromDate(t, Horizon.NEXT_MONTH, plan, today, weekStart)
        assertEquals(TaskChange(monthOf = LocalDate.of(2026, 12, 1), clearWeek = true, clearDue = true), writes.change)
        assertEquals(listOf(RemoveTask(today, "t"), RemoveTask(today.plusDays(4), "t")), writes.plan)

        val parked = PlanBoard.horizonFromDate(task("p").copy(someday = true), Horizon.WEEK, emptyList(), today, weekStart)
        assertEquals(TaskChange(weekOf = weekStart, clearMonth = true, later = false), parked.change)
        assertTrue(parked.plan.isEmpty())

        val stillSomeday = PlanBoard.horizonFromDate(task("s", due = today).copy(someday = true), Horizon.SOMEDAY, emptyList(), today, weekStart)
        assertEquals(TaskChange(clearDue = true), stillSomeday.change)
        assertEquals(TaskChange(later = true), PlanBoard.horizonFromDate(task("n"), Horizon.SOMEDAY, emptyList(), today, weekStart).change)
    }

    @Test
    fun `une date précise retire semaine, mois et someday`() {
        val change = TaskChange(dueDate = today)
        assertEquals(change, PlanBoard.withDatePicked(change, task("t")))
        assertEquals(
            TaskChange(dueDate = today, clearWeek = true, clearMonth = true, later = false),
            PlanBoard.withDatePicked(change, task("t").copy(weekOf = weekStart, monthOf = november, someday = true)),
        )
    }

    @Test
    fun `engagement lu pour le champ de date - horizon qui tient, sinon à replanifier`() {
        assertEquals(Commitment.Holds(Horizon.SOMEDAY), PlanBoard.commitment(task("t").copy(someday = true, weekOf = weekStart.minusDays(7)), today, weekStart))
        assertEquals(Commitment.Holds(Horizon.WEEK), PlanBoard.commitment(task("t").copy(weekOf = weekStart), today, weekStart))
        assertEquals(Commitment.Holds(Horizon.NEXT_WEEK), PlanBoard.commitment(task("t").copy(weekOf = nextWeek), today, weekStart))
        assertEquals(Commitment.Holds(Horizon.THIS_MONTH), PlanBoard.commitment(task("t").copy(monthOf = november), today, weekStart))
        assertEquals(Commitment.Holds(Horizon.NEXT_MONTH), PlanBoard.commitment(task("t").copy(monthOf = LocalDate.of(2026, 12, 1)), today, weekStart))
        assertEquals(Commitment.Stale, PlanBoard.commitment(task("t").copy(weekOf = weekStart.minusDays(7)), today, weekStart))
        assertEquals(Commitment.Stale, PlanBoard.commitment(task("t").copy(monthOf = LocalDate.of(2026, 10, 1)), today, weekStart))
        assertNull(PlanBoard.commitment(task("t"), today, weekStart))
        assertNull(PlanBoard.commitment(task("t").copy(weekOf = nextWeek.plusDays(7)), today, weekStart))
    }

    @Test
    fun `seule une tâche simple de premier niveau prend un horizon depuis la date`() {
        assertTrue(PlanBoard.canTakeHorizon(task("t")))
        assertFalse(PlanBoard.canTakeHorizon(task("t").copy(recurrenceType = "daily")))
        assertFalse(PlanBoard.canTakeHorizon(task("t").copy(parentTaskUid = "p")))
    }
}
