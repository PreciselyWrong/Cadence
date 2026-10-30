@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskViews
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

/** Fiche d'une tâche : modification, actions et suppression. Enregistrer applique les changements. */
@Composable
internal fun TaskDetailSheet(
    taskUid: String,
    viewModel: TasksViewModel,
    onDismiss: () -> Unit,
) {
    val task by viewModel.observeTask(taskUid).collectAsStateWithLifecycle(initialValue = null)
    val current = task ?: return
    val projects by viewModel.projects.collectAsStateWithLifecycle()
    val tags by viewModel.tags.collectAsStateWithLifecycle()
    val zone = ZoneId.systemDefault()
    val edit = remember(current.uid) { TaskEditState(current, zone) }
    var confirmDelete by remember { mutableStateOf(false) }
    var pickingDate by remember { mutableStateOf(false) }
    var pickingTime by remember { mutableStateOf(false) }

    val save = {
        val result = edit.result()
        if (result.change != TaskChange()) viewModel.update(current.uid, result.change)
        result.moveDate?.let { viewModel.askRecurringMove(current.uid, it) }
        onDismiss()
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp)
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedTextField(
                value = edit.name,
                onValueChange = { edit.name = it },
                label = { Text(stringResource(R.string.tasks_field_name)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = edit.note,
                onValueChange = { edit.note = it },
                label = { Text(stringResource(R.string.tasks_field_note)) },
                minLines = 3,
                modifier = Modifier.fillMaxWidth(),
            )
            DueFields(
                edit = edit,
                onPickDate = { pickingDate = true },
                onPickTime = { pickingTime = true },
            )
            FieldLabel(R.string.tasks_field_priority)
            PrioritySelector(selected = edit.priority, onSelect = { edit.priority = it }, allowNone = false)
            FieldLabel(R.string.tasks_field_project)
            ProjectDropdown(projects = projects, selectedUid = edit.projectUid, onSelect = { edit.projectUid = it })
            if (tags.isNotEmpty()) {
                FieldLabel(R.string.tasks_field_tags)
                TagChips(
                    tags = tags,
                    selected = edit.tagUids,
                    onToggle = { uid -> edit.tagUids = edit.tagUids.toggle(uid) },
                )
            }
            FieldLabel(R.string.tasks_field_status)
            StatusChips(selected = edit.status, onSelect = { edit.status = it })
            TaskActions(
                task = current,
                onToggle = {
                    viewModel.toggle(current)
                    onDismiss()
                },
                onSkip = {
                    viewModel.skipOccurrence(current)
                    onDismiss()
                },
                onDelete = { confirmDelete = true },
            )
            Button(
                onClick = save,
                enabled = edit.name.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            ) { Text(stringResource(R.string.tasks_save)) }
        }
    }

    if (pickingDate) {
        TaskDatePickerDialog(
            initial = edit.dueDate ?: LocalDate.now(),
            onConfirm = {
                edit.dueDate = it
                pickingDate = false
            },
            onDismiss = { pickingDate = false },
        )
    }
    if (pickingTime) {
        TaskTimePickerDialog(
            initial = edit.dueTime ?: LocalTime.of(9, 0),
            onConfirm = {
                edit.dueTime = it
                pickingTime = false
            },
            onDismiss = { pickingTime = false },
        )
    }
    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text(stringResource(R.string.tasks_delete_title)) },
            text = { Text(stringResource(R.string.tasks_delete_message)) },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.delete(current)
                    onDismiss()
                }) { Text(stringResource(R.string.tasks_action_delete)) }
            },
            dismissButton = {
                TextButton(onClick = { confirmDelete = false }) { Text(stringResource(R.string.tasks_cancel)) }
            },
        )
    }
}

@Composable
private fun DueFields(edit: TaskEditState, onPickDate: () -> Unit, onPickTime: () -> Unit) {
    val today = LocalDate.now()
    FieldLabel(R.string.tasks_field_due)
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        OutlinedButton(onClick = onPickDate) {
            Text(edit.dueDate?.let { dayLabel(it, today) } ?: stringResource(R.string.tasks_no_due_date))
        }
        if (edit.dueDate != null) {
            OutlinedButton(onClick = onPickTime) {
                Text(edit.dueTime?.let(::wireTime) ?: stringResource(R.string.tasks_add_time))
            }
            TextButton(onClick = {
                edit.dueDate = null
                edit.dueTime = null
            }) { Text(stringResource(R.string.tasks_clear_due)) }
        }
    }
}

@Composable
private fun TaskActions(
    task: TaskItem,
    onToggle: () -> Unit,
    onSkip: () -> Unit,
    onDelete: () -> Unit,
) {
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        OutlinedButton(onClick = onToggle) {
            Text(stringResource(if (task.isClosed) R.string.tasks_action_reopen else R.string.tasks_action_complete))
        }
        if (task.isRecurring) {
            OutlinedButton(onClick = onSkip) { Text(stringResource(R.string.tasks_action_skip)) }
        }
        OutlinedButton(
            onClick = onDelete,
            colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
        ) { Text(stringResource(R.string.tasks_action_delete)) }
    }
}

private fun Set<String>.toggle(uid: String): Set<String> = if (uid in this) this - uid else this + uid

/** Brouillon de la fiche ; [result] ne renvoie que les champs réellement modifiés. */
internal class TaskEditState(private val task: TaskItem, zone: ZoneId) {
    private val originalDue: LocalDate? = task.dueDay
    private val originalTime: LocalTime? = task.dueDate?.takeIf { task.dueHasTime }?.let { instantTime(it, zone) }

    var name by mutableStateOf(task.name)
    var note by mutableStateOf(task.note.orEmpty())
    var priority by mutableStateOf(task.priority)
    var status by mutableStateOf(task.status)
    var projectUid by mutableStateOf(task.projectUid)
    var tagUids by mutableStateOf(task.tagUids.toSet())
    var dueDate by mutableStateOf(originalDue)
    var dueTime by mutableStateOf(originalTime)

    fun result(): EditResult {
        val dateChanged = dueDate != originalDue
        val timeChanged = dueTime != originalTime
        // Une récurrente dont la date change passe par moveRecurring, pas par updateTask.
        val moveDate = dueDate.takeIf { task.isRecurring && dateChanged }
        val due = when {
            dateChanged && dueDate == null -> TaskChange(clearDue = true)
            moveDate != null -> TaskChange(dueTime = if (timeChanged) dueTime?.let(::wireTime) else null)
            dateChanged || timeChanged -> TaskChange(dueDate = dueDate, dueTime = dueTime?.let(::wireTime))
            else -> TaskChange()
        }
        val change = TaskChange(
            name = name.trim().takeIf { it != task.name },
            note = note.trim().takeIf { it != task.note.orEmpty() },
            priority = priority.takeIf { it != task.priority },
            status = status.takeIf { it != task.status },
            projectUid = projectUid.takeIf { it != task.projectUid },
            clearProject = projectUid == null && task.projectUid != null,
            tagUids = tagUids.toList().takeIf { tagUids != task.tagUids.toSet() },
        )
        return EditResult(
            change = change.copy(dueDate = due.dueDate, dueTime = due.dueTime, clearDue = due.clearDue),
            moveDate = moveDate,
        )
    }
}

internal class EditResult(val change: TaskChange, val moveDate: LocalDate?)
