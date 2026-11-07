@file:OptIn(ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
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
import ch.nicolab.cadence.tasks.model.IdeaTasks
import ch.nicolab.cadence.tasks.model.ProjectChoices
import ch.nicolab.cadence.tasks.quickadd.ShareAction
import ch.nicolab.cadence.tasks.quickadd.ShareSession
import kotlinx.coroutines.flow.flowOf

/**
 * Feuille de partage, au-dessus de l'appli d'origine : l'aperçu de l'adresse (lu par le serveur, jamais par
 * l'appareil), le texte modifiable, le projet et les étiquettes, puis Inbox (d'office), Tâche ou Liens (avec une
 * adresse). La fermer range le partage dans l'Inbox.
 */
@Composable
internal fun ShareSheet(session: ShareSession, onDone: () -> Unit) {
    val context = LocalContext.current
    val previews = remember(context) { TasksGraph.linkPreviews(context) }
    val projects by session.projects.collectAsStateWithLifecycle()
    val tags by session.tags.collectAsStateWithLifecycle()
    val url = remember(session.text) { IdeaTasks.address(session.text) }
    val pageTitle = rememberPageTitle(url, previews)
    val decide: (ShareAction) -> Unit = { action ->
        session.settle(action, pageTitle)
        onDone()
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
            ShareTextField(session.text, onChange = { session.text = it })
            ProjectAndTagFields(
                projects = ProjectChoices.forTask(projects, null),
                projectUid = session.projectUid,
                onProject = { session.projectUid = it },
                tags = tags,
                tagUids = session.tagUids,
                onTag = session::toggleTag,
            )
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Space.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Spacer(Modifier.weight(1f))
                if (url != null) {
                    SecondaryAction(stringResource(R.string.tasks_share_to_links)) { decide(ShareAction.LINK) }
                }
                SecondaryAction(stringResource(R.string.tasks_share_to_task)) { decide(ShareAction.TASK) }
                PrimaryAction(stringResource(R.string.tasks_share_to_inbox)) { decide(ShareAction.INBOX) }
            }
        }
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
private fun ShareTextField(value: String, onChange: (String) -> Unit) {
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
            Text(stringResource(R.string.tasks_inbox_capture_hint), style = MaterialTheme.typography.bodyLarge, color = palette.outline)
        }
        BasicTextField(
            value = value,
            onValueChange = onChange,
            maxLines = SHARE_TEXT_LINES,
            textStyle = MaterialTheme.typography.bodyLarge.copy(color = palette.onSurface),
            cursorBrush = SolidColor(palette.primary),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/** Au-delà, le champ défile : les actions restent visibles au-dessus du clavier. */
private const val SHARE_TEXT_LINES = 5
