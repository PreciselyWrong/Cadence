package ch.nicolab.cadence.tasks.ui

import ch.nicolab.cadence.calendar.CalendarEvent
import ch.nicolab.cadence.calendar.DeviceCalendar
import ch.nicolab.cadence.calendar.EventWithDone
import ch.nicolab.cadence.tasks.model.TaskItem
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class TodayAgendaTest {
    private val zone = ZoneId.of("Europe/Zurich")
    private val day = LocalDate.of(2026, 10, 30)

    private fun at(hour: Int, minute: Int = 0): Instant =
        day.atTime(hour, minute).atZone(zone).toInstant()

    private fun timedTask(uid: String, at: Instant) =
        TaskItem(uid = uid, name = uid, dueDate = at, dueHasTime = true, dueDay = day)

    /** Sans heure, le serveur stocke la fin du jour : la tâche ne doit pas être placée à cette heure. */
    private fun untimedTask(uid: String) =
        TaskItem(uid = uid, name = uid, dueDate = at(23, 59), dueHasTime = false, dueDay = day)

    private fun timedEvent(title: String, startHour: Int, startMinute: Int = 0) =
        event(title, begin = at(startHour, startMinute), end = at(startHour + 1, startMinute), allDay = false)

    private fun allDayEvent(title: String): EventWithDone = event(
        title = title,
        begin = day.atStartOfDay(ZoneOffset.UTC).toInstant(),
        end = day.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant(),
        allDay = true,
    )

    private fun event(title: String, begin: Instant, end: Instant, allDay: Boolean): EventWithDone {
        val calendar = DeviceCalendar(
            id = 1L,
            accountName = "perso@example.org",
            accountType = "com.google",
            displayName = "Travail",
            colorArgb = 0xFF1E88E5.toInt(),
            visibleOnDevice = true,
        )
        return EventWithDone(
            event = CalendarEvent(
                calendarId = calendar.id,
                eventId = title.hashCode().toLong(),
                instanceBegin = begin.toEpochMilli(),
                instanceEnd = end.toEpochMilli(),
                allDay = allDay,
                title = title,
                location = null,
                colorArgb = calendar.colorArgb,
            ),
            calendar = calendar,
            done = false,
        )
    }

    /** Libellés courts : uid pour une tâche, titre pour un événement. */
    private fun labels(items: List<TodayItem>): List<String> = items.map { item ->
        when (item) {
            is TodayItem.Task -> item.task.uid
            is TodayItem.Event -> item.event.event.title
        }
    }

    @Test
    fun `tâches et événements à heure se mêlent par heure de début`() {
        val items = mergeTodayItems(
            tasks = listOf(timedTask("t0900", at(9)), timedTask("t1100", at(11))),
            events = listOf(timedEvent("e0930", 9, 30), timedEvent("e1430", 14, 30)),
            zone = zone,
        )

        assertEquals(listOf("t0900", "e0930", "t1100", "e1430"), labels(items))
    }

    @Test
    fun `une journée entière passe avant les éléments à heure`() {
        val items = mergeTodayItems(
            tasks = listOf(timedTask("t0800", at(8))),
            events = listOf(timedEvent("e0900", 9), allDayEvent("Vacances")),
            zone = zone,
        )

        assertEquals(listOf("Vacances", "t0800", "e0900"), labels(items))
    }

    @Test
    fun `les journées entières gardent l'ordre fourni`() {
        val items = mergeTodayItems(
            tasks = emptyList(),
            events = listOf(allDayEvent("Anniversaire"), allDayEvent("Congé")),
            zone = zone,
        )

        assertEquals(listOf("Anniversaire", "Congé"), labels(items))
    }

    @Test
    fun `les tâches sans heure suivent les éléments à heure, dans leur ordre d'origine`() {
        val items = mergeTodayItems(
            tasks = listOf(untimedTask("b"), timedTask("t1000", at(10)), untimedTask("a")),
            events = listOf(timedEvent("e0900", 9)),
            zone = zone,
        )

        assertEquals(listOf("e0900", "t1000", "b", "a"), labels(items))
    }

    @Test
    fun `une tâche sans heure n'est pas placée à l'heure de fin de journée`() {
        val items = mergeTodayItems(
            tasks = listOf(untimedTask("sans-heure")),
            events = listOf(event("e2300", begin = at(23), end = at(23, 59), allDay = false)),
            zone = zone,
        )

        assertEquals(listOf("e2300", "sans-heure"), labels(items))
    }

    @Test
    fun `sans tâches ni événements la liste est vide`() {
        assertTrue(mergeTodayItems(emptyList(), emptyList(), zone).isEmpty())
    }

    @Test
    fun `seuls les événements ou seules les tâches donnent une liste complète`() {
        assertEquals(
            listOf("e0900"),
            labels(mergeTodayItems(emptyList(), listOf(timedEvent("e0900", 9)), zone)),
        )
        assertEquals(
            listOf("a", "b"),
            labels(mergeTodayItems(listOf(untimedTask("a"), untimedTask("b")), emptyList(), zone)),
        )
    }
}
