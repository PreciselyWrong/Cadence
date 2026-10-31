package ch.nicolab.cadence.calendar.data

import ch.nicolab.cadence.calendar.CalendarDisplay
import ch.nicolab.cadence.calendar.CalendarEvent
import ch.nicolab.cadence.calendar.CalendarGlobalSettings
import ch.nicolab.cadence.calendar.CalendarSettingsStore
import ch.nicolab.cadence.calendar.CalendarSource
import ch.nicolab.cadence.calendar.DeviceCalendar
import ch.nicolab.cadence.calendar.EventDoneStore
import ch.nicolab.cadence.calendar.EventHiddenStore
import ch.nicolab.cadence.calendar.EventInstanceKey
import ch.nicolab.cadence.calendar.HiddenEvent
import ch.nicolab.cadence.calendar.TimeRange
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.emptyFlow

internal class FakeCalendarSource : CalendarSource {
    var permission = true
    var calendars: List<DeviceCalendar> = emptyList()
    var events: List<CalendarEvent> = emptyList()
    val changeEvents = MutableSharedFlow<Unit>(extraBufferCapacity = 8)

    override fun hasPermission(): Boolean = permission

    override suspend fun calendars(): List<DeviceCalendar> = if (permission) calendars else emptyList()

    override suspend fun instances(range: TimeRange): List<CalendarEvent> = if (permission) events else emptyList()

    override fun changes(): Flow<Unit> = if (permission) changeEvents else emptyFlow()
}

internal class InMemoryCalendarStore :
    CalendarSettingsStore,
    EventDoneStore,
    EventHiddenStore {
    private val hiddenState = MutableStateFlow<Set<HiddenEvent>>(emptySet())
    private val displayState = MutableStateFlow<Map<Long, CalendarDisplay>>(emptyMap())
    private val globalState = MutableStateFlow(CalendarGlobalSettings())
    private val doneState = MutableStateFlow<Set<EventInstanceKey>>(emptySet())

    override val displays: Flow<Map<Long, CalendarDisplay>> = displayState
    override val global: Flow<CalendarGlobalSettings> = globalState
    override val done: Flow<Set<EventInstanceKey>> = doneState
    override val hidden: Flow<Set<HiddenEvent>> = hiddenState

    override suspend fun setDisplay(calendarId: Long, display: CalendarDisplay) {
        displayState.value = displayState.value + (calendarId to display)
    }

    override suspend fun setCheckEvents(enabled: Boolean) {
        globalState.value = globalState.value.copy(checkEvents = enabled)
    }

    override suspend fun setHideDone(enabled: Boolean) {
        globalState.value = globalState.value.copy(hideDone = enabled)
    }

    override suspend fun setDone(key: EventInstanceKey, done: Boolean) {
        doneState.value = if (done) doneState.value + key else doneState.value - key
    }

    override suspend fun setHidden(event: HiddenEvent, hidden: Boolean) {
        hiddenState.value = hiddenState.value.filterNot { it.key == event.key }.toSet() + if (hidden) setOf(event) else emptySet()
    }
}
