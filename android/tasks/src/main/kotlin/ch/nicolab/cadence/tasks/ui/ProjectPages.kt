package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.font.FontWeight
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.SectionHeader
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.links.PageCheck
import ch.nicolab.cadence.tasks.links.PageChecks
import ch.nicolab.cadence.tasks.model.IdeaTasks
import ch.nicolab.cadence.tasks.model.LinkItem
import ch.nicolab.cadence.tasks.model.ProjectPages
import ch.nicolab.cadence.tasks.links.LinkExtractor
import ch.nicolab.cadence.tasks.quickadd.ShareCapture

/** Une boîte ouverte depuis la page d'un projet : une seule à la fois. */
internal sealed interface ProjectPageDialog {
    object Add : ProjectPageDialog
    object Check : ProjectPageDialog
    data class Edit(val page: LinkItem) : ProjectPageDialog
    data class Remove(val page: LinkItem) : ProjectPageDialog
    data class Task(val page: LinkItem) : ProjectPageDialog
}

/**
 * Section « Pages » d'un projet, sous ses tâches : une ligne compacte par page, qui ouvre l'adresse ; « ⋯ » crée une
 * tâche, modifie ou retire la page. Rien n'est affiché sans page.
 */
internal fun LazyListScope.projectPageItems(pages: List<LinkItem>, onMenu: (ProjectPageDialog) -> Unit) {
    if (pages.isEmpty()) return
    item(key = "pages") { SectionHeader(title = stringResource(R.string.project_pages_title), count = pages.size) }
    items(pages, key = { "page-${it.uid}" }) { page ->
        ProjectPageRow(page, onMenu, Modifier.padding(bottom = Space.sm))
    }
}

@Composable
private fun ProjectPageRow(page: LinkItem, onMenu: (ProjectPageDialog) -> Unit, modifier: Modifier = Modifier) {
    val palette = cadence
    val uriHandler = LocalUriHandler.current
    val note = ProjectPages.noteLine(page.note)
    val site = page.siteName?.takeIf { it.isNotBlank() } ?: page.domain
    Row(
        modifier
            .fillMaxWidth()
            .clip(Radius.Control)
            .background(palette.containerHigh)
            .clickable { runCatching { uriHandler.openUri(page.url) } }
            .padding(start = Space.sm, top = Space.sm, bottom = Space.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        DomainPastille(page.domain, Modifier.size(Size.badge), Radius.Chip)
        Column(Modifier.weight(1f).padding(horizontal = Space.md), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
            Text(
                page.displayTitle,
                style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
                color = palette.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (site != page.displayTitle) {
                Text(site, style = MaterialTheme.typography.labelSmall, color = palette.outline, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            note?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = palette.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        ProjectPageMenu(page, onMenu)
    }
}

/** « ⋯ » d'une page : Créer une tâche, Modifier, Retirer. */
@Composable
private fun ProjectPageMenu(page: LinkItem, onMenu: (ProjectPageDialog) -> Unit) {
    var more by remember { mutableStateOf(false) }
    Row {
        IconButton(onClick = { more = true }) {
            Icon(Icons.Outlined.MoreHoriz, contentDescription = stringResource(R.string.project_pages_more))
        }
        DropdownMenu(expanded = more, onDismissRequest = { more = false }) {
            listOf(
                R.string.links_create_task to ProjectPageDialog.Task(page),
                R.string.links_edit to ProjectPageDialog.Edit(page),
                R.string.project_pages_remove to ProjectPageDialog.Remove(page),
            ).forEach { (label, dialog) ->
                DropdownMenuItem(
                    text = { Text(stringResource(label)) },
                    onClick = {
                        more = false
                        onMenu(dialog)
                    },
                )
            }
        }
    }
}

/** La boîte ouverte par [dialog] ; [onDismiss] la ferme. Les écritures passent par [viewModel] (file d'envoi). */
@Composable
internal fun ProjectPageDialogs(
    dialog: ProjectPageDialog,
    projectUid: String,
    pages: List<LinkItem>,
    viewModel: TasksViewModel,
    onDismiss: () -> Unit,
) {
    when (dialog) {
        ProjectPageDialog.Add -> AddProjectPageDialog(
            onAdd = { url ->
                viewModel.addProjectPage(projectUid, url)
                onDismiss()
            },
            onDismiss = onDismiss,
        )
        ProjectPageDialog.Check -> PageCheckSheet(projectUid, pages, onDismiss)
        is ProjectPageDialog.Edit -> EditProjectPageDialog(
            page = dialog.page,
            onSave = { title, note ->
                viewModel.editProjectPage(dialog.page, title, note)
                onDismiss()
            },
            onDismiss = onDismiss,
        )
        is ProjectPageDialog.Remove -> AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text(stringResource(R.string.project_pages_remove_title)) },
            text = { Text(stringResource(R.string.project_pages_remove_message, dialog.page.displayTitle)) },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.removeProjectPage(dialog.page.uid)
                    onDismiss()
                }) { Text(stringResource(R.string.project_pages_remove)) }
            },
            dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.links_cancel)) } },
        )
        is ProjectPageDialog.Task -> {
            val context = LocalContext.current
            QuickAddSheet(
                onDismiss = onDismiss,
                initialName = IdeaTasks.capturedName(dialog.page.url, dialog.page.title, ShareCapture.verbs(context)),
                initialNote = dialog.page.url,
                initialProjectUid = projectUid,
                expanded = true,
                onSave = { draft -> viewModel.saveNewTask(draft) },
            )
        }
    }
}

