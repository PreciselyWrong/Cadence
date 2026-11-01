package ch.nicolab.cadence.calendar

import java.time.Duration
import java.time.Instant

/** Report d'une notification d'événement : « 10 min », ou « À la fin » (au moment où l'événement se termine). */
enum class EventSnoozeMode { TEN_MINUTES, UNTIL_END }

/** Règles du report d'une notification d'événement, sans Android. */
object EventSnooze {
    val TEN_MINUTES: Duration = Duration.ofMinutes(10)

    /** Sous ce délai avant la fin, « À la fin » n'a plus de sens : la notification ne le propose pas. */
    val MIN_TIME_BEFORE_END: Duration = Duration.ofMinutes(5)

    fun offersUntilEnd(end: Instant, now: Instant, allDay: Boolean): Boolean =
        !allDay && Duration.between(now, end) >= MIN_TIME_BEFORE_END

    /** Heure de la nouvelle notification, décalée hors plage silencieuse par [shift]. */
    fun triggerAt(mode: EventSnoozeMode, now: Instant, end: Instant, shift: (Instant) -> Instant): Instant {
        val wanted = when (mode) {
            EventSnoozeMode.TEN_MINUTES -> now.plus(TEN_MINUTES)
            EventSnoozeMode.UNTIL_END -> end
        }
        return shift(wanted)
    }
}
