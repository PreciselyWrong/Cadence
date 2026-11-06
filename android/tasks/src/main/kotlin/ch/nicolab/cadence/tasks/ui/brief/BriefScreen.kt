package ch.nicolab.cadence.tasks.ui.brief

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.windowInsetsBottomHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.WbSunny
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.EmptyState
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.ScreenHeader
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.components.ChoiceChip
import ch.nicolab.cadence.designsystem.components.rememberAppSnackbarHostState
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.brief.AnticipateDto
import ch.nicolab.cadence.tasks.brief.BriefDto
import ch.nicolab.cadence.tasks.brief.BriefSettingsJson
import ch.nicolab.cadence.tasks.brief.BriefView
import ch.nicolab.cadence.tasks.brief.DEFAULT_BRIEF_SECTIONS
import ch.nicolab.cadence.tasks.brief.MoveDto
import ch.nicolab.cadence.tasks.brief.QuestionDto
import ch.nicolab.cadence.tasks.model.EstimateFormat
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.planning.PlanningChanges
import ch.nicolab.cadence.tasks.ui.ChoiceCard
import ch.nicolab.cadence.tasks.ui.OverdueTriage
import ch.nicolab.cadence.tasks.ui.PlaceInDay
import ch.nicolab.cadence.tasks.ui.PlanningViewModel
import ch.nicolab.cadence.tasks.ui.SuggestionList
import ch.nicolab.cadence.tasks.ui.TaskDateSheet
import ch.nicolab.cadence.tasks.ui.TaskDetailSheet
import ch.nicolab.cadence.tasks.ui.TaskRow
import ch.nicolab.cadence.tasks.ui.TasksViewModel
import ch.nicolab.cadence.tasks.ui.ThisOrThatSheet
import ch.nicolab.cadence.tasks.ui.rememberProjectNames
import ch.nicolab.cadence.tasks.ui.rememberRowDecor
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject

/**
 * Ma journée, poussée depuis Aujourd'hui : en-tête (date, résumé, lecture), puis les sections dans l'ordre et la
 * visibilité du brief (ou des réglages), avec la planification du jour après les priorités. Chaque geste propose « Annuler ».
 */
