package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.LinkEdit
import ch.nicolab.cadence.tasks.model.LinkItem
import ch.nicolab.cadence.tasks.model.LinkStatus
import ch.nicolab.cadence.tasks.model.ProjectItem
import ch.nicolab.cadence.tasks.model.TagItem

/** « ⋯ » d'un lien : Modifier, Créer une tâche, Archiver (ou Désarchiver), Supprimer. */
@Composable
internal fun LinkControls(
    link: LinkItem,
    onArchive: (Boolean) -> Unit,
    onEdit: () -> Unit,
    onTask: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var more by remember { mutableStateOf(false) }
    val archived = link.status == LinkStatus.DROPPED
    Box(modifier) {
        IconButton(onClick = { more = true }) {
            Icon(Icons.Outlined.MoreHoriz, contentDescription = stringResource(R.string.links_more_actions))
        }
        DropdownMenu(expanded = more, onDismissRequest = { more = false }) {
            listOf(
                R.string.links_edit to onEdit,
                R.string.links_create_task to onTask,
                (if (archived) R.string.links_unarchive else R.string.links_archive) to { onArchive(!archived) },
                R.string.links_delete to onDelete,
            ).forEach { (label, action) ->
                DropdownMenuItem(
                    text = { Text(stringResource(label)) },
                    onClick = {
                        more = false
                        action()
                    },
                )
            }
        }
    }
}

/** Étiquettes du lien et le bouton qui ouvre le choix ; sans étiquette, juste le bouton. */
@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
internal fun LinkTagLine(link: LinkItem, tags: List<TagItem>, onTags: (List<String>) -> Unit) {
    var picking by remember { mutableStateOf(false) }
    val chosen = remember(tags, link.tagUids) { tags.filter { it.uid in link.tagUids } }
    FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
        chosen.forEach { QuickPill(it.name, { picking = true }, quiet = true) }
        QuickPill(stringResource(if (chosen.isEmpty()) R.string.links_add_tag else R.string.links_edit_tags), { picking = true }, quiet = true)
    }
    if (picking) {
        CadenceSheet(title = stringResource(R.string.links_tags_title), subtitle = null, dismiss = { picking = false }) {
            Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(bottom = Space.xl)) {
                if (tags.isEmpty()) {
                    Text(stringResource(R.string.links_no_tags), style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant)
                } else {
                    TagChips(tags, link.tagUids.toSet()) { uid ->
                        onTags(if (uid in link.tagUids) link.tagUids - uid else link.tagUids + uid)
                    }
                }
            }
        }
    }
}

/** Tout ce qui appartient à l'utilisateur dans un lien ; les étiquettes s'écrivent aussitôt, le reste à l'enregistrement. */
@Composable
internal fun LinkEditDialog(
    link: LinkItem,
    projects: List<ProjectItem>,
    tags: List<TagItem>,
    onTags: (List<String>) -> Unit,
    onSave: (LinkEdit) -> Unit,
    onDismiss: () -> Unit,
) {
    var title by remember { mutableStateOf(link.title.orEmpty()) }
    var url by remember { mutableStateOf(link.url) }
    var note by remember { mutableStateOf(link.note.orEmpty()) }
    var projectUid by remember { mutableStateOf(link.projectUid) }
    var choosingProject by remember { mutableStateOf(false) }
    val projectName = projects.firstOrNull { it.uid == projectUid }?.name
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.links_edit_title)) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text(stringResource(R.string.links_field_title)) },
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = url,
                    onValueChange = { url = it },
                    label = { Text(stringResource(R.string.links_field_url)) },
                    modifier = Modifier.fillMaxWidth(),
                )
                Box {
                    TextButton(onClick = { choosingProject = true }) {
                        Text(projectName ?: stringResource(R.string.links_no_project))
                    }
                    DropdownMenu(expanded = choosingProject, onDismissRequest = { choosingProject = false }) {
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.links_no_project)) },
                            onClick = {
                                projectUid = null
                                choosingProject = false
                            },
                        )
                        projects.forEach { project ->
                            DropdownMenuItem(
                                text = { Text(project.name) },
                                onClick = {
                                    projectUid = project.uid
                                    choosingProject = false
                                },
                            )
                        }
                    }
                }
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text(stringResource(R.string.links_field_note)) },
                    modifier = Modifier.fillMaxWidth(),
                )
                LinkTagLine(link, tags, onTags)
            }
        },
        confirmButton = {
            TextButton(enabled = url.isNotBlank(), onClick = { onSave(LinkEdit(title, url, note, projectUid)) }) {
                Text(stringResource(R.string.links_save))
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.links_cancel)) } },
    )
}

@Composable
internal fun LinkDeleteDialog(link: LinkItem, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.links_delete_title)) },
        text = { Text(stringResource(R.string.links_delete_message, link.displayTitle)) },
        confirmButton = { TextButton(onClick = onConfirm) { Text(stringResource(R.string.links_delete)) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.links_cancel)) } },
    )
}
