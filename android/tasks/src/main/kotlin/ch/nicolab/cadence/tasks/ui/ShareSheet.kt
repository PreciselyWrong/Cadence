@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.links.CachedPreview
import ch.nicolab.cadence.tasks.links.LinkPreviews
import ch.nicolab.cadence.tasks.model.AddressPlaces
import ch.nicolab.cadence.tasks.model.IdeaTasks
import ch.nicolab.cadence.tasks.model.PlaceRef
import ch.nicolab.cadence.tasks.model.ProjectChoices
import ch.nicolab.cadence.tasks.quickadd.ShareAction
import ch.nicolab.cadence.tasks.quickadd.ShareSession
import ch.nicolab.cadence.tasks.widget.openTaskIntent
import kotlinx.coroutines.flow.flowOf

/**
 * Feuille de partage, au-dessus de l'appli d'origine. Sans adresse : Inbox d'office, Tâche. Avec une adresse : l'aperçu,
 * « Déjà dans » si elle est connue, le nom de la tâche, le projet et les étiquettes, puis Tâche (primaire), et Projet…,
 * Note, Inbox. Fermer la feuille range le partage dans l'Inbox.
 */
@Composable
internal fun ShareSheet(session: ShareSession, onDone: () -> Unit) {
    val context = LocalContext.current
    val previews = remember(context) { TasksGraph.linkPreviews(context) }
    val projects by session.projects.collectAsStateWithLifecycle()
    val tags by session.tags.collectAsStateWithLifecycle()
    val url = remember(session.text) { IdeaTasks.address(session.text) }
    val pageTitle = rememberPageTitle(url, previews)
    val places by produceState<AddressPlaces?>(null, url) {
        value = url?.let { session.placesOf(it) }
    }
    var pickingProject by remember { mutableStateOf(false) }
    LaunchedEffect(session.text, pageTitle) { session.followSuggestedName(pageTitle) }

    val decide: (ShareAction) -> Unit = { action ->
        session.settle(action, pageTitle)
        onDone()
    }
    val openExisting: (PlaceRef?) -> Unit = { place ->
        // Le partage part dans l'Inbox comme à chaque fermeture ; l'appli s'ouvre sur la tâche, ou sur l'accueil.
        val intent = place?.let { openTaskIntent(context, it.uid) } ?: context.packageManager.getLaunchIntentForPackage(context.packageName)
        intent?.let(context::startActivity)
        decide(ShareAction.INBOX)
    }

    if (pickingProject) {
        LinkProjectSheet(
            projects = ProjectChoices.forTask(projects, null),
            onPick = { uid ->
                session.projectUid = uid
                decide(ShareAction.LINK)
            },
            onDismiss = { pickingProject = false },
        )
        return
    }

    CadenceSheet(
        title = stringResource(R.string.tasks_share_title),
        subtitle = null,
        dismiss = { decide(ShareAction.INBOX) },
    ) {
        Column(
            Modifier.fillMaxWidth().imePadding().padding(bottom = Space.md),
            verticalArrangement = Arrangement.spacedBy(Space.md),
        ) {
            url?.let { LinkPreviewCard(it, previews) }
            places?.takeUnless { it.isEmpty }?.let { AlreadyIn(it, onOpen = openExisting) }
            ShareTextField(session.text, hint = stringResource(R.string.tasks_inbox_capture_hint), lines = SHARE_TEXT_LINES, onChange = { session.text = it })
            if (url != null) {
                ShareTextField(session.taskName, hint = stringResource(R.string.tasks_share_name_label), lines = 1, onChange = session::renameTask)
            }
            ProjectAndTagFields(
                projects = ProjectChoices.forTask(projects, null),
                projectUid = session.projectUid,
                onProject = { session.projectUid = it },
                tags = tags,
                tagUids = session.tagUids,
                onTag = session::toggleTag,
            )
            if (url == null) {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(Space.sm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.weight(1f))
                    SecondaryAction(stringResource(R.string.tasks_share_to_task)) { decide(ShareAction.TASK) }
                    PrimaryAction(stringResource(R.string.tasks_share_to_inbox)) { decide(ShareAction.INBOX) }
                }
            } else {
                FlowRow(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                    verticalArrangement = Arrangement.spacedBy(Space.sm),
                ) {
                    SecondaryAction(stringResource(R.string.tasks_share_to_inbox)) { decide(ShareAction.INBOX) }
                    SecondaryAction(stringResource(R.string.tasks_share_to_note)) { decide(ShareAction.NOTE) }
                    SecondaryAction(stringResource(R.string.tasks_share_to_project)) { pickingProject = true }
                    val known = places?.isEmpty == false
                    PrimaryAction(
                        stringResource(if (known) R.string.tasks_share_add_anyway else R.string.tasks_share_to_task),
                    ) { decide(ShareAction.TASK) }
                }
            }
        }
    }
}

/** « Déjà dans « X » » : la première tâche ou le premier projet qui cite l'adresse, « +N » pour les autres. */
@Composable
private fun AlreadyIn(places: AddressPlaces, onOpen: (PlaceRef?) -> Unit) {
    val first = places.tasks.firstOrNull() ?: places.projects.first()
    val more = places.tasks.size + places.projects.size - 1
    val palette = cadence
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(Space.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            if (more > 0) {
                stringResource(R.string.tasks_share_already_more, first.name, more)
            } else {
                stringResource(R.string.tasks_share_already, first.name)
            },
            style = MaterialTheme.typography.bodyMedium,
            color = palette.onSurface,
            modifier = Modifier.weight(1f),
        )
        SecondaryAction(stringResource(R.string.tasks_share_open)) { onOpen(places.tasks.firstOrNull()) }
    }
}

/** Titre de la page en cache (`link_previews`, lu par le serveur) ; null tant qu'il n'est pas connu. */
@Composable
internal fun rememberPageTitle(url: String?, previews: LinkPreviews): String? {
    val flow = remember(url, previews) { url?.let(previews::observe) ?: flowOf<CachedPreview?>(null) }
    val preview by flow.collectAsState(initial = null)
    return preview?.takeUnless { it.failed }?.title?.takeIf { it.isNotBlank() }
}

@Composable
private fun ShareTextField(value: String, hint: String, lines: Int, onChange: (String) -> Unit) {
    val palette = cadence
    Box(
        Modifier
            .fillMaxWidth()
            .clip(Radius.Control)
            .background(palette.containerHigh)
            .heightIn(min = Size.touch)
            .padding(Space.md),
        contentAlignment = Alignment.CenterStart,
    ) {
        if (value.isEmpty()) {
            Text(hint, style = MaterialTheme.typography.bodyLarge, color = palette.outline)
        }
        BasicTextField(
            value = value,
            onValueChange = onChange,
            maxLines = lines,
            textStyle = MaterialTheme.typography.bodyLarge.copy(color = palette.onSurface),
            cursorBrush = SolidColor(palette.primary),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/** Au-delà, le champ défile : les actions restent visibles au-dessus du clavier. */
private const val SHARE_TEXT_LINES = 5