@Composable
fun BriefScreen(onBack: () -> Unit) {
    val viewModel: BriefViewModel = viewModel()
    val cached by viewModel.brief.collectAsStateWithLifecycle()
    val eveningCached by viewModel.evening.collectAsStateWithLifecycle()
    val view by viewModel.view.collectAsStateWithLifecycle()
    val pending by viewModel.pending.collectAsStateWithLifecycle()
    val settings by viewModel.settings.collectAsStateWithLifecycle()
    val tasks by viewModel.tasks.collectAsStateWithLifecycle()
    val today by viewModel.today.collectAsStateWithLifecycle()
    val zone by viewModel.zone.collectAsStateWithLifecycle()
    val audioChoice by viewModel.audioChoice.collectAsStateWithLifecycle()
    val audioKey by viewModel.audioKey.collectAsStateWithLifecycle()
    val playerState by viewModel.playerState.collectAsStateWithLifecycle()
    val preparing by viewModel.preparing.collectAsStateWithLifecycle()
    val voiceSheet by viewModel.voiceSheet.collectAsStateWithLifecycle()
    val voiceInstall by viewModel.voiceInstall.collectAsStateWithLifecycle()
    val marks by viewModel.marks.collectAsStateWithLifecycle()
    val tasksViewModel: TasksViewModel = viewModel()
    val planning: PlanningViewModel = viewModel()
    val snackbar = rememberAppSnackbarHostState()
    val dayPlan = rememberDayPlan(tasksViewModel, planning, snackbar)
    val projectNames = rememberProjectNames(tasksViewModel)
    var choosing by remember { mutableStateOf(false) }
    val undoLabel = stringResource(R.string.tasks_undo)
    var openedTaskUid by remember { mutableStateOf<String?>(null) }
    var datingTask by remember { mutableStateOf<TaskItem?>(null) }
    var movingTask by remember { mutableStateOf<Pair<TaskItem, MoveDto>?>(null) }
    var preciseFor by remember { mutableStateOf<QuestionDto?>(null) }

    LaunchedEffect(viewModel) {
        viewModel.opened()
        viewModel.refresh()
    }
    LaunchedEffect(viewModel) {
        viewModel.notices.collect { notice ->
            snackbar.currentSnackbarData?.dismiss()
            launch {
                val result = snackbar.showSnackbar(
                    message = notice.message,
                    actionLabel = notice.undo?.let { undoLabel },
                    duration = SnackbarDuration.Short,
                )
                if (result == SnackbarResult.ActionPerformed) notice.undo?.invoke()
            }
        }
    }

    val audioUi = BriefAudioUi(
        choice = audioChoice,
        briefKey = audioKey.orEmpty(),
        player = playerState,
        marks = marks,
        preparing = preparing,
    )
    val audioControls: @Composable () -> Unit = {
        BriefAudioControls(
            ui = audioUi,
            onPlay = viewModel::playAudio,
            onToggle = viewModel::toggleAudio,
            onNext = viewModel::nextChapter,
            onPrevious = viewModel::previousChapter,
            modifier = Modifier.padding(top = Space.sm),
        )
    }
    // Un geste sur une tâche déjà terminée la rouvre ; sur une tâche ouverte il la termine (avec « Annuler »).
    val toggle: (TaskItem) -> Unit = { task ->
        if (task.isClosed) tasksViewModel.toggle(task, hold = false) else viewModel.complete(task)
    }

    Surface(Modifier.fillMaxSize(), color = cadence.background, contentColor = cadence.onSurface) {
        Column(Modifier.fillMaxSize().statusBarsPadding()) {
            ScreenHeader(
                title = stringResource(if (view == BriefView.EVENING) R.string.evening_title else R.string.brief_title),
                onBack = onBack,
                backDescription = stringResource(R.string.brief_back),
            )
            LazyColumn(modifier = Modifier.weight(1f), contentPadding = PaddingValues(start = Space.gutter, top = Space.sm, end = Space.gutter, bottom = Space.xl)) {
                val night = eveningCached?.evening
                if (view == BriefView.EVENING && night != null) {
                    eveningSections(
                        evening = night,
                        context = EveningContext(
                            date = eveningCached?.date ?: today,
                            today = today,
                            zone = zone,
                            tasks = tasks,
                            settings = settings,
                            pending = pending,
                            onOpen = { openedTaskUid = it.uid },
                            onToggle = toggle,
                            onCarry = viewModel::carryOver,
                            onPickDate = { datingTask = it },
                            onLater = viewModel::later,
                            onAbandon = viewModel::abandon,
                            hasMorning = cached?.brief != null,
                            onShowMorning = viewModel::showMorning,
                            audio = audioControls,
                        ),
                    )
                    return@LazyColumn
                }
                val snapshot = cached
                val brief = snapshot?.brief
                val lists = MyDay.lists(brief?.tonight.orEmpty(), brief?.moves.orEmpty(), dayPlan.overdue)
                if (snapshot?.status == STATUS_FAILED) {
                    item(key = "failed") {
                        Text(
                            stringResource(R.string.brief_failed_message),
                            style = MaterialTheme.typography.bodyMedium,
                            color = cadence.error,
                            modifier = Modifier.padding(bottom = Space.md),
                        )
                    }
                }
                val planSections: LazyListScope.() -> Unit = {
                    dayPlanSections(
                        plan = dayPlan,
                        overdue = lists.overdue,
                        onPlace = {
                            planning.requestPlacement()
                            onBack()
                        },
                        onChoose = { choosing = true },
                    )
                }
                if (brief == null) {
                    if (snapshot == null && !dayPlan.hasContent) {
                        item(key = "empty") {
                            EmptyState(
                                icon = Icons.Outlined.WbSunny,
                                title = stringResource(R.string.brief_empty_title),
                                message = stringResource(R.string.brief_empty_message),
                            )
                        }
                    } else if (snapshot != null) {
                        item(key = "unreadable") {
                            Text(
                                stringResource(R.string.brief_unreadable_message),
                                style = MaterialTheme.typography.bodyMedium,
                                color = cadence.onSurfaceVariant,
                            )
                        }
                    }
                    planSections()
                    return@LazyColumn
                }
                val date = snapshot.date
                val sections = brief.sections ?: settings?.let { BriefSettingsJson.sections(it) } ?: DEFAULT_BRIEF_SECTIONS
                val context = BriefContext(
                    brief = brief,
                    lists = lists,
                    date = date,
                    today = today,
                    zone = zone,
                    tasks = tasks,
                    settings = settings,
                    pending = pending,
                    onOpen = { openedTaskUid = it.uid },
                    onComplete = toggle,
                    onMove = { task, move, target -> viewModel.move(date, task, move, target) },
                    onPickMoveDate = { task, move -> movingTask = task to move },
                    onAnswer = { question, answer -> viewModel.answer(date, question, answer) },
                    onFeedback = { card, vote -> viewModel.feedback(date, card, vote) },
                    onPrecise = { preciseFor = it },
                    onReopen = { task -> tasksViewModel.toggle(task, hold = false) },
                )
                item(key = "header") {
                    BriefHeader(
                        brief = brief,
                        date = date,
                        preparedAt = BriefFormat.clockAt(snapshot.generatedAt, zone),
                        audio = audioControls,
                        link = {
                            if (eveningCached?.evening != null) {
                                TertiaryAction(stringResource(R.string.evening_show), onClick = viewModel::showEvening)
                            }
                        },
                    )
                }
                sections.forEach { id ->
                    briefSection(id, context)
                    if (id == "tonight") planSections()
                }
                if ("tonight" !in sections) planSections()
                item(key = "feedback") {
                    ScreenFeedback(
                        vote = pending.feedback[screenFeedbackCard(date).key],
                        onVote = { vote -> viewModel.feedback(date, screenFeedbackCard(date), vote) },
                    )
                }
            }
            Spacer(
                Modifier
                    .fillMaxWidth()
                    .windowInsetsBottomHeight(WindowInsets.navigationBars)
                    .background(cadence.background),
            )
        }
    }

    if (choosing) {
        val byUid = remember(dayPlan.suggestions) { dayPlan.suggestions.associateBy { it.uid } }
        ThisOrThatSheet(
            cards = dayPlan.suggestions.map { task ->
                ChoiceCard(
                    task.uid,
                    task.name,
                    listOfNotNull(task.projectUid?.let { projectNames[it] }, task.estimatedMinutes?.let(EstimateFormat::format)).joinToString(" · "),
                )
            },
            onChoose = { uid ->
                choosing = false
                byUid[uid]?.let(dayPlan.onAddToday)
            },
            dismiss = { choosing = false },
        )
    }
    datingTask?.let { task ->
        TaskDateSheet(
            title = stringResource(R.string.evening_action_date),
            today = today,
            date = task.dueDay,
            time = null,
            // « Aucune échéance » n'est pas un report : seule une vraie date est écrite.
            onApply = { day, _ -> day?.let { viewModel.setDue(task, it) } },
            onDismiss = { datingTask = null },
        )
    }
    movingTask?.let { (task, move) ->
        TaskDateSheet(
            title = stringResource(R.string.brief_move_other_date),
            today = today,
            date = runCatching { LocalDate.parse(move.to) }.getOrNull(),
            time = null,
            // « Aucune échéance » n'est pas un déplacement : seule une vraie date est écrite.
            onApply = { day, _ -> day?.let { target -> cached?.let { viewModel.move(it.date, task, move, target) } } },
            onDismiss = { movingTask = null },
        )
    }
    openedTaskUid?.let { uid ->
        TaskDetailSheet(taskUid = uid, viewModel = tasksViewModel, onDismiss = { openedTaskUid = null })
    }
    preciseFor?.let { question ->
        PreciseAnswerSheet(
            question = question,
            onSend = { text ->
                cached?.let { viewModel.answer(it.date, question, text) }
                preciseFor = null
            },
            onDismiss = { preciseFor = null },
        )
    }
    if (voiceSheet) {
        BriefVoiceSheet(
            install = voiceInstall,
            onDownload = viewModel::downloadVoice,
            onCancel = viewModel::cancelVoiceDownload,
            onDismiss = viewModel::dismissVoiceSheet,
        )
    }
}

