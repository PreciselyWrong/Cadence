@file:OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AddTask
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
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
import ch.nicolab.cadence.tasks.model.Goals
import ch.nicolab.cadence.tasks.model.TaskItem

/**
 * Feuilles d'un but : sa modification ([goalUid]), et l'ajout rapide d'une tâche liée ([stepFor]) prérempli de son
 * nom. Le but reste : c'est le rêve, la tâche le prochain pas.
 */
@Composable
internal fun GoalSheets(
    viewModel: TasksViewModel,
    goalUid: String?,
    stepFor: String?,
    onOpenTask: (String) -> Unit,
    onClose: () -> Unit,
    onCreateStep: (String) -> Unit,
) {
    val goals by viewModel.goals.collectAsStateWithLifecycle()
    val overview by viewModel.goalOverview.collectAsStateWithLifecycle()
    val tasks by viewModel.everyTask.collectAsStateWithLifecycle()
    val goal = goalUid?.let { uid -> goals.firstOrNull { it.uid == uid } }
    if (goal != null && stepFor == null) {
        val uids = setOf(goal.uid) + goals.filter { it.parentGoalUid == goal.uid }.map { it.uid }
        GoalEditSheet(
            goal = goal,
            nextStep = Goals.nextStep(uids, tasks),
            linkedTasks = overview?.linkedTasks?.get(goal.uid) ?: 0,
            onSave = { change ->
                viewModel.updateGoal(goal.uid, change)
                onClose()
            },
            onCreateTask = { onCreateStep(goal.uid) },
            onOpenTask = {
                onClose()
                onOpenTask(it)
            },
            onDelete = {
                viewModel.deleteGoalWithUndo(goal)
                onClose()
            },
            onDismiss = onClose,
        )
    }
    stepFor?.let { uid ->
        QuickAddSheet(
            onDismiss = onClose,
            initialName = goals.firstOrNull { it.uid == uid }?.title.orEmpty(),
            onSave = { draft ->
                viewModel.createTaskForGoal(uid, draft)
                onClose()
            },
        )
    }
}

/**
 * Feuille d'un but : d'abord ce qui fait avancer (prochain pas, « Créer une tâche »), puis nom, note, type (envie)
 * et état, enfin la suppression.
 */
@Composable
private fun GoalEditSheet(
    goal: GoalItem,
    nextStep: TaskItem?,
    linkedTasks: Int,
    onSave: (GoalChange) -> Unit,
    onCreateTask: () -> Unit,
    onOpenTask: (String) -> Unit,
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
        nextStep?.let { step ->
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(Radius.Control)
                    .background(palette.containerHigh)
                    .clickable { onOpenTask(step.uid) }
                    .padding(horizontal = Space.lg, vertical = Space.md),
            ) {
                Text(stringResource(R.string.goals_step_label), style = MaterialTheme.typography.labelMedium, color = palette.outline)
                Text(step.name, style = MaterialTheme.typography.bodyLarge, color = palette.onSurface, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            Spacer(Modifier.height(Space.sm))
        }
        ActionRow(Icons.Outlined.AddTask, stringResource(R.string.goals_create_task), palette.primary, onCreateTask)
        Spacer(Modifier.height(Space.md))
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
                FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                    GoalBucket.entries.forEach { option ->
                        ChoiceChip(label = stringResource(bucketLabel(option)), selected = bucket == option, onClick = { bucket = option })
                    }
                }
            }
        }
        Spacer(Modifier.height(Space.md))
        FieldGroup(stringResource(R.string.goals_edit_status)) {
            FlowRow(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Space.sm),
                verticalArrangement = Arrangement.spacedBy(Space.sm),
            ) {
                GoalStatus.entries.forEach { option ->
                    ChoiceChip(label = stringResource(goalStatusLabel(option, goal.isWish)), selected = status == option, onClick = { status = option })
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
        ActionRow(Icons.Outlined.Delete, stringResource(R.string.goals_edit_delete), palette.error, onDelete)
        Spacer(Modifier.height(Space.lg))
    }
}

/**
 * Ajout d'envies à la suite : un nom, son groupe, « Ajouter ». La feuille reste ouverte et le champ se vide, pour en
 * noter plusieurs d'affilée ; la dernière ajoutée est rappelée sous le champ.
 */
@Composable
internal fun WishCaptureSheet(initialBucket: GoalBucket, onAdd: (String, GoalBucket) -> Unit, onDismiss: () -> Unit) {
    var name by rememberSaveable { mutableStateOf("") }
    var bucket by rememberSaveable { mutableStateOf(initialBucket) }
    var last by rememberSaveable { mutableStateOf<String?>(null) }
    val palette = cadence
    val add = {
        if (name.isNotBlank()) {
            onAdd(name, bucket)
            last = name.trim()
            name = ""
        }
    }
    CadenceSheet(title = stringResource(R.string.goals_wish_add), subtitle = null, dismiss = onDismiss) {
        CadenceField(
            value = name,
            onValue = { name = it },
            label = stringResource(R.string.goals_wish_name),
            placeholder = stringResource(R.string.goals_wish_name_hint),
            onDone = add,
            support = last?.let { stringResource(R.string.goals_wish_added, it, stringResource(bucketLabel(bucket))) },
        )
        Spacer(Modifier.height(Space.md))
        FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
            GoalBucket.entries.forEach { option ->
                ChoiceChip(label = stringResource(bucketLabel(option)), selected = bucket == option, onClick = { bucket = option })
            }
        }
        Spacer(Modifier.height(Space.lg))
        PrimaryAction(label = stringResource(R.string.goals_wish_add_action), enabled = name.isNotBlank(), onClick = add)
        Spacer(Modifier.height(Space.lg))
    }
}

/** Une envie s'accorde au féminin (« Active », « Réalisée », « Abandonnée ») ; un objectif est « Atteint ». */
private fun goalStatusLabel(status: GoalStatus, wish: Boolean): Int = when (status) {
    GoalStatus.ACTIVE -> if (wish) R.string.goals_status_wish_active else R.string.goals_status_active
    GoalStatus.ACHIEVED -> if (wish) R.string.goals_status_wish_done else R.string.goals_status_achieved
    GoalStatus.PAUSED -> R.string.goals_status_paused
    GoalStatus.DROPPED -> if (wish) R.string.goals_status_wish_dropped else R.string.goals_status_dropped
}
