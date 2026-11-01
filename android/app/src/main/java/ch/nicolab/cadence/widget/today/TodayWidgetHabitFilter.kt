package ch.nicolab.cadence.widget.today

import ch.nicolab.cadence.domain.GoalDirection
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitEvaluation
import ch.nicolab.cadence.domain.HabitGoal

/**
 * Familles d'habitudes que le widget « Aujourd'hui » peut masquer, déduites de l'objectif :
 * l'abstinence (limite à zéro) et le suivi seul priment, puis la limite (« au plus »), puis le sens
 * « au moins » par type d'objectif (case ou compteur, quantité, durée).
 */
enum class HabitKind { TODO, QUANTITY, LIMIT, ABSTINENCE, TRACKER, TIMER }

fun HabitGoal.widgetKind(): HabitKind = when {
    isAbstinence -> HabitKind.ABSTINENCE
    direction == GoalDirection.TRACK_ONLY -> HabitKind.TRACKER
    direction == GoalDirection.AT_MOST -> HabitKind.LIMIT
    goalType == GoalType.DURATION -> HabitKind.TIMER
    goalType == GoalType.QUANTITY -> HabitKind.QUANTITY
    else -> HabitKind.TODO
}

/** Vrai si l'habitude passe les filtres de nature, de jour prévu et de « déjà faite » de [config]. Fonction pure. */
fun showsHabit(goal: HabitGoal, evaluation: HabitEvaluation, config: TodayWidgetConfig): Boolean =
    goal.widgetKind() !in config.hiddenHabitKinds &&
        (!config.onlyPlannedHabits || evaluation.isPlannedForDate) &&
        (!config.hideDoneHabits || !evaluation.isCompleted)