private const val STATUS_FAILED = "failed"

/** Le retour unique de l'écran passe par le même canal que les votes sur les alertes, avec son propre type. */
private fun screenFeedbackCard(date: LocalDate) = AnticipateDto(key = "brief:$date", type = "brief")

/** Échues à trier, suggestions, placement : le contenu de l'ancienne feuille « Planifier la journée ». */
private fun LazyListScope.dayPlanSections(plan: DayPlanUi, overdue: List<TaskItem>, onPlace: () -> Unit, onChoose: () -> Unit) {
    if (overdue.isNotEmpty()) {
        item(key = "plan-overdue") {
            BriefSection(stringResource(R.string.planning_triage_title), null) {
                OverdueTriage(overdue, plan.today, plan.onTriage)
            }
        }
    }
    if (plan.suggestions.isNotEmpty()) {
        item(key = "plan-suggestions") {
            BriefSection(stringResource(R.string.suggestions_title), null) {
                SuggestionList(plan.suggestions, plan.weekStart, plan.onAddToday, onChoose)
            }
        }
    }
    if (plan.toPlaceCount > 0) {
        item(key = "plan-place") {
            BriefSection(stringResource(R.string.planning_place_title), null) {
                PlaceInDay(plan.capacity, plan.toPlaceCount, plan.workday, onPlace)
            }
        }
    }
}

