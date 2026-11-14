package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import ch.nicolab.cadence.designsystem.theme.Glass
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.planning.OverdueReplan
import ch.nicolab.cadence.tasks.planning.ReplanChoice
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/** État d'une ligne : en cours, faite (avec son « Annuler », null pour un saut) ou en échec. */
private sealed interface RowState {
    data object Busy : RowState
    data class Done(val choice: ReplanChoice, val undo: (suspend () -> Unit)?) : RowState
    data object Failed : RowState
}

/**
 * Feuille « Replanifier les échues » d'Aujourd'hui : chaque échue avec ses choix rapides ([OverdueReplan.choices]),
 * un toucher écrit tout de suite. La liste est celle de l'ouverture : une tâche replanifiée reste en place avec son
 * choix et « Annuler », pour que rien ne saute sous le doigt. Le titre ouvre la fiche.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
internal fun OverdueReplanSheet(
    tasks: List<TaskItem>,
    onChoose: suspend (TaskItem, ReplanChoice) -> (suspend () -> Unit)?,
    onOpen: (TaskItem) -> Unit,
    onDismiss: () -> Unit,
) {
    val palette = cadence
    val rows = remember { tasks.toList() }
    val states = remember { mutableStateMapOf<String, RowState>() }
    val scope = rememberCoroutineScope()

    fun run(uid: String, action: suspend () -> RowState?) {
        val before = states[uid]
        states[uid] = RowState.Busy
        scope.launch {
            val next = try {
                action()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                RowState.Failed
            }
            if (next == null) states.remove(uid) else states[uid] = next
            if (next == RowState.Failed && before is RowState.Done) states[uid] = before
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = palette.background,
        contentColor = palette.onSurface,
        scrimColor = palette.scrim.copy(alpha = Glass.ScrimAlpha),
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = Space.gutter)) {
            Text(stringResource(R.string.overdue_replan_title), style = MaterialTheme.typography.titleLarge)
            Text(
                stringResource(R.string.overdue_replan_hint),
                style = MaterialTheme.typography.bodyMedium,
                color = palette.onSurfaceVariant,
                modifier = Modifier.padding(top = Space.xs, bottom = Space.md),
            )
            LazyColumn(Modifier.weight(1f, fill = false)) {
                items(rows, key = { it.uid }) { task ->
                    ReplanRow(
                        task = task,
                        state = states[task.uid],
                        onOpen = { onOpen(task) },
                        onChoose = { choice -> run(task.uid) { RowState.Done(choice, onChoose(task, choice)) } },
                        onUndo = { undo -> run(task.uid) { undo(); null } },
                    )
                }
            }
            TextButton(onClick = onDismiss, modifier = Modifier.align(Alignment.End).padding(vertical = Space.sm)) {
                Text(stringResource(R.string.overdue_replan_close))
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ReplanRow(
    task: TaskItem,
    state: RowState?,
    onOpen: () -> Unit,
    onChoose: (ReplanChoice) -> Unit,
    onUndo: (suspend () -> Unit) -> Unit,
) {
    val palette = cadence
    Column(Modifier.fillMaxWidth().padding(vertical = Space.sm)) {
        Text(
            task.name,
            style = MaterialTheme.typography.bodyLarge,
            color = if (state is RowState.Done) palette.onSurfaceVariant else palette.onSurface,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .fillMaxWidth()
                .clickable(role = Role.Button, onClick = onOpen)
                .padding(bottom = Space.sm),
        )
        when (state) {
            is RowState.Done -> Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "→ " + stringResource(doneLabel(state.choice)),
                    style = MaterialTheme.typography.labelLarge,
                    color = palette.primary,
                    modifier = Modifier.weight(1f),
                )
                state.undo?.let { undo ->
                    TextButton(onClick = { onUndo(undo) }) { Text(stringResource(R.string.tasks_undo)) }
                }
            }
            else -> {
                if (state == RowState.Failed) {
                    Text(
                        stringResource(R.string.overdue_replan_failed),
                        style = MaterialTheme.typography.bodySmall,
                        color = palette.error,
                        modifier = Modifier.padding(bottom = Space.xs),
                    )
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                    OverdueReplan.choices(task).forEach { choice ->
                        QuickPill(
                            stringResource(choiceLabel(choice)),
                            onClick = { if (state != RowState.Busy) onChoose(choice) },
                            quiet = choice != ReplanChoice.TODAY && choice != ReplanChoice.TOMORROW,
                        )
                    }
                }
            }
        }
    }
}

private fun choiceLabel(choice: ReplanChoice): Int = when (choice) {
    ReplanChoice.TODAY -> R.string.overdue_replan_today
    ReplanChoice.TOMORROW -> R.string.overdue_replan_tomorrow
    ReplanChoice.NEXT_WEEK -> R.string.overdue_replan_next_week
    ReplanChoice.LATER -> R.string.overdue_replan_later
    ReplanChoice.DROP -> R.string.overdue_replan_drop
    ReplanChoice.SKIP -> R.string.overdue_replan_skip
}

private fun doneLabel(choice: ReplanChoice): Int = when (choice) {
    ReplanChoice.TODAY -> R.string.overdue_replan_done_today
    ReplanChoice.TOMORROW -> R.string.overdue_replan_done_tomorrow
    ReplanChoice.NEXT_WEEK -> R.string.overdue_replan_done_next_week
    ReplanChoice.LATER -> R.string.overdue_replan_done_later
    ReplanChoice.DROP -> R.string.overdue_replan_done_drop
    ReplanChoice.SKIP -> R.string.overdue_replan_done_skip
}
