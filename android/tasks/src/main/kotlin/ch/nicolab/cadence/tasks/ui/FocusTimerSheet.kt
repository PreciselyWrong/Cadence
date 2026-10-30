@file:OptIn(ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.theme.MetricStyle
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.focus.FocusTimerStore
import ch.nicolab.cadence.tasks.focus.PomodoroPhase
import kotlinx.coroutines.delay

private const val TICK_MS = 250L

/** Minuteur de concentration lancé depuis une tâche. Local : rien n'est envoyé au serveur. */
@Composable
internal fun FocusTimerSheet(taskUid: String, taskName: String, onDismiss: () -> Unit) {
    val store = FocusTimerStore.get(LocalContext.current)
    val state by store.state.collectAsStateWithLifecycle()
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val ownsTimer = state.taskUid == taskUid
    val shown = if (ownsTimer || state.taskUid == null) state else state.reset().copy(taskUid = taskUid)

    // La fin d'une phase l'enchaîne en pause : le minuteur ne repart jamais seul.
    LaunchedEffect(state) {
        while (true) {
            now = System.currentTimeMillis()
            if (ownsTimer && state.isFinished(now)) {
                store.advance()
                return@LaunchedEffect
            }
            delay(TICK_MS)
        }
    }

    val remaining = shown.remainingMs(now)
    val seconds = (remaining + 999) / 1000
    val clock = "%02d:%02d".format(seconds / 60, seconds % 60)
    val phaseLabel = stringResource(
        when (shown.phase) {
            PomodoroPhase.FOCUS -> R.string.tasks_focus_phase_focus
            PomodoroPhase.SHORT_BREAK -> R.string.tasks_focus_phase_short
            PomodoroPhase.LONG_BREAK -> R.string.tasks_focus_phase_long
        },
    )
    val running = ownsTimer && shown.isRunning
    val started = ownsTimer && (shown.isRunning || shown.remainingAtResumeMs < shown.phase.durationMs)

    CadenceSheet(title = stringResource(R.string.tasks_focus_title), subtitle = taskName, dismiss = onDismiss) {
        Text(phaseLabel, style = MaterialTheme.typography.titleMedium, color = cadence.primary)
        Text(
            clock,
            style = MetricStyle,
            color = cadence.onSurface,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(vertical = Space.lg),
        )
        Text(
            pluralStringResource(R.plurals.tasks_focus_sessions, shown.completedFocus, shown.completedFocus),
            style = MaterialTheme.typography.bodyMedium,
            color = cadence.onSurfaceVariant,
        )
        Column(
            Modifier.fillMaxWidth().padding(top = Space.xl),
            verticalArrangement = Arrangement.spacedBy(Space.md),
        ) {
            PrimaryAction(
                label = stringResource(
                    when {
                        running -> R.string.tasks_focus_pause
                        started -> R.string.tasks_focus_resume
                        else -> R.string.tasks_focus_start
                    },
                ),
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (running) store.pause() else store.start(taskUid)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(Space.md), verticalAlignment = Alignment.CenterVertically) {
                SecondaryAction(stringResource(R.string.tasks_focus_next), Modifier.weight(1f), enabled = ownsTimer) { store.advance() }
                SecondaryAction(stringResource(R.string.tasks_focus_reset), Modifier.weight(1f), enabled = ownsTimer) { store.reset() }
            }
            if (!ownsTimer && state.taskUid != null) {
                Text(
                    stringResource(R.string.tasks_focus_other_task),
                    style = MaterialTheme.typography.bodyMedium,
                    color = cadence.onSurfaceVariant,
                )
            }
            Text(
                stringResource(R.string.tasks_focus_local),
                style = MaterialTheme.typography.labelMedium,
                color = cadence.outline,
                modifier = Modifier.padding(bottom = Space.xl),
            )
        }
    }
}
