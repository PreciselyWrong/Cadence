package ch.nicolab.cadence.calendar

internal object CalendarCodecs {
    private const val SEPARATOR = ":"
    private const val AGENDA_BIT = 1
    private const val TASKS_BIT = 2
    private const val WIDGET_BIT = 4
    private const val HIDDEN_PARTS = 5

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

    /** "calendarId:eventId:instanceBegin:allDay(0|1):titre" ; le titre est le reste de la ligne, séparateurs compris. */
    fun encodeHidden(hidden: HiddenEvent): String =
        "${encodeKey(hidden.key)}$SEPARATOR${if (hidden.allDay) 1 else 0}$SEPARATOR${hidden.title}"

    /** null when malformed. */
    fun decodeHidden(value: String): HiddenEvent? {
        val parts = value.split(SEPARATOR, limit = HIDDEN_PARTS)
        if (parts.size != HIDDEN_PARTS) return null
        val key = decodeKey(parts.take(3).joinToString(SEPARATOR)) ?: return null
        val allDay = when (parts[3]) {
            "1" -> true
            "0" -> false
            else -> return null
        }
        return HiddenEvent(key, title = parts[4], allDay = allDay)
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