@Composable
private fun AddProjectPageDialog(onAdd: (String) -> Unit, onDismiss: () -> Unit) {
    var text by remember { mutableStateOf("") }
    val url = remember(text) { IdeaTasks.address(text) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.project_pages_add_title)) },
        text = {
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                label = { Text(stringResource(R.string.links_field_url)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = {
            TextButton(enabled = url != null, onClick = { url?.let(onAdd) }) { Text(stringResource(R.string.project_pages_add_confirm)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.links_cancel)) } },
    )
}

@Composable
private fun EditProjectPageDialog(page: LinkItem, onSave: (String, String) -> Unit, onDismiss: () -> Unit) {
    var title by remember(page.uid) { mutableStateOf(page.title.orEmpty()) }
    var note by remember(page.uid) { mutableStateOf(page.note.orEmpty()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.project_pages_edit_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text(stringResource(R.string.links_field_title)) },
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text(stringResource(R.string.links_field_note)) },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = { TextButton(onClick = { onSave(title, note) }) { Text(stringResource(R.string.links_save)) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.links_cancel)) } },
    )
}

/**
 * « Vérifier les pages » : un appel en ligne, rien n'est supprimé. Liste les pages mortes (404, 410 ou hôte
 * injoignable) ; sans réseau, le dit.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PageCheckSheet(projectUid: String, pages: List<LinkItem>, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val checker = remember(context) { TasksGraph.pageChecks(context) }
    var outcome by remember { mutableStateOf<Result<List<PageCheck>>?>(null) }
    LaunchedEffect(projectUid) { outcome = checker.check(projectUid) }
    CadenceSheet(title = stringResource(R.string.project_pages_check_title), subtitle = null, dismiss = onDismiss) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(bottom = Space.xl),
            verticalArrangement = Arrangement.spacedBy(Space.md),
        ) {
            val result = outcome
            val dead = result?.getOrNull()?.let(PageChecks::dead)
            when {
                result == null -> Text(stringResource(R.string.project_pages_check_running), style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant)
                result.isFailure -> Text(stringResource(R.string.project_pages_check_offline), style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant)
                dead.isNullOrEmpty() -> Text(stringResource(R.string.project_pages_check_ok), style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant)
                else -> dead.forEach { DeadPageLine(it, pages) }
            }
        }
    }
}

@Composable
private fun DeadPageLine(check: PageCheck, pages: List<LinkItem>) {
    val palette = cadence
    val title = pages.firstOrNull { it.uid == check.uid }?.displayTitle ?: LinkExtractor.domain(check.url) ?: check.url
    val reason = check.code?.let { stringResource(R.string.project_pages_dead_code, it) } ?: stringResource(R.string.project_pages_dead_unreachable)
    Column(verticalArrangement = Arrangement.spacedBy(Space.xs)) {
        Text(title, style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold), color = palette.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(check.url, style = MaterialTheme.typography.bodySmall, color = palette.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(reason, style = MaterialTheme.typography.labelMedium, color = palette.onSurface)
    }
}
