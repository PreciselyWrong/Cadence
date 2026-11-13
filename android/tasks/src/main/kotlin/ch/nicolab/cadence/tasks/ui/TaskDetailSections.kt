@file:OptIn(ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import ch.nicolab.cadence.tasks.notes.ContentTargets
import ch.nicolab.cadence.tasks.notes.MarkdownCheckbox
import ch.nicolab.cadence.tasks.notes.ContentRef
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.material3.IconButton
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.OpenInNew
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.designsystem.components.ActionRow
import ch.nicolab.cadence.designsystem.components.BadgeTone
import ch.nicolab.cadence.designsystem.components.CadenceBadge
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.RowGroup
import ch.nicolab.cadence.designsystem.components.SettingRow
import ch.nicolab.cadence.designsystem.components.readableTintOf
import ch.nicolab.cadence.designsystem.components.TaskCheckbox
import ch.nicolab.cadence.designsystem.components.rememberCadenceHaptic
import ch.nicolab.cadence.designsystem.components.rowGroupShape
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.RepeatType
import ch.nicolab.cadence.tasks.model.Repetition
import ch.nicolab.cadence.tasks.model.TaskExtraRows
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.quickadd.singleLineCapture
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter

/** Une ligne du groupe de champs : intitulé discret, valeur dessous, chevron. */
internal class DetailField(
    val icon: ImageVector,
    val label: String,
    val value: String,
    val onClick: () -> Unit,
    val empty: Boolean = false,
    /** Faux pour une ligne qu'un fichier possède (le projet d'une tâche TODO.md) : elle se lit sans s'ouvrir. */
    val enabled: Boolean = true,
    /** Couleur de ce que porte la valeur (date, priorité, projet, étiquette) ; null : neutre. */
    val accent: Color? = null,
)

internal enum class DetailFieldKey { DATES, REPEAT, ESTIMATE, PRIORITY, STATUS, TAGS, PROJECT }

/**
 * Lignes de la fiche, comme le panneau du web : une valeur déjà lue sur un badge du haut n'est pas répétée
 * (le badge s'ouvre d'un toucher) ; dates et projet restent visibles même vides ; tout autre champ vide
 * attend « Plus de champs ».
 */
internal object DetailFieldRules {
    private val core = setOf(DetailFieldKey.DATES, DetailFieldKey.PROJECT)

    fun visible(key: DetailFieldKey, filled: Boolean, hasBadge: Boolean, showMore: Boolean): Boolean = when {
        filled -> !hasBadge
        else -> key in core || showMore
    }

    /** Vrai si « Plus de champs » cacherait au moins une ligne. */
    fun hasHidden(fields: List<Pair<DetailFieldKey, Boolean>>, badges: Set<DetailFieldKey>, showMore: Boolean): Boolean =
        fields.any { (key, filled) -> !filled && !visible(key, filled, key in badges, showMore) }
}

/** Groupe de lignes connectées : coins extérieurs arrondis, jonctions presque droites. */
@Composable
internal fun DetailFieldGroup(fields: List<DetailField>) {
    RowGroup(Modifier.fillMaxWidth()) {
        fields.forEachIndexed { index, field ->
            DetailRow(field, rowGroupShape(index, fields.size))
        }
    }
}

@Composable
private fun DetailRow(field: DetailField, shape: Shape) {
    val palette = cadence
    val haptic = rememberCadenceHaptic()
    Row(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(palette.card)
            .clickable(enabled = field.enabled, role = Role.Button) {
                haptic.tap()
                field.onClick()
            }
            .heightIn(min = Size.settingRow)
            .padding(horizontal = Space.lg, vertical = Space.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Une valeur posée prend la couleur de ce qu'elle porte (sinon l'encre neutre), une ligne vide reste grise.
        val tint = when {
            field.empty -> palette.outline
            field.accent != null -> readableTintOf(field.accent, palette.card, 3.0)
            else -> palette.onSurfaceVariant
        }
        Icon(field.icon, null, tint = tint, modifier = Modifier.size(Size.iconLarge))
        Spacer(Modifier.width(Space.lg))
        Column(Modifier.weight(1f)) {
            Text(field.label, style = MaterialTheme.typography.labelMedium, color = palette.onSurfaceVariant)
            Text(
                field.value,
                style = MaterialTheme.typography.bodyLarge,
                color = if (field.empty) palette.onSurfaceVariant else palette.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (field.enabled) {
            Icon(
                Icons.AutoMirrored.Outlined.KeyboardArrowRight,
                null,
                tint = palette.onSurfaceVariant,
                modifier = Modifier.size(Size.icon),
            )
        }
    }
}

/** Texte libre en ligne, sans cadre : placeholder discret, curseur à l'accent. */
@Composable
internal fun InlineTextField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    singleLine: Boolean = false,
    onDone: (() -> Unit)? = null,
    readOnly: Boolean = false,
) {
    val palette = cadence
    Box(modifier, contentAlignment = Alignment.CenterStart) {
        if (value.isEmpty()) {
            Text(placeholder, style = MaterialTheme.typography.bodyLarge, color = palette.outline)
        }
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            readOnly = readOnly,
            textStyle = MaterialTheme.typography.bodyLarge.copy(color = palette.onSurface),
            cursorBrush = SolidColor(palette.primary),
            singleLine = singleLine,
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.Sentences,
                imeAction = if (onDone != null) ImeAction.Done else ImeAction.Default,
            ),
            keyboardActions = KeyboardActions(onDone = { onDone?.invoke() }),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/**
 * Description de la tâche : lue rendue (Markdown, plan, liens, puces, cases) ; le crayon ou un toucher sur une
 * description vide l'édite en plan ([OutlineField], barre posée par la fiche au-dessus du clavier).
 */
@Composable
internal fun NoteCard(
    state: OutlineEditorState,
    editing: Boolean,
    onEditingChange: (Boolean) -> Unit,
    outlineScope: String,
    readOnly: Boolean = false,
    /** Toucher une puce de tâche ou un lien vers une note dans la description rendue. */
    onRef: ((ContentRef) -> Unit)? = null,
    onWikiLink: (String) -> Unit = {},
    targets: ContentTargets? = null,
    onToggleTask: ((TaskItem) -> Unit)? = null,
) {
    val focusRequester = remember { FocusRequester() }
    var focused by remember { mutableStateOf(false) }
    LaunchedEffect(editing) { if (editing) focusRequester.requestFocus() }
    Panel(Modifier.fillMaxWidth()) {
        if (state.doc.isNotBlank() && (readOnly || !editing)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                MarkdownView(
                    content = state.doc,
                    onToggleCheckbox = { line -> if (!readOnly) state.edit(MarkdownCheckbox.toggle(state.doc, line)) },
                    modifier = Modifier.weight(1f),
                    onWikiLink = onWikiLink,
                    onRef = onRef,
                    outlineScope = outlineScope,
                    targets = targets,
                    onToggleTask = onToggleTask,
                )
                if (!readOnly) {
                    IconButton(onClick = {
                        state.caretToEnd()
                        onEditingChange(true)
                    }) {
                        Icon(Icons.Outlined.Edit, contentDescription = stringResource(R.string.tasks_idea_edit))
                    }
                }
            }
        } else {
            OutlineField(
                state = state,
                hint = stringResource(R.string.tasks_detail_note_hint),
                style = MaterialTheme.typography.bodyLarge,
                readOnly = readOnly,
                modifier = Modifier
                    .heightIn(min = Size.touch)
                    .focusRequester(focusRequester)
                    .onFocusChanged { focus ->
                        if (focus.isFocused && !editing && !readOnly) onEditingChange(true)
                        if (focused && !focus.isFocused) onEditingChange(false)
                        focused = focus.isFocused
                    },
            )
        }
    }
}

/**
 * Sous-tâches : liste à cocher, progression dans le titre, ajout en ligne. Toucher une sous-tâche ouvre
 * un menu (renommer, ouvrir comme tâche, supprimer avec « Annuler »).
 */
@Composable
internal fun SubtasksCard(parentUid: String, viewModel: TasksViewModel, onOpen: (TaskItem) -> Unit) {
    val flow = remember(parentUid) { viewModel.observeSubtasks(parentUid) }
    val subtasks by flow.collectAsStateWithLifecycle(initialValue = emptyList())
    var draft by rememberSaveable(parentUid) { mutableStateOf("") }
    var menuFor by remember { mutableStateOf<TaskItem?>(null) }
    var renaming by remember { mutableStateOf<TaskItem?>(null) }
    val submit = {
        val name = draft.trim()
        if (name.isNotEmpty()) {
            viewModel.addSubtask(parentUid, name)
            draft = ""
        }
    }
    val palette = cadence
    Panel(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(Space.xs)) {
            // Sans sous-tâche, le champ « Ajouter une sous-tâche » suffit : pas de titre au-dessus (comme le web).
            if (subtasks.isNotEmpty()) {
                Text(
                    stringResource(R.string.tasks_subtasks_progress, subtasks.count { it.isClosed }, subtasks.size),
                    style = MaterialTheme.typography.titleSmall,
                    color = palette.onSurface,
                )
            }
            subtasks.forEach { subtask ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    TaskCheckbox(
                        checked = subtask.isClosed,
                        onCheckedChange = { viewModel.toggle(subtask) },
                        contentDescription = subtask.name,
                    )
                    Spacer(Modifier.width(Space.xs))
                    Text(
                        subtask.name,
                        style = MaterialTheme.typography.bodyLarge,
                        color = if (subtask.isClosed) palette.onSurfaceVariant else palette.onSurface,
                        textDecoration = if (subtask.isClosed) TextDecoration.LineThrough else null,
                        modifier = Modifier.weight(1f).heightIn(min = Size.touch).clickable(role = Role.Button) { menuFor = subtask },
                    )
                }
            }
            Row(Modifier.heightIn(min = Size.touch), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(Size.touch), contentAlignment = Alignment.Center) {
                    Icon(Icons.Outlined.Add, null, tint = palette.primary, modifier = Modifier.size(Size.iconLarge))
                }
                Spacer(Modifier.width(Space.xs))
                InlineTextField(
                    value = draft,
                    onValueChange = { draft = it },
                    placeholder = stringResource(R.string.tasks_detail_subtask_add),
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    onDone = submit,
                )
            }
        }
    }
    menuFor?.let { subtask ->
        CadenceSheet(title = subtask.name, subtitle = null, dismiss = { menuFor = null }) {
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                ActionRow(Icons.Outlined.Edit, stringResource(R.string.tasks_subtask_rename), palette.primary) {
                    menuFor = null
                    renaming = subtask
                }
                ActionRow(Icons.Outlined.OpenInNew, stringResource(R.string.tasks_subtask_open), palette.primary) {
                    menuFor = null
                    onOpen(subtask)
                }
                ActionRow(Icons.Outlined.Delete, stringResource(R.string.tasks_action_delete), palette.error) {
                    menuFor = null
                    viewModel.askDelete(subtask)
                }
            }
        }
    }
    renaming?.let { subtask ->
        RenameSubtaskDialog(
            current = subtask.name,
            onSave = { name ->
                viewModel.renameSubtask(subtask, name)
                renaming = null
            },
            onDismiss = { renaming = null },
        )
    }
}

