@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.HourglassEmpty
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material.icons.outlined.Repeat
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Sell
import androidx.compose.material.icons.outlined.Share
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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.designsystem.components.ActionRow
import ch.nicolab.cadence.designsystem.components.BadgeTone
import ch.nicolab.cadence.designsystem.components.CadenceBadge
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.ChoiceChip
import ch.nicolab.cadence.designsystem.components.HeaderButtonStyle
import ch.nicolab.cadence.designsystem.components.RoundHeaderButton
import ch.nicolab.cadence.designsystem.components.SegmentedTabs
import ch.nicolab.cadence.designsystem.components.TaskCheckbox
import ch.nicolab.cadence.designsystem.theme.Glass
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.DetailTitle
import ch.nicolab.cadence.tasks.model.EstimateFormat
import ch.nicolab.cadence.tasks.model.Funnel
import ch.nicolab.cadence.tasks.model.FunnelStage
import ch.nicolab.cadence.tasks.model.NextAction
import ch.nicolab.cadence.tasks.model.ProjectChoices
import ch.nicolab.cadence.tasks.model.RepeatType
import ch.nicolab.cadence.tasks.model.ShareText
import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskExtraRows
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskPriority
import ch.nicolab.cadence.tasks.model.TaskStatus
import ch.nicolab.cadence.tasks.model.TaskViews
import ch.nicolab.cadence.tasks.swipe.FileBackedActions
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
    val weekStart by viewModel.weekStart.collectAsStateWithLifecycle()
    val projects by viewModel.projects.collectAsStateWithLifecycle()
    val tags by viewModel.tags.collectAsStateWithLifecycle()
    val tagColors = remember(tags) { tagBadgeColorsByName(tags) }
    val zone = moment.zone
    val today = moment.today
    val palette = cadence
    val context = LocalContext.current

    var title by remember(current.uid) { mutableStateOf(current.name) }
    var note by remember(current.uid) { mutableStateOf(current.note.orEmpty()) }
    val sent = remember(current.uid) { SentText(current.name, current.note.orEmpty()) }
    val latest by rememberUpdatedState(current)
    // Une tâche de fichier TODO.md ne se modifie pas d'ici : rien n'est écrit, même par la fermeture.
    val readOnly = !FileBackedActions.canEdit(current)
    val flushText = flush@{
        if (!FileBackedActions.canEdit(latest)) return@flush
        val baseline = latest.copy(name = sent.name, note = sent.note)
        val change = TaskEdits.text(baseline, title, note)
        if (change != TaskChange()) {
            change.name?.let { sent.name = it }
            change.note?.let { sent.note = it }
            viewModel.edit(latest, change)
        }
    }
    // Une série demande sa portée à chaque enregistrement : le texte n'est donc proposé qu'à la fermeture.
    LaunchedEffect(title, note) {
        delay(AUTOSAVE_DELAY_MS)
        if (!latest.isRecurring) flushText()
    }
    DisposableEffect(current.uid) { onDispose { flushText() } }
    val close = {
        flushText()
        onDismiss()
    }

    var picker by remember { mutableStateOf<Picker?>(null) }
    var dateTab by remember { mutableStateOf(DateTab.Due) }
    var confirmDelete by remember { mutableStateOf(false) }
    // Une sous-tâche ouverte s'affiche par-dessus : sa fiche est une fiche de tâche comme une autre.
    var openedSubtask by rememberSaveable(current.uid) { mutableStateOf<String?>(null) }
    var moreFields by rememberSaveable(current.uid) { mutableStateOf(false) }
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
                readOnly = readOnly,
                closed = current.isClosed,
                highPriority = current.priority == TaskPriority.HIGH,
                // Terminer est la case, à côté du titre (comme une ligne) : plus de gros bouton pris pour « Enregistrer ».
                onToggle = {
                    flushText()
                    viewModel.toggle(current)
                    onDismiss()
                },
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
                if (readOnly) FileBackedNotice()
                DetailBadges(
                    task = current,
                    enabled = !readOnly,
                    today = today,
                    dueTime = dueTime,
                    projectName = projects.firstOrNull { it.uid == current.projectUid }?.name,
                    projectIcon = projects.firstOrNull { it.uid == current.projectUid }?.icon,
                    projectColor = current.projectUid?.let { projectColors[it] }?.let(::Color),
                    tagNames = tags.filter { it.uid in current.tagUids }.map { it.name },
                    tagColors = tagColors,
                    onDates = { openDates(DateTab.Due) },
                    onPriority = { picker = Picker.Priority },
                    onProject = { picker = Picker.Project },
                    onStatus = { picker = Picker.Status },
                    onTags = { picker = Picker.Tags },
                    onRepeat = { picker = Picker.Repeat },
                )
                // Horizon et prochaine action : seulement s'ils servent déjà, sinon derrière « Plus de champs ».
                val funnelInUse = current.someday || current.reviewOn != null ||
                    FunnelStage.entries.any { Funnel.has(current, it, weekStart) }
                if (!current.isRecurring && current.parentTaskUid == null && (funnelInUse || moreFields)) {
                    FunnelSection(
                        task = current,
                        weekStart = weekStart,
                        today = today,
                        enabled = !readOnly,
                        onToggle = { viewModel.funnel(current, it) },
                        onReviewOn = { viewModel.reviewOn(current, it) },
                    )
                }
                if (!readOnly && NextAction.canDesignate(current) && (moreFields || NextAction.isDesignated(current, projects))) {
                    ChoiceChip(
                        label = stringResource(R.string.next_action_chip),
                        selected = NextAction.isDesignated(current, projects),
                        leadingIcon = Icons.Outlined.Flag,
                        onClick = { viewModel.toggleNextAction(current) },
                    )
                }
                PostponementLine(taskUid = current.uid, version = current.dueDay)
                NoteCard(note = note, onNoteChange = { note = it }, readOnly = readOnly)
                LinkPreviewList("$title\n$note", viewModel.linkPreviews)
                if (!readOnly) {
                    AddToLinksRow("$title\n$note", sourceKey = current.uid, onAdd = { viewModel.addLinkFrom(it, "task", current.uid) })
                }
                if (!readOnly) SubtasksCard(parentUid = current.uid, viewModel = viewModel, onOpen = { openedSubtask = it.uid })
                val keyedFields = detailFields(
                        task = current,
                        today = today,
                        dueTime = dueTime,
                        startTime = startTime,
                        projectName = projects.firstOrNull { it.uid == current.projectUid }?.name,
                        projectIcon = projects.firstOrNull { it.uid == current.projectUid }?.icon,
                        tagNames = tags.filter { it.uid in current.tagUids }.map { it.name },
                        onDates = { openDates(DateTab.Due) },
                        onRepeat = { picker = Picker.Repeat },
                        onEstimate = { picker = Picker.Estimate },
                        onPriority = { picker = Picker.Priority },
                        onStatus = { picker = Picker.Status },
                        onTags = { picker = Picker.Tags },
                        onProject = { picker = Picker.Project },
                    )
                val shownFields = keyedFields
                    .filter { DetailFieldRules.visible(it.key, it.filled, it.hasBadge, moreFields) }
                    .map { it.field }
                if (shownFields.isNotEmpty()) DetailFieldGroup(shownFields, enabled = !readOnly)
                val canShowMore = !moreFields && (
                    DetailFieldRules.hasHidden(
                        keyedFields.map { it.key to it.filled },
                        keyedFields.filter { it.hasBadge }.mapTo(HashSet()) { it.key },
                        moreFields,
                    ) ||
                        TaskExtraRows.visible(current.extras).isNotEmpty() ||
                        (!funnelInUse && !current.isRecurring && current.parentTaskUid == null) ||
                        (!readOnly && NextAction.canDesignate(current) && !NextAction.isDesignated(current, projects))
                    )
                if (!readOnly && canShowMore) {
                    TextButton(onClick = { moreFields = true }, modifier = Modifier.heightIn(min = Size.touch)) {
                        Text(stringResource(R.string.tasks_detail_more_fields))
                    }
                }
                if (hasReminder && !notifications.allowed) {
                    NotificationsOffNotice()
                }
                if (moreFields || readOnly) ReadOnlyDetails(current)
                Spacer(Modifier.height(Space.xl))
            }
        }
    }

    val applyDue = { date: LocalDate?, time: LocalTime? ->
        val result = TaskEdits.due(latest, date, time, zone)
        // Pour une série, le jour et l'heure forment un seul changement : une seule question.
        val change = result.moveDate?.let { result.change.copy(dueDate = it) } ?: result.change
        if (change != TaskChange()) viewModel.edit(latest, change)
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
            onSelect = { viewModel.edit(latest, TaskEdits.estimate(latest, it)) },
            onDismiss = dismissPicker,
        )
        Picker.Priority -> ChoiceSheet(
            title = stringResource(R.string.tasks_field_priority),
            choices = listOf(TaskPriority.LOW, TaskPriority.MEDIUM, TaskPriority.HIGH).map {
                SheetChoice(it, stringResource(priorityLabel(it)), priorityColor(it))
            },
            selected = current.priority ?: NO_PRIORITY,
            onSelect = { if (it != current.priority) viewModel.edit(latest, TaskChange(priority = it)) },
            onDismiss = dismissPicker,
        )
        Picker.Status -> ChoiceSheet(
            title = stringResource(R.string.tasks_field_status),
            choices = editableStatuses.map { SheetChoice(it, stringResource(statusLabelRes(it))) },
            selected = current.status,
            onSelect = { if (it != current.status) viewModel.edit(latest, TaskChange(status = it)) },
            onDismiss = dismissPicker,
        )
        Picker.Tags -> TagsSheet(
            tags = tags,
            selected = current.tagUids.toSet(),
            onChange = { viewModel.edit(latest, TaskChange(tagUids = it.toList())) },
            deferred = current.isRecurring,
            onDismiss = dismissPicker,
        )
        Picker.Project -> ProjectSheet(
            projects = ProjectChoices.forTask(projects, current.projectUid),
            selectedUid = current.projectUid,
            onSelect = { viewModel.edit(latest, TaskEdits.project(latest, it)) },
            onDismiss = dismissPicker,
        )
        Picker.Actions -> CadenceSheet(
            title = stringResource(R.string.tasks_detail_actions_title),
            subtitle = null,
            dismiss = dismissPicker,
        ) {
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                ActionRow(
                    Icons.Outlined.PushPin,
                    stringResource(if (current.pinnedAt == null) R.string.tasks_action_pin else R.string.tasks_action_unpin),
                    palette.primary,
                ) {
                    viewModel.edit(latest, TaskChange(pinned = current.pinnedAt == null))
                    picker = null
                }
                if (current.isRecurring) {
                    ActionRow(Icons.Outlined.SkipNext, stringResource(R.string.tasks_action_skip), palette.primary) {
                        viewModel.skipOccurrence(current)
                        picker = null
                        onDismiss()
                    }
                }
                ActionRow(Icons.Outlined.Share, stringResource(R.string.tasks_action_share), palette.primary) {
                    context.shareText(ShareText.withNote(current.name, current.note), current.name)
                    picker = null
                }
                ActionRow(Icons.Outlined.ContentCopy, stringResource(R.string.tasks_action_copy), palette.primary) {
                    context.copyText(current.name, ShareText.withNote(current.name, current.note))
                    picker = null
                }
                ActionRow(Icons.Outlined.ContentCopy, stringResource(R.string.tasks_action_duplicate), palette.primary) {
                    viewModel.duplicate(current)
                    picker = null
                    onDismiss()
                }
                ActionRow(Icons.Outlined.Delete, stringResource(R.string.tasks_action_delete), palette.error) {
                    picker = null
                    if (current.isRecurring) {
                        // La portée est demandée à la place de la confirmation ; le texte en attente n'est plus à écrire.
                        sent.name = title.trim()
                        sent.note = note.trim()
                        viewModel.askDelete(current)
                        onDismiss()
                    } else {
                        confirmDelete = true
                    }
                }
            }
        }
        Picker.Focus -> FocusTimerSheet(taskUid = current.uid, taskName = current.name, onDismiss = dismissPicker)
        null -> Unit
    }
    openedSubtask?.let { uid ->
        TaskDetailSheet(taskUid = uid, viewModel = viewModel, onDismiss = { openedSubtask = null })
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
    readOnly: Boolean,
    closed: Boolean,
    highPriority: Boolean,
    onToggle: () -> Unit,
    onTitleChange: (String) -> Unit,
    onBack: () -> Unit,
    onFocusTimer: () -> Unit,
    onMore: () -> Unit,
) {
    val palette = cadence
    val focus = LocalFocusManager.current
    val titleStyle = if (DetailTitle.isLong(title)) {
        MaterialTheme.typography.titleLarge
    } else {
        MaterialTheme.typography.headlineSmall
    }
    // Barre d'outils seule sur sa ligne, puis le titre sur toute la largeur avec sa case : un titre court
    // tient sur une ligne au lieu d'être serré entre quatre boutons.
    Column(Modifier.fillMaxWidth().padding(horizontal = Space.sm, vertical = Space.sm)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            RoundHeaderButton(
                icon = Icons.AutoMirrored.Outlined.ArrowBack,
                contentDescription = stringResource(R.string.tasks_detail_back),
                style = HeaderButtonStyle.Plain,
                onClick = onBack,
            )
            Spacer(Modifier.weight(1f))
            RoundHeaderButton(
                icon = Icons.Outlined.Timer,
                contentDescription = stringResource(R.string.tasks_focus_open),
                onClick = onFocusTimer,
            )
            if (!readOnly) {
                RoundHeaderButton(
                    icon = Icons.Outlined.MoreVert,
                    contentDescription = stringResource(R.string.tasks_detail_more),
                    onClick = onMore,
                )
            }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = Space.sm), verticalAlignment = Alignment.Top) {
            TaskCheckbox(
                checked = closed,
                onCheckedChange = { onToggle() },
                highPriority = highPriority,
                contentDescription = stringResource(if (closed) R.string.tasks_mark_undone else R.string.tasks_mark_done),
            )
            Spacer(Modifier.width(Space.sm))
            Box(Modifier.weight(1f).padding(top = Space.sm)) {
                if (title.isEmpty()) {
                    Text(
                        stringResource(R.string.tasks_detail_title_hint),
                        style = titleStyle,
                        color = palette.outline,
                    )
                }
                BasicTextField(
                    value = title,
                    onValueChange = onTitleChange,
                    readOnly = readOnly,
                    textStyle = titleStyle.copy(color = palette.onSurface),
                    cursorBrush = SolidColor(palette.primary),
                    keyboardOptions = KeyboardOptions(
                        capitalization = KeyboardCapitalization.Sentences,
                        imeAction = ImeAction.Done,
                    ),
                    keyboardActions = KeyboardActions(onDone = { focus.clearFocus() }),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
private fun DetailBadges(
    task: TaskItem,
    enabled: Boolean,
    today: LocalDate,
    dueTime: LocalTime?,
    projectName: String?,
    projectIcon: String?,
    projectColor: Color?,
    tagNames: List<String>,
    tagColors: Map<String, Color>,
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
            val overdue = TaskViews.isOverdue(task, today)
            val text = compactDateTime(due, dueTime, today)
            TapBadge(onDates, enabled) {
                CadenceBadge(
                    text = if (overdue) stringResource(R.string.tasks_detail_overdue, text) else text,
                    tone = if (overdue) BadgeTone.Neutral else BadgeTone.Primary,
                    icon = Icons.Outlined.Schedule,
                )
            }
        }
        // Comme projet, statut et étiquettes : un badge seulement pour une valeur posée ; la ligne Priorité
        // plus bas reste là pour en choisir une. Une tâche simple garde une fiche simple.
        task.priority?.let { priority ->
            TapBadge(onPriority, enabled) {
                CadenceBadge(
                    text = stringResource(priorityBadge(priority)),
                    tone = when (priority) {
                        TaskPriority.HIGH -> BadgeTone.Error
                        TaskPriority.MEDIUM -> BadgeTone.Warning
                        else -> BadgeTone.Neutral
                    },
                    icon = Icons.Outlined.Flag,
                )
            }
        }
        projectName?.let {
            TapBadge(onProject, enabled) {
                CadenceBadge(text = it, tone = BadgeTone.Neutral, color = projectColor, icon = entityIcon(projectIcon))
            }
        }
        if (task.isClosed) {
            CadenceBadge(text = stringResource(R.string.tasks_detail_done), tone = BadgeTone.Success)
        } else if (task.status != TaskStatus.NOT_STARTED) {
            TapBadge(onStatus, enabled) {
                CadenceBadge(text = stringResource(statusLabelRes(task.status)), tone = BadgeTone.Primary)
            }
        }
        if (task.isRecurring) {
            TapBadge(onRepeat, enabled) {
                CadenceBadge(text = stringResource(R.string.tasks_recurring), icon = Icons.Outlined.Repeat)
            }
        }
        tagNames.take(MAX_TAG_BADGES).forEach { name ->
            TapBadge(onTags, enabled) { CadenceBadge(text = "#$name", color = tagColors[name]) }
        }
        if (tagNames.size > MAX_TAG_BADGES) {
            TapBadge(onTags, enabled) {
                CadenceBadge(text = stringResource(R.string.tasks_detail_more_tags, tagNames.size - MAX_TAG_BADGES))
            }
        }
    }
}

@Composable
private fun TapBadge(onClick: () -> Unit, enabled: Boolean, content: @Composable () -> Unit) {
    Box(
        Modifier.clip(Radius.Pill).clickable(enabled = enabled, role = Role.Button, onClick = onClick),
    ) { content() }
}

@Composable
private fun detailFields(
    task: TaskItem,
    today: LocalDate,
    dueTime: LocalTime?,
    startTime: LocalTime?,
    projectName: String?,
    projectIcon: String?,
    tagNames: List<String>,
    onDates: () -> Unit,
    onRepeat: () -> Unit,
    onEstimate: () -> Unit,
    onPriority: () -> Unit,
    onStatus: () -> Unit,
    onTags: () -> Unit,
    onProject: () -> Unit,
): List<KeyedDetailField> {
    val due = task.dueDay?.let { compactDateTime(it, dueTime, today) }
    val start = task.startDay?.let { compactDateTime(it, startTime, today) }
    val dates = when {
        start != null && due != null -> "$start → $due"
        due != null -> due
        start != null -> stringResource(R.string.tasks_detail_starts, start)
        else -> stringResource(R.string.tasks_detail_dates_none)
    }
    val none = stringResource(R.string.tasks_detail_none)
    val statusSet = task.isClosed || task.status != TaskStatus.NOT_STARTED
    return listOf(
        KeyedDetailField(
            DetailFieldKey.DATES,
            filled = due != null || start != null,
            // Le badge du haut ne montre que l'échéance : un début garde sa ligne.
            hasBadge = due != null && start == null,
            DetailField(Icons.Outlined.CalendarMonth, stringResource(R.string.tasks_detail_dates), dates, onDates, due == null && start == null),
        ),
        KeyedDetailField(
            DetailFieldKey.REPEAT,
            filled = task.repetition.type != RepeatType.NONE,
            hasBadge = task.isRecurring,
            DetailField(
                Icons.Outlined.Repeat,
                stringResource(R.string.tasks_field_repeat),
                repeatLabel(task.repetition),
                onRepeat,
                task.repetition.type == RepeatType.NONE,
            ),
        ),
        KeyedDetailField(
            DetailFieldKey.ESTIMATE,
            filled = task.estimatedMinutes != null,
            hasBadge = false,
            DetailField(
                Icons.Outlined.HourglassEmpty,
                stringResource(R.string.tasks_field_estimate),
                task.estimatedMinutes?.let(EstimateFormat::format) ?: none,
                onEstimate,
                task.estimatedMinutes == null,
            ),
        ),
        KeyedDetailField(
            DetailFieldKey.PRIORITY,
            filled = task.priority != null,
            hasBadge = task.priority != null,
            DetailField(
                Icons.Outlined.Flag,
                stringResource(R.string.tasks_field_priority),
                task.priority?.let { stringResource(priorityLabel(it)) } ?: stringResource(R.string.tasks_priority_none),
                onPriority,
                task.priority == null,
            ),
        ),
        KeyedDetailField(
            DetailFieldKey.STATUS,
            filled = statusSet,
            hasBadge = statusSet,
            DetailField(
                Icons.Outlined.TaskAlt,
                stringResource(R.string.tasks_field_status),
                stringResource(statusLabelRes(task.status)),
                onStatus,
            ),
        ),
        KeyedDetailField(
            DetailFieldKey.TAGS,
            filled = tagNames.isNotEmpty(),
            hasBadge = tagNames.isNotEmpty(),
            DetailField(
                Icons.Outlined.Sell,
                stringResource(R.string.tasks_field_tags),
                tagNames.takeIf { it.isNotEmpty() }?.joinToString(" ") { "#$it" } ?: none,
                onTags,
                tagNames.isEmpty(),
            ),
        ),
        KeyedDetailField(
            DetailFieldKey.PROJECT,
            filled = projectName != null,
            hasBadge = projectName != null,
            DetailField(
                entityIcon(projectIcon) ?: Icons.Outlined.Folder,
                stringResource(R.string.tasks_field_project),
                projectName ?: stringResource(R.string.tasks_no_project),
                onProject,
                projectName == null,
            ),
        ),
    )
}

/** Une ligne de la fiche avec ce qu'il faut pour décider si elle s'affiche ([DetailFieldRules]). */
internal class KeyedDetailField(val key: DetailFieldKey, val filled: Boolean, val hasBadge: Boolean, val field: DetailField)

