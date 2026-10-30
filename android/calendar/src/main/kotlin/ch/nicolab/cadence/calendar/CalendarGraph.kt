package ch.nicolab.cadence.calendar

import android.content.Context
import ch.nicolab.cadence.calendar.data.createCalendarRepository

/** Câblage manuel du module, comme `TasksGraph`. */
object CalendarGraph {
    @Volatile private var repository: CalendarRepository? = null

    fun repository(context: Context): CalendarRepository = repository ?: synchronized(this) {
        repository ?: createCalendarRepository(context.applicationContext).also { repository = it }
    }
}
