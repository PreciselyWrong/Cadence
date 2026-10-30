package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.RecurringScope

/** Choix de la portée d'un déplacement de tâche récurrente ; null = annulé. */
@Composable
internal fun RecurringMoveDialog(onAnswer: (RecurringScope?) -> Unit) {
    AlertDialog(
        onDismissRequest = { onAnswer(null) },
        title = { Text(stringResource(R.string.tasks_move_recurring_title)) },
        text = {
            Column {
                TextButton(onClick = { onAnswer(RecurringScope.THIS) }) {
                    Text(stringResource(R.string.tasks_move_this))
                }
                TextButton(onClick = { onAnswer(RecurringScope.FOLLOWING) }) {
                    Text(stringResource(R.string.tasks_move_following))
                }
                TextButton(onClick = { onAnswer(RecurringScope.ALL) }) {
                    Text(stringResource(R.string.tasks_move_all))
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = { onAnswer(null) }) { Text(stringResource(R.string.tasks_cancel)) }
        },
    )
}
