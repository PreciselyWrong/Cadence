package ch.nicolab.cadence.tasks.ui

import ch.nicolab.cadence.calendar.CalendarEvent
import ch.nicolab.cadence.calendar.DeviceCalendar
import ch.nicolab.cadence.calendar.EventWithDone
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.planning.ProposedBlock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Aujourd'hui en ligne du temps : « À caser », la journée, le trait maintenant, le créneau libre. */
class TodayTimelineTest {
    private val zone = ZoneId.of("Europe/Zurich")
    private val day = LocalDate.of(2026, 11, 14)

    private fun at(hour: Int, minute: Int = 0): Instant = day.atTime(hour, minute).atZone(zone).toInstant()

    private fun timed(uid: String, hour: Int, minute: Int = 0, minutes: Int? = null) =
        TaskItem(uid = uid, name = uid, dueDate = at(hour, minute), dueHasTime = true, dueDay = day, estimatedMinutes = minutes)

    private fun untimed(uid: String, minutes: Int? = null) =
        TaskItem(uid = uid, name = uid, dueDate = at(23, 59), dueHasTime = false, dueDay = day, estimatedMinutes = minutes)

    private fun event(title: String, from: Int, to: Int, done: Boolean = false) = eventAt(title, at(from), at(to), false, done)

    private fun allDay(title: String) = eventAt(
        title,
        day.atStartOfDay(ZoneOffset.UTC).toInstant(),
        day.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant(),
        true,
        false,
    )

    private fun eventAt(title: String, begin: Instant, end: Instant, allDay: Boolean, done: Boolean): EventWithDone {
        val calendar = DeviceCalendar(1L, "perso@example.org", "com.google", "Perso", 0xFF1E88E5.toInt(), true)
        return EventWithDone(
            CalendarEvent(calendar.id, title.hashCode().toLong(), begin.toEpochMilli(), end.toEpochMilli(), allDay, title, null, calendar.colorArgb),
            calendar,
            done,
        )
    }

    private fun build(
        tasks: List<TaskItem>,
        events: List<EventWithDone> = emptyList(),
        now: Instant = at(8, 55),
        planStarts: Map<String, Instant> = emptyMap(),
    ) = TodayTimeline.of(tasks, events, planStarts, planOrder = emptyList(), now = now, zone = zone)

    private fun labels(timeline: TodayTimeline) = timeline.entries.map { entry ->
        when (entry) {
            is TimelineEntry.Item -> entry.label
            TimelineEntry.Now -> "now"
            is TimelineEntry.Free -> "free:${entry.minutes}"
        }
    }

    private val TimelineEntry.Item.label: String
        get() = when (val item = item) {
            is TodayItem.Task -> item.task.uid
            is TodayItem.Event -> item.event.event.title
        }

    @Test
    fun `à caser réunit les tâches sans heure et celles dont l'heure est passée, celles-ci d'abord`() {
        val timeline = build(listOf(untimed("ticktick"), timed("garage", 8, 30), timed("sport", 15)), now = at(9))
        assertEquals(listOf("garage", "ticktick"), timeline.toPlace.map { it.task.uid })
        assertEquals(at(8, 30), timeline.toPlace.first().missedAt)
        assertNull(timeline.toPlace.last().missedAt)
        assertEquals(listOf("now", "sport"), labels(timeline).filterNot { it.startsWith("free") })
    }

    @Test
    fun `la journée met le passé avant le trait maintenant, la journée entière en tête`() {
        val timeline = build(
            listOf(timed("sport", 15)),
            events = listOf(event("Café", 7, 8), event("Foire", 13, 14), allDay("Anniversaire")),
            now = at(8, 55),
        )
        assertEquals(listOf("Anniversaire", "Café", "now", "free:245", "Foire", "sport"), labels(timeline))
        val items = timeline.entries.filterIsInstance<TimelineEntry.Item>().associateBy { it.label }
        assertTrue(items.getValue("Café").past)
        assertFalse(items.getValue("Foire").past)
        assertTrue(items.getValue("Foire").next)
        assertFalse(items.getValue("sport").next)
    }

    @Test
    fun `un événement en cours n'est pas passé et le trait se place avant sa fin`() {
        val timeline = build(emptyList(), events = listOf(event("Réunion", 8, 10), event("Midi", 12, 13)), now = at(9))
        assertEquals(listOf("Réunion", "now", "free:120", "Midi"), labels(timeline))
        assertFalse((timeline.entries.first() as TimelineEntry.Item).past)
    }

    @Test
    fun `deux éléments qui se chevauchent sont signalés`() {
        val timeline = build(listOf(timed("sport", 15, minutes = 60)), events = listOf(event("Anniversaire", 15, 17), event("Marinades", 18, 19)))
        val items = timeline.entries.filterIsInstance<TimelineEntry.Item>().associateBy { it.label }
        assertTrue(items.getValue("Anniversaire").overlaps || items.getValue("sport").overlaps)
        assertFalse(items.getValue("Marinades").overlaps)
    }

    @Test
    fun `un créneau libre de moins de 30 minutes ne s'affiche pas`() {
        val timeline = build(emptyList(), events = listOf(event("Bientôt", 9, 10)), now = at(8, 45))
        assertEquals(listOf("now", "Bientôt"), labels(timeline))
    }

    @Test
    fun `caser ici pose les tâches à la suite dès le prochain quart d'heure, sans déborder du créneau`() {
        val timeline = build(
            listOf(untimed("a", minutes = 5), untimed("b"), untimed("c", minutes = 120)),
            events = listOf(event("Foire", 10, 11)),
            now = at(8, 55),
        )
        val free = timeline.entries.filterIsInstance<TimelineEntry.Free>().single()
        assertEquals(
            listOf(ProposedBlock("a", 9 * 60, 9 * 60 + 5), ProposedBlock("b", 9 * 60 + 5, 9 * 60 + 35)),
            TodayTimeline.fill(timeline.toPlace.map { it.task }, free),
        )
    }

    @Test
    fun `une tâche placée par le plan prend l'heure du plan`() {
        val timeline = build(listOf(untimed("plan")), planStarts = mapOf("plan" to at(16)))
        assertEquals(emptyList<ToPlace>(), timeline.toPlace)
        assertTrue("plan" in labels(timeline))
    }

    @Test
    fun `une tâche en cours reste sur la journée, avant le trait, jusqu'à la fin de sa durée`() {
        val timeline = build(listOf(timed("chien", 9, 15, minutes = 30), timed("garage", 10, 30)), now = at(9, 20))
        assertEquals(emptyList<ToPlace>(), timeline.toPlace)
        assertEquals(listOf("chien", "now", "free:45", "garage"), labels(timeline))
        val later = build(listOf(timed("chien", 9, 15, minutes = 30)), now = at(9, 46))
        assertEquals(listOf("chien"), later.toPlace.map { it.task.uid })
    }
}
