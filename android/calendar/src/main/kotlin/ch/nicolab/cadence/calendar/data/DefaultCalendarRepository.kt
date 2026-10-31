package ch.nicolab.cadence.calendar.data

import ch.nicolab.cadence.calendar.CalendarDisplay
import ch.nicolab.cadence.calendar.CalendarEvent
import ch.nicolab.cadence.calendar.CalendarGlobalSettings
import ch.nicolab.cadence.calendar.CalendarRepository
import ch.nicolab.cadence.calendar.CalendarSettingsStore
import ch.nicolab.cadence.calendar.CalendarSource
import ch.nicolab.cadence.calendar.CalendarSurface
import ch.nicolab.cadence.calendar.CalendarWithDisplay
import ch.nicolab.cadence.calendar.DeviceCalendar
import ch.nicolab.cadence.calendar.EventDoneStore
import ch.nicolab.cadence.calendar.EventHiddenStore
import ch.nicolab.cadence.calendar.HiddenEvent
import ch.nicolab.cadence.calendar.EventInstanceKey
import ch.nicolab.cadence.calendar.EventWithDone
import ch.nicolab.cadence.calendar.TimeRange
import ch.nicolab.cadence.calendar.selectEvents
import ch.nicolab.cadence.calendar.withDisplays
import java.time.ZoneId
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.mapLatest
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.flow.update

/**
 * Assemble agendas, occurrences et réglages. [refresh] réabonne les flux au fournisseur, ce qui
 * enregistre l'observateur une fois la permission accordée.
 */
@OptIn(ExperimentalCoroutinesApi::class)
internal class DefaultCalendarRepository(
    private val source: CalendarSource,
    private val settings: CalendarSettingsStore,
    private val doneStore: EventDoneStore,
    private val hiddenStore: EventHiddenStore,
    private val zone: () -> ZoneId = ZoneId::systemDefault,
) : CalendarRepository {

    private val refreshTick = MutableStateFlow(0)

    private val ticks: Flow<Unit> = refreshTick.flatMapLatest {
        merge(flowOf(Unit), source.changes())
    }

    override val permissionMissing: Flow<Boolean> = ticks
        .map { !source.hasPermission() }
        .distinctUntilChanged()

    override val globalSettings: Flow<CalendarGlobalSettings> = settings.global

    override fun calendars(): Flow<List<CalendarWithDisplay>> = combine(
        ticks.mapLatest { readCalendars() },
        settings.displays,
    ) { calendars, displays -> withDisplays(calendars, displays) }

    override fun events(range: TimeRange, surface: CalendarSurface): Flow<List<EventWithDone>> = combine(
        ticks.mapLatest { readCalendarsAndEvents(range) },
        settings.displays,
        settings.global,
        doneStore.done,
        hiddenStore.hidden,
    ) { (calendars, events), displays, global, done, hidden ->
        selectEvents(events, calendars, displays, global, done, range, surface, zone(), hidden.mapTo(HashSet()) { it.key })
    }.distinctUntilChanged()

    override suspend fun setDisplay(calendarId: Long, display: CalendarDisplay) {
        settings.setDisplay(calendarId, display)
    }

    override suspend fun setCheckEvents(enabled: Boolean) {
        settings.setCheckEvents(enabled)
    }

    override suspend fun setHideDone(enabled: Boolean) {
        settings.setHideDone(enabled)
    }

    override suspend fun hideEvent(event: HiddenEvent) {
        hiddenStore.setHidden(event, hidden = true)
    }

    override suspend fun restoreEvent(key: EventInstanceKey) {
        val current = hiddenStore.hidden.first().firstOrNull { it.key == key } ?: return
        hiddenStore.setHidden(current, hidden = false)
    }

    override fun hiddenEvents(): Flow<List<HiddenEvent>> =
        hiddenStore.hidden.map { set -> set.sortedByDescending { it.key.instanceBegin } }

    override suspend fun toggleDone(key: EventInstanceKey) {
        if (!settings.global.first().checkEvents) return
        val isDone = key in doneStore.done.first()
        doneStore.setDone(key, !isDone)
    }

    override fun refresh() {
        refreshTick.update { it + 1 }
    }

    private suspend fun readCalendars(): List<DeviceCalendar> =
        if (source.hasPermission()) source.calendars() else emptyList()

    private suspend fun readCalendarsAndEvents(range: TimeRange): Pair<List<DeviceCalendar>, List<CalendarEvent>> =
        if (source.hasPermission()) source.calendars() to source.instances(range)
        else emptyList<DeviceCalendar>() to emptyList()
}