/** Un seul retour, discret, en bas de l'écran. */
@Composable
private fun ScreenFeedback(vote: String?, onVote: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(top = Space.xl), verticalAlignment = Alignment.CenterVertically) {
        if (vote != null) {
            DecisionTag(stringResource(R.string.brief_feedback_given, stringResource(if (vote == "useful") R.string.brief_feedback_useful else R.string.brief_feedback_noise)))
        } else {
            Text(
                stringResource(R.string.brief_feedback_question),
                style = MaterialTheme.typography.bodySmall,
                color = cadence.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
            TertiaryAction(stringResource(R.string.brief_feedback_useful), onClick = { onVote("useful") })
            TertiaryAction(stringResource(R.string.brief_feedback_noise), onClick = { onVote("noise") })
        }
    }
}

/** ⋯ d'une alerte : en voir moins de ce type, sans vote à chaque carte. */
@Composable
private fun CardOptions(onLess: () -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { open = true }) {
            Icon(Icons.Outlined.MoreVert, contentDescription = stringResource(R.string.brief_card_options), tint = cadence.onSurfaceVariant)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.brief_card_less)) },
                onClick = {
                    open = false
                    onLess()
                },
            )
        }
    }
}

/** Tout ce qu'une section lit ou fait : évite de passer une dizaine de paramètres à chaque section. */
internal class BriefContext(
    val brief: BriefDto,
    val lists: MyDayLists,
    val date: LocalDate,
    val today: LocalDate,
    val zone: ZoneId,
    val tasks: Map<String, TaskItem>,
    val settings: JsonObject?,
    /** Gestes tout juste faits : lignes cochées, cartes refermées sur leur choix. */
    val pending: BriefPending,
    val onOpen: (TaskItem) -> Unit,
    val onComplete: (TaskItem) -> Unit,
    val onMove: (TaskItem, MoveDto, LocalDate) -> Unit,
    val onPickMoveDate: (TaskItem, MoveDto) -> Unit,
    val onAnswer: (QuestionDto, String) -> Unit,
    val onFeedback: (AnticipateDto, String) -> Unit,
    val onPrecise: (QuestionDto) -> Unit,
    val onReopen: (TaskItem) -> Unit,
)

