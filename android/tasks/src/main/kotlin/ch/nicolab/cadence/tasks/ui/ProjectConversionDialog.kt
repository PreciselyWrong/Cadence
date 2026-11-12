package ch.nicolab.cadence.tasks.ui

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.tasks.R

/** Confirmation avant de transformer une tâche en projet : le geste ne se rattrape pas sur le serveur. */
@Composable
internal fun ConvertToProjectDialog(name: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.tasks_to_project_title, name)) },
        text = { Text(stringResource(R.string.tasks_to_project_message)) },
        confirmButton = {
            TextButton(onClick = onConfirm) { Text(stringResource(R.string.tasks_to_project_confirm)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.tasks_cancel)) }
        },
    )
}
