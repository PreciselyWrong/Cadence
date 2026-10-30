@file:OptIn(ExperimentalLayoutApi::class)

package ch.nicolab.cadence.tasks.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.outlined.Checklist
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.FormatBold
import androidx.compose.material.icons.outlined.FormatListBulleted
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material.icons.outlined.StickyNote2
import androidx.compose.material.icons.outlined.Title
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.designsystem.components.BadgeTone
import ch.nicolab.cadence.designsystem.components.CadenceBadge
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.EmptyState as DsEmptyState
import ch.nicolab.cadence.designsystem.components.HeaderButtonStyle
import ch.nicolab.cadence.designsystem.components.RoundHeaderButton
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.links.LinkExtractor
import ch.nicolab.cadence.tasks.links.LinkPreviews
import ch.nicolab.cadence.tasks.model.NoteChange
import ch.nicolab.cadence.tasks.model.NoteItem
import ch.nicolab.cadence.tasks.notes.Markdown
import ch.nicolab.cadence.tasks.notes.MarkdownCheckbox
import ch.nicolab.cadence.tasks.notes.MarkdownEditing
import ch.nicolab.cadence.tasks.notes.NoteFields
import ch.nicolab.cadence.tasks.notes.TextEdit
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private const val PREVIEW_LINES = 6
private const val TINT_ALPHA_LIGHT = 0.14f
private const val TINT_ALPHA_DARK = 0.22f
private val NOTE_CARD_MIN_HEIGHT = 72.dp
private val NOTE_BODY_MIN = 200.dp
private val SWATCH = 40.dp

/** Notes en grille de cartes décalées : épinglées d'abord, puis les plus récentes. */
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
    LazyVerticalStaggeredGrid(
        columns = StaggeredGridCells.Fixed(2),
        modifier = modifier,
        contentPadding = tasksListPadding(),
        horizontalArrangement = Arrangement.spacedBy(Space.sm),
        verticalItemSpacing = Space.sm,
    ) {
        items(notes, key = { it.uid }) { note ->
            NoteCard(note, viewModel.linkPreviews, onClick = { onOpen(note) })
        }
    }
}

