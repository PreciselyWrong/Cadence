package ch.nicolab.cadence.domain

import java.time.LocalDate

/** Série d'une habitude : périodes planifiées réussies d'affilée, et meilleur passé. */
data class HabitStreak(
    val current: Int,
    val best: Int,
)

/**
 * Ce qu'une période apporte à la série.
 *
 * La distinction tient à la promesse du produit : une absence autorisée ne doit ni casser
 * la série ni la nourrir. Elle est donc traversée, pas comptée.
 */
private enum class PeriodOutcome {
    VALIDATED,
    FAILED,
    NEUTRAL,
}

/**
 * Compte les périodes planifiées réussies, jamais les jours calendaires consécutifs.
 *
 * Chaque période est relue avec la version de l'habitude en vigueur à ce moment-là, via
 * [habitAt] : un changement d'objectif ne réinterprète pas le passé. Une période entièrement
 * mise de côté — pause, voyage, saut motivé — ou sans aucun jour planifié est neutre : la
 * série la franchit sans y gagner de réussite artificielle.
 *
 * La période en cours ne casse jamais la série : elle n'est pas terminée. Elle ne compte
 * que lorsqu'elle est déjà validée.
 */
object StreakCalculator {

    /** Profondeur maximale explorée, pour qu'un historique long reste borné. */
    private const val MAX_PERIODS = 400

    fun compute(
        habitAt: (LocalDate) -> HabitDefinition?,
        today: LocalDate,
        entries: List<HabitEntry>,
        pauses: List<HabitPause>,
        maxPeriods: Int = MAX_PERIODS,
    ): HabitStreak {
        val evaluator = HabitEvaluator()
        var current = 0
        var best = 0
        var running = 0
        var broken = false
        var cursor = today

        repeat(maxPeriods) {
            val habit = habitAt(cursor) ?: return@repeat
            val window = PeriodCalculator.window(cursor, habit.goal.period, habit.schedule.firstDayOfWeek)
            val outcome = outcomeOf(evaluator, habit, cursor, window, entries, pauses, today)

            when (outcome) {
                PeriodOutcome.VALIDATED -> {
                    running++
                    best = maxOf(best, running)
                    if (!broken) current = running
                }
                PeriodOutcome.FAILED -> {
                    running = 0
                    broken = true
                }
                // Neutre : la série se poursuit de part et d'autre sans rien gagner.
                PeriodOutcome.NEUTRAL -> Unit
            }

            cursor = window.start.minusDays(1)
            if (cursor < habit.startsOn) return HabitStreak(current, best)
        }

        return HabitStreak(current, best)
    }

    private fun outcomeOf(
        evaluator: HabitEvaluator,
        habit: HabitDefinition,
        cursor: LocalDate,
        window: PeriodWindow,
        entries: List<HabitEntry>,
        pauses: List<HabitPause>,
        today: LocalDate,
    ): PeriodOutcome {
        val days = generateSequence(window.start) { it.plusDays(1) }
            .takeWhile { it < window.endExclusive }
            .toList()
        val plannedDays = days.filter { isPlannedOn(habit, it) && it <= today }
        if (plannedDays.isEmpty()) return PeriodOutcome.NEUTRAL
        if (plannedDays.all { day -> pauses.any { it.includes(day) } }) return PeriodOutcome.NEUTRAL

        val validated = evaluator.evaluate(habit, cursor, entries, pauses).validatesPeriod
        val running = window.includes(today)
        return when {
            // Sous un plafond, rien n'est acquis tant que la période peut encore le franchir.
            running && habit.goal.isLimit -> PeriodOutcome.NEUTRAL
            validated -> PeriodOutcome.VALIDATED
            // La période courante n'est pas finie : elle ne peut pas encore échouer.
            running -> PeriodOutcome.NEUTRAL
            else -> PeriodOutcome.FAILED
        }
    }
}
