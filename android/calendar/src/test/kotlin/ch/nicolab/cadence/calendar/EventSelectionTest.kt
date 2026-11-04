package ch.nicolab.cadence.calendar

import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Test

class EventSelectionTest {
    private val zone = ZoneId.of("Europe/Zurich")
    private val day = LocalDate.of(2026, 10, 30)
    private val range = TimeRange.ofDays(day, 1, zone)
    private val defaults = CalendarGlobalSettings()
    private val calendar = calendar(id = 1L)

    private fun calendar(id: Long, account: String = "compte", name: String = "Agenda $id") = DeviceCalendar(
        id = id,
        accountName = account,
        accountType = "com.google",
        displayName = name,
        colorArgb = 0,
        visibleOnDevice = true,
    )

    private fun at(hour: Int, date: LocalDate = day): Long =
        date.atTime(hour, 0).atZone(zone).toInstant().toEpochMilli()

    private fun event(
        eventId: Long = 1L,
        calendarId: Long = 1L,
        begin: Long = at(10),
        end: Long = begin + 3_600_000L,
        allDay: Boolean = false,
        title: String = "Réunion",
    ) = CalendarEvent(
        calendarId = calendarId,
        eventId = eventId,
        instanceBegin = begin,
        instanceEnd = end,
        allDay = allDay,
        title = title,
        location = null,
        colorArgb = 0,
    )

    private fun select(
        events: List<CalendarEvent>,
        calendars: List<DeviceCalendar> = listOf(calendar),
        displays: Map<Long, CalendarDisplay> = emptyMap(),
        global: CalendarGlobalSettings = defaults,
        done: Set<EventInstanceKey> = emptySet(),
        surface: CalendarSurface = CalendarSurface.AGENDA,
        hidden: Set<EventInstanceKey> = emptySet(),
        now: Long = at(12),
    ): List<EventWithDone> = selectEvents(events, calendars, displays, global, done, range, surface, zone, hidden, now)

    @Test
    fun `un agenda sans réglage s'affiche sur l'agenda et les tâches, pas sur le widget`() {
        val events = listOf(event())

        assertEquals(1, select(events, surface = CalendarSurface.AGENDA).size)
        assertEquals(1, select(events, surface = CalendarSurface.TASKS).size)
        assertEquals(0, select(events, surface = CalendarSurface.WIDGET).size)
    }

    @Test
    fun `un réglage enregistré masque l'agenda sur la surface désactivée`() {
        val displays = mapOf(1L to CalendarDisplay(agenda = false))
        val events = listOf(event())

        assertEquals(0, select(events, displays = displays, surface = CalendarSurface.AGENDA).size)
        assertEquals(1, select(events, displays = displays, surface = CalendarSurface.TASKS).size)
    }

    @Test
    fun `une occurrence d'un agenda inconnu est écartée`() {
        val events = listOf(event(calendarId = 99L))

        assertEquals(emptyList<EventWithDone>(), select(events))
    }

    @Test
    fun `une occurrence hors de la plage est écartée`() {
        val tomorrow = event(begin = at(10, day.plusDays(1)))

        assertEquals(emptyList<EventWithDone>(), select(listOf(tomorrow)))
    }

    @Test
    fun `l'état fait vient de l'ensemble des faites`() {
        val done = event(eventId = 1L)
        val pending = event(eventId = 2L)

        val result = select(listOf(done, pending), done = setOf(done.key))

        assertEquals(mapOf(1L to true, 2L to false), result.associate { it.event.eventId to it.done })
    }

    @Test
    fun `sans cocher les événements, aucune occurrence n'est faite ni masquée`() {
        val event = event()
        val global = CalendarGlobalSettings(checkEvents = false, hideDone = true)

        val result = select(listOf(event), global = global, done = setOf(event.key))

        assertEquals(1, result.size)
        assertFalse(result.single().done)
    }

    @Test
    fun `masquer les faites retire les occurrences faites`() {
        val done = event(eventId = 1L)
        val pending = event(eventId = 2L)
        val global = CalendarGlobalSettings(hideDone = true)

        val result = select(listOf(done, pending), global = global, done = setOf(done.key))

        assertEquals(listOf(2L), result.map { it.event.eventId })
    }

    @Test
    fun `les doublons de même clé n'apparaissent qu'une fois`() {
        val result = select(listOf(event(), event()))

        assertEquals(1, result.size)
    }

