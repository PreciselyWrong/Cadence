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
 * Occurrences à montrer sur [surface] dans [range]. Garde celles dont l'agenda est connu dans [calendars], utilisé et affiché sur [surface],
 * qui chevauchent [range] dans [zone]. done = global.checkEvents && key in done. Retire les faites si global.hideDone et les occurrences de [hidden], sur toute surface.
 * Un même événement présent sur plusieurs agendas (titre, début, fin et jour entier identiques ; lieux compatibles) n'est
 * montré qu'une fois, voir [withoutDuplicates]. Tri : allDay d'abord, puis localStart, puis title (insensible à la casse), puis eventId.
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
    val order = calendars.withIndex().associate { it.value.id to it.index }
    val shown = events
        .distinctBy { it.key }
        .filterNot { it.key in hidden }
        .mapNotNull { event ->
            val calendar = calendarsById[event.calendarId] ?: return@mapNotNull null
            val display = displays.displayFor(calendar.id)
            if (!display.isUsed(calendar) || !display.shows(surface)) return@mapNotNull null
            if (!event.overlaps(range, zone)) return@mapNotNull null
            event to calendar
        }
    return withoutDuplicates(shown, order, zone)
        .map { (event, calendar) -> EventWithDone(event, calendar, done = global.checkEvents && event.key in done) }
        .filterNot { global.hideDone && it.done }
        .sortedWith(
            compareByDescending<EventWithDone> { it.event.allDay }
                .thenBy { it.event.localStart(zone) }
                .thenBy { it.event.title.lowercase() }
                .thenBy { it.event.eventId },
        )
}

/**
 * Garde une occurrence par groupe de doublons entre agendas différents : même titre (espaces et casse ignorés), même début et même fin dans
 * [zone], même caractère « journée entière ». Deux lieux non vides et différents séparent deux événements ; un lieu
 * absent s'accorde avec tout. Le survivant vient de l'agenda principal, sinon du premier dans [order], puis du plus
 * petit eventId. Fonction pure, appliquée après le filtre par surface pour qu'un agenda masqué ne cache pas son double.
 */
internal fun withoutDuplicates(
    items: List<Pair<CalendarEvent, DeviceCalendar>>,
    order: Map<Long, Int>,
    zone: ZoneId,
): List<Pair<CalendarEvent, DeviceCalendar>> {
    val ranked = items.sortedWith(
        compareByDescending<Pair<CalendarEvent, DeviceCalendar>> { it.second.primary }
            .thenBy { order[it.second.id] ?: Int.MAX_VALUE }
            .thenBy { it.first.eventId },
    )
    val kept = HashMap<List<Any>, MutableList<CalendarEvent>>()
    val survivors = HashSet<EventInstanceKey>()
    for ((event, calendar) in ranked) {
        val group = kept.getOrPut(listOf(event.title.trim().lowercase(), event.localStart(zone), event.localEnd(zone), event.allDay)) { mutableListOf() }
        // Deux événements distincts d'un même agenda ne sont jamais des doublons : seul un autre agenda peut répéter celui-ci.
        if (group.none { it.calendarId != calendar.id && sameLocation(it.location, event.location) }) {
            group += event
            survivors += event.key
        }
    }
    return items.filter { it.first.key in survivors }
}

private fun sameLocation(a: String?, b: String?): Boolean {
    val left = a?.trim().orEmpty()
    val right = b?.trim().orEmpty()
    return left.isEmpty() || right.isEmpty() || left.equals(right, ignoreCase = true)
}
