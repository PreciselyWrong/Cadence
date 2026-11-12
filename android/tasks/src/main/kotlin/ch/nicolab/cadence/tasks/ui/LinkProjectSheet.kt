package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.RowGroup
import ch.nicolab.cadence.designsystem.components.SettingRow
import ch.nicolab.cadence.designsystem.components.rowGroupShape
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.ProjectItem

/**
 * Feuille « Projet… » d'une adresse qu'on enregistre dans les liens : « Aucun projet » en tête, puis les projets
 * ouverts. Choisir une ligne range le lien tout de suite ([onPick]).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun LinkProjectSheet(projects: List<ProjectItem>, onPick: (String?) -> Unit, onDismiss: () -> Unit) {
    CadenceSheet(title = stringResource(R.string.links_project_pick_title), subtitle = null, dismiss = onDismiss) {
        val count = projects.size + 1
        Column(Modifier.verticalScroll(rememberScrollState())) {
            RowGroup {
                SettingRow(
                    title = stringResource(R.string.tasks_no_project),
                    icon = Icons.Outlined.Block,
                    shape = rowGroupShape(0, count),
                    onClick = { onPick(null) },
                )
                projects.forEachIndexed { index, project ->
                    SettingRow(
                        title = project.name,
                        icon = Icons.Outlined.Folder,
                        shape = rowGroupShape(index + 1, count),
                        onClick = { onPick(project.uid) },
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}