private fun LazyListScope.briefSection(id: String, context: BriefContext) {
    val brief = context.brief
    when (id) {
        "timeline" -> item(key = id) {
            BriefSection(stringResource(R.string.brief_timeline_title), null) {
                BriefTimelineSection(brief.timeline, context.today, context.settings)
            }
        }
        "tonight" -> item(key = id) {
            if (context.lists.priorities.isEmpty()) return@item
            val counters = brief.counters
            val detail = counters.capacityMinutes?.let {
                stringResource(R.string.brief_tonight_detail, durationLabel(counters.tonightMinutes), durationLabel(it))
            } ?: durationLabel(counters.tonightMinutes)
            BriefSection(stringResource(R.string.brief_tonight_title), detail) {
                context.lists.priorities.forEach { entry ->
                    val task = context.tasks[entry.taskUid] ?: return@forEach
                    BriefTaskRow(task, context, subtitle = BriefFormat.visibleReason(entry.reason, entry.reasonCode), onToggle = { context.onComplete(task) })
                }
            }
        }
        "moves" -> item(key = id) {
            if (context.lists.moves.isEmpty()) return@item
            BriefSection(stringResource(R.string.brief_moves_title), null) {
                context.lists.moves.forEach { move ->
                    val task = context.tasks[move.taskUid] ?: return@forEach
                    val target = runCatching { LocalDate.parse(move.to) }.getOrNull() ?: return@forEach
                    val movable = PlanningChanges.movable(listOf(task)).isNotEmpty()
                    val moved = context.pending.moved[move.proposalKey]
                    val open = moved == null && movable
                    Column(Modifier.animateContentSize()) {
                        BriefTaskRow(
                            task = task,
                            context = context,
                            subtitle = BriefFormat.visibleReason(move.reason, move.reasonCode),
                            onToggle = { context.onComplete(task) },
                            trailing = when {
                                moved != null -> {
                                    { DecisionTag(stringResource(R.string.brief_move_done, BriefFormat.chip(moved))) }
                                }
                                movable -> {
                                    {
                                        ChoiceChip(
                                            label = BriefFormat.chip(target) + "  →",
                                            selected = false,
                                            onClick = { context.onMove(task, move, target) },
                                        )
                                    }
                                }
                                else -> null
                            },
                        )
                        AnimatedVisibility(visible = open) {
                            Row(Modifier.fillMaxWidth().padding(start = RowContentInset)) {
                                TertiaryAction(stringResource(R.string.brief_move_other_date), onClick = { context.onPickMoveDate(task, move) })
                            }
                        }
                    }
                }
            }
        }
        "anticipate" -> item(key = id) {
            if (brief.anticipate.isEmpty()) return@item
            BriefSection(stringResource(R.string.brief_anticipate_title), null) {
                brief.anticipate.forEach { card ->
                    val answer = card.question?.let { context.pending.answers[it.key] }
                    val vote = context.pending.feedback[card.key]
                    Column(Modifier.padding(bottom = Space.md).animateContentSize()) {
                        Row(verticalAlignment = Alignment.Top) {
                            Text(
                                card.question?.text ?: card.text,
                                style = MaterialTheme.typography.bodyLarge,
                                color = cadence.onSurface,
                                modifier = Modifier.weight(1f),
                            )
                            if (vote == null) CardOptions(onLess = { context.onFeedback(card, "noise") })
                        }
                        card.question?.let { question ->
                            AnimatedVisibility(visible = answer == null) {
                                Row(Modifier.padding(top = Space.xs)) {
                                    SecondaryAction(stringResource(R.string.brief_answer_yes), onClick = { context.onAnswer(question, "yes") })
                                    Spacer(Modifier.width(Space.xs))
                                    SecondaryAction(stringResource(R.string.brief_answer_no), onClick = { context.onAnswer(question, "no") })
                                    Spacer(Modifier.width(Space.xs))
                                    TertiaryAction(stringResource(R.string.brief_answer_precise), onClick = { context.onPrecise(question) })
                                }
                            }
                        }
                        if (answer != null || vote != null) {
                            Row(Modifier.padding(top = Space.xs), verticalAlignment = Alignment.CenterVertically) {
                                if (answer != null) {
                                    DecisionTag(stringResource(R.string.brief_answer_given, answerLabel(answer)))
                                    Spacer(Modifier.width(Space.xs))
                                }
                                if (vote != null) DecisionTag(stringResource(R.string.brief_feedback_less))
                            }
                        }
                    }
                }
            }
        }
        "replies" -> item(key = id) {
            // Sans messagerie branchée ni réponse en attente, le bloc n'a rien à dire.
            if (brief.replies.isEmpty()) return@item
            BriefSection(stringResource(R.string.brief_replies_title), null) {
                brief.replies.forEach { reply ->
                    val since = reply.date?.let { runCatching { java.time.OffsetDateTime.parse(it).toLocalDate() }.getOrNull() }
                    Column(Modifier.padding(vertical = Space.xs)) {
                        Text(reply.subject, style = MaterialTheme.typography.bodyLarge, color = cadence.onSurface)
                        val meta = listOfNotNull(
                            reply.from.ifBlank { null },
                            since?.let { stringResource(R.string.brief_since_days, BriefFormat.daysSince(it, context.today)) },
                        ).joinToString(" · ")
                        if (meta.isNotBlank()) Text(meta, style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
                    }
                }
            }
        }
        "inbox" -> item(key = id) {
            if (brief.inbox.isEmpty()) return@item
            BriefSection(stringResource(R.string.brief_inbox_title), null) {
                brief.inbox.forEach { entry ->
                    Column(Modifier.padding(vertical = Space.xs)) {
                        Text(entry.title, style = MaterialTheme.typography.bodyLarge, color = cadence.onSurface)
                        entry.proposal?.reason?.takeIf { it.isNotBlank() }?.let {
                            Text(it, style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
                        }
                    }
                }
            }
        }
        "resolved" -> item(key = id) {
            val resolved = brief.resolved.mapNotNull { context.tasks[it.taskUid] }
            if (resolved.isEmpty()) return@item
            ResolvedSection(resolved.size) {
                resolved.forEach { task ->
                    BriefTaskRow(task, context, subtitle = null, onToggle = { context.onReopen(task) })
                }
            }
        }
    }
}

/** « Réglé » : repliée par défaut, un appui sur le titre l'ouvre. */
@Composable
private fun ResolvedSection(count: Int, content: @Composable () -> Unit) {
    var open by rememberSaveable { mutableStateOf(false) }
    val title = stringResource(R.string.brief_resolved_title)
    Column(Modifier.fillMaxWidth().padding(top = Space.xl, bottom = Space.xs).animateContentSize()) {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = Size.touch)
                .clickable(role = Role.Button, onClick = { open = !open }),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(title, style = MaterialTheme.typography.titleSmall, color = cadence.onSurfaceVariant)
            Spacer(Modifier.width(Space.sm))
            Text(count.toString(), style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
            Spacer(Modifier.weight(1f))
            Icon(
                if (open) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore,
                contentDescription = stringResource(if (open) R.string.brief_resolved_collapse else R.string.brief_resolved_expand),
                tint = cadence.onSurfaceVariant,
            )
        }
        if (open) content()
    }
}

/** « Oui » et « Non » en toutes lettres ; une réponse libre se lit telle qu'elle a été écrite. */
@Composable
private fun answerLabel(answer: String): String = when (answer) {
    "yes" -> stringResource(R.string.brief_answer_yes)
    "no" -> stringResource(R.string.brief_answer_no)
    else -> answer
}

/** Durée lisible : « 40 min », « 2 h », « 1 h 10 ». */
@Composable
internal fun durationLabel(minutes: Int): String {
    val (hours, rest) = BriefFormat.hoursAndMinutes(minutes)
    return when {
        hours == 0 -> stringResource(R.string.brief_duration_minutes, rest)
        rest == 0 -> stringResource(R.string.brief_duration_hours, hours)
        else -> stringResource(R.string.brief_duration_hours_minutes, hours, rest)
    }
}

@Composable
private fun BriefHeader(brief: BriefDto, date: LocalDate, preparedAt: String?, audio: @Composable () -> Unit, link: @Composable () -> Unit) {
    val palette = cadence
    Column(Modifier.fillMaxWidth().padding(bottom = Space.md)) {
        val dateLine = listOfNotNull(BriefFormat.longDate(date), preparedAt?.let { stringResource(R.string.brief_prepared_at, it) }).joinToString(" · ")
        Text(dateLine, style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant)
        Text(
            brief.verdict.text,
            style = MaterialTheme.typography.titleMedium,
            color = palette.onSurface,
            modifier = Modifier.padding(top = Space.xs),
        )
        audio()
        link()
    }
}

@Composable
internal fun countLine(@StringRes label: Int, count: Int): AnnotatedString = buildAnnotatedString {
    withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = cadence.onSurface)) { append(count.toString()) }
    append(" ")
    append(stringResource(label))
}

