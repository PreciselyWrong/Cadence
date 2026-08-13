package ch.nicolab.cadence.domain

import java.time.Instant

/**
 * Chronomètre d'une habitude de durée.
 *
 * Le temps écoulé n'est jamais stocké : il se déduit des segments déjà terminés et de
 * l'instant où le segment courant a démarré. Une pause fige donc naturellement le compteur,
 * et un redémarrage du processus retrouve la même valeur sans avoir rien à rattraper.
 *
 * Le compte est fondé sur des instants, pas sur des dates civiles : minuit et un changement
 * de fuseau restent sans effet sur la durée mesurée.
 */
data class HabitTimer(
    val habitId: String,
    /** Secondes des segments déjà terminés. */
    val accumulatedSeconds: Long,
    /** Instant de reprise du segment courant, nul lorsque le chronomètre est arrêté. */
    val runningSince: Instant?,
) {
    init {
        require(habitId.isNotBlank()) { "Timer habit id cannot be blank" }
        require(accumulatedSeconds >= 0) { "Accumulated time cannot be negative" }
    }

    val isRunning: Boolean get() = runningSince != null

    /** Une horloge qui recule ne retire jamais du temps déjà compté. */
    fun elapsedSecondsAt(now: Instant): Long {
        val since = runningSince ?: return accumulatedSeconds
        val current = (now.epochSecond - since.epochSecond).coerceAtLeast(0)
        return accumulatedSeconds + current
    }

    /** Un second appui sur `Pause` ne change rien. */
    fun pausedAt(now: Instant): HabitTimer =
        if (!isRunning) this else HabitTimer(habitId, elapsedSecondsAt(now), null)

    /** Un second appui sur `Reprendre` ne change rien. */
    fun resumedAt(now: Instant): HabitTimer =
        if (isRunning) this else copy(runningSince = now)

    fun reset(): HabitTimer = HabitTimer(habitId, 0, null)

    companion object {
        fun started(habitId: String, now: Instant) = HabitTimer(habitId, 0, now)

        /**
         * Palier atteint en tenant compte du temps déjà enregistré dans la période et de
         * celui qu'affiche le chronomètre. Le temps continue après le minimum : c'est
         * l'affichage qui change, pas le décompte.
         */
        fun attainmentOf(goal: HabitGoal, progressMinor: Long, elapsedSeconds: Long): GoalAttainment {
            val total = progressMinor + elapsedSeconds
            return when {
                total >= goal.targetMinor -> GoalAttainment.IDEAL
                total >= goal.effectiveMinimumMinor -> GoalAttainment.MINIMUM
                else -> GoalAttainment.TODO
            }
        }
    }
}
