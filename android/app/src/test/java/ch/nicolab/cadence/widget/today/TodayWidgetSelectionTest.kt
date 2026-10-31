package ch.nicolab.cadence.widget.today

import ch.nicolab.cadence.calendar.CalendarEvent
import ch.nicolab.cadence.calendar.DeviceCalendar
import ch.nicolab.cadence.calendar.EventWithDone
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskPriority
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class TodayWidgetSelectionTest {
    private val today = LocalDate.of(2026, 10, 30)
    private val zone = ZoneOffset.UTC
    private val now = Instant.parse("2026-10-30T10:00:00Z")

    @Test
    fun `la portee Aujourd'hui exclut les retards et demain`() {
        val tasks = listOf(task("late", today.minusDays(2)), task("now", today), task("tomorrow", today.plusDays(1)))

        val selection = select(tasks, TodayWidgetConfig(taskScope = TaskScope.TODAY))

        assertEquals(listOf("now"), selection.tasks.map { it.uid })
        assertEquals(emptyList<String>(), selection.overdue.map { it.uid })
        assertEquals(1, selection.total)
    }

    @Test
    fun `les retards forment une section en tete quand elle est activee`() {
        val tasks = listOf(task("today", today), task("late", today.minusDays(3)))

        val selection = select(tasks, TodayWidgetConfig(showOverdueSection = true))

        assertEquals(listOf("late"), selection.overdue.map { it.uid })
        assertEquals(listOf("today"), selection.tasks.map { it.uid })
        assertEquals(2, selection.total)
    }

    @Test
    fun `sans section de retards les retards se melent a la liste par echeance`() {
        val tasks = listOf(task("today", today), task("late", today.minusDays(3)))

        val selection = select(tasks, TodayWidgetConfig(showOverdueSection = false))

        assertEquals(emptyList<String>(), selection.overdue.map { it.uid })
        assertEquals(listOf("late", "today"), selection.tasks.map { it.uid })
    }

    @Test
    fun `les trois prochains jours incluent demain et exclut le quatrieme`() {
        val tasks = listOf(
            task("d1", today.plusDays(1)),
            task("d3", today.plusDays(3)),
            task("d4", today.plusDays(4)),
        )

        val selection = select(tasks, TodayWidgetConfig(taskScope = TaskScope.NEXT_3))

        assertEquals(listOf("d1", "d3"), selection.tasks.map { it.uid })
    }

    @Test
    fun `sans date ne garde que les taches sans echeance`() {
        val tasks = listOf(task("dated", today), task("undated"))

        val selection = select(tasks, TodayWidgetConfig(taskScope = TaskScope.NO_DATE))

        assertEquals(listOf("undated"), selection.tasks.map { it.uid })
    }

    @Test
    fun `la boite garde les taches sans date ni projet`() {
        val tasks = listOf(
            task("loose"),
            task("inProject", projectUid = "p1"),
            task("dated", today),
        )

        val selection = select(tasks, TodayWidgetConfig(taskScope = TaskScope.INBOX))

        assertEquals(listOf("loose"), selection.tasks.map { it.uid })
    }

    @Test
    fun `le tri par priorite place les taches prioritaires en premier`() {
        val tasks = listOf(
            task("low", today, priority = TaskPriority.LOW),
            task("none", today),
            task("high", today, priority = TaskPriority.HIGH),
        )

        val selection = select(tasks, TodayWidgetConfig(taskScope = TaskScope.TODAY, sort = TaskSort.PRIORITY))

        assertEquals(listOf("high", "low", "none"), selection.tasks.map { it.uid })
    }

    @Test
    fun `toutes les taches du jour sont gardees, sans limite de lignes`() {
        val tasks = (1..40).map { task("t$it", today) }

        val selection = select(tasks, TodayWidgetConfig(taskScope = TaskScope.TODAY))

        assertEquals(40, selection.tasks.size)
        assertEquals(40, selection.total)
    }

    @Test
    fun `tous les retards sont gardes avant les taches du jour`() {
        val late = (1..15).map { task("late$it", today.minusDays(it.toLong())) }
        val tasks = late + task("today", today)

        val selection = select(tasks, TodayWidgetConfig(showOverdueSection = true))

        assertEquals(15, selection.overdue.size)
        assertEquals(listOf("today"), selection.tasks.map { it.uid })
        assertEquals(16, selection.total)
    }

    @Test
    fun `priorite haute seule et masquage des recurrences`() {
        val tasks = listOf(
            task("high", today, priority = TaskPriority.HIGH),
            task("low", today, priority = TaskPriority.LOW),
            task("highRecurring", today, priority = TaskPriority.HIGH, recurrenceType = "daily"),
        )

        val selection = select(
            tasks,
            TodayWidgetConfig(taskScope = TaskScope.TODAY, highPriorityOnly = true, hideRecurring = true),
        )

        assertEquals(listOf("high"), selection.tasks.map { it.uid })
    }

    @Test
    fun `les evenements n'apparaissent que si demande et suivent l'heure`() {
        val events = listOf(
            event("afternoon", begin = at("15:00"), allDay = false),
            event("morning", begin = at("09:00"), allDay = false),
        )

        val hidden = select(emptyList(), TodayWidgetConfig(showEvents = false), events)
        val shown = select(emptyList(), TodayWidgetConfig(showEvents = true), events)

        assertTrue(hidden.events.isEmpty())
        assertEquals(listOf("morning", "afternoon"), shown.events.map { it.event.title })
    }

    @Test
    fun `le filtre de projets ne garde que les taches de ces projets`() {
        val tasks = listOf(
            task("a", today, projectUid = "p1"),
            task("b", today, projectUid = "p2"),
            task("loose", today),
        )

        val selection = select(tasks, TodayWidgetConfig(taskScope = TaskScope.TODAY, projectUids = setOf("p1")))

        assertEquals(listOf("a"), selection.tasks.map { it.uid })
        assertEquals(1, selection.total)
    }

    @Test
    fun `le filtre d'etiquettes garde les taches portant au moins une etiquette choisie`() {
        val tasks = listOf(
            task("x", today, tagUids = listOf("t1", "t9")),
            task("y", today, tagUids = listOf("t2")),
            task("none", today),
        )

        val selection = select(tasks, TodayWidgetConfig(taskScope = TaskScope.TODAY, tagUids = setOf("t1", "t2")))

        assertEquals(listOf("x", "y"), selection.tasks.map { it.uid }.sorted())
    }

    @Test
    fun `projets et etiquettes se cumulent`() {
        val tasks = listOf(
            task("both", today, projectUid = "p1", tagUids = listOf("t1")),
            task("projectOnly", today, projectUid = "p1"),
            task("tagOnly", today, tagUids = listOf("t1")),
        )

        val selection = select(
            tasks,
            TodayWidgetConfig(taskScope = TaskScope.TODAY, projectUids = setOf("p1"), tagUids = setOf("t1")),
        )

        assertEquals(listOf("both"), selection.tasks.map { it.uid })
    }

    private fun select(
        tasks: List<TaskItem>,
        config: TodayWidgetConfig,
        events: List<EventWithDone> = emptyList(),
    ) = selectWidgetTasks(tasks, events, config, today, zone, now)

    private fun task(
        uid: String,
        due: LocalDate? = null,
        projectUid: String? = null,
        priority: Int? = null,
        recurrenceType: String? = null,
        tagUids: List<String> = emptyList(),
    ) = TaskItem(
        uid = uid,
        name = uid,
        dueDay = due,
        dueDate = due?.atStartOfDay(zone)?.toInstant(),
        projectUid = projectUid,
        priority = priority,
        recurrenceType = recurrenceType,
        tagUids = tagUids,
    )

    private fun at(hhmm: String): Long =
        today.atTime(java.time.LocalTime.parse(hhmm)).toInstant(ZoneOffset.UTC).toEpochMilli()

    private fun event(title: String, begin: Long, allDay: Boolean) = EventWithDone(
        event = CalendarEvent(
            calendarId = 1L,
            eventId = title.hashCode().toLong(),
            instanceBegin = begin,
            instanceEnd = begin + 3_600_000L,
            allDay = allDay,
            title = title,
            location = null,
            colorArgb = 0xFF00AA00.toInt(),
        ),
        calendar = DeviceCalendar(1L, "compte", "local", "Agenda", 0xFF00AA00.toInt(), true),
        done = false,
    )

    @Test
    fun `par jour les taches forment une section par echeance, les retards en tete`() {
        val tasks = listOf(
            task("today", today),
            task("yesterday-a", today.minusDays(1)),
            task("old", today.minusDays(3)),
            task("yesterday-b", today.minusDays(1)),
        )

        val sections = taskSections(select(tasks, TodayWidgetConfig(groupByDay = true)), TodayWidgetConfig(groupByDay = true), today)

        assertEquals(listOf(today.minusDays(3), today.minusDays(1), today), sections.map { it.day })
        assertEquals(listOf(true, true, false), sections.map { it.overdue })
        assertEquals(listOf(1, 2, 1), sections.map { it.tasks.size })
        assertTrue(sections.all { it.labelled })
    }

    @Test
    fun `une seule section du jour n'a pas d'intitule`() {
        val config = TodayWidgetConfig(groupByDay = true)
        val sections = taskSections(select(listOf(task("a", today), task("b", today)), config), config, today)

        assertEquals(1, sections.size)
        assertEquals(false, sections.single().labelled)
    }

    @Test
    fun `sans regroupement par jour les retards gardent leur section unique`() {
        val config = TodayWidgetConfig(groupByDay = false)
        val tasks = listOf(task("today", today), task("old", today.minusDays(3)), task("y", today.minusDays(1)))

        val sections = taskSections(select(tasks, config), config, today)

        assertEquals(listOf(true, false), sections.map { it.overdue })
        assertEquals(listOf(true, false), sections.map { it.labelled })
        assertEquals(listOf(listOf("old", "y"), listOf("today")), sections.map { s -> s.tasks.map { it.uid } })
    }
}
