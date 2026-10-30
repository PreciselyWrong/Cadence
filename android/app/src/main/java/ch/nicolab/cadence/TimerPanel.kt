package ch.nicolab.cadence

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.domain.GoalAttainment
import ch.nicolab.cadence.domain.HabitGoal
import ch.nicolab.cadence.domain.HabitTimer
import ch.nicolab.cadence.ui.HabitFormatter
import ch.nicolab.cadence.ui.components.PrimaryAction
import ch.nicolab.cadence.ui.components.SecondaryAction
import ch.nicolab.cadence.ui.components.TertiaryAction
import ch.nicolab.cadence.ui.theme.Space
import ch.nicolab.cadence.ui.theme.cadence
import java.time.Clock
import kotlinx.coroutines.delay

/**
 * Secondes écoulées, rafraîchies chaque seconde tant que le chronomètre tourne. Un
 * chronomètre en pause n'entretient aucune boucle : sa valeur est déjà figée.
 */
@Composable
private fun elapsedSeconds(timer: HabitTimer?, clock: Clock): State<Long> =
    produceState(timer?.elapsedSecondsAt(clock.instant()) ?: 0L, timer) {
        value = timer?.elapsedSecondsAt(clock.instant()) ?: 0L
        if (timer?.isRunning != true) return@produceState
        while (true) {
            delay(1_000)
            value = timer.elapsedSecondsAt(clock.instant())
        }
    }

/**
 * Commandes du chronomètre d'une habitude de durée.
 *
 * Le temps continue après le minimum : seul le palier annoncé change, jusqu'à l'idéal.
 * Une pause ne compte aucun temps, et `Terminer` enregistre une seule saisie.
 */
@Composable
internal fun TimerPanel(
    timer: HabitTimer?,
    goal: HabitGoal,
    progressMinor: Long,
    accent: Color,
    clock: Clock = Clock.systemDefaultZone(),
    start: () -> Unit,
    pause: () -> Unit,
    finish: () -> Unit,
    reset: () -> Unit,
) {
    val palette = cadence
    val seconds by elapsedSeconds(timer, clock)
    val running = timer?.isRunning == true
    val attainment = HabitTimer.attainmentOf(goal, progressMinor, seconds)

    // Un chronomètre en cours garde l'écran allumé : la veille couperait le retour visuel.
    val view = LocalView.current
    DisposableEffect(view, running) {
        view.keepScreenOn = running
        onDispose { view.keepScreenOn = false }
    }

    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.Start) {
        Text(
            HabitFormatter.formatValue(seconds, goal.goalType, goal.unit),
            style = MaterialTheme.typography.headlineSmall,
            color = palette.ink,
        )
        if (!goal.isTracker) Text(
            stringResource(
                when (attainment) {
                    GoalAttainment.TODO -> R.string.status_todo
                    GoalAttainment.MINIMUM -> R.string.status_minimum_reached
                    GoalAttainment.IDEAL -> R.string.status_ideal_reached
                },
            ),
            style = MaterialTheme.typography.labelMedium,
            color = if (attainment == GoalAttainment.TODO) palette.inkFaint else palette.success,
        )
        Spacer(Modifier.height(Space.md))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.md)) {
            if (running) {
                SecondaryAction(stringResource(R.string.timer_pause), Modifier.weight(1f), onClick = pause)
            } else {
                PrimaryAction(
                    stringResource(if (seconds > 0) R.string.timer_resume else R.string.timer_start),
                    Modifier.weight(1f),
                    accent = accent,
                    onClick = start,
                )
            }
            PrimaryAction(
                stringResource(R.string.timer_finish),
                Modifier.weight(1f),
                accent = accent,
                enabled = seconds > 0,
                onClick = finish,
            )
        }
        if (seconds > 0) {
            Spacer(Modifier.height(Space.xs))
            TertiaryAction(stringResource(R.string.timer_reset), Modifier.fillMaxWidth(), onClick = reset)
        }
    }
}
