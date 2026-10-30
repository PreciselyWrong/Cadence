@file:OptIn(ExperimentalLayoutApi::class)

package ch.nicolab.cadence.tasks.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.StickyNote2
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.designsystem.components.BadgeTone
import ch.nicolab.cadence.designsystem.components.CadenceBadge
import ch.nicolab.cadence.designsystem.components.EmptyState as DsEmptyState
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.ScreenHeader
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.NoteItem
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private const val PREVIEW_LINES = 5

/** Couleur d'une note si le serveur en donne une lisible ; sinon null. */
private fun noteTint(note: NoteItem): Color? = note.color?.let { raw ->
    runCatching { Color(android.graphics.Color.parseColor(raw)) }.getOrNull()
}

/** Notes du serveur en grille de cartes, lecture seule. */
@Composable
internal fun NotesTab(viewModel: TasksViewModel, onOpen: (NoteItem) -> Unit, modifier: Modifier = Modifier) {
    val notes by viewModel.notes.collectAsStateWithLifecycle()
    if (notes.isEmpty()) {
        DsEmptyState(
            icon = Icons.Outlined.StickyNote2,
            title = stringResource(R.string.tasks_inbox_segment_notes),
            message = stringResource(R.string.tasks_notes_empty),
        )
        return
    }
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        modifier = modifier,
        contentPadding = tasksListPadding(),
        horizontalArrangement = Arrangement.spacedBy(Space.md),
        verticalArrangement = Arrangement.spacedBy(Space.md),
    ) {
        items(notes, key = { it.uid }) { note -> NoteCard(note, onClick = { onOpen(note) }) }
    }
}

@Composable
internal fun NoteCard(note: NoteItem, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val tint = noteTint(note)
    Panel(modifier.fillMaxWidth().heightIn(min = NOTE_CARD_MIN_HEIGHT), onClick = onClick) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(Space.lg),
            verticalArrangement = Arrangement.spacedBy(Space.sm),
        ) {
            Text(
                note.title.ifBlank { stringResource(R.string.tasks_note_untitled) },
                style = MaterialTheme.typography.titleMedium,
                color = tint ?: cadence.onSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                note.content,
                style = MaterialTheme.typography.bodyMedium,
                color = cadence.onSurfaceVariant,
                maxLines = PREVIEW_LINES,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

private val NOTE_CARD_MIN_HEIGHT = 120.dp

/** Note en plein écran, lecture seule : la modification se fait sur le web. */
@Composable
internal fun NoteScreen(viewModel: TasksViewModel, noteUid: String, onBack: () -> Unit) {
    BackHandler(onBack = onBack)
    val flow = remember(noteUid) { viewModel.observeNote(noteUid) }
    val note by flow.collectAsStateWithLifecycle(initialValue = null)
    val tags by viewModel.tags.collectAsStateWithLifecycle()
    val projects by viewModel.projects.collectAsStateWithLifecycle()
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        val current = note
        Column(Modifier.fillMaxSize()) {
            ScreenHeader(
                title = current?.title?.ifBlank { null } ?: stringResource(R.string.tasks_note_untitled),
                modifier = Modifier.statusBarsPadding().padding(horizontal = Space.gutter),
                onBack = onBack,
                backDescription = stringResource(R.string.tasks_note_back),
            )
            if (current == null) return@Column
            Column(
                Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = Space.gutter),
                verticalArrangement = Arrangement.spacedBy(Space.md),
            ) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                    projects.firstOrNull { it.uid == current.projectUid }?.let { CadenceBadge(it.name, tone = BadgeTone.Primary) }
                    current.tagUids.mapNotNull { uid -> tags.firstOrNull { it.uid == uid } }
                        .forEach { CadenceBadge("#${it.name}") }
                    current.updatedAt?.let {
                        CadenceBadge(
                            stringResource(
                                R.string.tasks_note_updated,
                                it.atZone(ZoneId.systemDefault()).toLocalDate().format(noteDate),
                            ),
                        )
                    }
                }
                SelectionContainer {
                    Text(
                        text = current.content.ifBlank { stringResource(R.string.tasks_note_empty_content) },
                        style = MaterialTheme.typography.bodyLarge,
                        color = cadence.onSurface,
                    )
                }
                Text(
                    stringResource(R.string.tasks_note_readonly),
                    style = MaterialTheme.typography.labelMedium,
                    color = cadence.outline,
                    modifier = Modifier.padding(bottom = Space.xxl),
                )
            }
        }
    }
}

private val noteDate: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMM yyyy", tasksLocale)