@Composable
private fun RenameSubtaskDialog(current: String, onSave: (String) -> Unit, onDismiss: () -> Unit) {
    var name by rememberSaveable(current) { mutableStateOf(current) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.tasks_subtask_rename_title)) },
        text = {
            TextField(
                value = name,
                onValueChange = { name = singleLineCapture(it) },
                maxLines = 6,
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = {
            TextButton(onClick = { onSave(name) }) { Text(stringResource(R.string.goals_edit_save)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.tasks_quick_add_cancel)) }
        },
    )
}

@Composable
internal fun repeatLabel(repetition: Repetition): String = when (repetition.type) {
    RepeatType.NONE -> stringResource(R.string.tasks_repeat_none)
    RepeatType.DAILY -> pluralStringResource(R.plurals.tasks_repeat_daily, repetition.interval, repetition.interval)
    RepeatType.WEEKLY -> pluralStringResource(R.plurals.tasks_repeat_weekly, repetition.interval, repetition.interval)
    RepeatType.MONTHLY -> pluralStringResource(R.plurals.tasks_repeat_monthly, repetition.interval, repetition.interval)
    RepeatType.OTHER -> stringResource(R.string.tasks_repeat_custom)
}

/** Champs serveur que l'appareil n'écrit pas encore, lus tels quels ; affichés sous « Plus de champs ». */
@Composable
internal fun ReadOnlyDetails(task: TaskItem) {
    val palette = cadence
    val rows = TaskExtraRows.visible(task.extras)
    if (rows.isNotEmpty()) {
        Text(
            stringResource(R.string.tasks_extras_title),
            style = MaterialTheme.typography.labelLarge,
            color = palette.onSurfaceVariant,
        )
        RowGroup(Modifier.fillMaxWidth()) {
            rows.forEachIndexed { index, row ->
                SettingRow(
                    title = stringResource(extraLabel(row.key)),
                    subtitle = extraValue(row.value),
                    shape = rowGroupShape(index, rows.size),
                )
            }
        }
        Text(
            stringResource(R.string.tasks_extras_readonly),
            style = MaterialTheme.typography.labelMedium,
            color = palette.outline,
        )
    }
}

