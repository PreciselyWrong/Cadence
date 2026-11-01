@file:OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.designsystem.components.ActionRow
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.ChoiceChip
import ch.nicolab.cadence.designsystem.components.FieldGroup
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.GoalBucket
import ch.nicolab.cadence.tasks.model.GoalChange
import ch.nicolab.cadence.tasks.model.GoalItem
import ch.nicolab.cadence.tasks.model.GoalStatus

/**
 * Feuilles d'un but ouvert ([goalUid]) : sa modification, puis « Créer une tâche », qui ouvre l'ajout rapide
 * prérempli de son nom et lie la tâche au but. Le but reste : c'est le rêve, la tâche le prochain pas.
 */
@Composable
internal fun GoalSheets(viewModel: TasksViewModel, goalUid: String?, onClose: () -> Unit) {
    val goals by viewModel.goals.collectAsStateWithLifecycle()
    val overview by viewModel.goalOverview.collectAsStateWithLifecycle()
    var taskFor by rememberSaveable { mutableStateOf<String?>(null) }
    val goal = goalUid?.let { uid -> goals.firstOrNull { it.uid == uid } }
    if (goal != null && taskFor == null) {
        GoalEditSheet(
            goal = goal,
            linkedTasks = overview?.linkedTasks?.get(goal.uid) ?: 0,
            onSave = { change ->
                viewModel.updateGoal(goal.uid, change)
                onClose()
            },
            onCreateTask = { taskFor = goal.uid },
            onDelete = {
                viewModel.deleteGoalWithUndo(goal)
                onClose()
            },
            onDismiss = onClose,
        )
    }
    taskFor?.let { uid ->
        QuickAddSheet(
            onDismiss = {
                taskFor = null
                onClose()
            },
            initialName = goals.firstOrNull { it.uid == uid }?.title.orEmpty(),
            onSave = { draft ->
                viewModel.createTaskForGoal(uid, draft)
                taskFor = null
                onClose()
            },
        )
    }
}

/** Nom, note, type (pour une envie) et état d'un but, avec la création d'une tâche liée et la suppression. */
@Composable
private fun GoalEditSheet(
    goal: GoalItem,
    linkedTasks: Int,
    onSave: (GoalChange) -> Unit,
    onCreateTask: () -> Unit,
    onDelete: () -> Unit,
    onDismiss: () -> Unit,
) {
    var title by rememberSaveable(goal.uid) { mutableStateOf(goal.title) }
    var why by rememberSaveable(goal.uid) { mutableStateOf(goal.why.orEmpty()) }
    var bucket by rememberSaveable(goal.uid) { mutableStateOf(goal.bucket) }
    var status by rememberSaveable(goal.uid) { mutableStateOf(GoalStatus.fromWire(goal.status)) }
    val palette = cadence
    CadenceSheet(
        title = stringResource(if (goal.isWish) R.string.goals_edit_wish_title else R.string.goals_edit_title),
        subtitle = if (linkedTasks > 0) pluralStringResource(R.plurals.goals_linked_tasks, linkedTasks, linkedTasks) else null,
        dismiss = onDismiss,
    ) {
        CadenceField(value = title, onValue = { title = it }, label = stringResource(R.string.goals_edit_name))
        Spacer(Modifier.height(Space.md))
        FieldGroup(stringResource(R.string.goals_edit_why)) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .clip(Radius.Control)
                    .background(palette.containerHigh)
                    .padding(horizontal = Space.lg, vertical = Space.sm),
            ) {
                InlineTextField(
                    value = why,
                    onValueChange = { why = it },
                    placeholder = stringResource(R.string.goals_edit_why_hint),
                    modifier = Modifier.fillMaxWidth().heightIn(min = Size.touch),
                )
            }
        }
        if (goal.isWish) {
            Spacer(Modifier.height(Space.md))
            FieldGroup(stringResource(R.string.goals_edit_kind)) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                    GoalBucket.entries.forEach { option ->
                        ChoiceChip(label = stringResource(bucketLabel(option)), selected = bucket == option, onClick = { bucket = option })
                    }
                }
            }
        }
        Spacer(Modifier.height(Space.md))
        FieldGroup(stringResource(R.string.goals_edit_status)) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                GoalStatus.entries.forEach { option ->
                    ChoiceChip(label = stringResource(goalStatusLabel(option)), selected = status == option, onClick = { status = option })
                }
            }
        }
        Spacer(Modifier.height(Space.lg))
        PrimaryAction(
            label = stringResource(R.string.goals_edit_save),
            enabled = title.isNotBlank(),
            onClick = { onSave(GoalChange(title = title, why = why, bucket = bucket, status = status)) },
        )
        Spacer(Modifier.height(Space.md))
        ActionRow(Icons.Outlined.Add, stringResource(R.string.goals_create_task), palette.primary, onCreateTask)
        ActionRow(Icons.Outlined.Delete, stringResource(R.string.goals_edit_delete), palette.error, onDelete)
        Spacer(Modifier.height(Space.lg))
    }
}

private fun goalStatusLabel(status: GoalStatus): Int = when (status) {
    GoalStatus.ACTIVE -> R.string.goals_status_active
    GoalStatus.ACHIEVED -> R.string.goals_status_achieved
    GoalStatus.PAUSED -> R.string.goals_status_paused
    GoalStatus.DROPPED -> R.string.goals_status_dropped
}
