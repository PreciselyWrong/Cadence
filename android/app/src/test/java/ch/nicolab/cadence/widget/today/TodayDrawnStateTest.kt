package ch.nicolab.cadence.widget.today

import ch.nicolab.cadence.tasks.model.ProjectItem
import ch.nicolab.cadence.tasks.model.TaskItem
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Test

/**
 * Chaque redessin du widget fait clignoter certains lanceurs (Smart Launcher) : une synchro qui
 * réécrit les tâches sans rien changer à l'écran ne doit pas produire un nouvel état dessiné.
 */
class TodayDrawnStateTest {
    private val today = LocalDate.of(2026, 11, 24)
    private val now = Instant.parse("2026-11-24T06:47:10Z")
    private val task = TaskItem(uid = "t1", name = "Répondre", dueDay = today)
    private val project = ProjectItem(uid = "p1", name = "Finances", color = "#22AA55")

    private fun state(
        tasks: List<TaskItem> = listOf(task),
        at: Instant = now,
        projects: Map<String, ProjectItem> = mapOf("p1" to project),
    ) = TodayDrawnState.of(
        config = TodayWidgetConfig(),
        checkEvents = false,
        calendarAccessMissing = false,
        now = at,
        selection = TodaySelection(total = tasks.size, overdueTotal = 0, overdue = emptyList(), tasks = tasks, events = emptyList()),
        habits = emptyList(),
        projects = projects,
        tagNames = emptyMap(),
        tagColors = emptyMap(),
        today = today,
        zone = ZoneOffset.UTC,
    )

    @Test
    fun `une synchro qui ne change rien a l'ecran garde le meme etat`() {
        val synced = state(
            tasks = listOf(task.copy(pendingSync = true)),
            at = now.plusSeconds(30),
            projects = mapOf("p1" to project.copy(updatedAt = now, description = "notes")),
        )

        assertEquals(state(), synced)
    }

    @Test
    fun `un changement visible donne un nouvel etat`() {
        assertNotEquals(state(), state(tasks = listOf(task.copy(name = "Répondre à Maman"))))
        assertNotEquals(state(), state(tasks = emptyList()))
        assertNotEquals(state(), state(projects = mapOf("p1" to project.copy(color = "#000000"))))
    }

    @Test
    fun `une coche ne compte que tant que sa ligne est affichee`() {
        val shown = TodaySelection(total = 1, overdueTotal = 0, overdue = emptyList(), tasks = listOf(task), events = emptyList())
        val gone = shown.copy(total = 0, tasks = emptyList())

        assertEquals(setOf("t1"), TodayDrawnState.visibleHeld(setOf("t1", "other"), shown))
        assertEquals(emptySet<String>(), TodayDrawnState.visibleHeld(setOf("t1"), gone))
    }

    @Test
    fun `la minute suivante redessine les evenements en cours`() {
        assertNotEquals(state(), state(at = now.plusSeconds(60)))
    }
}
