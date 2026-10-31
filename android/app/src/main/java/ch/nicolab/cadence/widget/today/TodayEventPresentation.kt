package ch.nicolab.cadence.widget.today

import ch.nicolab.cadence.calendar.CalendarEvent
import ch.nicolab.cadence.calendar.EventWithDone
import ch.nicolab.cadence.calendar.localEnd
import ch.nicolab.cadence.calendar.localStart
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** Moment d'un événement du jour : fait (l'emporte), à venir, en cours ou passé. */
enum class TodayEventState { UPCOMING, ONGOING, PAST, DONE }

/** Libellés et état d'un événement dans le widget « Aujourd'hui ». Fonctions pures. */
object TodayEventPresentation {
    private val TIME: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

    /** « 14:30–15:30 », « 14:30 » sans durée, [allDayLabel] pour une journée entière. */
    fun timeLabel(event: CalendarEvent, zone: ZoneId, allDayLabel: String): String {
        if (event.allDay) return allDayLabel
        val start = event.localStart(zone)
        val end = event.localEnd(zone)
        val from = format(start, zone)
        return if (end <= start) from else "$from–${format(end, zone)}"
    }

    fun state(event: EventWithDone, now: Instant, zone: ZoneId): TodayEventState {
        if (event.done) return TodayEventState.DONE
        val nowMillis = now.toEpochMilli()
        return when {
            nowMillis < event.event.localStart(zone) -> TodayEventState.UPCOMING
            nowMillis < event.event.localEnd(zone) -> TodayEventState.ONGOING
            else -> TodayEventState.PAST
        }
    }

    private fun format(millis: Long, zone: ZoneId): String = Instant.ofEpochMilli(millis).atZone(zone).format(TIME)
}
