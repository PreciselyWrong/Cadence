@file:OptIn(ExperimentalLayoutApi::class)

package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AddComment
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.RowGroup
import ch.nicolab.cadence.designsystem.components.SettingRow
import ch.nicolab.cadence.designsystem.components.TaskCheckbox
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.EstimateFormat
import ch.nicolab.cadence.tasks.model.RepeatType
import ch.nicolab.cadence.tasks.model.Repetition
import ch.nicolab.cadence.tasks.model.TaskExtraRows
import ch.nicolab.cadence.tasks.model.TaskItem
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter

/** Sous-tâches : cases à cocher, progression et ajout rapide. */
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
    Panel(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(Space.lg), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
            val title = if (subtasks.isEmpty()) {
                stringResource(R.string.tasks_subtasks)
            } else {
                stringResource(R.string.tasks_subtasks_progress, subtasks.count { it.isClosed }, subtasks.size)
            }
            Text(title, style = MaterialTheme.typography.titleSmall, color = cadence.onSurface)
            subtasks.forEach { subtask ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.md)) {
                    TaskCheckbox(checked = subtask.isClosed, onCheckedChange = { viewModel.toggle(subtask) })
                    Text(
                        subtask.name,
                        style = MaterialTheme.typography.bodyLarge,
                        color = if (subtask.isClosed) cadence.onSurfaceVariant else cadence.onSurface,
                    )
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                OutlinedTextField(
                    value = draft,
                    onValueChange = { draft = it },
                    placeholder = { Text(stringResource(R.string.tasks_subtask_hint)) },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
                TextButton(onClick = submit, enabled = draft.isNotBlank()) { Text(stringResource(R.string.tasks_subtask_add)) }
            }
        }
    }
}

@Composable
internal fun StartFields(edit: TaskEditState, onPickDate: () -> Unit, onPickTime: () -> Unit) {
    val today = LocalDate.now()
    FieldLabel(R.string.tasks_field_start)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(onClick = onPickDate) {
            Text(edit.startDate?.let { dayLabel(it, today) } ?: stringResource(R.string.tasks_add_start))
        }
        if (edit.startDate != null) {
            OutlinedButton(onClick = onPickTime) {
                Text(edit.startTime?.let(::wireTime) ?: stringResource(R.string.tasks_add_time))
            }
            TextButton(onClick = {
                edit.startDate = null
                edit.startTime = null
            }) { Text(stringResource(R.string.tasks_clear_due)) }
        }
    }
}

@Composable
internal fun RepetitionFields(edit: TaskEditState) {
    FieldLabel(R.string.tasks_field_repeat)
    val current = edit.repetition
    if (current.type == RepeatType.OTHER) {
        // Une règle que l'appareil ne sait pas écrire reste telle quelle tant qu'on n'en choisit pas une autre.
        Text(
            stringResource(R.string.tasks_repeat_custom),
            style = MaterialTheme.typography.bodyMedium,
            color = cadence.onSurfaceVariant,
        )
    }
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf(RepeatType.NONE, RepeatType.DAILY, RepeatType.WEEKLY, RepeatType.MONTHLY).forEach { type ->
            androidx.compose.material3.FilterChip(
                selected = current.type == type,
                onClick = { edit.repetition = Repetition(type, 1) },
                label = { Text(repeatLabel(Repetition(type, 1))) },
            )
        }
    }
    if (current.type != RepeatType.NONE && current.type != RepeatType.OTHER) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
            Text(stringResource(R.string.tasks_repeat_every), style = MaterialTheme.typography.bodyMedium)
            OutlinedButton(
                onClick = { edit.repetition = current.copy(interval = (current.interval - 1).coerceAtLeast(1)) },
                enabled = current.interval > 1,
            ) { Text("−") }
            Text(repeatLabel(current), style = MaterialTheme.typography.titleSmall)
            OutlinedButton(onClick = { edit.repetition = current.copy(interval = current.interval + 1) }) { Text("+") }
        }
        if (edit.dueDate == null) {
            Text(
                stringResource(R.string.tasks_repeat_needs_due),
                style = MaterialTheme.typography.bodyMedium,
                color = cadence.onSurfaceVariant,
            )
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

@Composable
internal fun EstimateFields(edit: TaskEditState) {
    FieldLabel(R.string.tasks_field_estimate)
    val presets = (EstimateFormat.presets + listOfNotNull(edit.estimate)).distinct().sorted()
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        androidx.compose.material3.FilterChip(
            selected = edit.estimate == null,
            onClick = { edit.estimate = null },
            label = { Text(stringResource(R.string.tasks_estimate_none)) },
        )
        presets.forEach { minutes ->
            androidx.compose.material3.FilterChip(
                selected = edit.estimate == minutes,
                onClick = { edit.estimate = minutes },
                label = { Text(EstimateFormat.format(minutes)) },
            )
        }
    }
}

/** Ce que l'appareil n'écrit pas encore : liens, commentaires, et les champs serveur lus tels quels. */
@Composable
internal fun ReadOnlyDetails(task: TaskItem) {
    val rows = TaskExtraRows.visible(task.extras)
    RowGroup(Modifier.fillMaxWidth()) {
        SettingRow(
            title = stringResource(R.string.tasks_field_links),
            subtitle = stringResource(R.string.tasks_web_only),
            icon = Icons.Outlined.Link,
        )
        SettingRow(
            title = stringResource(R.string.tasks_field_comments),
            subtitle = stringResource(R.string.tasks_web_only),
            icon = Icons.Outlined.AddComment,
        )
    }
    if (rows.isNotEmpty()) {
        FieldLabel(R.string.tasks_extras_title)
        RowGroup(Modifier.fillMaxWidth()) {
            rows.forEach { row ->
                SettingRow(title = stringResource(extraLabel(row.key)), subtitle = extraValue(row.value))
            }
        }
        Text(
            stringResource(R.string.tasks_extras_readonly),
            style = MaterialTheme.typography.labelMedium,
            color = cadence.outline,
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
