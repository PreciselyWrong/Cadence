package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
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
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.designsystem.components.BadgeTone
import ch.nicolab.cadence.designsystem.components.CadenceBadge
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.RowGroup
import ch.nicolab.cadence.designsystem.components.SettingRow
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
)

/** Groupe de lignes connectées : coins extérieurs arrondis, jonctions presque droites. */
@Composable
internal fun DetailFieldGroup(fields: List<DetailField>, enabled: Boolean = true) {
    RowGroup(Modifier.fillMaxWidth()) {
        fields.forEachIndexed { index, field ->
            DetailRow(field, rowGroupShape(index, fields.size), enabled)
        }
    }
}

@Composable
private fun DetailRow(field: DetailField, shape: Shape, enabled: Boolean) {
    val palette = cadence
    val haptic = rememberCadenceHaptic()
    Row(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(palette.card)
            .clickable(enabled = enabled, role = Role.Button) {
                haptic.tap()
                field.onClick()
            }
            .heightIn(min = Size.settingRow)
            .padding(horizontal = Space.lg, vertical = Space.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(field.icon, null, tint = palette.primary, modifier = Modifier.size(Size.iconLarge))
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
        if (enabled) {
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

/** Note de la tâche : zone libre dans une carte, enregistrée au fil de la saisie par la fiche. */
@Composable
internal fun NoteCard(note: String, onNoteChange: (String) -> Unit, readOnly: Boolean = false) {
    Panel(Modifier.fillMaxWidth()) {
        InlineTextField(
            value = note,
            onValueChange = onNoteChange,
            readOnly = readOnly,
            placeholder = stringResource(R.string.tasks_detail_note_hint),
            modifier = Modifier.fillMaxWidth().heightIn(min = Size.touch),
        )
    }
}

/** Sous-tâches : liste à cocher, progression dans le titre, ajout en ligne. */
@Composable
internal fun SubtasksCard(parentUid: String, viewModel: TasksViewModel) {
    val flow = remember(parentUid) { viewModel.observeSubtasks(parentUid) }
    val subtasks by flow.collectAsStateWithLifecycle(initialValue = emptyList())
    var draft by rememberSaveable(parentUid) { mutableStateOf("") }
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
            val title = if (subtasks.isEmpty()) {
                stringResource(R.string.tasks_subtasks)
            } else {
                stringResource(R.string.tasks_subtasks_progress, subtasks.count { it.isClosed }, subtasks.size)
            }
            Text(title, style = MaterialTheme.typography.titleSmall, color = palette.onSurface)
            subtasks.forEach { subtask ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    TaskCheckbox(checked = subtask.isClosed, onCheckedChange = { viewModel.toggle(subtask) })
                    Spacer(Modifier.width(Space.xs))
                    Text(
                        subtask.name,
                        style = MaterialTheme.typography.bodyLarge,
                        color = if (subtask.isClosed) palette.onSurfaceVariant else palette.onSurface,
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
}

@Composable
internal fun repeatLabel(repetition: Repetition): String = when (repetition.type) {
    RepeatType.NONE -> stringResource(R.string.tasks_repeat_none)
    RepeatType.DAILY -> pluralStringResource(R.plurals.tasks_repeat_daily, repetition.interval, repetition.interval)
    RepeatType.WEEKLY -> pluralStringResource(R.plurals.tasks_repeat_weekly, repetition.interval, repetition.interval)
    RepeatType.MONTHLY -> pluralStringResource(R.plurals.tasks_repeat_monthly, repetition.interval, repetition.interval)
    RepeatType.OTHER -> stringResource(R.string.tasks_repeat_custom)
}

/**
 * Ce que l'appareil n'écrit pas encore : liens et commentaires en une seule ligne discrète, puis les
 * champs serveur lus tels quels.
 */
@Composable
internal fun ReadOnlyDetails(task: TaskItem) {
    val palette = cadence
    Row(
        Modifier.fillMaxWidth().padding(horizontal = Space.lg, vertical = Space.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Outlined.Link, null, tint = palette.outline, modifier = Modifier.size(Size.icon))
        Spacer(Modifier.width(Space.md))
        Text(
            stringResource(R.string.tasks_detail_links_row),
            style = MaterialTheme.typography.bodyMedium,
            color = palette.outline,
        )
    }
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
    "review_on" -> R.string.tasks_extra_review_on
    "reviewed_at" -> R.string.tasks_extra_reviewed_at
    "week_of" -> R.string.tasks_extra_week_of
    "recurrence_end_date" -> R.string.tasks_extra_recurrence_end_date
    "completion_based" -> R.string.tasks_extra_completion_based
    "in_view_at" -> R.string.tasks_extra_in_view_at
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

/** Bandeau de la fiche d'une tâche de fichier TODO.md : d'où elle vient et pourquoi elle est figée. */
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
