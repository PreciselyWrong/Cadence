package ch.nicolab.cadence.domain

import java.time.LocalDate

/** Où en est une habitude dans la semaine en cours. */
enum class WeekStage {
    TODO,
    WELL_UNDERWAY,
    MINIMUM,
    DONE,
}

/** Une habitude de la semaine, avec son évaluation du jour pour ouvrir la bonne saisie. */
data class WeekEntry(
    val habit: HabitDefinition,
    val evaluation: HabitEvaluation,
    val stage: WeekStage,
)

/**
 * Vue « Cette semaine » : uniquement les habitudes sur lesquelles il reste quelque chose
 * à faire ou à constater.
 *
 * Une habitude dont plus aucun jour n'est planifié d'ici la fin de la semaine disparaît -
 * la lister ne servirait qu'à culpabiliser sans action possible. Une habitude en pause
 * disparaît de même.
 */
data class WeekOutlook(
    val byStage: Map<WeekStage, List<WeekEntry>>,
) {
    companion object {

        /** Seuil au-delà duquel une habitude est visiblement lancée. */
        private const val WELL_UNDERWAY_RATIO = 0.5

        fun of(
            habits: List<HabitDefinition>,
            today: LocalDate,
            entries: List<HabitEntry>,
            pausesOf: (String) -> List<HabitPause>,
        ): WeekOutlook {
            val evaluator = HabitEvaluator()
            val week = PeriodCalculator.window(today, PeriodType.WEEK, DayOfWeekStart)
            val visible = habits.mapNotNull { habit ->
                val pauses = pausesOf(habit.id)
                if (pauses.any { it.includes(today) }) return@mapNotNull null
                if (!remainsPlannedThisWeek(habit, today, week)) return@mapNotNull null
                val evaluation = evaluator.evaluate(habit, today, entries, pauses)
                WeekEntry(habit, evaluation, stageOf(habit, evaluation))
            }
            return WeekOutlook(
                WeekStage.entries.associateWith { stage -> visible.filter { it.stage == stage } },
            )
        }

        private val DayOfWeekStart = java.time.DayOfWeek.MONDAY

        /** Vrai s'il reste au moins un jour planifié entre aujourd'hui et la fin de la semaine. */
        private fun remainsPlannedThisWeek(
            habit: HabitDefinition,
            today: LocalDate,
            week: PeriodWindow,
        ): Boolean = generateSequence(today) { it.plusDays(1) }
            .takeWhile { it < week.endExclusive }
            .any { isPlannedOn(habit, it) }

        private fun stageOf(habit: HabitDefinition, evaluation: HabitEvaluation): WeekStage {
            if (habit.goal.isAbstinence) {
                return if (evaluation.validatesPeriod) WeekStage.WELL_UNDERWAY else WeekStage.TODO
            }
            // Sous un plafond il n'y a rien à poursuivre : soit on tient, soit on a dépassé.
            if (habit.goal.isLimit) {
                return if (evaluation.validatesPeriod) WeekStage.DONE else WeekStage.TODO
            }
            return when {
                evaluation.isCompleted -> WeekStage.DONE
                evaluation.validatesPeriod -> WeekStage.MINIMUM
                evaluation.progressMinor > evaluation.targetMinor * WELL_UNDERWAY_RATIO -> WeekStage.WELL_UNDERWAY
                else -> WeekStage.TODO
            }
        }
    }
}
