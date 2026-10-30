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
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
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
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

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
    val scope = rememberCoroutineScope()
    val genericError = stringResource(R.string.tasks_error_generic)
    var saving by remember { mutableStateOf(false) }
    var saveError by remember { mutableStateOf<String?>(null) }
    var confirmDelete by remember { mutableStateOf(false) }
    var pickingDate by remember { mutableStateOf(false) }
    var pickingTime by remember { mutableStateOf(false) }
    var pickingStartDate by remember { mutableStateOf(false) }
    var pickingStartTime by remember { mutableStateOf(false) }
    var focusOpen by remember { mutableStateOf(false) }
    val notifications = rememberNotificationPermission()
    val hasReminder = current.reminderAt != null
    LaunchedEffect(hasReminder) {
        if (hasReminder) notifications.request()
    }

    // La fiche ne se ferme qu'après l'écriture : en cas d'échec, les modifications restent à l'écran.
    val save = {
        if (!saving) {
            val result = edit.result()
            saving = true
            saveError = null
            scope.launch {
                try {
                    if (result.change != TaskChange()) viewModel.saveChange(current.uid, result.change)
                    result.moveDate?.let { viewModel.askRecurringMove(current.uid, it) }
                    onDismiss()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    saveError = e.message ?: genericError
                    saving = false
                }
            }
        }
    }

    ModalBottomSheet(
        onDismissRequest = { if (!saving) onDismiss() },
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
            SubtasksCard(parentUid = current.uid, viewModel = viewModel)
            StartFields(
                edit = edit,
                onPickDate = { pickingStartDate = true },
                onPickTime = { pickingStartTime = true },
            )
            DueFields(
                edit = edit,
                onPickDate = { pickingDate = true },
                onPickTime = { pickingTime = true },
            )
            RepetitionFields(edit)
            EstimateFields(edit)
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
            ReadOnlyDetails(current)
            OutlinedButton(onClick = { focusOpen = true }, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.tasks_focus_open))
            }
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
            if (hasReminder && !notifications.allowed) {
                NotificationsOffNotice()
            }
            if (saving) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }
            saveError?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
            Button(
                onClick = save,
                enabled = edit.name.isNotBlank() && !saving,
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
    if (pickingStartDate) {
        TaskDatePickerDialog(
            initial = edit.startDate ?: LocalDate.now(),
            onConfirm = {
                edit.startDate = it
                pickingStartDate = false
            },
            onDismiss = { pickingStartDate = false },
        )
    }
    if (pickingStartTime) {
        TaskTimePickerDialog(
            initial = edit.startTime ?: LocalTime.of(9, 0),
            onConfirm = {
                edit.startTime = it
                pickingStartTime = false
            },
            onDismiss = { pickingStartTime = false },
        )
    }
    if (focusOpen) {
        FocusTimerSheet(taskUid = current.uid, taskName = current.name, onDismiss = { focusOpen = false })
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
    private val originalStart: LocalDate? = task.startDay
    private val originalStartTime: LocalTime? = task.startDate?.takeIf { task.startHasTime }?.let { instantTime(it, zone) }
    var startDate by mutableStateOf(originalStart)
    var startTime by mutableStateOf(originalStartTime)
    var estimate by mutableStateOf(task.estimatedMinutes)
    var repetition by mutableStateOf(task.repetition)

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
        val startDateChanged = startDate != originalStart
        val startTimeChanged = startTime != originalStartTime
        return EditResult(
            change = change.copy(
                dueDate = due.dueDate,
                dueTime = due.dueTime,
                clearDue = due.clearDue,
                clearStart = startDateChanged && startDate == null,
                startDate = startDate.takeIf { startDateChanged || startTimeChanged },
                startTime = startTime?.takeIf { startDate != null && (startDateChanged || startTimeChanged) }?.let(::wireTime),
                estimatedMinutes = estimate.takeIf { it != task.estimatedMinutes },
                clearEstimate = estimate == null && task.estimatedMinutes != null,
                repetition = repetition.takeIf { it != task.repetition },
            ),
            moveDate = moveDate,
        )
    }
}

internal class EditResult(val change: TaskChange, val moveDate: LocalDate?)
