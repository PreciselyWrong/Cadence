package ch.nicolab.cadence.calendar.data

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import ch.nicolab.cadence.calendar.CalendarDisplay
import ch.nicolab.cadence.calendar.CalendarGlobalSettings
import ch.nicolab.cadence.calendar.EventInstanceKey
import ch.nicolab.cadence.calendar.HiddenEvent
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir

class PreferencesCalendarStoreTest {
    @TempDir
    lateinit var dir: File

    private lateinit var scope: CoroutineScope

    @BeforeEach
    fun setUp() {
        scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    }

    @AfterEach
    fun tearDown() {
        scope.cancel()
    }

    private fun store() = PreferencesCalendarStore(
        PreferenceDataStoreFactory.create(scope = scope, produceFile = { File(dir, "calendar.preferences_pb") }),
    )

    private val key = EventInstanceKey(calendarId = 1L, eventId = 7L, instanceBegin = 1_800_000_000_000L)

    @Test
    fun `defaults are empty displays, checked events and nothing done`() = runBlocking {
        val store = store()

        assertTrue(store.displays.first().isEmpty())
        assertEquals(CalendarGlobalSettings(), store.global.first())
        assertTrue(store.done.first().isEmpty())
    }

    @Test
    fun `display settings round-trip for two calendars`() = runBlocking {
        val store = store()
        val work = CalendarDisplay(agenda = true, tasks = false, widget = true)
        val personal = CalendarDisplay(agenda = false, tasks = true, widget = false)

        store.setDisplay(1L, work)
        store.setDisplay(2L, personal)

        assertEquals(mapOf(1L to work, 2L to personal), store.displays.first())
    }

    @Test
    fun `global settings round-trip`() = runBlocking {
        val store = store()

        store.setCheckEvents(false)
        store.setHideDone(true)

        assertEquals(CalendarGlobalSettings(checkEvents = false, hideDone = true), store.global.first())
    }

    @Test
    fun `done instances can be added then removed`() = runBlocking {
        val store = store()

        store.setDone(key, true)
        assertEquals(setOf(key), store.done.first())

        store.setDone(key, false)
        assertTrue(store.done.first().isEmpty())
    }

    @Test
    fun `hidden events persist, replace by key and are removed on restore`() = runBlocking {
        val store = store()
        val hidden = HiddenEvent(key, "Dentiste", allDay = false)

        store.setHidden(hidden, true)
        store.setHidden(hidden.copy(title = "Dentiste (renommé)"), true)

        assertEquals(setOf(hidden.copy(title = "Dentiste (renommé)")), store.hidden.first())

        store.setHidden(hidden, false)

        assertTrue(store.hidden.first().isEmpty())
    }
}