@Composable
internal fun BriefSection(title: String, detail: String?, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(top = Space.xl, bottom = Space.xs)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(title, style = MaterialTheme.typography.titleSmall, color = cadence.onSurfaceVariant)
            Spacer(Modifier.weight(1f))
            detail?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant) }
        }
        Spacer(Modifier.height(Space.xs))
        content()
    }
}

/**
 * Ligne de tâche : état et titre viennent de Room ; le motif du brief s'écrit sous le titre. Un geste tout juste fait
 * ([BriefPending.completing]) coche et barre la ligne à l'instant, même si la tâche est récurrente et reste ouverte.
 */
@Composable
internal fun BriefTaskRow(
    task: TaskItem,
    today: LocalDate,
    zone: ZoneId,
    pending: BriefPending,
    subtitle: String?,
    onOpen: (TaskItem) -> Unit,
    onToggle: () -> Unit,
    trailing: (@Composable () -> Unit)? = null,
    forceClosed: Boolean = false,
) {
    TaskRow(
        task = task,
        projectName = null,
        today = today,
        zone = zone,
        // Une ligne déjà cochée par ce geste ne se coche pas deux fois : « Annuler » du message la rend.
        onToggle = { if (!pending.isCompleting(task.uid)) onToggle() },
        onOpen = { onOpen(task) },
        onSwipeAction = {},
        onMenu = { onOpen(task) },
        subtitle = subtitle,
        trailing = trailing,
        forceClosed = forceClosed || pending.isCompleting(task.uid),
        // Ma journée se lit d'un coup d'œil : la note reste dans la fiche.
        decor = rememberRowDecor().copy(showDescription = false),
    )
}

