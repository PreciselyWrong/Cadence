package ch.nicolab.cadence.domain

import kotlin.math.roundToLong

/**
 * Trois chiffres lisibles sans économies : le record, l'écart moyen entre deux écarts notés
 * et le nombre d'écarts des 30 derniers jours. Tout provient du calcul d'abstinence, sans
 * nouvelle règle : une pause reste neutre et un écart absent n'est jamais une preuve.
 */
data class AbstinenceLapseSummary(
    val recordDays: Long,
    /** Jours propres entre deux écarts, arrondis ; null tant qu'il n'y a pas deux écarts. */
    val averageGapDays: Long?,
    val lapsesLast30Days: Int,
) {
    companion object {
        fun of(stats: AbstinenceStats): AbstinenceLapseSummary = AbstinenceLapseSummary(
            recordDays = stats.bestDays,
            averageGapDays = stats.averageClearDaysBetweenOccurrences?.roundToLong(),
            lapsesLast30Days = stats.occurrences30,
        )
    }
}