/** Carte de note : teinte de sa couleur, premier lien en vignette, aperçu sans syntaxe markdown. */
@Composable
internal fun NoteCard(note: NoteItem, previews: LinkPreviews, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val palette = cadence
    val accent = noteAccent(note.color, palette.isDark)
    val preview = remember(note.content) { Markdown.preview(note.content, PREVIEW_LINES) }
    val firstLink = remember(note.content) { LinkExtractor.urls(note.content, 1).firstOrNull() }
    Column(
        modifier
            .fillMaxWidth()
            .heightIn(min = NOTE_CARD_MIN_HEIGHT)
            .clip(Radius.Card)
            .background(palette.card)
            .background(accent?.copy(alpha = if (palette.isDark) TINT_ALPHA_DARK else TINT_ALPHA_LIGHT) ?: Color.Transparent)
            .clickable(onClick = onClick)
            .padding(Space.md),
        verticalArrangement = Arrangement.spacedBy(Space.xs),
    ) {
        firstLink?.let { LinkThumbStrip(it, previews, Modifier.padding(bottom = Space.xs)) }
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
            Text(
                note.title.ifBlank { stringResource(R.string.tasks_note_untitled) },
                style = MaterialTheme.typography.titleSmall,
                color = accent ?: palette.onSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            if (note.pinned) {
                Icon(
                    Icons.Filled.PushPin,
                    contentDescription = stringResource(R.string.tasks_note_pinned_badge),
                    tint = palette.onSurfaceVariant,
                    modifier = Modifier.size(Size.iconSm),
                )
            }
        }
        if (preview.isNotBlank()) {
            Text(
                preview,
                style = MaterialTheme.typography.bodySmall,
                color = palette.onSurfaceVariant,
                maxLines = PREVIEW_LINES + 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** Note en plein écran. [isNew] : la note n'existe pas encore, elle est créée à la première saisie. */
@Composable
internal fun NoteScreen(viewModel: TasksViewModel, noteUid: String, isNew: Boolean, onBack: () -> Unit) {
    BackHandler(onBack = onBack)
    val flow = remember(noteUid) { viewModel.observeNote(noteUid) }
    val note by flow.collectAsStateWithLifecycle(initialValue = null)
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        if (note != null || isNew) {
            NoteEditor(viewModel, noteUid, note, onBack)
        }
    }
}

@Composable
private fun NoteEditor(viewModel: TasksViewModel, uid: String, note: NoteItem?, onBack: () -> Unit) {
    val palette = cadence
    val focus = LocalFocusManager.current
    val session = remember(uid) { viewModel.noteSession(uid, NoteFields(note?.title.orEmpty(), note?.content.orEmpty())) }
    var title by remember(uid) { mutableStateOf(TextFieldValue(session.current.title)) }
    var body by remember(uid) { mutableStateOf(TextFieldValue(session.current.content)) }
    var editing by rememberSaveable(uid) { mutableStateOf(note == null || note.content.isBlank()) }
    var organizing by rememberSaveable(uid) { mutableStateOf(false) }
    val titleFocus = remember { FocusRequester() }
    val bodyFocus = remember { FocusRequester() }
    val tags by viewModel.tags.collectAsStateWithLifecycle()
    val projects by viewModel.projects.collectAsStateWithLifecycle()

    DisposableEffect(uid) { onDispose { viewModel.closeNote(uid) } }
    LaunchedEffect(uid) { if (note == null) titleFocus.requestFocus() }
    LaunchedEffect(editing) { if (editing && note != null) bodyFocus.requestFocus() }
    LaunchedEffect(note?.title, note?.content) {
        note ?: return@LaunchedEffect
        val shown = session.merge(NoteFields(note.title, note.content))
        if (shown.title != title.text) title = TextFieldValue(shown.title, TextRange(shown.title.length))
        if (shown.content != body.text) body = TextFieldValue(shown.content, TextRange(shown.content.length))
    }

    fun setBody(value: TextFieldValue) {
        body = value
        session.edit(content = value.text)
        viewModel.noteEdited(uid)
    }

    Column(Modifier.fillMaxSize().statusBarsPadding().imePadding().navigationBarsPadding()) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = Space.gutter, vertical = Space.sm),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Space.sm),
        ) {
            RoundHeaderButton(
                icon = Icons.AutoMirrored.Outlined.ArrowBack,
                contentDescription = stringResource(R.string.tasks_note_back),
                style = HeaderButtonStyle.Plain,
                onClick = onBack,
            )
            Box(Modifier.weight(1f))
            if (note != null) {
                RoundHeaderButton(
                    icon = if (note.pinned) Icons.Filled.PushPin else Icons.Outlined.PushPin,
                    contentDescription = stringResource(if (note.pinned) R.string.tasks_note_unpin else R.string.tasks_note_pin),
                    style = if (note.pinned) HeaderButtonStyle.Filled else HeaderButtonStyle.Plain,
                    onClick = { viewModel.saveNoteAttributes(uid, NoteChange(pinned = !note.pinned)) },
                )
                RoundHeaderButton(
                    icon = Icons.Outlined.Tune,
                    contentDescription = stringResource(R.string.tasks_note_organize),
                    style = HeaderButtonStyle.Plain,
                    onClick = { organizing = true },
                )
                RoundHeaderButton(
                    icon = Icons.Outlined.Delete,
                    contentDescription = stringResource(R.string.tasks_action_delete),
                    style = HeaderButtonStyle.Plain,
                    onClick = {
                        viewModel.deleteNoteWithUndo(uid)
                        onBack()
                    },
                )
            }
        }
        Column(
            Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Space.gutter),
            verticalArrangement = Arrangement.spacedBy(Space.md),
        ) {
            PlainField(
                value = title,
                onValueChange = {
                    title = it
                    session.edit(title = it.text)
                    viewModel.noteEdited(uid)
                },
                hint = stringResource(R.string.tasks_note_title_hint),
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.focusRequester(titleFocus),
                singleLine = true,
            )
            if (note != null) {
                NoteMeta(note, projects.firstOrNull { it.uid == note.projectUid }?.name, tags.filter { it.uid in note.tagUids }.map { it.name })
            }
            if (editing) {
                PlainField(
                    value = body,
                    onValueChange = { next ->
                        val fixed = MarkdownEditing.continueList(body.toEdit(), next.toEdit())
                        setBody(fixed?.toValue() ?: next)
                    },
                    hint = stringResource(R.string.tasks_note_body_hint),
                    style = MaterialTheme.typography.bodyLarge,
                    modifier = Modifier.heightIn(min = NOTE_BODY_MIN).focusRequester(bodyFocus),
                    singleLine = false,
                )
            } else {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = NOTE_BODY_MIN)
                        .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {
                            body = body.copy(selection = TextRange(body.text.length))
                            editing = true
                        },
                ) {
                    if (body.text.isBlank()) {
                        Text(
                            stringResource(R.string.tasks_note_empty_content),
                            style = MaterialTheme.typography.bodyLarge,
                            color = palette.outline,
                        )
                    } else {
                        MarkdownView(
                            content = body.text,
                            onToggleCheckbox = { line ->
                                setBody(TextFieldValue(MarkdownCheckbox.toggle(body.text, line)))
                                viewModel.flushNote(uid)
                            },
                        )
                    }
                }
                LinkPreviewList(body.text, viewModel.linkPreviews, Modifier.padding(bottom = Space.xl), PreviewSize.Large)
            }
        }
        if (editing) {
            FormattingBar(
                onChecklist = { setBody(MarkdownEditing.togglePrefix(body.toEdit(), "- [ ] ").toValue()) },
                onBullets = { setBody(MarkdownEditing.togglePrefix(body.toEdit(), "- ").toValue()) },
                onHeading = { setBody(MarkdownEditing.togglePrefix(body.toEdit(), "# ").toValue()) },
                onBold = { setBody(MarkdownEditing.wrap(body.toEdit(), "**").toValue()) },
                onDone = {
                    focus.clearFocus()
                    editing = false
                },
            )
        }
    }

    if (organizing && note != null) {
        OrganizeSheet(note = note, viewModel = viewModel, onDismiss = { organizing = false })
    }
}

