package ch.nicolab.cadence.agenda

import ch.nicolab.cadence.calendar.EventInstanceKey
import ch.nicolab.cadence.tasks.calendarfeeds.CalendarFeedsClient
import ch.nicolab.cadence.tasks.calendarfeeds.FeedEvent
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import kotlin.math.abs

private const val MINUTES_PER_DAY = 24 * 60

/**
 * Convertit une occurrence d'agenda abonné (ICS ou Google côté serveur) en [AgendaEntry.Event]
 * en lecture seule, placée dans [zone] sur son jour civil (`event.date`).
 */
internal fun mapFeedEventToAgendaEntry(
    event: FeedEvent,
    zone: ZoneId,
    defaultColorArgb: Int,
): AgendaEntry.Event? {
    val day = runCatching { LocalDate.parse(event.date) }.getOrNull() ?: return null
    val dayStart = day.atStartOfDay()
    val dayEnd = day.plusDays(1).atStartOfDay()

    val startMinute = event.startMinute
    val endMinute = event.endMinute
    val (start, end) = if (event.allDay) {
        dayStart to dayEnd
    } else if (startMinute != null && endMinute != null) {
        minuteOnDay(day, startMinute) to minuteOnDay(day, endMinute)
    } else {
        val parsedStart = parseIsoToLocal(event.start, zone) ?: dayStart
        val parsedEnd = parseIsoToLocal(event.end, zone) ?: parsedStart
        val clippedStart = if (parsedStart.isBefore(dayStart)) dayStart else parsedStart
        val clippedEnd = if (parsedEnd.isAfter(dayEnd)) dayEnd else parsedEnd
        val safeEnd = if (clippedEnd.isBefore(clippedStart)) clippedStart else clippedEnd
        clippedStart to safeEnd
    }

    val calendarId = -1L * (abs(event.feedUid.hashCode().toLong()) + 1L)
    val eventId = abs(event.uid.hashCode().toLong()) + 1L
    val instanceBegin = start.atZone(zone).toInstant().toEpochMilli()

    return AgendaEntry.Event(
        eventKey = EventInstanceKey(calendarId, eventId, instanceBegin),
        calendarName = event.feedName.ifBlank { event.feedUid },
        title = event.title,
        start = start,
        end = end,
        allDay = event.allDay,
        done = false,
        colorArgb = CalendarFeedsClient.parseHexColor(event.color, defaultColorArgb),
        location = event.location,
        description = event.description,
        readOnly = true,
        stableId = "${event.feedUid}:${event.uid}:${event.date}:${event.startMinute ?: -1}",
    )
}

internal fun mapFeedEvents(
    events: List<FeedEvent>,
    zone: ZoneId,
    defaultColorArgb: Int,
): List<AgendaEntry.Event> = events.mapNotNull { mapFeedEventToAgendaEntry(it, zone, defaultColorArgb) }

private fun minuteOnDay(day: LocalDate, minute: Int): LocalDateTime {
    val clamped = minute.coerceIn(0, MINUTES_PER_DAY)
    return if (clamped >= MINUTES_PER_DAY) {
        day.plusDays(1).atStartOfDay()
    } else {
        day.atTime(clamped / 60, clamped % 60)
    }
}

private fun parseIsoToLocal(iso: String, zone: ZoneId): LocalDateTime? {
    if (iso.isBlank()) return null
    return runCatching {
        Instant.parse(iso).atZone(zone).toLocalDateTime()
    }.recoverCatching {
        OffsetDateTime.parse(iso).atZoneSameInstant(zone).toLocalDateTime()
    }.getOrNull()
}