private fun extraLabel(key: String): Int = when (key) {
    "recurrence_end_date" -> R.string.tasks_extra_recurrence_end_date
    "completion_based" -> R.string.tasks_extra_completion_based
    "created_at" -> R.string.tasks_extra_created_at
    else -> R.string.tasks_extra_updated_at
}

@Composable
private fun extraValue(raw: String): String = when (raw) {
    "true" -> stringResource(R.string.tasks_extra_yes)
    "false" -> stringResource(R.string.tasks_extra_no)
    else -> runCatching { OffsetDateTime.parse(raw).toLocalDate().format(longDate) }
        .recoverCatching { LocalDate.parse(raw.take(DATE_LENGTH)).format(longDate) }
        .getOrDefault(raw)
}

private const val DATE_LENGTH = 10
private val longDate: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMM yyyy", tasksLocale)

/** Bandeau de la fiche d'une tâche de fichier TODO.md : d'où elle vient et ce que le fichier fixe. */
@Composable
internal fun FileBackedNotice() {
    val palette = cadence
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
        CadenceBadge(text = stringResource(R.string.tasks_file_badge), tone = BadgeTone.Neutral)
        Text(
            stringResource(R.string.tasks_file_readonly),
            style = MaterialTheme.typography.bodyMedium,
            color = palette.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
    }
}
