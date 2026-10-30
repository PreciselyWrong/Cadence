@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.HourglassEmpty
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.Repeat
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Sell
import androidx.compose.material.icons.outlined.SkipNext
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material.icons.outlined.Timer
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.platform.LocalFocusManager
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.designsystem.components.ActionRow
import ch.nicolab.cadence.designsystem.components.BadgeTone
import ch.nicolab.cadence.designsystem.components.CadenceBadge
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.HeaderButtonStyle
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.RoundHeaderButton
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.components.SegmentedTabs
import ch.nicolab.cadence.designsystem.theme.Glass
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.EstimateFormat
import ch.nicolab.cadence.tasks.model.RepeatType
import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskPriority
import ch.nicolab.cadence.tasks.model.TaskStatus
import java.time.LocalDate
import java.time.LocalTime
import kotlinx.coroutines.delay

private const val AUTOSAVE_DELAY_MS = 700L
private const val MAX_TAG_BADGES = 2
private const val NO_PRIORITY = -1

private enum class Picker { Dates, Repeat, Estimate, Priority, Status, Tags, Project, Actions, Focus }

private enum class DateTab { Start, Due }

private val editableStatuses = listOf(
    TaskStatus.NOT_STARTED,
    TaskStatus.IN_PROGRESS,
    TaskStatus.PLANNED,
    TaskStatus.WAITING,
)

/** Dernier titre et dernière note envoyés : évite de réécrire deux fois le même texte (frappe puis fermeture). */
private class SentText(var name: String, var note: String)

/**
 * Fiche d'une tâche. Tout s'enregistre au fil des gestes : chaque sélecteur écrit son champ dès
 * qu'on choisit, le titre et la note partent après une courte pause et à la fermeture.
 */
