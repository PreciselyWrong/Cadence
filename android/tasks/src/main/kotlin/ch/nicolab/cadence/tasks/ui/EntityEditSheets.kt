@file:OptIn(ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.RowGroup
import ch.nicolab.cadence.designsystem.components.SettingRow
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.components.rowGroupShape
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.ProjectHierarchy
import ch.nicolab.cadence.tasks.model.ProjectItem
import ch.nicolab.cadence.tasks.model.TagColor
import ch.nicolab.cadence.tasks.model.TagColors
import ch.nicolab.cadence.tasks.model.TagItem
import ch.nicolab.cadence.tasks.model.TagPaths

private enum class EditPage { MAIN, ICON, PARENT, COLOR }

/** Statut, icône et projet parent d'un projet : la feuille du statut mène aux deux autres choix. */
@Composable
internal fun ProjectEditSheets(project: ProjectItem, viewModel: TasksViewModel, onDismiss: () -> Unit) {
    val projects by viewModel.projects.collectAsStateWithLifecycle()
    var page by remember { mutableStateOf(EditPage.MAIN) }
    when (page) {
        EditPage.MAIN -> ProjectStatusSheet(
            project = project,
            onPick = { viewModel.setProjectStatus(project.uid, it) },
            onDismiss = onDismiss,
            parentName = projects.firstOrNull { it.uid == project.parentProjectUid }?.name,
            onEditIcon = { page = EditPage.ICON },
            onEditParent = { page = EditPage.PARENT },
        )
        EditPage.ICON -> EntityIconSheet(
            title = stringResource(R.string.tasks_edit_icon),
            subtitle = project.name,
            current = project.icon,
            onPick = { viewModel.setProjectIcon(project.uid, it) },
            onDismiss = onDismiss,
        )
        EditPage.COLOR -> Unit // couleur : étiquettes seulement
        EditPage.PARENT -> {
            val candidates = remember(projects, project.uid) { ProjectHierarchy.parentCandidates(projects, project.uid) }
            ParentSheet(
                title = stringResource(R.string.tasks_project_parent_title),
                subtitle = project.name,
                noneLabel = stringResource(R.string.tasks_edit_parent_none),
                options = candidates.map { ParentOption(it.uid, it.name, ProjectHierarchy.ancestors(projects, it.uid).joinToString(" › ") { p -> p.name }) },
                currentUid = project.parentProjectUid,
                onPick = { viewModel.moveProject(project.uid, it) },
                onDismiss = onDismiss,
            )
        }
    }
}

/** Nom, icône et parent d'une étiquette ; « Plus tard » (étiquette système) n'offre que l'icône. */
@Composable
internal fun TagEditSheets(tag: TagItem, viewModel: TasksViewModel, onDismiss: () -> Unit) {
    val tags by viewModel.tags.collectAsStateWithLifecycle()
    var page by remember { mutableStateOf(EditPage.MAIN) }
    val parent = tags.firstOrNull { it.name == TagPaths.parentPath(tag.name) }
    when (page) {
        EditPage.MAIN -> TagMainSheet(
            tag = tag,
            parentName = parent?.name,
            onRename = { leaf, done -> viewModel.renameTag(tag.uid, TagPaths.renamedLeaf(tag.name, leaf), done) },
            resolvedColor = TagColors.resolve(tag, tags),
            onEditIcon = { page = EditPage.ICON },
            onEditColor = { page = EditPage.COLOR },
            onEditParent = { page = EditPage.PARENT },
            onDismiss = onDismiss,
        )
        EditPage.COLOR -> TagColorSheet(
            tag = tag,
            automatic = TagColors.resolve(tag.copy(color = null), tags),
            onPick = { viewModel.setTagColor(tag.uid, it) },
            onDismiss = onDismiss,
        )
        EditPage.ICON -> EntityIconSheet(
            title = stringResource(R.string.tasks_edit_icon),
            subtitle = tag.name,
            current = tag.icon,
            onPick = { viewModel.setTagIcon(tag.uid, it) },
            onDismiss = onDismiss,
        )
        EditPage.PARENT -> {
            val candidates = remember(tags, tag.uid) { TagPaths.parentCandidates(tags, tag.uid) }
            ParentSheet(
                title = stringResource(R.string.tasks_tag_edit_parent),
                subtitle = tag.name,
                noneLabel = stringResource(R.string.tasks_tag_edit_parent_none),
                options = candidates.map { ParentOption(it.uid, it.name, null) },
                currentUid = parent?.uid,
                onPick = { viewModel.moveTag(tag.uid, it) },
                onDismiss = onDismiss,
            )
        }
    }
}

@Composable
private fun TagMainSheet(
    tag: TagItem,
    parentName: String?,
    onRename: (String, (Boolean) -> Unit) -> Unit,
    resolvedColor: TagColor,
    onEditIcon: () -> Unit,
    onEditColor: () -> Unit,
    onEditParent: () -> Unit,
    onDismiss: () -> Unit,
) {
    val reserved = tag.name == TagPaths.SOMEDAY
    var leaf by rememberSaveable(tag.uid) { mutableStateOf(TagPaths.leaf(tag.name)) }
    val hasSlash = leaf.contains(TagPaths.SEPARATOR)
    val changed = leaf.trim().isNotEmpty() && leaf.trim() != TagPaths.leaf(tag.name)
    CadenceSheet(title = stringResource(R.string.tasks_tag_edit), subtitle = tag.name, dismiss = onDismiss) {
        if (!reserved) {
            CadenceField(
                value = leaf,
                onValue = { leaf = it },
                label = stringResource(R.string.tasks_tag_edit_name),
                support = if (hasSlash) stringResource(R.string.tasks_tag_edit_no_slash) else null,
            )
            Spacer(Modifier.height(Space.md))
            PrimaryAction(
                label = stringResource(R.string.tasks_tag_edit_save),
                enabled = changed && !hasSlash,
                onClick = { onRename(leaf.trim()) { done -> if (done) onDismiss() } },
            )
            Spacer(Modifier.height(Space.lg))
        }
        RowGroup {
            val rows = if (reserved) 2 else 3
            SettingRow(
                title = stringResource(R.string.tasks_edit_icon),
                shape = rowGroupShape(0, rows),
                trailing = { IconValue(tag.icon) },
                onClick = onEditIcon,
            )
            SettingRow(
                title = stringResource(R.string.tasks_edit_color),
                shape = rowGroupShape(1, rows),
                trailing = { TagColorValue(tag, resolvedColor) },
                onClick = onEditColor,
            )
            if (!reserved) {
                SettingRow(
                    title = stringResource(R.string.tasks_tag_edit_parent),
                    subtitle = parentName ?: stringResource(R.string.tasks_tag_edit_parent_none),
                    shape = rowGroupShape(2, rows),
                    onClick = onEditParent,
                )
            }
        }
    }
}

/** Valeur d'une ligne « Icône » : l'icône posée, ou « Aucune ». */
@Composable
internal fun IconValue(icon: String?) {
    val vector = entityIcon(icon)
    if (vector != null) {
        EntityIcon(vector, tint = cadence.primary)
    } else {
        Text(stringResource(R.string.tasks_icon_none), style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant)
    }
}

/** Grille d'icônes du jeu partagé (fournie par l'application) et retrait de l'icône ; un choix ferme la feuille. */
@Composable
internal fun EntityIconSheet(title: String, subtitle: String, current: String?, onPick: (String?) -> Unit, onDismiss: () -> Unit) {
    val picker = LocalEntityIconPicker.current
    CadenceSheet(title = title, subtitle = subtitle, dismiss = onDismiss) {
        picker?.invoke(current) {
            onPick(it)
            onDismiss()
        }
        if (current != null) {
            TertiaryAction(label = stringResource(R.string.tasks_icon_remove)) {
                onPick(null)
                onDismiss()
            }
        }
    }
}

private data class ParentOption(val uid: String, val label: String, val context: String?)

/** Liste de parents possibles, « sans parent » en tête ; la valeur courante est cochée, un appui l'applique et ferme. */
@Composable
private fun ParentSheet(
    title: String,
    subtitle: String,
    noneLabel: String,
    options: List<ParentOption>,
    currentUid: String?,
    onPick: (String?) -> Unit,
    onDismiss: () -> Unit,
) {
    val palette = cadence
    CadenceSheet(title = title, subtitle = subtitle, dismiss = onDismiss) {
        Column(Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
            RowGroup {
                val count = options.size + 1
                (listOf(ParentOption("", noneLabel, null)) + options).forEachIndexed { index, option ->
                    val uid = option.uid.ifEmpty { null }
                    SettingRow(
                        title = option.label,
                        subtitle = option.context?.takeIf { it.isNotEmpty() },
                        shape = rowGroupShape(index, count),
                        trailing = {
                            if (uid == currentUid) Icon(Icons.Outlined.Check, contentDescription = null, tint = palette.primary)
                        },
                        onClick = {
                            onPick(uid)
                            onDismiss()
                        },
                    )
                }
            }
        }
    }
}
