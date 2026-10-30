@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.TaskDraft
import java.time.LocalDate
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions

/**
 * Ajout rapide d'une tâche, réutilisable par d'autres écrans (ex. l'activité du widget).
 * Sans [onSave], la tâche est créée directement ; [onSave] permet de la transformer
 * (ex. convertir une entrée de la boîte de réception).
 */
@Composable
fun QuickAddSheet(
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    initialName: String = "",
    onSave: ((TaskDraft) -> Unit)? = null,
) {
    val viewModel: TasksViewModel = viewModel()
    val projects by viewModel.projects.collectAsStateWithLifecycle()
    val moment by viewModel.moment.collectAsStateWithLifecycle()
    val today = moment.today
    val tomorrow = today.plusDays(1)

    var name by rememberSaveable { mutableStateOf(initialName) }
    var due by remember { mutableStateOf<LocalDate?>(null) }
    var priority by rememberSaveable { mutableStateOf<Int?>(null) }
    var projectUid by rememberSaveable { mutableStateOf<String?>(null) }
    var pickingDate by remember { mutableStateOf(false) }
    val focus = remember { FocusRequester() }

    LaunchedEffect(Unit) { focus.requestFocus() }

    fun save() {
        val trimmed = name.trim()
        if (trimmed.isEmpty()) return
        val draft = TaskDraft(name = trimmed, dueDate = due, priority = priority, projectUid = projectUid)
        (onSave ?: viewModel::createTask)(draft)
        onDismiss()
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        modifier = modifier,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = stringResource(R.string.tasks_quick_title),
                style = MaterialTheme.typography.titleMedium,
            )
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text(stringResource(R.string.tasks_field_name)) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { save() }),
                modifier = Modifier.fillMaxWidth().focusRequester(focus),
            )
            FieldLabel(R.string.tasks_field_due)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(
                    selected = due == null,
                    onClick = { due = null },
                    label = { Text(stringResource(R.string.tasks_no_due_date)) },
                )
                FilterChip(
                    selected = due == today,
                    onClick = { due = today },
                    label = { Text(stringResource(R.string.tasks_day_today)) },
                )
                FilterChip(
                    selected = due == tomorrow,
                    onClick = { due = tomorrow },
                    label = { Text(stringResource(R.string.tasks_day_tomorrow)) },
                )
                val custom = due != null && due != today && due != tomorrow
                FilterChip(
                    selected = custom,
                    onClick = { pickingDate = true },
                    label = {
                        Text(due?.takeIf { custom }?.let { dayLabel(it, today) }
                            ?: stringResource(R.string.tasks_chip_custom_date))
                    },
                )
            }
            FieldLabel(R.string.tasks_field_priority)
            PrioritySelector(selected = priority, onSelect = { priority = it }, allowNone = true)
            FieldLabel(R.string.tasks_field_project)
            ProjectDropdown(projects = projects, selectedUid = projectUid, onSelect = { projectUid = it })
            Button(
                onClick = { save() },
                enabled = name.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            ) { Text(stringResource(R.string.tasks_add)) }
        }
    }

    if (pickingDate) {
        TaskDatePickerDialog(
            initial = due ?: today,
            onConfirm = {
                due = it
                pickingDate = false
            },
            onDismiss = { pickingDate = false },
        )
    }
}
