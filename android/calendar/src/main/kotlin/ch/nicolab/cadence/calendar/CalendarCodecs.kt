package ch.nicolab.cadence.calendar

internal object CalendarCodecs {
    private const val SEPARATOR = ":"
    private const val AGENDA_BIT = 1
    private const val TASKS_BIT = 2
    private const val WIDGET_BIT = 4

    /** "calendarId:eventId:instanceBegin" */
    fun encodeKey(key: EventInstanceKey): String =
        listOf(key.calendarId, key.eventId, key.instanceBegin).joinToString(SEPARATOR)

    /** null when malformed (wrong part count or non-Long part). */
    fun decodeKey(value: String): EventInstanceKey? {
        val parts = value.split(SEPARATOR)
        if (parts.size != 3) return null
        val (calendarId, eventId, instanceBegin) = parts.map { it.toLongOrNull() ?: return null }
        return EventInstanceKey(calendarId, eventId, instanceBegin)
    }

    /** Bits: agenda = 1, tasks = 2, widget = 4. */
    fun encodeDisplay(display: CalendarDisplay): Int =
        (if (display.agenda) AGENDA_BIT else 0) or
            (if (display.tasks) TASKS_BIT else 0) or
            (if (display.widget) WIDGET_BIT else 0)

    fun decodeDisplay(bits: Int): CalendarDisplay = CalendarDisplay(
        agenda = bits and AGENDA_BIT != 0,
        tasks = bits and TASKS_BIT != 0,
        widget = bits and WIDGET_BIT != 0,
    )
}
