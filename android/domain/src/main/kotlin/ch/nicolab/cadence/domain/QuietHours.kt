package ch.nicolab.cadence.domain

import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId

/**
 * Plage silencieuse du compte (`quiet_hours` du serveur : début inclus, fin exclue, heure du fuseau du
 * compte). Elle peut traverser minuit (22:00 à 07:00). Une alarme locale qui y tombe est repoussée à la fin.
 */
data class QuietHours(val enabled: Boolean, val start: LocalTime, val end: LocalTime) {
    /** Fin de la plage si [at] y tombe, sinon null (plage désactivée, vide ou instant hors plage). */
    fun endAfter(at: Instant, zone: ZoneId): Instant? {
        if (!enabled || start == end) return null
        val local = at.atZone(zone)
        val minutes = local.hour * 60 + local.minute
        val from = start.hour * 60 + start.minute
        val to = end.hour * 60 + end.minute
        val overnight = from > to
        val inside = if (overnight) minutes >= from || minutes < to else minutes in from until to
        if (!inside) return null
        val endsTomorrow = overnight && minutes >= from
        val day = if (endsTomorrow) local.toLocalDate().plusDays(1) else local.toLocalDate()
        return day.atTime(end).atZone(zone).toInstant()
    }

    fun shift(at: Instant, zone: ZoneId): Instant = endAfter(at, zone) ?: at

    companion object {
        /** Lit la forme serveur ; null si une heure manque ou n'est pas `HH:mm`. */
        fun parse(enabled: Boolean, start: String?, end: String?): QuietHours? {
            val from = time(start) ?: return null
            val to = time(end) ?: return null
            return QuietHours(enabled, from, to)
        }

        private val pattern = Regex("^([01]\\d|2[0-3]):([0-5]\\d)$")

        private fun time(raw: String?): LocalTime? {
            val match = pattern.matchEntire(raw ?: return null) ?: return null
            return LocalTime.of(match.groupValues[1].toInt(), match.groupValues[2].toInt())
        }
    }
}

/** Plage silencieuse et fuseau dans lequel elle se lit ; sans plage, rien n'est repoussé. */
data class QuietPolicy(val hours: QuietHours?, val zone: ZoneId) {
    fun shift(at: Instant): Instant = hours?.shift(at, zone) ?: at

    companion object {
        val NONE = QuietPolicy(null, ZoneId.systemDefault())
    }
}

/** Choix de « Plus tard » sur une notification de rappel. Le report reste local à l'appareil. */
enum class SnoozeDelay(val minutes: Long) {
    TEN_MINUTES(10),
    ONE_HOUR(60);

    /** Un report ne sonne jamais pendant la plage silencieuse : il attend sa fin. */
    fun triggerAt(now: Instant, quiet: QuietPolicy): Instant = quiet.shift(now.plusSeconds(minutes * 60))
}
