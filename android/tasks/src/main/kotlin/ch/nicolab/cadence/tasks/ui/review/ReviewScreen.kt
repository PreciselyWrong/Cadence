@file:OptIn(ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui.review

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.CallSplit
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.EventNote
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.PauseCircle
import androidx.compose.material.icons.outlined.Today
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import ch.nicolab.cadence.designsystem.components.ActionRow
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.EmptyState
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.ScreenHeader
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.components.SectionHeader
import ch.nicolab.cadence.designsystem.components.TabPill
import ch.nicolab.cadence.designsystem.components.TabPills
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.components.rememberAppSnackbarHostState
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.Decision
import ch.nicolab.cadence.tasks.model.FunnelStage
import ch.nicolab.cadence.tasks.review.ProjectReason
import ch.nicolab.cadence.tasks.review.ReviewInboxItem
import ch.nicolab.cadence.tasks.review.ReviewProject
import ch.nicolab.cadence.tasks.review.ReviewStep
import ch.nicolab.cadence.tasks.review.ReviewTask
import ch.nicolab.cadence.tasks.review.WeekCapacity
import ch.nicolab.cadence.tasks.ui.ChoiceCard
import ch.nicolab.cadence.tasks.ui.TaskDatePickerDialog
import ch.nicolab.cadence.tasks.ui.ThisOrThatSheet
import ch.nicolab.cadence.tasks.ui.TaskDetailSheet
import ch.nicolab.cadence.tasks.ui.TasksViewModel
import ch.nicolab.cadence.tasks.ui.formatReviewDay
import ch.nicolab.cadence.tasks.ui.funnelIcon
import java.time.LocalDate
import java.time.ZoneId

/** Ligne ouverte par « Décider », avec la liste où elle figure. */
private sealed interface Deciding {
    data class Task(val item: ReviewTask, val step: ReviewStep, val committed: Boolean = false) : Deciding
    data class Inbox(val item: ReviewInboxItem) : Deciding
    data class Project(val item: ReviewProject) : Deciding
}

private class Choice(val icon: ImageVector, val label: Int, val danger: Boolean = false, val run: () -> Unit)

/**
 * Revue, ouverte depuis le Bilan : six étapes, une à la fois, l'étape gardée entre deux sessions.
 * Un bouton « Décider » par ligne ; chaque décision est enregistrée seule, une revue interrompue
 * reprend donc là où elle était. Aucune notification, aucun rappel.
 */
@Composable
fun ReviewScreen(onBack: () -> Unit, onOpenProject: (String) -> Unit) {
    val viewModel: ReviewViewModel = viewModel()
    val tasksViewModel: TasksViewModel = viewModel()
    val step by viewModel.step.collectAsStateWithLifecycle()
    val summary by viewModel.summary.collectAsStateWithLifecycle()
    val content by viewModel.content.collectAsStateWithLifecycle()
    val busy by viewModel.busy.collectAsStateWithLifecycle()
    val routineMissing by viewModel.routineMissing.collectAsStateWithLifecycle()
    val snackbar = rememberAppSnackbarHostState()
    var deciding by remember { mutableStateOf<Deciding?>(null) }
    var openTaskUid by rememberSaveable { mutableStateOf<String?>(null) }
    var choosing by remember { mutableStateOf<List<ReviewTask>?>(null) }
    var settingCapacity by remember { mutableStateOf<Int?>(null) }
    var settingCapacityOpen by remember { mutableStateOf(false) }
    val palette = cadence

    LaunchedEffect(viewModel) { viewModel.messages.collect { snackbar.showSnackbar(it) } }
    BackHandler(enabled = openTaskUid == null, onBack = onBack)

    val counts = summary?.value?.counts
    val subtitle = summary?.value?.let {
        pluralStringResource(R.plurals.review_attention, it.attentionTotal, it.attentionTotal) + " · " +
            pluralStringResource(R.plurals.review_decided, it.decidedThisWeek, it.decidedThisWeek)
    }

    Surface(Modifier.fillMaxSize(), color = palette.background, contentColor = palette.onSurface) {
        Column(Modifier.fillMaxSize().statusBarsPadding()) {
            Box(Modifier.padding(horizontal = Space.gutter)) {
                ScreenHeader(
                    title = stringResource(R.string.review_title),
                    subtitle = subtitle,
                    onBack = onBack,
                    backDescription = stringResource(R.string.review_back),
                )
            }
            if (routineMissing) {
                TertiaryAction(
                    stringResource(R.string.review_routine_plan),
                    modifier = Modifier.padding(horizontal = Space.gutter),
                    onClick = viewModel::planRoutine,
                )
            }
            TabPills(
                tabs = ReviewStep.entries.map { TabPill(stringResource(stepLabel(it)), counts?.of(it)) },
                selected = step.ordinal,
                onSelect = { viewModel.select(ReviewStep.entries[it]) },
            )
            LazyColumn(
                Modifier.weight(1f),
                contentPadding = PaddingValues(start = Space.gutter, end = Space.gutter, top = Space.md, bottom = Space.xxxl),
                verticalArrangement = Arrangement.spacedBy(Space.sm),
            ) {
                offlineLine(content)
                when (val current = content) {
                    StepContent.Loading -> Unit
                    StepContent.Unavailable -> item(key = "unavailable") {
                        EmptyState(
                            icon = Icons.Outlined.CloudOff,
                            title = stringResource(R.string.review_unavailable_title),
                            message = stringResource(R.string.review_unavailable),
                            action = { SecondaryAction(stringResource(R.string.review_retry), onClick = viewModel::load) },
                        )
                    }
                    is StepContent.Tasks -> {
                        if (current.page.items.isEmpty()) emptyStep(step)
                        items(current.page.items, key = { it.uid }) { item ->
                            ReviewRow(
                                title = item.name,
                                meta = taskMeta(item, step),
                                busy = busy == item.uid,
                                onOpen = { openTaskUid = item.uid },
                                onDecide = { deciding = Deciding.Task(item, step) },
                            )
                        }
                        moreOnWeb(current.page.total, current.page.items.size)
                    }
                    is StepContent.Inbox -> {
                        if (current.page.items.isEmpty()) emptyStep(step)
                        items(current.page.items, key = { it.uid }) { item ->
                            ReviewRow(
                                title = item.text,
                                meta = item.createdAt?.let {
                                    stringResource(R.string.review_captured_on, formatReviewDay(it.atZone(ZoneId.systemDefault()).toLocalDate()))
                                },
                                busy = busy == "inbox:${item.uid}",
                                onDecide = { deciding = Deciding.Inbox(item) },
                            )
                        }
                        moreOnWeb(current.page.total, current.page.items.size)
                    }
                    is StepContent.Projects -> {
                        if (current.page.items.isEmpty()) emptyStep(step)
                        items(current.page.items, key = { it.uid }) { item ->
                            ReviewRow(
                                title = item.name,
                                meta = item.reasons.map { stringResource(reasonLabel(it)) }.joinToString(" · "),
                                busy = busy == "project:${item.uid}",
                                onOpen = { onOpenProject(item.uid) },
                                onDecide = { deciding = Deciding.Project(item) },
                            )
                        }
                    }
                    is StepContent.Week -> {
                        val week = current.week
                        item(key = "capacity") {
                            CapacityPanel(
                                planned = week.plannedMinutes,
                                capacity = week.capacityMinutes,
                                unestimated = week.unestimated,
                                onSet = {
                                    settingCapacity = week.capacityMinutes
                                    settingCapacityOpen = true
                                },
                            )
                        }
                        val choices = week.committed + week.inView
                        if (choices.size >= 2) {
                            item(key = "choose") {
                                SecondaryAction(
                                    stringResource(R.string.choose_open),
                                    modifier = Modifier.fillMaxWidth(),
                                    onClick = { choosing = choices },
                                )
                            }
                        }
                        if (choices.isEmpty()) emptyStep(step)
                        if (week.committed.isNotEmpty()) {
                            item(key = "committed-header") {
                                SectionHeader(title = stringResource(R.string.review_week_committed), count = week.committed.size)
                            }
                            items(week.committed, key = { "c:${it.uid}" }) { item ->
                                ReviewRow(
                                    title = item.name,
                                    meta = listOfNotNull(item.projectName, item.estimatedMinutes?.let(::estimateText)).joinToString(" · "),
                                    busy = busy == item.uid,
                                    onOpen = { openTaskUid = item.uid },
                                    onDecide = { deciding = Deciding.Task(item, step, committed = true) },
                                )
                            }
                        }
                        if (week.inView.isNotEmpty()) {
                            item(key = "view-header") {
                                SectionHeader(title = stringResource(R.string.review_week_in_view), count = week.inView.size)
                            }
                            items(week.inView, key = { "v:${it.uid}" }) { item ->
                                ReviewRow(
                                    title = item.name,
                                    meta = listOfNotNull(item.projectName, item.estimatedMinutes?.let(::estimateText)).joinToString(" · "),
                                    busy = busy == item.uid,
                                    onOpen = { openTaskUid = item.uid },
                                    onDecide = { deciding = Deciding.Task(item, step, committed = false) },
                                )
                            }
                        }
                    }
                }
                step.next?.let { next ->
                    item(key = "next") {
                        TertiaryAction(
                            stringResource(R.string.review_next, stringResource(stepLabel(next))),
                            modifier = Modifier.fillMaxWidth().padding(top = Space.md),
                            onClick = { viewModel.select(next) },
                        )
                    }
                }
            }
        }
    }

    deciding?.let { open ->
        DecisionSheet(
            open = open,
            viewModel = viewModel,
            onOpenTask = { openTaskUid = it },
            onOpenProject = onOpenProject,
            dismiss = { deciding = null },
        )
    }
    choosing?.let { list ->
        val byUid = remember(list) { list.associateBy { it.uid } }
        ThisOrThatSheet(
            cards = list.map { ChoiceCard(it.uid, it.name, listOfNotNull(it.projectName, it.estimatedMinutes?.let(::estimateText)).joinToString(" · ")) },
            onChoose = { uid -> byUid[uid]?.let(viewModel::chooseToday); choosing = null },
            dismiss = { choosing = null },
        )
    }
    if (settingCapacityOpen) {
        CapacitySheet(
            current = settingCapacity,
            onPick = { viewModel.saveCapacity(it); settingCapacityOpen = false },
            dismiss = { settingCapacityOpen = false },
        )
    }
    openTaskUid?.let { uid ->
        TaskDetailSheet(taskUid = uid, viewModel = tasksViewModel, onDismiss = { openTaskUid = null })
    }
}

private fun LazyListScope.offlineLine(content: StepContent) {
    val fetchedAt = when (content) {
        is StepContent.Tasks -> content.fetchedAt.takeIf { content.fromCache }
        is StepContent.Inbox -> content.fetchedAt.takeIf { content.fromCache }
        is StepContent.Projects -> content.fetchedAt.takeIf { content.fromCache }
        is StepContent.Week -> content.fetchedAt.takeIf { content.fromCache }
        else -> null
    } ?: return
    item(key = "offline") {
        val palette = cadence
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.CloudOff, null, tint = palette.outline, modifier = Modifier.size(Size.iconSm))
            Spacer(Modifier.width(Space.sm))
            Text(
                stringResource(R.string.review_offline, formatReviewDay(fetchedAt.atZone(ZoneId.systemDefault()).toLocalDate())),
                style = MaterialTheme.typography.labelMedium,
                color = palette.outline,
            )
        }
    }
}

