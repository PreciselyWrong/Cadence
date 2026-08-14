package ch.nicolab.cadence.domain

import java.time.LocalDate
import java.time.temporal.ChronoUnit

/** Rythme auquel une cible augmente. */
enum class ProgressionCadence {
    WEEKLY,
    MONTHLY,
}

/** Une marche de la progression : à partir de quelle date, quelle cible. */
data class ProgressionStep(
    val from: LocalDate,
    val targetMinor: Long,
)

/**
 * Augmentation automatique d'une cible.
 *
 * La cible d'une date se calcule toujours depuis le point de départ — nombre de paliers
 * franchis multiplié par le pas — jamais en cumulant la valeur courante. Relire une date
 * deux fois donne donc deux fois le même chiffre, quel que soit le moment de la lecture.
 *
 * La cadence mensuelle suit les mois civils : un départ le 31 janvier avance au mois
 * suivant, sans dépendre d'un bloc de trente jours.
 */
data class GoalProgression(
    val step: Long,
    val cadence: ProgressionCadence,
    /** Plafond facultatif; la cible ne le dépasse jamais. */
    val capMinor: Long?,
    val startsOn: LocalDate,
) {
    init {
        require(step > 0) { "Progression step must be positive" }
        capMinor?.let { require(it > 0) { "Progression cap must be positive" } }
    }

    /**
     * Nombre de paliers franchis entre le départ et [date].
     *
     * En cadence hebdomadaire, un palier est une semaine pleine écoulée depuis le départ.
     * En cadence mensuelle, c'est un changement de mois civil : un départ le 31 janvier
     * avance le 1er février, sans jamais buter sur un mois qui n'a pas de 31.
     */
    private fun stepsUntil(date: LocalDate): Long = when {
        date < startsOn -> 0
        cadence == ProgressionCadence.WEEKLY -> ChronoUnit.WEEKS.between(startsOn, date)
        else -> (date.year - startsOn.year) * 12L + (date.monthValue - startsOn.monthValue)
    }.coerceAtLeast(0)

    fun targetAt(startingTargetMinor: Long, date: LocalDate): Long {
        val raised = startingTargetMinor + step * stepsUntil(date)
        val cap = capMinor ?: return raised
        return minOf(raised, maxOf(cap, startingTargetMinor))
    }

    /** Prochaines cibles, pour montrer où mène la progression avant de s'y engager. */
    fun preview(startingTargetMinor: Long, from: LocalDate, count: Int): List<ProgressionStep> {
        require(count > 0) { "Preview needs at least one step" }
        val anchor = maxOf(from, startsOn)
        return (0 until count).map { index ->
            val date = when (cadence) {
                ProgressionCadence.WEEKLY -> anchor.plusWeeks(index.toLong())
                ProgressionCadence.MONTHLY -> anchor.plusMonths(index.toLong())
            }
            ProgressionStep(date, targetAt(startingTargetMinor, date))
        }
    }
}
