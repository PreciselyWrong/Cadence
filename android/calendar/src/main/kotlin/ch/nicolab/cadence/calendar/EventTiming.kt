package ch.nicolab.cadence.calendar

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset

/** Début dans le fuseau [zone] : une journée entière (ancrée à minuit UTC par le fournisseur) est réancrée à minuit local du même jour civil. */
fun CalendarEvent.localStart(zone: ZoneId): Long =
    if (allDay) utcDayToLocalMidnight(instanceBegin, zone) else instanceBegin

/** Fin exclusive, même règle que [localStart]. */
fun CalendarEvent.localEnd(zone: ZoneId): Long =
    if (allDay) utcDayToLocalMidnight(instanceEnd, zone) else instanceEnd

/** Vrai si l'occurrence touche [range] (fin exclusive des deux côtés). Une occurrence de durée nulle compte si son début est dans [range[. */
fun CalendarEvent.overlaps(range: TimeRange, zone: ZoneId): Boolean {
    val start = localStart(zone)
    val end = localEnd(zone)
    val touches = start < range.endMillis && end > range.startMillis
    val zeroLengthInside = start == end && start in range.startMillis until range.endMillis
    return touches || zeroLengthInside
}

/** Jours civils [start, start + days[ dans [zone]. */
fun TimeRange.Companion.ofDays(start: LocalDate, days: Int, zone: ZoneId): TimeRange {
    require(days >= 0) { "days < 0" }
    return TimeRange(
        startMillis = start.atStartOfDay(zone).toInstant().toEpochMilli(),
        endMillis = start.plusDays(days.toLong()).atStartOfDay(zone).toInstant().toEpochMilli(),
    )
}

private fun utcDayToLocalMidnight(epochMillis: Long, zone: ZoneId): Long {
    val day = Instant.ofEpochMilli(epochMillis).atZone(ZoneOffset.UTC).toLocalDate()
    return day.atStartOfDay(zone).toInstant().toEpochMilli()
}
