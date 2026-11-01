package ch.nicolab.cadence.calendar

import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

/** Identifiant texte d'une occurrence, stable : clé d'alarme, d'extra d'intent et de remise. */
fun EventInstanceKey.token(): String = CalendarCodecs.encodeKey(this)

/** Relit [token] ; null s'il est mal formé. */
fun eventKeyOfToken(token: String): EventInstanceKey? = CalendarCodecs.decodeKey(token)

/** Alarme d'un événement : sonne à [triggerAt], l'événement commençant à [startMillis] (heure locale réelle, epoch). */
data class EventAlarm(
    val key: EventInstanceKey,
    val title: String,
    val location: String?,
    val startMillis: Long,
    val triggerAt: Instant,
)

/** Résumé des journées entières d'un [day], sonné à 8 h (décalé hors plage silencieuse). */
data class DigestAlarm(val day: LocalDate, val triggerAt: Instant, val titles: List<String>) {
    val token: String get() = "digest:$day"
}

data class EventReminderPlan(val events: List<EventAlarm>, val digests: List<DigestAlarm>)

/**
 * Décide, sans Android, quelles alarmes poser pour les événements d'agenda. L'appelant fournit les occurrences
 * déjà filtrées par `selectEvents(..., CalendarSurface.REMINDERS)` : agenda utilisé et non masqué partout,
 * « Notifications » de l'agenda actif, occurrences masquées retirées, doublons entre agendas fusionnés.
 */
object EventReminders {
    /** Au-delà, les alarmes sont posées à l'approche seulement. */
    val HORIZON: Duration = Duration.ofDays(14)

    /** Un résumé non remis (téléphone éteint à 8 h) sonne encore dans cet intervalle. */
    val DIGEST_LATE: Duration = Duration.ofHours(3)

    val DIGEST_TIME: LocalTime = LocalTime.of(8, 0)

    /** Clé de remise des événements : une occurrence ne sonne qu'une fois par appareil. */
    fun deliveryKey(key: EventInstanceKey): String = key.token()

    fun plan(
        events: List<EventWithDone>,
        settings: EventReminderSettings,
        delivered: Set<String>,
        now: Instant,
        zone: ZoneId,
        shift: (Instant) -> Instant = { it },
        lead: Duration = Duration.ofMinutes(settings.leadMinutes),
    ): EventReminderPlan {
        if (!settings.enabled) return EventReminderPlan(emptyList(), emptyList())
        val horizon = now.plus(HORIZON)
        val alarms = events
            .filter { !it.done && !it.event.allDay }
            .mapNotNull { item ->
                val event = item.event
                val start = Instant.ofEpochMilli(event.localStart(zone))
                val ring = shift(start.minus(lead))
                // Une alarme repoussée au-delà du début (plage silencieuse) n'annonce plus rien d'utile.
                val upcoming = ring.isAfter(now) && !ring.isAfter(start) && !start.isAfter(horizon)
                val late = !ring.isAfter(now) && start.isAfter(now) && deliveryKey(event.key) !in delivered
                if (!upcoming && !late) return@mapNotNull null
                EventAlarm(event.key, event.title, event.location, event.localStart(zone), ring)
            }
            .sortedBy { it.triggerAt }
        return EventReminderPlan(alarms, if (settings.allDayDigest) digests(events, delivered, now, zone, shift) else emptyList())
    }

    /** Titres des journées entières notifiables d'un [day], dans l'ordre alphabétique sans casse. */
    fun allDayTitles(events: List<EventWithDone>, day: LocalDate, zone: ZoneId): List<String> =
        events
            .filter { !it.done && it.event.allDay && it.event.coversDay(day, zone) }
            .map { it.event.title.trim() }
            .sortedBy { it.lowercase() }

    private fun digests(
        events: List<EventWithDone>,
        delivered: Set<String>,
        now: Instant,
        zone: ZoneId,
        shift: (Instant) -> Instant,
    ): List<DigestAlarm> {
        val today = now.atZone(zone).toLocalDate()
        val lastDay = now.plus(HORIZON).atZone(zone).toLocalDate()
        val result = mutableListOf<DigestAlarm>()
        var day = today
        while (!day.isAfter(lastDay)) {
            val titles = allDayTitles(events, day, zone)
            if (titles.isNotEmpty()) {
                val ring = shift(day.atTime(DIGEST_TIME).atZone(zone).toInstant())
                val alarm = DigestAlarm(day, ring, titles)
                val upcoming = ring.isAfter(now)
                val late = !upcoming && !ring.isBefore(now.minus(DIGEST_LATE)) && alarm.token !in delivered
                if (upcoming || late) result += alarm
            }
            day = day.plusDays(1)
        }
        return result
    }

    private fun CalendarEvent.coversDay(day: LocalDate, zone: ZoneId): Boolean {
        val start = Instant.ofEpochMilli(localStart(zone)).atZone(zone).toLocalDate()
        val endExclusive = Instant.ofEpochMilli(localEnd(zone)).atZone(zone).toLocalDate()
        return !day.isBefore(start) && (day.isBefore(endExclusive) || day == start)
    }

    /** Retire les remises qui ne peuvent plus servir : l'occurrence a commencé il y a plus d'un jour. */
    fun pruneDelivered(delivered: Set<String>, now: Instant, zone: ZoneId): Set<String> {
        val earliest = now.minus(Duration.ofDays(1))
        return delivered.filterTo(HashSet()) { token ->
            if (token.startsWith("digest:")) {
                val day = runCatching { LocalDate.parse(token.removePrefix("digest:")) }.getOrNull()
                day != null && !day.plusDays(1).atStartOfDay(zone).toInstant().isBefore(earliest)
            } else {
                val begin = eventKeyOfToken(token)?.instanceBegin
                begin != null && !Instant.ofEpochMilli(begin).isBefore(earliest)
            }
        }
    }
}