@Composable
internal fun TaskDetailSheet(
    taskUid: String,
    viewModel: TasksViewModel,
    onDismiss: () -> Unit,
) {
    val task by viewModel.observeTask(taskUid).collectAsStateWithLifecycle(initialValue = null)
    val current = task ?: return
    val moment by viewModel.moment.collectAsStateWithLifecycle()
    val projects by viewModel.projects.collectAsStateWithLifecycle()
    val tags by viewModel.tags.collectAsStateWithLifecycle()
    val zone = moment.zone
    val today = moment.today
    val palette = cadence

    var title by remember(current.uid) { mutableStateOf(current.name) }
    var note by remember(current.uid) { mutableStateOf(current.note.orEmpty()) }
    val sent = remember(current.uid) { SentText(current.name, current.note.orEmpty()) }
    val latest by rememberUpdatedState(current)
    val flushText = {
        val baseline = latest.copy(name = sent.name, note = sent.note)
        val change = TaskEdits.text(baseline, title, note)
        if (change != TaskChange()) {
            change.name?.let { sent.name = it }
            change.note?.let { sent.note = it }
            viewModel.update(latest.uid, change)
        }
    }
    LaunchedEffect(title, note) {
        delay(AUTOSAVE_DELAY_MS)
        flushText()
    }
    DisposableEffect(current.uid) { onDispose { flushText() } }
    val close = {
        flushText()
        onDismiss()
    }

    var picker by remember { mutableStateOf<Picker?>(null) }
    var dateTab by remember { mutableStateOf(DateTab.Due) }
    var confirmDelete by remember { mutableStateOf(false) }
    val notifications = rememberNotificationPermission()
    val hasReminder = current.reminderAt != null
    LaunchedEffect(hasReminder) {
        if (hasReminder) notifications.request()
    }

    val dueTime = current.dueDate?.takeIf { current.dueHasTime }?.let { instantTime(it, zone) }
    val startTime = current.startDate?.takeIf { current.startHasTime }?.let { instantTime(it, zone) }
    val projectColors = rememberProjectColors(viewModel)
    val openDates = { tab: DateTab ->
        dateTab = tab
        picker = Picker.Dates
    }

    ModalBottomSheet(
        onDismissRequest = close,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = palette.background,
        contentColor = palette.onSurface,
        scrimColor = palette.scrim.copy(alpha = Glass.ScrimAlpha),
        dragHandle = null,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .fillMaxHeight()
                .navigationBarsPadding()
                .imePadding(),
        ) {
            DetailHeader(
                title = title,
                onTitleChange = { title = it },
                onBack = close,
                onFocusTimer = { picker = Picker.Focus },
                onMore = { picker = Picker.Actions },
            )
            Column(
                Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = Space.gutter),
                verticalArrangement = Arrangement.spacedBy(Space.md),
            ) {
                DetailBadges(
                    task = current,
                    today = today,
                    dueTime = dueTime,
                    projectName = projects.firstOrNull { it.uid == current.projectUid }?.name,
                    projectColor = current.projectUid?.let { projectColors[it] }?.let(::Color),
                    tagNames = tags.filter { it.uid in current.tagUids }.map { it.name },
                    onDates = { openDates(DateTab.Due) },
                    onPriority = { picker = Picker.Priority },
                    onProject = { picker = Picker.Project },
                    onStatus = { picker = Picker.Status },
                    onTags = { picker = Picker.Tags },
                    onRepeat = { picker = Picker.Repeat },
                )
                NoteCard(note = note, onNoteChange = { note = it })
                SubtasksCard(parentUid = current.uid, viewModel = viewModel)
                DetailFieldGroup(
                    detailFields(
                        task = current,
                        today = today,
                        dueTime = dueTime,
                        startTime = startTime,
                        projectName = projects.firstOrNull { it.uid == current.projectUid }?.name,
                        tagNames = tags.filter { it.uid in current.tagUids }.map { it.name },
                        onDates = { openDates(DateTab.Due) },
                        onRepeat = { picker = Picker.Repeat },
                        onEstimate = { picker = Picker.Estimate },
                        onPriority = { picker = Picker.Priority },
                        onStatus = { picker = Picker.Status },
                        onTags = { picker = Picker.Tags },
                        onProject = { picker = Picker.Project },
                    ),
                )
                if (hasReminder && !notifications.allowed) {
                    NotificationsOffNotice()
                }
                ReadOnlyDetails(current)
            }
            if (!WindowInsets.isImeVisible) {
                DetailActionBar(
                    closed = current.isClosed,
                    onPlan = { openDates(DateTab.Due) },
                    onToggle = {
                        flushText()
                        viewModel.toggle(current)
                        onDismiss()
                    },
                )
            }
        }
    }

    val applyDue = { date: LocalDate?, time: LocalTime? ->
        val result = TaskEdits.due(latest, date, time, zone)
        if (result.change != TaskChange()) viewModel.update(latest.uid, result.change)
        result.moveDate?.let { viewModel.askRecurringMove(latest.uid, it) }
    }
    val dismissPicker = { picker = null }
    when (picker) {
        Picker.Dates -> {
            val onStart = dateTab == DateTab.Start
            TaskDateSheet(
                title = stringResource(R.string.tasks_detail_dates),
                today = today,
                date = if (onStart) current.startDay else current.dueDay,
                time = if (onStart) startTime else dueTime,
                onApply = { date, time ->
                    if (onStart) {
                        val change = TaskEdits.start(latest, date, time, zone)
                        if (change != TaskChange()) viewModel.update(latest.uid, change)
                    } else {
                        applyDue(date, time)
                    }
                },
                onDismiss = dismissPicker,
                header = {
                    SegmentedTabs(
                        labels = listOf(
                            stringResource(R.string.tasks_detail_start),
                            stringResource(R.string.tasks_field_due),
                        ),
                        selected = if (onStart) 0 else 1,
                        onSelect = { dateTab = if (it == 0) DateTab.Start else DateTab.Due },
                    )
                },
            )
        }
        Picker.Repeat -> RepetitionSheet(
            current = current.repetition,
            hasDue = current.dueDay != null,
            onApply = { if (it != current.repetition) viewModel.update(current.uid, TaskChange(repetition = it)) },
            onDismiss = dismissPicker,
        )
        Picker.Estimate -> EstimateSheet(
            current = current.estimatedMinutes,
            onSelect = { viewModel.update(current.uid, TaskEdits.estimate(latest, it)) },
            onDismiss = dismissPicker,
        )
        Picker.Priority -> ChoiceSheet(
            title = stringResource(R.string.tasks_field_priority),
            choices = listOf(TaskPriority.LOW, TaskPriority.MEDIUM, TaskPriority.HIGH).map {
                SheetChoice(it, stringResource(priorityLabel(it)), priorityColor(it))
            },
            selected = current.priority ?: NO_PRIORITY,
            onSelect = { if (it != current.priority) viewModel.update(current.uid, TaskChange(priority = it)) },
            onDismiss = dismissPicker,
        )
        Picker.Status -> ChoiceSheet(
            title = stringResource(R.string.tasks_field_status),
            choices = editableStatuses.map { SheetChoice(it, stringResource(statusLabelRes(it))) },
            selected = current.status,
            onSelect = { if (it != current.status) viewModel.update(current.uid, TaskChange(status = it)) },
            onDismiss = dismissPicker,
        )
        Picker.Tags -> TagsSheet(
            tags = tags,
            selected = current.tagUids.toSet(),
            onChange = { viewModel.update(current.uid, TaskChange(tagUids = it.toList())) },
            onDismiss = dismissPicker,
        )
        Picker.Project -> ProjectSheet(
            projects = projects,
            selectedUid = current.projectUid,
            onSelect = { viewModel.update(current.uid, TaskEdits.project(latest, it)) },
            onDismiss = dismissPicker,
        )
        Picker.Actions -> CadenceSheet(
            title = stringResource(R.string.tasks_detail_actions_title),
            subtitle = null,
            dismiss = dismissPicker,
        ) {
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                if (current.isRecurring) {
                    ActionRow(Icons.Outlined.SkipNext, stringResource(R.string.tasks_action_skip), palette.primary) {
                        viewModel.skipOccurrence(current)
                        picker = null
                        onDismiss()
                    }
                }
                ActionRow(Icons.Outlined.Delete, stringResource(R.string.tasks_action_delete), palette.error) {
                    picker = null
                    confirmDelete = true
                }
            }
        }
        Picker.Focus -> FocusTimerSheet(taskUid = current.uid, taskName = current.name, onDismiss = dismissPicker)
        null -> Unit
    }
    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text(stringResource(R.string.tasks_delete_title)) },
            text = { Text(stringResource(R.string.tasks_delete_message)) },
            confirmButton = {
                TextButton(onClick = {
                    // Une tâche supprimée ne doit pas recevoir l'écriture du texte en attente.
                    sent.name = title.trim()
                    sent.note = note.trim()
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

private fun priorityLabel(priority: Int): Int = when (priority) {
    TaskPriority.HIGH -> R.string.tasks_priority_high
    TaskPriority.MEDIUM -> R.string.tasks_priority_medium
    else -> R.string.tasks_priority_low
}

@Composable
private fun DetailHeader(
    title: String,
    onTitleChange: (String) -> Unit,
    onBack: () -> Unit,
    onFocusTimer: () -> Unit,
    onMore: () -> Unit,
) {
    val palette = cadence
    val focus = LocalFocusManager.current
    Row(
        Modifier.fillMaxWidth().padding(horizontal = Space.sm, vertical = Space.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Space.xs),
    ) {
        RoundHeaderButton(
            icon = Icons.AutoMirrored.Outlined.ArrowBack,
            contentDescription = stringResource(R.string.tasks_detail_back),
            style = HeaderButtonStyle.Plain,
            onClick = onBack,
        )
        Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) {
                if (title.isEmpty()) {
                    Text(
                        stringResource(R.string.tasks_detail_title_hint),
                        style = MaterialTheme.typography.headlineSmall,
                        color = palette.outline,
                    )
                }
                BasicTextField(
                    value = title,
                    onValueChange = onTitleChange,
                    textStyle = MaterialTheme.typography.headlineSmall.copy(color = palette.onSurface),
                    cursorBrush = SolidColor(palette.primary),
                    maxLines = 2,
                    keyboardOptions = KeyboardOptions(
                        capitalization = KeyboardCapitalization.Sentences,
                        imeAction = ImeAction.Done,
                    ),
                    keyboardActions = KeyboardActions(onDone = { focus.clearFocus() }),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        RoundHeaderButton(
            icon = Icons.Outlined.Timer,
            contentDescription = stringResource(R.string.tasks_focus_open),
            onClick = onFocusTimer,
        )
        RoundHeaderButton(
            icon = Icons.Outlined.MoreVert,
            contentDescription = stringResource(R.string.tasks_detail_more),
            onClick = onMore,
        )
    }
}

@Composable
private fun DetailBadges(
    task: TaskItem,
    today: LocalDate,
    dueTime: LocalTime?,
    projectName: String?,
    projectColor: Color?,
    tagNames: List<String>,
    onDates: () -> Unit,
    onPriority: () -> Unit,
    onProject: () -> Unit,
    onStatus: () -> Unit,
    onTags: () -> Unit,
    onRepeat: () -> Unit,
) {
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(Space.sm),
        verticalArrangement = Arrangement.spacedBy(Space.sm),
    ) {
        task.dueDay?.let { due ->
            val overdue = due.isBefore(today) && !task.isClosed
            val text = compactDateTime(due, dueTime, today)
            TapBadge(onDates) {
                CadenceBadge(
                    text = if (overdue) stringResource(R.string.tasks_detail_overdue, text) else text,
                    tone = if (overdue) BadgeTone.Error else BadgeTone.Primary,
                    icon = Icons.Outlined.Schedule,
                )
            }
        }
        TapBadge(onPriority) {
            val priority = task.priority
            CadenceBadge(
                text = priority?.let { stringResource(priorityBadge(it)) } ?: stringResource(R.string.tasks_field_priority),
                tone = when (priority) {
                    TaskPriority.HIGH -> BadgeTone.Error
                    TaskPriority.MEDIUM -> BadgeTone.Warning
                    else -> BadgeTone.Neutral
                },
                icon = Icons.Outlined.Flag,
            )
        }
        projectName?.let {
            TapBadge(onProject) { CadenceBadge(text = it, tone = BadgeTone.Neutral, color = projectColor) }
        }
        if (task.isClosed) {
            CadenceBadge(text = stringResource(R.string.tasks_detail_done), tone = BadgeTone.Success)
        } else if (task.status != TaskStatus.NOT_STARTED) {
            TapBadge(onStatus) {
                CadenceBadge(text = stringResource(statusLabelRes(task.status)), tone = BadgeTone.Primary)
            }
        }
        if (task.isRecurring) {
            TapBadge(onRepeat) {
                CadenceBadge(text = stringResource(R.string.tasks_recurring), icon = Icons.Outlined.Repeat)
            }
        }
        tagNames.take(MAX_TAG_BADGES).forEach { name ->
            TapBadge(onTags) { CadenceBadge(text = "#$name") }
        }
        if (tagNames.size > MAX_TAG_BADGES) {
            TapBadge(onTags) {
                CadenceBadge(text = stringResource(R.string.tasks_detail_more_tags, tagNames.size - MAX_TAG_BADGES))
            }
        }
    }
}

@Composable
private fun TapBadge(onClick: () -> Unit, content: @Composable () -> Unit) {
    Box(
        Modifier.clip(Radius.Pill).clickable(role = Role.Button, onClick = onClick),
    ) { content() }
}

@Composable
private fun detailFields(
    task: TaskItem,
    today: LocalDate,
    dueTime: LocalTime?,
    startTime: LocalTime?,
    projectName: String?,
    tagNames: List<String>,
    onDates: () -> Unit,
    onRepeat: () -> Unit,
    onEstimate: () -> Unit,
    onPriority: () -> Unit,
    onStatus: () -> Unit,
    onTags: () -> Unit,
    onProject: () -> Unit,
): List<DetailField> {
    val due = task.dueDay?.let { compactDateTime(it, dueTime, today) }
    val start = task.startDay?.let { compactDateTime(it, startTime, today) }
    val dates = when {
        start != null && due != null -> "$start → $due"
        due != null -> due
        start != null -> stringResource(R.string.tasks_detail_starts, start)
        else -> stringResource(R.string.tasks_detail_dates_none)
    }
    val none = stringResource(R.string.tasks_detail_none)
    return listOf(
        DetailField(Icons.Outlined.CalendarMonth, stringResource(R.string.tasks_detail_dates), dates, onDates, due == null && start == null),
        DetailField(
            Icons.Outlined.Repeat,
            stringResource(R.string.tasks_field_repeat),
            repeatLabel(task.repetition),
            onRepeat,
            task.repetition.type == RepeatType.NONE,
        ),
        DetailField(
            Icons.Outlined.HourglassEmpty,
            stringResource(R.string.tasks_field_estimate),
            task.estimatedMinutes?.let(EstimateFormat::format) ?: none,
            onEstimate,
            task.estimatedMinutes == null,
        ),
        DetailField(
            Icons.Outlined.Flag,
            stringResource(R.string.tasks_field_priority),
            task.priority?.let { stringResource(priorityLabel(it)) } ?: stringResource(R.string.tasks_priority_none),
            onPriority,
            task.priority == null,
        ),
        DetailField(
            Icons.Outlined.TaskAlt,
            stringResource(R.string.tasks_field_status),
            stringResource(statusLabelRes(task.status)),
            onStatus,
        ),
        DetailField(
            Icons.Outlined.Sell,
            stringResource(R.string.tasks_field_tags),
            tagNames.takeIf { it.isNotEmpty() }?.joinToString(" ") { "#$it" } ?: none,
            onTags,
            tagNames.isEmpty(),
        ),
        DetailField(
            Icons.Outlined.Folder,
            stringResource(R.string.tasks_field_project),
            projectName ?: stringResource(R.string.tasks_no_project),
            onProject,
            projectName == null,
        ),
    )
}

/** Barre fixe du bas : planifier ou terminer, sans avoir à faire défiler la fiche. */
@Composable
private fun DetailActionBar(closed: Boolean, onPlan: () -> Unit, onToggle: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = Space.gutter, vertical = Space.md),
        horizontalArrangement = Arrangement.spacedBy(Space.md),
    ) {
        SecondaryAction(
            label = stringResource(R.string.tasks_detail_plan),
            modifier = Modifier.weight(1f),
            onClick = onPlan,
        )
        PrimaryAction(
            label = stringResource(if (closed) R.string.tasks_action_reopen else R.string.tasks_action_complete),
            modifier = Modifier.weight(1f),
            onClick = onToggle,
        )
    }
}
