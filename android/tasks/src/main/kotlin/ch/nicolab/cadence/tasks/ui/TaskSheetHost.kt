package ch.nicolab.cadence.tasks.ui

import androidx.compose.runtime.Composable
import androidx.lifecycle.viewmodel.compose.viewModel
import ch.nicolab.cadence.designsystem.components.rememberAppSnackbarHostState

/**
 * Fiche d'une tâche ouverte depuis un écran hors de ce module (Agenda) : la même fiche que dans Tâches,
 * avec ses bandeaux et la question « cette tâche ou la série ? ». Posé en permanence par l'écran hôte,
 * pour qu'un bandeau parti de la fiche survive à sa fermeture ; [openTaskUid] null n'affiche rien.
 */
@Composable
fun TaskSheetHost(openTaskUid: String?, onDismiss: () -> Unit) {
    val viewModel: TasksViewModel = viewModel()
    TaskOverlays(
        viewModel = viewModel,
        snackbar = rememberAppSnackbarHostState(),
        selectedTaskUid = openTaskUid,
        onCloseTask = onDismiss,
    )
}