    @Test
    fun `tri par journée entière d'abord, puis début, puis titre sans casse`() {
        val events = listOf(
            event(eventId = 1L, begin = at(10), title = "beta"),
            event(eventId = 2L, begin = at(8), title = "gamma"),
            event(eventId = 3L, begin = at(10), title = "Alpha"),
            event(
                eventId = 4L,
                begin = day.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
                end = day.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
                allDay = true,
                title = "Zeta",
            ),
        )

        val titles = select(events).map { it.event.title }

        assertEquals(listOf("Zeta", "gamma", "Alpha", "beta"), titles)
    }

    @Test
    fun `withDisplays trie par compte puis nom sans casse et applique les défauts`() {
        val calendars = listOf(
            calendar(id = 1L, account = "b", name = "Travail"),
            calendar(id = 2L, account = "a", name = "zeta"),
            calendar(id = 3L, account = "a", name = "Alpha"),
        )
        val displays = mapOf(2L to CalendarDisplay(agenda = false, tasks = false, widget = true))

        val result = withDisplays(calendars, displays)

        assertEquals(listOf(3L, 2L, 1L), result.map { it.calendar.id })
        assertEquals(CalendarDisplay(), result.first { it.calendar.id == 3L }.display)
        assertEquals(CalendarDisplay(agenda = false, tasks = false, widget = true), result.first { it.calendar.id == 2L }.display)
    }

    @Test
    fun `une occurrence masquée disparaît de chaque surface`() {
        val events = listOf(event(eventId = 1L), event(eventId = 2L, begin = at(11)))
        val hidden = setOf(events[0].key)

        CalendarSurface.entries.forEach { surface ->
            val displays = mapOf(1L to CalendarDisplay(agenda = true, tasks = true, widget = true))
            assertEquals(listOf(2L), select(events, displays = displays, surface = surface, hidden = hidden).map { it.event.eventId })
        }
    }

    @Test
    fun `un agenda dont les notifications sont coupées n'a aucun événement sur la surface Rappels mais reste ailleurs`() {
        val displays = mapOf(1L to CalendarDisplay(notify = false))
        val events = listOf(event())

        assertEquals(0, select(events, displays = displays, surface = CalendarSurface.REMINDERS).size)
        assertEquals(1, select(events, displays = displays, surface = CalendarSurface.AGENDA).size)
        assertEquals(1, select(events, surface = CalendarSurface.REMINDERS).size)
    }

    @Test
    fun `un doublon sur un agenda aux notifications coupées sonne via l'autre agenda`() {
        val calendars = listOf(calendar(1L), calendar(2L))
        val displays = mapOf(1L to CalendarDisplay(notify = false))
        val events = listOf(event(eventId = 1L, calendarId = 1L), event(eventId = 2L, calendarId = 2L))

        assertEquals(listOf(2L to 2L), ids(select(events, calendars, displays, surface = CalendarSurface.REMINDERS)))
    }

    @Test
    fun `masquer une occurrence d'une série garde les autres occurrences`() {
        val first = event(eventId = 5L, begin = at(10))
        val second = event(eventId = 5L, begin = at(14))

        val shown = select(listOf(first, second), hidden = setOf(first.key))

        assertEquals(listOf(second.instanceBegin), shown.map { it.event.instanceBegin })
    }

    @Test
    fun `un événement masqué et fait ne revient pas via le réglage masquer les faits`() {
        val e = event()

        assertEquals(0, select(listOf(e), done = setOf(e.key), hidden = setOf(e.key)).size)
    }

    @Test
    fun `un agenda non synchronisé et jamais choisi est écarté de toutes les surfaces`() {
        val unsynced = calendar(id = 1L).copy(syncEvents = false)
        val events = listOf(event())

        CalendarSurface.entries.forEach { surface ->
            assertEquals(0, select(events, calendars = listOf(unsynced), surface = surface).size, surface.name)
        }
    }

    @Test
    fun `un agenda non synchronisé que l'on choisit d'utiliser reste affiché`() {
        val unsynced = calendar(id = 1L).copy(syncEvents = false)
        val displays = mapOf(1L to CalendarDisplay(used = true))

        assertEquals(1, select(listOf(event()), calendars = listOf(unsynced), displays = displays).size)
    }

