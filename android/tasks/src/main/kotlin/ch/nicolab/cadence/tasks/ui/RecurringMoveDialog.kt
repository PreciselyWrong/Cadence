@file:OptIn(ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui

import androidx.annotation.StringRes
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.RowGroup
import ch.nicolab.cadence.designsystem.components.SettingRow
import ch.nicolab.cadence.designsystem.components.rowGroupShape
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.RecurringScope

private class ScopeChoice(val scope: RecurringScope, @StringRes val title: Int, @StringRes val description: Int)

/** Feuille de choix de la portée d'un changement sur une tâche récurrente ; null = annulé. */
@Composable
private fun RecurringScopeSheet(
    @StringRes title: Int,
    choices: List<ScopeChoice>,
    onAnswer: (RecurringScope?) -> Unit,
) {
    CadenceSheet(title = stringResource(title), subtitle = null, dismiss = { onAnswer(null) }) {
        RowGroup {
            choices.forEachIndexed { index, choice ->
                SettingRow(
                    title = stringResource(choice.title),
                    subtitle = stringResource(choice.description),
                    shape = rowGroupShape(index, choices.size),
                    onClick = { onAnswer(choice.scope) },
                )
            }
        }
    }
}

/** Choix de la portée d'un déplacement de tâche récurrente ; null = annulé. */
@Composable
internal fun RecurringMoveDialog(onAnswer: (RecurringScope?) -> Unit) = RecurringScopeSheet(
    title = R.string.tasks_move_recurring_title,
    choices = listOf(
        ScopeChoice(RecurringScope.THIS, R.string.tasks_move_this, R.string.tasks_move_this_hint),
        ScopeChoice(RecurringScope.FOLLOWING, R.string.tasks_move_following, R.string.tasks_move_following_hint),
        ScopeChoice(RecurringScope.ALL, R.string.tasks_move_all, R.string.tasks_move_all_hint),
    ),
    onAnswer = onAnswer,
)

/** Choix de la portée d'une suppression de tâche récurrente ; null = annulé. */
@Composable
internal fun RecurringDeleteDialog(onAnswer: (RecurringScope?) -> Unit) = RecurringScopeSheet(
    title = R.string.swipe_delete_recurring_title,
    choices = listOf(
        ScopeChoice(RecurringScope.THIS, R.string.swipe_delete_this, R.string.swipe_delete_this_hint),
        ScopeChoice(RecurringScope.ALL, R.string.swipe_delete_all, R.string.swipe_delete_all_hint),
    ),
    onAnswer = onAnswer,
)
