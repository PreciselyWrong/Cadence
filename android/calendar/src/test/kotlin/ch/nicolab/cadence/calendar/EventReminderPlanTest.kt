package ch.nicolab.cadence.calendar

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class EventReminderPlanTest {
    private val zone = ZoneId.of("Europe/Zurich")
    private val now: Instant = at("2026-11-02T08:00:00")
    private val ten = EventReminderSettings(enabled = true, leadMinutes = 10)
    private val calendar = DeviceCalendar(1L, "compte", "com.google", "Travail", 0, visibleOnDevice = true)

    private fun at(local: String): Instant = LocalDateTime.parse(local).atZone(zone).toInstant()

    private fun timed(id: Long, start: String, title: String = "Réunion $id", minutes: Long = 60) = EventWithDone(
        CalendarEvent(1L, id, at(start).toEpochMilli(), at(start).plusSeconds(minutes * 60).toEpochMilli(), false, title, null, 0),
        calendar,
        done = false,
    )

    private fun allDay(id: Long, day: String, days: Long = 1, title: String = "Congé $id"): EventWithDone {
        val begin = LocalDate.parse(day).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        return EventWithDone(
            CalendarEvent(1L, id, begin, begin + days * 86_400_000L, true, title, null, 0),
            calendar,
            done = false,
        )
    }

    private fun plan(
        events: List<EventWithDone>,
        settings: EventReminderSettings = ten,
        delivered: Set<String> = emptySet(),
        shift: (Instant) -> Instant = { it },
    ) = EventReminders.plan(events, settings, delivered, now, zone, shift)

    @Test
    fun `un événement sonne à son début moins l'avance choisie`() {
        val alarms = plan(listOf(timed(1, "2026-11-02T14:00:00"))).events

        assertEquals(at("2026-11-02T13:50:00"), alarms.single().triggerAt)
        assertEquals(at("2026-11-02T14:00:00").toEpochMilli(), alarms.single().startMillis)
    }

    @Test
    fun `à l'heure sonne au début même`() {
        val alarms = plan(listOf(timed(1, "2026-11-02T14:00:00")), ten.copy(leadMinutes = 0)).events

        assertEquals(at("2026-11-02T14:00:00"), alarms.single().triggerAt)
    }

    @Test
    fun `désactivé, aucun événement ni résumé ne sonne`() {
        val result = plan(listOf(timed(1, "2026-11-02T14:00:00"), allDay(2, "2026-11-03")), ten.copy(enabled = false, allDayDigest = true))

        assertTrue(result.events.isEmpty())
        assertTrue(result.digests.isEmpty())
    }

    @Test
    fun `une journée entière ne sonne jamais comme un événement`() {
        assertTrue(plan(listOf(allDay(1, "2026-11-03"))).events.isEmpty())
    }

    @Test
    fun `un événement fait ne sonne pas`() {
        assertTrue(plan(listOf(timed(1, "2026-11-02T14:00:00").copy(done = true))).events.isEmpty())
    }

    @Test
    fun `pose seulement dans l'horizon de 14 jours`() {
        val events = listOf(timed(1, "2026-11-10T09:00:00"), timed(2, "2026-11-20T09:00:00"))

        assertEquals(listOf(1L), plan(events).events.map { it.key.eventId })
    }

    @Test
    fun `un événement dont l'alarme est passée mais qui n'a pas commencé sonne encore, une fois`() {
        val event = timed(1, "2026-11-02T08:05:00")

        assertEquals(listOf(1L), plan(listOf(event)).events.map { it.key.eventId })
        assertTrue(plan(listOf(event), delivered = setOf(EventReminders.deliveryKey(event.event.key))).events.isEmpty())
    }

    @Test
    fun `un événement déjà commencé ne sonne plus`() {
        assertTrue(plan(listOf(timed(1, "2026-11-02T07:55:00"))).events.isEmpty())
    }

    @Test
    fun `la plage silencieuse repousse l'alarme, ou la retire si elle dépasse le début`() {
        val untilNine: (Instant) -> Instant = { if (it.isBefore(at("2026-11-02T09:00:00"))) at("2026-11-02T09:00:00") else it }
        val early = timed(1, "2026-11-02T08:30:00")
        val later = timed(2, "2026-11-02T09:30:00")

        val alarms = plan(listOf(early, later), shift = untilNine).events

        assertEquals(listOf(2L), alarms.map { it.key.eventId })
        assertEquals(at("2026-11-02T09:20:00"), alarms.single().triggerAt)
        val shifted = plan(listOf(timed(3, "2026-11-02T09:05:00")), shift = untilNine).events
        assertEquals(at("2026-11-02T09:00:00"), shifted.single().triggerAt)
    }

    @Test
    fun `sans résumé, les journées entières ne produisent rien`() {
        assertTrue(plan(listOf(allDay(1, "2026-11-03"))).digests.isEmpty())
    }

    @Test
    fun `le résumé des journées entières sonne à 8 h, un par jour avec ses titres`() {
        val settings = ten.copy(allDayDigest = true)
        val events = listOf(
            allDay(1, "2026-11-03", title = "Vacances"),
            allDay(2, "2026-11-03", title = "anniversaire"),
            allDay(3, "2026-11-05", days = 2, title = "Congrès"),
        )

        val digests = plan(events, settings).digests

        assertEquals(listOf(LocalDate.of(2026, 11, 3), LocalDate.of(2026, 11, 5), LocalDate.of(2026, 11, 6)), digests.map { it.day })
        assertEquals(at("2026-11-03T08:00:00"), digests.first().triggerAt)
        assertEquals(listOf("anniversaire", "Vacances"), digests.first().titles)
    }

    @Test
    fun `le résumé du jour manqué sonne encore pendant 3 h, puis plus`() {
        val settings = ten.copy(allDayDigest = true)
        val today = listOf(allDay(1, "2026-11-02"))

        assertEquals(1, EventReminders.plan(today, settings, emptySet(), at("2026-11-02T10:00:00"), zone).digests.size)
        assertTrue(EventReminders.plan(today, settings, emptySet(), at("2026-11-02T12:00:00"), zone).digests.isEmpty())
        assertTrue(EventReminders.plan(today, settings, setOf("digest:2026-11-02"), at("2026-11-02T10:00:00"), zone).digests.isEmpty())
    }

    @Test
    fun `les remises trop anciennes sont purgées`() {
        val old = EventInstanceKey(1L, 1L, at("2026-10-30T10:00:00").toEpochMilli()).token()
        val recent = EventInstanceKey(1L, 2L, at("2026-11-02T07:00:00").toEpochMilli()).token()

        assertEquals(setOf(recent, "digest:2026-11-02"), EventReminders.pruneDelivered(setOf(old, recent, "digest:2026-10-20", "digest:2026-11-02", "n'importe quoi"), now, zone))
    }
}
