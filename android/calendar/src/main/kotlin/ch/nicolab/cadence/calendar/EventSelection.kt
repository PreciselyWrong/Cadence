package ch.nicolab.cadence.calendar

import java.time.ZoneId

/** Réglage effectif d'un agenda : celui enregistré, sinon les valeurs par défaut d'un agenda neuf. */
fun Map<Long, CalendarDisplay>.displayFor(calendarId: Long): CalendarDisplay = this[calendarId] ?: CalendarDisplay()

/** Associe chaque agenda à son réglage, trié par accountName puis displayName (insensible à la casse). */
fun withDisplays(calendars: List<DeviceCalendar>, displays: Map<Long, CalendarDisplay>): List<CalendarWithDisplay> =
    calendars
        .map { CalendarWithDisplay(it, displays.displayFor(it.id)) }
        .sortedWith(
            compareBy<CalendarWithDisplay> { it.calendar.accountName.lowercase() }
                .thenBy { it.calendar.displayName.lowercase() },
        )

/**
 * Occurrences à montrer sur [surface] dans [range]. Garde celles dont l'agenda est connu dans [calendars] et affiché sur [surface],
 * qui chevauchent [range] dans [zone]. done = global.checkEvents && key in done. Retire les faites si global.hideDone et les occurrences de [hidden], sur toute surface.
 * Tri : allDay d'abord, puis localStart, puis title (insensible à la casse), puis eventId.
 */
fun selectEvents(
    events: List<CalendarEvent>,
    calendars: List<DeviceCalendar>,
    displays: Map<Long, CalendarDisplay>,
    global: CalendarGlobalSettings,
    done: Set<EventInstanceKey>,
    range: TimeRange,
    surface: CalendarSurface,
    zone: ZoneId,
    hidden: Set<EventInstanceKey> = emptySet(),
): List<EventWithDone> {
    val calendarsById = calendars.associateBy { it.id }
    return events
        .distinctBy { it.key }
        .filterNot { it.key in hidden }
        .mapNotNull { event ->
            val calendar = calendarsById[event.calendarId] ?: return@mapNotNull null
            if (!displays.displayFor(calendar.id).shows(surface)) return@mapNotNull null
            if (!event.overlaps(range, zone)) return@mapNotNull null
            EventWithDone(event, calendar, done = global.checkEvents && event.key in done)
        }
        .filterNot { global.hideDone && it.done }
        .sortedWith(
            compareByDescending<EventWithDone> { it.event.allDay }
                .thenBy { it.event.localStart(zone) }
                .thenBy { it.event.title.lowercase() }
                .thenBy { it.event.eventId },
        )
}
