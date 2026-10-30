package ch.nicolab.cadence.calendar.data

import android.content.Context
import ch.nicolab.cadence.calendar.CalendarRepository

internal fun createCalendarRepository(context: Context): CalendarRepository {
    val store = PreferencesCalendarStore(context.calendarPreferences())
    return DefaultCalendarRepository(
        source = AndroidCalendarSource(context),
        settings = store,
        doneStore = store,
    )
}
