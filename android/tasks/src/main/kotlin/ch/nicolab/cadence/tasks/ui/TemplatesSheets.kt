@file:OptIn(ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.RowGroup
import ch.nicolab.cadence.designsystem.components.SettingRow
import ch.nicolab.cadence.designsystem.components.rowGroupShape
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.project.ProjectTemplate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/** Choix du bouton « + » sur l'onglet Projets : saisie habituelle ou projet depuis un modèle. */
@Composable
internal fun ProjectAddChooserSheet(
    onAddTaskOrNote: () -> Unit,
    onFromTemplate: () -> Unit,
    onDismiss: () -> Unit,
) {
    val palette = cadence
    CadenceSheet(title = stringResource(R.string.tasks_fab_add), subtitle = null, dismiss = onDismiss) {
        RowGroup(Modifier.padding(bottom = Space.xl)) {
            SettingRow(
                title = stringResource(R.string.templates_add_task_or_note),
                shape = rowGroupShape(0, 2),
                onClick = {
                    onDismiss()
                    onAddTaskOrNote()
                },
            )
            SettingRow(
                title = stringResource(R.string.templates_from_template),
                shape = rowGroupShape(1, 2),
                onClick = {
                    onDismiss()
                    onFromTemplate()
                },
            )
        }
    }
}

/** Liste en ligne des modèles de projet du compte ; en choisir un le clone sous un nom modifiable. */
@Composable
internal fun TemplatesPickerSheet(
    onCloned: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val client = remember(context) { TasksGraph.templates(context) }
    val scope = rememberCoroutineScope()
    val palette = cadence
    val offlineMessage = stringResource(R.string.templates_offline)
    val actionOfflineMessage = stringResource(R.string.templates_action_offline)

    var loading by remember { mutableStateOf(true) }
    var templates by remember { mutableStateOf<List<ProjectTemplate>>(emptyList()) }
    var loadError by remember { mutableStateOf<String?>(null) }

    var picked by remember { mutableStateOf<ProjectTemplate?>(null) }
    var cloneName by rememberSaveable { mutableStateOf("") }
    var cloning by remember { mutableStateOf(false) }
    var cloneError by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        loading = true
        loadError = null
        try {
            templates = client.list()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            loadError = offlineMessage
        } finally {
            loading = false
        }
    }

    CadenceSheet(
        title = stringResource(R.string.templates_pick_title),
        subtitle = null,
        dismiss = onDismiss,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(bottom = Space.xl),
            verticalArrangement = Arrangement.spacedBy(Space.md),
        ) {
            when {
                loading -> Row(Modifier.fillMaxWidth().padding(vertical = Space.lg), horizontalArrangement = Arrangement.Center) {
                    CircularProgressIndicator()
                }
                loadError != null -> Text(loadError.orEmpty(), style = MaterialTheme.typography.bodyMedium, color = palette.error)
                templates.isEmpty() -> Text(stringResource(R.string.templates_empty), style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant)
                else -> RowGroup {
                    templates.forEachIndexed { index, tpl ->
                        val countLabel = if (tpl.taskCount > 0) {
                            pluralStringResource(R.plurals.templates_task_count, tpl.taskCount, tpl.taskCount)
                        } else {
                            null
                        }
                        val subtitle = listOfNotNull(
                            tpl.description.takeIf { it.isNotBlank() },
                            countLabel,
                        ).joinToString(" · ").ifBlank { null }
                        SettingRow(
                            title = tpl.name,
                            subtitle = subtitle,
                            shape = rowGroupShape(index, templates.size),
                            onClick = {
                                picked = tpl
                                cloneName = tpl.name
                                cloneError = null
                            },
                        )
                    }
                }
            }
        }
    }

    val target = picked
    if (target != null) {
        AlertDialog(
            onDismissRequest = { if (!cloning) picked = null },
            title = { Text(stringResource(R.string.templates_clone_title)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                    OutlinedTextField(
                        value = cloneName,
                        onValueChange = { cloneName = it },
                        label = { Text(stringResource(R.string.templates_clone_name_label)) },
                        singleLine = true,
                        enabled = !cloning,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    cloneError?.let { msg ->
                        Text(msg, style = MaterialTheme.typography.bodySmall, color = palette.error)
                    }
                }
            },
            confirmButton = {
                TextButton(
                    enabled = !cloning && cloneName.isNotBlank(),
                    onClick = {
                        val chosenName = cloneName.trim()
                        cloning = true
                        cloneError = null
                        scope.launch {
                            try {
                                client.clone(target.uid, chosenName)
                                picked = null
                                onCloned(chosenName)
                            } catch (e: CancellationException) {
                                throw e
                            } catch (_: Exception) {
                                cloneError = actionOfflineMessage
                            } finally {
                                cloning = false
                            }
                        }
                    },
                ) {
                    Text(stringResource(R.string.templates_clone_confirm))
                }
            },
            dismissButton = {
                TextButton(enabled = !cloning, onClick = { picked = null }) {
                    Text(stringResource(R.string.note_public_share_cancel))
                }
            },
        )
    }
}

/** Dialogue en ligne pour enregistrer un projet ouvert comme modèle. */
@Composable
internal fun SaveAsTemplateDialog(
    projectUid: String,
    projectName: String,
    onSaved: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val client = remember(context) { TasksGraph.templates(context) }
    val scope = rememberCoroutineScope()
    val palette = cadence
    val offlineMessage = stringResource(R.string.templates_action_offline)

    var name by rememberSaveable(projectUid) { mutableStateOf(projectName) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = { if (!saving) onDismiss() },
        title = { Text(stringResource(R.string.templates_save_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text(stringResource(R.string.templates_save_name_label)) },
                    singleLine = true,
                    enabled = !saving,
                    modifier = Modifier.fillMaxWidth(),
                )
                error?.let { msg ->
                    Text(msg, style = MaterialTheme.typography.bodySmall, color = palette.error)
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !saving && name.isNotBlank(),
                onClick = {
                    val chosen = name.trim()
                    saving = true
                    error = null
                    scope.launch {
                        try {
                            client.saveProjectAsTemplate(projectUid, chosen)
                            onSaved(chosen)
                        } catch (e: CancellationException) {
                            throw e
                        } catch (_: Exception) {
                            error = offlineMessage
                        } finally {
                            saving = false
                        }
                    }
                },
            ) {
                Text(stringResource(R.string.templates_save_confirm))
            }
        },
        dismissButton = {
            TextButton(enabled = !saving, onClick = onDismiss) {
                Text(stringResource(R.string.note_public_share_cancel))
            }
        },
    )
}
