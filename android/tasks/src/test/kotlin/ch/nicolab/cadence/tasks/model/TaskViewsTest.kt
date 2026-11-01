package ch.nicolab.cadence.tasks.model

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class TaskViewsTest {
    private val today = LocalDate.of(2026, 10, 30)
    private val now: Instant = Instant.parse("2026-10-30T09:00:00Z")
    private val utc: ZoneId = ZoneId.of("UTC")

    private fun series(uid: String, type: String, due: LocalDate, rule: RecurrenceRule = RecurrenceRule(), status: Int = TaskStatus.NOT_STARTED) =
        TaskItem(
            uid = uid, name = uid, status = status, recurrenceType = type, recurrence = rule,
            dueDay = due, dueDate = due.atStartOfDay(utc).toInstant(),
        )

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

        val grouped = TaskViews.upcoming(tasks, today, now, utc)

        assertEquals(
            mapOf(
                LocalDate.of(2026, 10, 31) to listOf("demain"),
                LocalDate.of(2026, 11, 6) to listOf("dans-sept-jours"),
            ),
            grouped.mapValues { (_, list) -> list.map { it.uid } },
        )
    }

    @Test
    fun `à classer garde les tâches ouvertes sans échéance ni projet`() {
        val tasks = listOf(
            task("sans-rien"),
            task("avec-projet").copy(projectUid = "projet"),
            task("avec-echeance", due = today),
            task("reportee").copy(deferUntil = Instant.parse("2026-11-01T00:00:00Z")),
            task("terminee", status = TaskStatus.DONE),
            task("sous-tache", parent = "retard"),
        )

        assertEquals(listOf("sans-rien"), TaskViews.unsorted(tasks, now).map { it.uid })
    }

    @Test
    fun `reporter une tâche à heure fixe garde son heure locale`() {
        val paris = ZoneId.of("Europe/Paris")
        // 07:30 UTC vaut 08:30 à Paris fin octobre (heure d'hiver).
        val task = TaskItem(
            uid = "reunion",
            name = "réunion",
            dueDate = Instant.parse("2026-10-30T07:30:00Z"),
            dueHasTime = true,
            dueDay = today,
        )

        val change = TaskViews.postponeChange(task, today.plusDays(1), paris)

        assertEquals(TaskChange(dueDate = LocalDate.of(2026, 10, 31), dueTime = "08:30"), change)
    }

    @Test
    fun `reporter une tâche sans heure ne fixe aucune heure`() {
        val task = TaskItem(
            uid = "journee",
            name = "journée",
            dueDate = Instant.parse("2026-10-30T22:59:59.999Z"),
            dueHasTime = false,
            dueDay = today,
        )

        val change = TaskViews.postponeChange(task, today.plusDays(1), ZoneId.of("Europe/Paris"))

        assertEquals(TaskChange(dueDate = LocalDate.of(2026, 10, 31)), change)
    }

    @Test
    fun `une tâche mise de côté n'est jamais en retard`() {
        val tasks = listOf(
            TaskItem("plus-tard", "plus tard", dueDay = LocalDate.of(2026, 10, 20), someday = true),
            TaskItem("retard", "retard", dueDay = LocalDate.of(2026, 10, 20)),
        )
        assertEquals(listOf("retard"), TaskViews.today(tasks, today, now).map { it.uid })
        assertEquals(listOf("retard"), TaskViews.overdue(tasks, today, now).map { it.uid })
    }

    @Test
    fun `suggestions du jour, cette semaine puis en vue, sans plus tard ni ce qui est déjà du jour`() {
        val week = LocalDate.of(2026, 10, 26)
        val tasks = listOf(
            TaskItem("vue-ancienne", "a", inViewAt = Instant.parse("2026-10-01T00:00:00Z")),
            TaskItem("vue-recente", "b", inViewAt = Instant.parse("2026-10-29T00:00:00Z")),
            TaskItem("semaine", "c", weekOf = week),
            TaskItem("semaine-passee", "d", weekOf = week.minusWeeks(1)),
            TaskItem("semaine-plus-tard", "e", weekOf = week, someday = true),
            TaskItem("semaine-du-jour", "f", weekOf = week, dueDay = today),
            TaskItem("vue-reportee", "g", inViewAt = Instant.EPOCH, deferUntil = Instant.parse("2026-11-05T00:00:00Z")),
            TaskItem("vue-terminee", "h", inViewAt = Instant.EPOCH, status = TaskStatus.DONE),
        )
        assertEquals(
            listOf("semaine", "vue-recente", "vue-ancienne"),
            TaskViews.suggestions(tasks, today, now, week).map { it.uid },
        )
    }

    @Test
    fun `en retard seulement pour une échéance passée d'une tâche ouverte qui n'est pas mise de côté`() {
        val past = LocalDate.of(2026, 10, 28)
        assertTrue(TaskViews.isOverdue(task("retard", due = past), today))
        assertFalse(TaskViews.isOverdue(task("aujourdhui", due = today), today))
        assertFalse(TaskViews.isOverdue(task("sans-date"), today))
        assertFalse(TaskViews.isOverdue(task("terminee", due = past, status = TaskStatus.DONE), today))
        assertFalse(TaskViews.isOverdue(task("plus-tard", due = past).copy(someday = true), today))
    }

    @Test
    fun `upcoming lists the later occurrences of a series next to its stored one, which alone is not virtual`() {
        val daily = series("quotidienne", "daily", LocalDate.of(2026, 10, 31))

        val grouped = TaskViews.upcoming(listOf(daily), today, now, utc, days = 3)

        assertEquals(
            listOf(LocalDate.of(2026, 10, 31), LocalDate.of(2026, 11, 1), LocalDate.of(2026, 11, 2)),
            grouped.keys.toList(),
        )
        assertEquals(listOf(false, true, true), grouped.values.map { it.single().virtual })
        assertEquals(3, grouped.values.flatten().map { it.rowKey }.toSet().size)
    }

    @Test
    fun `an overdue series leaves its stored row to Today and upcoming shows only the future ones`() {
        val weekly = series("hebdo", "weekly", LocalDate.of(2026, 10, 19), RecurrenceRule(weekday = 1))

        val grouped = TaskViews.upcoming(listOf(weekly), today, now, utc)

        assertEquals(listOf(LocalDate.of(2026, 11, 2)), grouped.keys.toList())
        assertTrue(grouped.values.single().single().virtual)
        assertTrue(TaskViews.today(listOf(weekly), today, now).single().let { !it.virtual && it.uid == "hebdo" })
    }

    @Test
    fun `upcoming expands neither closed, deferred, subtask, completion based nor out of window series`() {
        val tasks = listOf(
            series("terminee", "daily", today, status = TaskStatus.DONE),
            series("reportee", "daily", today).copy(deferUntil = Instant.parse("2026-12-01T00:00:00Z")),
            series("sous-tache", "daily", today).copy(parentTaskUid = "x"),
            series("apres-completion", "daily", today, RecurrenceRule(completionBased = true)),
            series("loin", "monthly", LocalDate.of(2026, 12, 15)),
        )

        assertTrue(TaskViews.upcoming(tasks, today, now, utc).isEmpty())
    }

    @Test
    fun `the series ends on its last day and skips removed days`() {
        val daily = series(
            "bornee", "daily", today,
            RecurrenceRule(endDay = LocalDate.of(2026, 11, 2), exdates = setOf(LocalDate.of(2026, 11, 1))),
        )

        assertEquals(
            listOf(LocalDate.of(2026, 10, 31), LocalDate.of(2026, 11, 2)),
            TaskViews.upcoming(listOf(daily), today, now, utc).keys.toList(),
        )
    }

    @Test
    fun `an overdue series is also due today through its occurrence of the day, once`() {
        val daily = series("quotidienne", "daily", LocalDate.of(2026, 10, 27))
        val someday = series("plus-tard", "daily", LocalDate.of(2026, 10, 27)).copy(someday = true)
        val onTime = series("a-jour", "daily", today)

        val occurrences = TaskViews.todayOccurrences(listOf(daily, someday, onTime), today, now, utc)

        assertEquals(listOf("quotidienne"), occurrences.map { it.uid })
        assertEquals(today, occurrences.single().dueDay)
        assertTrue(occurrences.single().virtual)
    }
}
