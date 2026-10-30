package ch.nicolab.cadence.tasks.model

import java.time.Instant
import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class TaskViewsTest {
    private val today = LocalDate.of(2026, 10, 30)
    private val now: Instant = Instant.parse("2026-10-30T09:00:00Z")

    private fun task(
        uid: String,
        due: LocalDate? = null,
        status: Int = TaskStatus.NOT_STARTED,
        defer: String? = null,
        parent: String? = null,
    ) = TaskItem(
        uid = uid,
        name = uid,
        status = status,
        dueDay = due,
        deferUntil = defer?.let(Instant::parse),
        parentTaskUid = parent,
    )

    @Test
    fun `aujourd'hui garde retards, échéances du jour et tâches en cours`() {
        val tasks = listOf(
            task("retard", due = LocalDate.of(2026, 10, 28)),
            task("aujourdhui", due = today),
            task("en-cours", status = TaskStatus.IN_PROGRESS),
            task("planifiee", status = TaskStatus.PLANNED),
            task("demain", due = LocalDate.of(2026, 10, 31)),
            task("reportee", due = today, defer = "2026-11-01T00:00:00Z"),
            task("terminee", due = today, status = TaskStatus.DONE),
            task("sous-tache", due = today, parent = "retard"),
        )

        val result = TaskViews.today(tasks, today, now).map { it.uid }

        assertEquals(setOf("retard", "aujourdhui", "en-cours", "planifiee"), result.toSet())
    }

    @Test
    fun `en retard ne garde que les échéances passées`() {
        val tasks = listOf(
            task("retard", due = LocalDate.of(2026, 10, 28)),
            task("aujourdhui", due = today),
        )

        assertEquals(listOf("retard"), TaskViews.overdue(tasks, today, now).map { it.uid })
    }

    @Test
    fun `une échéance de fin de journée du compte reste le jour prévu`() {
        // 2026-10-30T23:59:59.999Z vaut le 31 à Paris : le jour affiché vient de dueDay.
        val tasks = listOf(task("ce-jour", due = today))

        assertEquals(emptyList<String>(), TaskViews.overdue(tasks, today, now).map { it.uid })
        assertEquals(listOf("ce-jour"), TaskViews.today(tasks, today, now).map { it.uid })
    }

    @Test
    fun `à venir groupe les échéances des sept jours suivants, sans aujourd'hui ni tâche reportée`() {
        val tasks = listOf(
            task("aujourdhui", due = today),
            task("demain", due = LocalDate.of(2026, 10, 31)),
            task("dans-sept-jours", due = LocalDate.of(2026, 11, 6)),
            task("trop-loin", due = LocalDate.of(2026, 11, 7)),
            task("reportee", due = LocalDate.of(2026, 11, 2), defer = "2026-11-05T00:00:00Z"),
        )

        val grouped = TaskViews.upcoming(tasks, today, now)

        assertEquals(
            mapOf(
                LocalDate.of(2026, 10, 31) to listOf("demain"),
                LocalDate.of(2026, 11, 6) to listOf("dans-sept-jours"),
            ),
            grouped.mapValues { (_, list) -> list.map { it.uid } },
        )
    }
}
