package ch.nicolab.cadence.calendar.data

import ch.nicolab.cadence.calendar.CalendarDisplay
import ch.nicolab.cadence.calendar.CalendarEvent
import ch.nicolab.cadence.calendar.CalendarSurface
import ch.nicolab.cadence.calendar.DeviceCalendar
import ch.nicolab.cadence.calendar.EventWithDone
import ch.nicolab.cadence.calendar.TimeRange
import ch.nicolab.cadence.calendar.ofDays
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DefaultCalendarRepositoryTest {
    private val zone = ZoneId.of("Europe/Zurich")
    private val range = TimeRange.ofDays(LocalDate.of(2026, 10, 30), 1, zone)
    private val calendar = DeviceCalendar(
        id = 1L,
        accountName = "compte",
        accountType = "com.google",
        displayName = "Travail",
        colorArgb = 0,
        visibleOnDevice = true,
    )

    private fun event(eventId: Long = 1L, hour: Int = 10): CalendarEvent {
        val begin = LocalDate.of(2026, 10, 30).atTime(hour, 0).atZone(zone).toInstant().toEpochMilli()
        return CalendarEvent(
            calendarId = 1L,
            eventId = eventId,
            instanceBegin = begin,
            instanceEnd = begin + 3_600_000L,
            allDay = false,
            title = "Réunion $eventId",
            location = null,
            colorArgb = 0,
        )
    }

    private fun repository(source: FakeCalendarSource, store: InMemoryCalendarStore = InMemoryCalendarStore()) =
        DefaultCalendarRepository(source, store, store, zone = { zone })

    @Test
    fun `missing permission gives empty lists until refresh after the grant`() = runTest {
        val source = FakeCalendarSource().apply {
            permission = false
            calendars = listOf(calendar)
            events = listOf(event())
        }
        val repo = repository(source)

        assertTrue(repo.permissionMissing.first())
        assertTrue(repo.events(range, CalendarSurface.AGENDA).first().isEmpty())
        assertTrue(repo.calendars().first().isEmpty())

        source.permission = true
        repo.refresh()

        assertFalse(repo.permissionMissing.first())
        assertEquals(1, repo.events(range, CalendarSurface.AGENDA).first().size)
    }

    @Test
    fun `toggleDone marks then unmarks the occurrence`() = runTest {
        val source = FakeCalendarSource().apply { calendars = listOf(calendar); events = listOf(event()) }
        val repo = repository(source)
        val key = event().key

        repo.toggleDone(key)
        assertTrue(repo.events(range, CalendarSurface.AGENDA).first { it.single().done }.single().done)

        repo.toggleDone(key)
        assertFalse(repo.events(range, CalendarSurface.AGENDA).first().single().done)
    }

    @Test
    fun `toggleDone does nothing when checking events is disabled`() = runTest {
        val source = FakeCalendarSource().apply { calendars = listOf(calendar); events = listOf(event()) }
        val store = InMemoryCalendarStore()
        val repo = repository(source, store)
        repo.setCheckEvents(false)

        repo.toggleDone(event().key)

        assertTrue(store.done.first().isEmpty())
    }

    @Test
    fun `hideDone removes done occurrences from events`() = runTest {
        val source = FakeCalendarSource().apply {
            calendars = listOf(calendar)
            events = listOf(event(eventId = 1L), event(eventId = 2L, hour = 11))
        }
        val repo = repository(source)
        repo.toggleDone(event(eventId = 1L).key)

        repo.setHideDone(true)

        val visible = repo.events(range, CalendarSurface.AGENDA).first()
        assertEquals(listOf(2L), visible.map { it.event.eventId })
    }

    @Test
    fun `events re-emit when the provider changes`() = runTest {
        val source = FakeCalendarSource().apply { calendars = listOf(calendar); events = listOf(event(1L)) }
        val repo = repository(source)
        val results = mutableListOf<List<EventWithDone>>()

        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
            repo.events(range, CalendarSurface.AGENDA).toList(results)
        }
        runCurrent()
        source.events = listOf(event(1L), event(2L, hour = 11))
        source.changeEvents.emit(Unit)
        runCurrent()

        assertEquals(2, results.last().size)
    }

    @Test
    fun `hiding the tasks surface removes the calendar only from tasks`() = runTest {
        val source = FakeCalendarSource().apply { calendars = listOf(calendar); events = listOf(event()) }
        val repo = repository(source)

        repo.setDisplay(1L, CalendarDisplay(tasks = false))

        assertFalse(repo.calendars().first().single().display.tasks)
        assertTrue(repo.events(range, CalendarSurface.TASKS).first().isEmpty())
        assertEquals(1, repo.events(range, CalendarSurface.AGENDA).first().size)
    }
}