private fun LazyListScope.emptyStep(step: ReviewStep) {
    item(key = "empty") {
        Text(
            stringResource(emptyLabel(step)),
            style = MaterialTheme.typography.bodyMedium,
            color = cadence.onSurfaceVariant,
            modifier = Modifier.padding(vertical = Space.lg),
        )
    }
}

private fun LazyListScope.moreOnWeb(total: Int, shown: Int) {
    if (total <= shown) return
    item(key = "more") {
        Text(
            stringResource(R.string.review_more, total - shown),
            style = MaterialTheme.typography.labelMedium,
            color = cadence.outline,
        )
    }
}

/** Une ligne de revue : titre, contexte neutre, et le bouton « Décider » toujours visible. */
@Composable
private fun ReviewRow(
    title: String,
    meta: String?,
    busy: Boolean,
    onDecide: () -> Unit,
    onOpen: (() -> Unit)? = null,
) {
    val palette = cadence
    Panel(onClick = onOpen) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.bodyLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (!meta.isNullOrBlank()) {
                    Text(meta, style = MaterialTheme.typography.labelMedium, color = palette.onSurfaceVariant, maxLines = 2)
                }
            }
            Spacer(Modifier.width(Space.md))
            DecideButton(enabled = !busy, onClick = onDecide)
        }
    }
}