    @Test
    fun `un agenda synchronisé que l'on retire est écarté de toutes les surfaces`() {
        val synced = calendar(id = 1L).copy(syncEvents = true)
        val displays = mapOf(1L to CalendarDisplay(agenda = true, tasks = true, widget = true, used = false))
        val events = listOf(event())

        CalendarSurface.entries.forEach { surface ->
            assertEquals(0, select(events, calendars = listOf(synced), displays = displays, surface = surface).size, surface.name)
        }
    }

    private fun ids(result: List<EventWithDone>) = result.map { it.event.key.calendarId to it.event.eventId }

    @Test
    fun `masquer partout est le choix inverse d'utiliser`() {
        val display = CalendarDisplay(agenda = true, tasks = true, widget = true)

        val hidden = display.hiddenEverywhere(true)
        assertEquals(false, hidden.used)
        assertEquals(true, hidden.isHiddenEverywhere(calendar))
        assertEquals(true, hidden.agenda && hidden.tasks && hidden.widget)

        val back = hidden.hiddenEverywhere(false)
        assertEquals(true, back.used)
        assertEquals(false, back.isHiddenEverywhere(calendar))
    }

    @Test
    fun `un agenda masqué partout n'a aucun événement sur aucune surface même avec des doublons ailleurs`() {
        val calendars = listOf(calendar(1L), calendar(2L))
        val displays = mapOf(1L to CalendarDisplay(widget = true).hiddenEverywhere(true), 2L to CalendarDisplay(widget = true))
        val events = listOf(event(eventId = 1L, calendarId = 1L), event(eventId = 2L, calendarId = 2L))

        CalendarSurface.entries.forEach { surface ->
            assertEquals(listOf(2L to 2L), ids(select(events, calendars, displays, surface = surface)), surface.name)
        }
    }

    @Test
    fun `un même événement sur deux agendas n'apparaît qu'une fois`() {
        val calendars = listOf(calendar(1L), calendar(2L))
        val events = listOf(event(eventId = 1L, calendarId = 1L, title = "Dentiste"), event(eventId = 9L, calendarId = 2L, title = "  dentiste "))

        assertEquals(listOf(1L to 1L), ids(select(events, calendars)))
    }

    @Test
    fun `le doublon garde l'agenda principal, sinon le premier dans l'ordre`() {
        val shared = calendar(1L)
        val own = calendar(2L).copy(primary = true)
        val third = calendar(3L)
        val events = listOf(event(eventId = 1L, calendarId = 1L), event(eventId = 2L, calendarId = 2L), event(eventId = 3L, calendarId = 3L))

        assertEquals(listOf(2L to 2L), ids(select(events, listOf(shared, own, third))))
        assertEquals(listOf(1L to 1L), ids(select(events, listOf(shared, third))))
    }

    @Test
    fun `même titre à une autre heure ou un autre jour n'est pas fusionné`() {
        val calendars = listOf(calendar(1L), calendar(2L))
        val events = listOf(
            event(eventId = 1L, calendarId = 1L, begin = at(10)),
            event(eventId = 2L, calendarId = 2L, begin = at(11)),
            event(eventId = 3L, calendarId = 2L, begin = at(10), end = at(10) + 1_800_000L),
        )

        assertEquals(3, select(events, calendars).size)
    }

    @Test
    fun `une journée entière en double est fusionnée, pas celle d'un autre jour`() {
        val calendars = listOf(calendar(1L), calendar(2L))
        val utcDay = day.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        val allDay = { id: Long, cal: Long, offset: Long ->
            event(eventId = id, calendarId = cal, begin = utcDay, end = utcDay + 86_400_000L, allDay = true, title = "Congé")
                .let { it.copy(instanceBegin = it.instanceBegin + offset * 86_400_000L, instanceEnd = it.instanceEnd + offset * 86_400_000L) }
        }

        assertEquals(1, select(listOf(allDay(1L, 1L, 0), allDay(2L, 2L, 0)), calendars).size)
        assertEquals(1, select(listOf(allDay(1L, 1L, 0), allDay(2L, 2L, 1)), calendars).size)
    }

    @Test
    fun `une journée entière et un événement horaire de même titre restent deux`() {
        val calendars = listOf(calendar(1L), calendar(2L))
        val utcDay = day.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        val events = listOf(
            event(eventId = 1L, calendarId = 1L, begin = utcDay, end = utcDay + 86_400_000L, allDay = true),
            event(eventId = 2L, calendarId = 2L),
        )

        assertEquals(2, select(events, calendars).size)
    }