@Composable
private fun BriefTaskRow(
    task: TaskItem,
    context: BriefContext,
    subtitle: String?,
    onToggle: () -> Unit,
    trailing: (@Composable () -> Unit)? = null,
) = BriefTaskRow(task, context.today, context.zone, context.pending, subtitle, context.onOpen, onToggle, trailing)

/** « Préciser » : une réponse libre, envoyée comme un texte d'answer au serveur. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PreciseAnswerSheet(question: QuestionDto, onSend: (String) -> Unit, onDismiss: () -> Unit) {
    var text by remember { mutableStateOf("") }
    CadenceSheet(
        title = question.text,
        subtitle = null,
        dismiss = onDismiss,
    ) {
        CadenceField(
            value = text,
            onValue = { text = it.take(MAX_ANSWER) },
            label = stringResource(R.string.brief_precise_label),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(Space.md))
        PrimaryAction(
            label = stringResource(R.string.brief_precise_send),
            enabled = text.isNotBlank(),
            onClick = { onSend(text.trim()) },
        )
    }
}

private const val MAX_ANSWER = 500

/** Carte d'entrée dans Aujourd'hui : une ligne (verdict tronqué, chevron) ; le bilan du soir y remplace le résumé du matin. */
@Composable
internal fun BriefCard(card: BriefCardState, onOpen: () -> Unit, modifier: Modifier = Modifier) {
    Panel(modifier = modifier.fillMaxWidth(), onClick = onOpen) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(
                    stringResource(if (card.evening) R.string.evening_card_title else R.string.brief_card_title),
                    style = MaterialTheme.typography.labelMedium,
                    color = cadence.onSurfaceVariant,
                )
                Text(card.verdict, style = MaterialTheme.typography.bodyLarge, color = cadence.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Icon(
                Icons.Outlined.ChevronRight,
                contentDescription = stringResource(if (card.evening) R.string.evening_card_open else R.string.brief_card_open),
                tint = cadence.onSurfaceVariant,
            )
        }
    }
}