@Composable
private fun DecideButton(enabled: Boolean, onClick: () -> Unit) {
    val palette = cadence
    Row(
        Modifier
            .heightIn(min = Size.control)
            .background(palette.containerHigh, Radius.Chip)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = Space.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            stringResource(R.string.review_decide),
            style = MaterialTheme.typography.labelLarge,
            color = if (enabled) palette.onSurface else palette.outline,
        )
        Spacer(Modifier.width(Space.xs))
        Icon(Icons.Outlined.ExpandMore, null, tint = palette.onSurfaceVariant, modifier = Modifier.size(Size.iconSm))
    }
}

@Composable
private fun CapacityPanel(planned: Int, capacity: Int?, unestimated: Int, onSet: () -> Unit) {
    val palette = cadence
    Panel {
        Column(verticalArrangement = Arrangement.spacedBy(Space.xs)) {
            Text(
                WeekCapacity.line(planned, capacity),
                style = MaterialTheme.typography.titleMedium,
                color = if (WeekCapacity.over(planned, capacity)) palette.warning else palette.onSurface,
            )
            if (unestimated > 0) {
                Text(
                    pluralStringResource(R.plurals.review_week_unestimated, unestimated, unestimated),
                    style = MaterialTheme.typography.labelMedium,
                    color = palette.onSurfaceVariant,
                )
            }
            TertiaryAction(stringResource(R.string.review_capacity_set), onClick = onSet)
        }
    }
}