    @Test
    fun `les occurrences d'une série ne se fusionnent qu'avec la même occurrence d'un autre agenda`() {
        val calendars = listOf(calendar(1L), calendar(2L))
        val nextDay = day.plusDays(1)
        val wide = TimeRange.ofDays(day, 2, zone)
        val events = listOf(
            event(eventId = 1L, calendarId = 1L, begin = at(9)),
            event(eventId = 1L, calendarId = 1L, begin = at(9, nextDay)),
            event(eventId = 5L, calendarId = 2L, begin = at(9)),
            event(eventId = 5L, calendarId = 2L, begin = at(9, nextDay)),
        )

        val result = selectEvents(events, calendars, emptyMap(), defaults, emptySet(), wide, CalendarSurface.AGENDA, zone)

        assertEquals(listOf(1L to 1L, 1L to 1L), ids(result))
    }

    @Test
    fun `deux lieux différents gardent deux événements, un lieu absent fusionne`() {
        val calendars = listOf(calendar(1L), calendar(2L), calendar(3L))
        val a = event(eventId = 1L, calendarId = 1L).copy(location = "Salle A")
        val b = event(eventId = 2L, calendarId = 2L).copy(location = "salle b")
        val c = event(eventId = 3L, calendarId = 3L).copy(location = null)

        assertEquals(2, select(listOf(a, b), calendars).size)
        assertEquals(1, select(listOf(a, c), calendars).size)
    }

    @Test
    fun `le doublon est jugé après le filtre par surface`() {
        val calendars = listOf(calendar(1L).copy(primary = true), calendar(2L))
        val displays = mapOf(1L to CalendarDisplay(tasks = false))
        val events = listOf(event(eventId = 1L, calendarId = 1L), event(eventId = 2L, calendarId = 2L))

        assertEquals(listOf(2L to 2L), ids(select(events, calendars, displays, surface = CalendarSurface.TASKS)))
        assertEquals(listOf(1L to 1L), ids(select(events, calendars, displays, surface = CalendarSurface.AGENDA)))
    }

    @Test
    fun `cocher l'événement gardé le marque fait`() {
        val calendars = listOf(calendar(1L), calendar(2L))
        val events = listOf(event(eventId = 1L, calendarId = 1L), event(eventId = 2L, calendarId = 2L))
        val kept = events.first().key

        val result = select(events, calendars, done = setOf(kept))

        assertEquals(listOf(true), result.map { it.done })
    }

    @Test
    fun `un agenda qui coche le passé montre faites les occurrences terminées, pas celles en cours ou à venir`() {
        val displays = mapOf(1L to CalendarDisplay(autoDonePast = true))
        val ended = event(eventId = 1L, begin = at(9), end = at(10))
        val running = event(eventId = 2L, begin = at(11), end = at(13))
        val later = event(eventId = 3L, begin = at(15))

        val result = select(listOf(ended, running, later), displays = displays, now = at(12))

        assertEquals(mapOf(1L to true, 2L to false, 3L to false), result.associate { it.event.eventId to it.done })
    }

    @Test
    fun `sans le réglage, une occurrence terminée reste à cocher`() {
        val result = select(listOf(event(begin = at(9), end = at(10))), now = at(12))

        assertFalse(result.single().done)
    }

    @Test
    fun `une journée entière se coche seule à minuit local, pas avant`() {
        val displays = mapOf(1L to CalendarDisplay(autoDonePast = true))
        val utcDay = day.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        val allDay = event(begin = utcDay, end = utcDay + 86_400_000L, allDay = true)

        assertFalse(select(listOf(allDay), displays = displays, now = at(23)).single().done)
        assertEquals(true, select(listOf(allDay), displays = displays, now = at(0, day.plusDays(1))).single().done)
    }

    @Test
    fun `cocher le passé suit « Cocher un événement » et « Masquer les événements faits »`() {
        val displays = mapOf(1L to CalendarDisplay(autoDonePast = true))
        val ended = event(begin = at(9), end = at(10))

        assertFalse(select(listOf(ended), displays = displays, global = CalendarGlobalSettings(checkEvents = false)).single().done)
        assertEquals(0, select(listOf(ended), displays = displays, global = CalendarGlobalSettings(hideDone = true)).size)
    }
}