private fun TextFieldValue.toEdit() = TextEdit(text, selection.min, selection.max)

private fun TextEdit.toValue() = TextFieldValue(text, TextRange(selStart, selEnd))

/** Champ sans cadre, comme une page : le texte seul, avec un indice quand il est vide. */
@Composable
private fun PlainField(
    value: TextFieldValue,
    onValueChange: (TextFieldValue) -> Unit,
    hint: String,
    style: TextStyle,
    modifier: Modifier = Modifier,
    singleLine: Boolean,
) {
    val palette = cadence
    Box(modifier.fillMaxWidth()) {
        if (value.text.isEmpty()) Text(hint, style = style, color = palette.outline)
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            textStyle = style.copy(color = palette.onSurface),
            cursorBrush = SolidColor(palette.primary),
            singleLine = singleLine,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun NoteMeta(note: NoteItem, projectName: String?, tagNames: List<String>) {
    val accent = noteAccent(note.color, cadence.isDark)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
        accent?.let { Box(Modifier.size(Size.badgeHeight).padding(Space.xs).clip(CircleShape).background(it)) }
        projectName?.let { CadenceBadge(it, tone = BadgeTone.Primary) }
        tagNames.forEach { CadenceBadge("#$it") }
        note.updatedAt?.let {
            CadenceBadge(
                stringResource(R.string.tasks_note_updated, it.atZone(ZoneId.systemDefault()).toLocalDate().format(noteDate)),
            )
        }
    }
}

@Composable
private fun FormattingBar(
    onChecklist: () -> Unit,
    onBullets: () -> Unit,
    onHeading: () -> Unit,
    onBold: () -> Unit,
    onDone: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().background(cadence.containerHigh).padding(horizontal = Space.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FormatButton(Icons.Outlined.Checklist, R.string.tasks_note_checklist, onChecklist)
        FormatButton(Icons.Outlined.FormatListBulleted, R.string.tasks_note_bullets, onBullets)
        FormatButton(Icons.Outlined.Title, R.string.tasks_note_heading, onHeading)
        FormatButton(Icons.Outlined.FormatBold, R.string.tasks_note_bold, onBold)
        Box(Modifier.weight(1f))
        TextButton(onClick = onDone) { Text(stringResource(R.string.tasks_note_done_editing)) }
    }
}

@Composable
private fun FormatButton(icon: ImageVector, label: Int, onClick: () -> Unit) {
    IconButton(onClick = onClick, modifier = Modifier.size(Size.touch)) {
        Icon(icon, contentDescription = stringResource(label), tint = cadence.onSurface)
    }
}

/** Projet, étiquettes et couleur d'une note ; chaque choix s'écrit aussitôt. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun OrganizeSheet(note: NoteItem, viewModel: TasksViewModel, onDismiss: () -> Unit) {
    val projects by viewModel.projects.collectAsStateWithLifecycle()
    val tags by viewModel.tags.collectAsStateWithLifecycle()
    val dark = cadence.isDark
    CadenceSheet(title = stringResource(R.string.tasks_note_organize_title), subtitle = null, dismiss = onDismiss) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(bottom = Space.xl),
            verticalArrangement = Arrangement.spacedBy(Space.md),
        ) {
            ProjectDropdown(
                projects = projects,
                selectedUid = note.projectUid,
                onSelect = { uid ->
                    viewModel.saveNoteAttributes(note.uid, if (uid == null) NoteChange(clearProject = true) else NoteChange(projectUid = uid))
                },
            )
            if (tags.isNotEmpty()) {
                FieldLabel(R.string.tasks_field_tags)
                TagChips(
                    tags = tags,
                    selected = note.tagUids.toSet(),
                    onToggle = { uid ->
                        val next = if (uid in note.tagUids) note.tagUids - uid else note.tagUids + uid
                        viewModel.saveNoteAttributes(note.uid, NoteChange(tagUids = next))
                    },
                )
            }
            Text(stringResource(R.string.tasks_note_color), style = MaterialTheme.typography.labelLarge, color = cadence.onSurfaceVariant)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                Swatch(null, dark, note.color == null, stringResource(R.string.tasks_note_color_none)) {
                    viewModel.saveNoteAttributes(note.uid, NoteChange(clearColor = true))
                }
                NoteColors.forEach { color ->
                    Swatch(color, dark, color.value.equals(note.color, ignoreCase = true), color.name) {
                        viewModel.saveNoteAttributes(note.uid, NoteChange(color = color.value))
                    }
                }
            }
        }
    }
}

@Composable
private fun Swatch(color: NoteColor?, dark: Boolean, selected: Boolean, label: String, onClick: () -> Unit) {
    val palette = cadence
    val fill = color?.let { if (dark) it.dark else it.light } ?: palette.containerHigh
    Box(
        Modifier
            .size(SWATCH)
            .clip(CircleShape)
            .background(fill)
            .clickable(onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        if (selected) {
            Icon(
                Icons.Filled.Check,
                contentDescription = null,
                tint = if (color == null) palette.onSurface else Color.White,
                modifier = Modifier.size(Size.icon),
            )
        }
    }
}

private val noteDate: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMM yyyy", tasksLocale)