@Composable
private fun CapacitySheet(current: Int?, onPick: (Int?) -> Unit, dismiss: () -> Unit) {
    CadenceSheet(title = stringResource(R.string.review_capacity_title), subtitle = null, dismiss = dismiss) {
        Column(verticalArrangement = Arrangement.spacedBy(Space.xs)) {
            (WeekCapacity.presets.map { it as Int? } + null).forEach { minutes ->
                val label = minutes?.let(::estimateText) ?: stringResource(R.string.review_capacity_none)
                ActionRow(
                    icon = if (minutes == current) Icons.Outlined.Check else Icons.Outlined.Today,
                    label = label,
                    tint = if (minutes == current) cadence.primary else cadence.onSurfaceVariant,
                ) { onPick(minutes) }
            }
        }
    }
}

@Composable
private fun DecisionSheet(
    open: Deciding,
    viewModel: ReviewViewModel,
    onOpenTask: (String) -> Unit,
    onOpenProject: (String) -> Unit,
    dismiss: () -> Unit,
) {
    var pickingDate by remember { mutableStateOf(false) }
    var nextTask by remember { mutableStateOf<String?>(null) }
    val title = when (open) {
        is Deciding.Task -> open.item.name
        is Deciding.Inbox -> open.item.text
        is Deciding.Project -> open.item.name
    }
    fun task(decision: Decision) = { (open as Deciding.Task).let { viewModel.decide(it.item, decision) }; dismiss() }
    val choices: List<Choice> = when (open) {
        is Deciding.Task -> when {
            open.step == ReviewStep.PUSHED -> listOf(
                Choice(Icons.Outlined.Today, R.string.review_action_today, run = task(Decision.Today)),
                Choice(Icons.Outlined.CallSplit, R.string.review_action_split) { dismiss(); onOpenTask(open.item.uid) },
                Choice(funnelIcon(FunnelStage.LATER), R.string.review_action_later, run = task(Decision.Later)),
                Choice(Icons.Outlined.Block, R.string.review_action_drop, danger = true, run = task(Decision.Drop)),
                Choice(Icons.Outlined.Check, R.string.review_action_keep, run = task(Decision.Keep)),
            )
            open.step == ReviewStep.LATER -> listOf(
                Choice(Icons.Outlined.EventNote, R.string.review_action_review30, run = task(Decision.ReviewIn30Days)),
                Choice(Icons.Outlined.EventNote, R.string.review_action_review_on) { pickingDate = true },
                Choice(funnelIcon(FunnelStage.IN_VIEW), R.string.review_action_in_view, run = task(Decision.InView)),
                Choice(funnelIcon(FunnelStage.THIS_WEEK), R.string.review_action_this_week, run = task(Decision.ThisWeek)),
                Choice(Icons.Outlined.Check, R.string.review_action_keep_parked, run = task(Decision.KeepParked)),
                Choice(Icons.Outlined.Block, R.string.review_action_drop, danger = true, run = task(Decision.Drop)),
            )
            open.step == ReviewStep.WEEK && open.committed -> listOf(
                Choice(Icons.Outlined.Today, R.string.review_action_today, run = task(Decision.Today)),
                Choice(Icons.Outlined.VisibilityOff, R.string.review_action_not_this_week, run = task(Decision.NotThisWeek)),
                Choice(funnelIcon(FunnelStage.LATER), R.string.review_action_later, run = task(Decision.Later)),
            )
            open.step == ReviewStep.WEEK -> listOf(
                Choice(funnelIcon(FunnelStage.THIS_WEEK), R.string.review_action_this_week, run = task(Decision.ThisWeek)),
                Choice(Icons.Outlined.VisibilityOff, R.string.review_action_out_of_view, run = task(Decision.OutOfView)),
                Choice(funnelIcon(FunnelStage.LATER), R.string.review_action_later, run = task(Decision.Later)),
            )
            else -> listOf(
                Choice(funnelIcon(FunnelStage.THIS_WEEK), R.string.review_action_this_week, run = task(Decision.ThisWeek)),
                Choice(funnelIcon(FunnelStage.IN_VIEW), R.string.review_action_in_view, run = task(Decision.InView)),
                Choice(funnelIcon(FunnelStage.LATER), R.string.review_action_later, run = task(Decision.Later)),
                Choice(Icons.Outlined.Check, R.string.review_action_keep, run = task(Decision.Keep)),
                Choice(Icons.Outlined.Block, R.string.review_action_drop, danger = true, run = task(Decision.Drop)),
            )
        }
        is Deciding.Inbox -> listOf(
            Choice(Icons.Outlined.Add, R.string.review_action_to_task) { viewModel.toTask(open.item, null); dismiss() },
            Choice(funnelIcon(FunnelStage.THIS_WEEK), R.string.review_action_this_week) { viewModel.toTask(open.item, Decision.ThisWeek); dismiss() },
            Choice(funnelIcon(FunnelStage.LATER), R.string.review_action_park) { viewModel.toTask(open.item, Decision.Later); dismiss() },
            Choice(Icons.Outlined.Delete, R.string.review_action_discard, danger = true) { viewModel.discard(open.item); dismiss() },
        )
        is Deciding.Project -> listOf(
            Choice(Icons.Outlined.Add, R.string.review_action_next_task) { nextTask = "" },
            Choice(Icons.Outlined.Folder, R.string.review_action_open_project) { dismiss(); onOpenProject(open.item.uid) },
            Choice(Icons.Outlined.PauseCircle, R.string.review_action_hold) { viewModel.holdProject(open.item); dismiss() },
            Choice(Icons.Outlined.Check, R.string.review_action_keep) { viewModel.keepProject(open.item); dismiss() },
        )
    }
    val palette = cadence
    CadenceSheet(title = title, subtitle = null, dismiss = dismiss) {
        val pending = nextTask
        if (pending != null && open is Deciding.Project) {
            Column(verticalArrangement = Arrangement.spacedBy(Space.md)) {
                CadenceField(
                    value = pending,
                    onValue = { nextTask = it },
                    label = stringResource(R.string.review_next_task_hint),
                )
                PrimaryAction(
                    stringResource(R.string.review_next_task_add),
                    modifier = Modifier.fillMaxWidth(),
                    enabled = pending.isNotBlank(),
                ) {
                    viewModel.addNextTask(open.item, pending)
                    dismiss()
                }
            }
        } else {
            Column(Modifier.navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                choices.forEach { choice ->
                    ActionRow(choice.icon, stringResource(choice.label), if (choice.danger) palette.error else palette.primary, choice.run)
                }
            }
        }
    }
    if (pickingDate && open is Deciding.Task) {
        TaskDatePickerDialog(
            initial = open.item.reviewOn ?: LocalDate.now().plusDays(30),
            onConfirm = {
                pickingDate = false
                viewModel.decide(open.item, Decision.ReviewOn(it))
                dismiss()
            },
            onDismiss = { pickingDate = false },
        )
    }
}

