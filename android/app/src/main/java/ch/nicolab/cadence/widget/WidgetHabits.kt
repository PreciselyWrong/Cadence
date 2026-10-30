package ch.nicolab.cadence.widget

import ch.nicolab.cadence.data.local.CadenceRepository
import ch.nicolab.cadence.domain.AbstinenceProfile
import ch.nicolab.cadence.domain.HabitEntry
import ch.nicolab.cadence.domain.HabitEvaluation
import ch.nicolab.cadence.domain.HabitEvaluator
import ch.nicolab.cadence.domain.HabitTimer
import ch.nicolab.cadence.domain.AlcoholStatsCalculator
import ch.nicolab.cadence.domain.PeriodCalculator
import ch.nicolab.cadence.data.local.model.PersistedHabit
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

internal data class WidgetHabit(
    val habit: PersistedHabit,
    val evaluation: HabitEvaluation,
    /** Secondes déjà mesurées lorsqu'un chronomètre est actif, nulles sinon. */
    val timerSeconds: Long? = null,
    val abstinenceElapsed: ch.nicolab.cadence.domain.AbstinenceElapsed? = null,
    val alcoholSoberDays: Long? = null,
)

/**
 * Habitudes du jour affichées par les widgets : partagé entre le widget habitudes et
 * « Aujourd'hui », pour que les deux montrent la même progression.
 */
internal suspend fun pendingWidgetHabits(
    repository: CadenceRepository,
    today: LocalDate,
    now: Instant,
    zone: ZoneId,
): List<WidgetHabit> {
    val evaluator = HabitEvaluator()
    val timers = repository.getTimers()
    return repository.getHabitsEffectiveAt(today).mapNotNull { habit ->
        val window = PeriodCalculator.window(today, habit.goal.period, habit.schedule.firstDayOfWeek)
        val pauses = repository.getPauses(habit.id)
        val alcoholConsumptions = if (habit.abstinenceProfile == AbstinenceProfile.ALCOHOL) {
            repository.getAlcoholConsumptions(habit.id)
        } else emptyList()
        val trackingEntries = if (habit.abstinenceProfile == AbstinenceProfile.ALCOHOL) {
            alcoholConsumptions.map { consumption ->
                HabitEntry(
                    id = consumption.id,
                    habitId = consumption.habitId,
                    occurredAt = consumption.localDate.atStartOfDay(consumption.observedZoneId).toInstant(),
                    localDate = consumption.localDate,
                    observedZoneId = consumption.observedZoneId,
                    valueMinor = 1,
                )
            }
        } else repository.getEntries(habit.id)
        val entries = trackingEntries.filter { it.localDate >= window.start && it.localDate < window.endExclusive }
        val evaluation = evaluator.evaluate(habit.definition, today, entries, pauses)
        evaluation.takeIf { habit.goal.isAbstinence ||
            (habit.goal.isTracker && it.isPlannedForDate && !it.isPaused) || it.needsAttentionNow }?.let {
            // Un chronomètre actif s'affiche à la place de la progression : un toucher
            // sur l'habitude ouvre la saisie rapide, qui permet de le reprendre.
            val running = timers[habit.id]?.takeIf(HabitTimer::isRunning)?.elapsedSecondsAt(now)
            val elapsed = habit.abstinenceStartedAt
                ?.takeIf { habit.goal.isAbstinence && habit.abstinenceProfile != AbstinenceProfile.ALCOHOL }
                ?.let { start ->
                ch.nicolab.cadence.domain.AbstinenceElapsedCalculator.calculate(
                    habit.id, start, trackingEntries, now,
                )
            }
            val soberDays = habit.abstinenceStartedOn(zone)
                ?.takeIf { habit.abstinenceProfile == AbstinenceProfile.ALCOHOL }
                ?.let { start -> AlcoholStatsCalculator.compute(habit.id, start, today, alcoholConsumptions, pauses).currentSoberDays }
            WidgetHabit(habit, evaluation, running, elapsed, soberDays)
        }
    }
}