private fun stepLabel(step: ReviewStep): Int = when (step) {
    ReviewStep.UNDECIDED -> R.string.review_step_undecided
    ReviewStep.PUSHED -> R.string.review_step_pushed
    ReviewStep.PROJECTS -> R.string.review_step_projects
    ReviewStep.LATER -> R.string.review_step_later
    ReviewStep.STALE -> R.string.review_step_stale
    ReviewStep.WEEK -> R.string.review_step_week
}

private fun emptyLabel(step: ReviewStep): Int = when (step) {
    ReviewStep.UNDECIDED -> R.string.review_empty_undecided
    ReviewStep.PUSHED -> R.string.review_empty_pushed
    ReviewStep.PROJECTS -> R.string.review_empty_projects
    ReviewStep.LATER -> R.string.review_empty_later
    ReviewStep.STALE -> R.string.review_empty_stale
    ReviewStep.WEEK -> R.string.review_empty_week
}

private fun reasonLabel(reason: ProjectReason): Int = when (reason) {
    ProjectReason.NO_NEXT_ACTION -> R.string.review_reason_no_next_action
    ProjectReason.QUIET -> R.string.review_reason_quiet
    ProjectReason.PUSHED_TASKS -> R.string.review_reason_pushed_tasks
}

@Composable
private fun taskMeta(item: ReviewTask, step: ReviewStep): String {
    val parts = mutableListOf<String>()
    item.projectName?.let(parts::add)
    when (step) {
        ReviewStep.PUSHED -> item.push?.let { push ->
            parts += pluralStringResource(R.plurals.review_pushed_meta, push.recentCount, push.recentCount)
            push.lastPlannedFor?.let { parts += stringResource(R.string.review_planned_for, formatReviewDay(it)) }
        }
        ReviewStep.LATER -> when {
            item.reviewDue -> parts += stringResource(R.string.review_due_now)
            item.reviewOn != null -> parts += stringResource(R.string.review_due_on, formatReviewDay(item.reviewOn))
        }
        ReviewStep.STALE -> item.lastActivityAt?.let {
            parts += stringResource(R.string.review_unchanged_since, formatReviewDay(it.atZone(ZoneId.systemDefault()).toLocalDate()))
        }
        else -> Unit
    }
    return parts.joinToString(" · ")
}

private fun estimateText(minutes: Int): String = ch.nicolab.cadence.tasks.planning.formatMinutes(minutes)
