package ch.nicolab.cadence.tasks.ui.proposals

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.VectorConverter
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Event
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material.icons.outlined.Today
import androidx.compose.material.icons.outlined.Undo
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.ScreenHeader
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.components.rememberAppSnackbarHostState
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.proposals.DayLoad
import ch.nicolab.cadence.tasks.proposals.MorningCard
import ch.nicolab.cadence.tasks.proposals.MorningDayItem
import ch.nicolab.cadence.tasks.proposals.MorningDayPlan
import ch.nicolab.cadence.tasks.proposals.MorningRitual
import ch.nicolab.cadence.tasks.proposals.MorningTimelineEntry
import ch.nicolab.cadence.tasks.proposals.ProposalDto
import ch.nicolab.cadence.tasks.proposals.ProposalOp
import ch.nicolab.cadence.tasks.proposals.ProposalRepository
import ch.nicolab.cadence.tasks.proposals.Proposals
import ch.nicolab.cadence.tasks.proposals.RitualSwipe
import ch.nicolab.cadence.tasks.proposals.WeekDecision
import ch.nicolab.cadence.tasks.ui.TaskDatePickerDialog
import ch.nicolab.cadence.tasks.ui.TasksViewModel
import ch.nicolab.cadence.tasks.ui.tasksLocale
import java.io.IOException
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlinx.coroutines.launch

private val ritualDayChip: DateTimeFormatter = DateTimeFormatter.ofPattern("EEE d", tasksLocale)
private val ritualDueDay: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMM", tasksLocale)

private const val SWIPE_FRACTION = 0.28f
private const val ROTATION_DIVIDER = 28f
private const val ENTER_MS = 180
private const val LEAVE_MS = 140

/**
 * Rituel du matin en plein écran (`docs/50-morning-ritual.md`) :
 * 1. « Hier et retards » : grandes cartes glissables une par une pour les tâches en retard ;
 * 2. « Ta journée » : priorités (« Ce qui compte »), chronologie et charge ;
 * 3. « C'est parti » : applique en un appel et revient sur Aujourd'hui.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MorningRitualScreen(
    uid: String,
    onClose: () -> Unit,
    onApplied: () -> Unit,
) {
    val context = LocalContext.current
    val repo = remember(context) { ProposalRepository.of(context) }
    val tasks: TasksViewModel = viewModel()
    val snackbar = rememberAppSnackbarHostState()
    val scope = rememberCoroutineScope()
    val offline = stringResource(R.string.proposal_offline)
    val failed = stringResource(R.string.proposal_error)

    var dto by remember(uid) { mutableStateOf<ProposalDto?>(null) }
    var loadError by remember(uid) { mutableStateOf<String?>(null) }
    var busy by remember(uid) { mutableStateOf(false) }

    LaunchedEffect(uid) {
        repo.detail(uid)
            .onSuccess {
                dto = it
                loadError = null
            }
            .onFailure { err ->
                loadError = if (err is IOException) offline else failed
            }
    }

    val current = dto
    val today = remember(current) { Proposals.factToday(current?.facts) ?: LocalDate.now() }
    val cards = remember(current, today) { current?.let { MorningRitual.cards(it, today) }.orEmpty() }
    val loads = remember(current) { current?.let { Proposals.dayLoads(it.days, it.facts) }.orEmpty() }

    var index by remember(uid) { mutableIntStateOf(0) }
    var chosen by remember(uid) { mutableStateOf(emptyMap<String, WeekDecision>()) }
    var extraShown by remember(uid) { mutableStateOf(emptySet<String>()) }
    var history by remember(uid) { mutableStateOf(emptyList<String>()) }
    var focusUids by remember(current) { mutableStateOf(current?.let(MorningRitual::initialFocus).orEmpty()) }

    var moreForTask by remember(uid) { mutableStateOf<String?>(null) }
    var dateForTask by remember(uid) { mutableStateOf<String?>(null) }

    val inStep2 = current != null && index >= cards.size

    BackHandler {
        if (inStep2 && cards.isNotEmpty()) {
            index = (cards.size - 1).coerceAtLeast(0)
        } else {
            onClose()
        }
    }

    fun decideCard(taskUid: String, decision: WeekDecision) {
        chosen = chosen + (taskUid to decision)
        history = history + taskUid
        index += 1
    }

    fun undoCard() {
        val last = history.lastOrNull() ?: return
        history = history.dropLast(1)
        chosen = chosen - last
        index = (index - 1).coerceAtLeast(0)
    }

    fun applyAndStart() {
        if (busy) return
        scope.launch {
            busy = true
            val shown = cards.mapTo(HashSet()) { it.task.uid } + extraShown
            val body = MorningRitual.applyBody(shown, chosen)
            repo.apply(uid, body)
                .onSuccess {
                    tasks.requestSync()
                    onApplied()
                }
                .onFailure { err ->
                    snackbar.showSnackbar(if (err is IOException) offline else failed)
                }
            busy = false
        }
    }

    Surface(Modifier.fillMaxSize(), color = cadence.background, contentColor = cadence.onSurface) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            when {
                current == null -> {
                    ScreenHeader(
                        title = stringResource(R.string.ritual_step1_title),
                        onBack = onClose,
                        backDescription = stringResource(R.string.ritual_close),
                    )
                    Box(Modifier.fillMaxSize().padding(Space.gutter), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(Space.md)) {
                            Text(loadError ?: stringResource(R.string.proposal_loading), color = cadence.onSurfaceVariant)
                            if (loadError != null) {
                                SecondaryAction(stringResource(R.string.ritual_close), onClick = onClose)
                            }
                        }
                    }
                }

                !inStep2 -> {
                    ScreenHeader(
                        title = stringResource(R.string.ritual_step1_title),
                        onBack = onClose,
                        backDescription = stringResource(R.string.ritual_close),
                    )
                    RitualProgressBar(current = index + 1, total = cards.size)
                    val card = cards[index]
                    AnimatedContent(
                        targetState = card,
                        contentKey = { it.task.uid },
                        transitionSpec = {
                            (fadeIn(tween(ENTER_MS)) + slideInVertically(tween(ENTER_MS)) { it / 16 }) togetherWith fadeOut(tween(LEAVE_MS))
                        },
                        label = "morning-ritual-card",
                        modifier = Modifier.weight(1f),
                    ) { active ->
                        RitualCardStep(
                            card = active,
                            today = today,
                            undoable = history.isNotEmpty(),
                            onDecide = { decision -> decideCard(active.task.uid, decision) },
                            onMore = { moreForTask = active.task.uid },
                            onUndo = ::undoCard,
                        )
                    }
                }

                else -> {
                    val dayPlan = remember(current, today, chosen, focusUids) {
                        MorningRitual.dayPlan(current, today, chosen, focusUids)
                    }
                    ScreenHeader(
                        title = stringResource(R.string.ritual_step2_title),
                        onBack = {
                            if (cards.isNotEmpty()) index = cards.size - 1 else onClose()
                        },
                        backDescription = stringResource(R.string.ritual_close),
                    )
                    RitualDayStep(
                        plan = dayPlan,
                        busy = busy,
                        onToggleFocus = { taskUid -> focusUids = MorningRitual.toggleFocus(focusUids, taskUid) },
                        onNotToday = { taskUid ->
                            extraShown = extraShown + taskUid
                            chosen = chosen + (taskUid to WeekDecision(ProposalOp.PLAN_DAY, today.plusDays(1)))
                        },
                        onChangeChoice = { taskUid ->
                            extraShown = extraShown + taskUid
                            moreForTask = taskUid
                        },
                        onQuickOp = { taskUid, op ->
                            extraShown = extraShown + taskUid
                            chosen = chosen + (taskUid to WeekDecision(op))
                        },
                        onStartDay = ::applyAndStart,
                        onLater = onClose,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }

    moreForTask?.let { taskUid ->
        RitualMoreSheet(
            today = today,
            loads = loads,
            onPick = { decision ->
                moreForTask = null
                if (!inStep2) {
                    decideCard(taskUid, decision)
                } else {
                    extraShown = extraShown + taskUid
                    chosen = chosen + (taskUid to decision)
                }
            },
            onPickDate = {
                moreForTask = null
                dateForTask = taskUid
            },
            onDismiss = { moreForTask = null },
        )
    }

    dateForTask?.let { taskUid ->
        TaskDatePickerDialog(
            initial = today,
            onConfirm = { picked ->
                dateForTask = null
                val decision = WeekDecision(ProposalOp.PLAN_DAY, picked)
                if (!inStep2) {
                    decideCard(taskUid, decision)
                } else {
                    extraShown = extraShown + taskUid
                    chosen = chosen + (taskUid to decision)
                }
            },
            onDismiss = { dateForTask = null },
        )
    }
}

@Composable
private fun RitualProgressBar(current: Int, total: Int) {
    Column(
        Modifier.fillMaxWidth().padding(horizontal = Space.gutter, vertical = Space.xs),
        verticalArrangement = Arrangement.spacedBy(Space.xs),
    ) {
        Text(
            stringResource(R.string.ritual_progress, current, total),
            style = MaterialTheme.typography.labelMedium,
            color = cadence.onSurfaceVariant,
        )
        LinearProgressIndicator(
            progress = { if (total == 0) 1f else current.toFloat() / total },
            modifier = Modifier.fillMaxWidth().height(3.dp),
            color = cadence.primary,
            trackColor = cadence.containerHighest,
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun RitualCardStep(
    card: MorningCard,
    today: LocalDate,
    undoable: Boolean,
    onDecide: (WeekDecision) -> Unit,
    onMore: () -> Unit,
    onUndo: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val drag = remember(card.task.uid) { Animatable(Offset.Zero, Offset.VectorConverter) }
    val tomorrow = today.plusDays(1)
    val defaultLabel = decisionLabel(card.defaultChoice, today)
    val tomorrowLabel = stringResource(R.string.ritual_tomorrow)
    val laterLabel = stringResource(R.string.proposal_op_later)

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = Space.gutter, vertical = Space.md),
        verticalArrangement = Arrangement.spacedBy(Space.md),
    ) {
        Panel(
            modifier = Modifier
                .fillMaxWidth()
                .offset { IntOffset(drag.value.x.roundToInt(), drag.value.y.roundToInt()) }
                .graphicsLayer {
                    rotationZ = drag.value.x / ROTATION_DIVIDER
                    val dist = maxOf(abs(drag.value.x), abs(drag.value.y))
                    alpha = 1f - (dist / (size.width * 1.5f)).coerceIn(0f, 0.6f)
                }
                .pointerInput(card.task.uid) {
                    val thresholdX = size.width * SWIPE_FRACTION
                    val thresholdY = size.height * SWIPE_FRACTION
                    detectDragGestures(
                        onDragEnd = {
                            scope.launch {
                                val x = drag.value.x
                                val y = drag.value.y
                                when {
                                    x > thresholdX && abs(x) >= abs(y) -> {
                                        drag.animateTo(Offset(size.width * 1.2f, y), tween(LEAVE_MS))
                                        onDecide(MorningRitual.swipeChoice(RitualSwipe.RIGHT, card, today))
                                    }
                                    x < -thresholdX && abs(x) >= abs(y) -> {
                                        drag.animateTo(Offset(-size.width * 1.2f, y), tween(LEAVE_MS))
                                        onDecide(MorningRitual.swipeChoice(RitualSwipe.LEFT, card, today))
                                    }
                                    y < -thresholdY && abs(y) > abs(x) -> {
                                        drag.animateTo(Offset(x, -size.height * 1.2f), tween(LEAVE_MS))
                                        onDecide(MorningRitual.swipeChoice(RitualSwipe.UP, card, today))
                                    }
                                    else -> drag.animateTo(Offset.Zero)
                                }
                            }
                        },
                        onDragCancel = { scope.launch { drag.animateTo(Offset.Zero) } },
                    ) { change, amount ->
                        change.consume()
                        scope.launch { drag.snapTo(drag.value + amount) }
                    }
                }
                .semantics {
                    customActions = listOf(
                        CustomAccessibilityAction(defaultLabel) {
                            onDecide(MorningRitual.swipeChoice(RitualSwipe.RIGHT, card, today))
                            true
                        },
                        CustomAccessibilityAction(tomorrowLabel) {
                            onDecide(MorningRitual.swipeChoice(RitualSwipe.LEFT, card, today))
                            true
                        },
                        CustomAccessibilityAction(laterLabel) {
                            onDecide(MorningRitual.swipeChoice(RitualSwipe.UP, card, today))
                            true
                        },
                    )
                },
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                Text(
                    card.task.name,
                    style = MaterialTheme.typography.headlineSmall,
                    color = cadence.onSurface,
                )
                val metaParts = buildList {
                    card.task.project?.let { add(it) }
                    card.latenessDays?.let { days ->
                        add(
                            if (days <= 1) stringResource(R.string.proposal_late_yesterday)
                            else stringResource(R.string.proposal_late_days, days),
                        )
                    }
                    card.task.estimateMin?.takeIf { it > 0 }?.let { add(formatMinutes(it)) }
                }
                if (metaParts.isNotEmpty()) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(Space.sm),
                    ) {
                        card.task.project?.let {
                            Text(it, style = MaterialTheme.typography.labelLarge, color = cadence.onSurfaceVariant)
                        }
                        card.latenessDays?.let { days ->
                            val lateText = if (days <= 1) stringResource(R.string.proposal_late_yesterday)
                            else stringResource(R.string.proposal_late_days, days)
                            Text(lateText, style = MaterialTheme.typography.labelLarge, color = cadence.warning)
                        }
                        card.task.estimateMin?.takeIf { it > 0 }?.let { mins ->
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                                Icon(Icons.Outlined.Schedule, contentDescription = null, tint = cadence.onSurfaceVariant, modifier = Modifier.size(14.dp))
                                Text(formatMinutes(mins), style = MaterialTheme.typography.labelLarge, color = cadence.onSurfaceVariant)
                            }
                        }
                    }
                }
                if (card.hasAdvice && card.advice != null) {
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(cadence.primaryContainer)
                            .border(1.dp, cadence.primary.copy(alpha = 0.4f), RoundedCornerShape(12.dp))
                            .padding(Space.md),
                        verticalArrangement = Arrangement.spacedBy(Space.xs),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
                            Icon(Icons.Outlined.AutoAwesome, contentDescription = null, tint = cadence.onPrimaryContainer, modifier = Modifier.size(16.dp))
                            Text(
                                "${stringResource(R.string.ritual_advice_title)} · $defaultLabel",
                                style = MaterialTheme.typography.labelLarge,
                                color = cadence.onPrimaryContainer,
                            )
                        }
                        if (card.advice.reason.isNotBlank()) {
                            Text(
                                card.advice.reason,
                                style = MaterialTheme.typography.bodyMedium,
                                color = cadence.onPrimaryContainer,
                            )
                        }
                    }
                }
            }
        }

        // Gros boutons : le choix par défaut en premier et pré-sélectionné (accent si conseil IA, neutre sinon).
        val defaultDecision = card.defaultChoice
        val recommendedText = stringResource(R.string.triage_deck_recommended)
        BigActionButton(
            label = defaultLabel,
            icon = iconForDecision(defaultDecision, today),
            highlighted = card.hasAdvice,
            neutralPreselected = !card.hasAdvice,
            recommendedDescription = if (card.hasAdvice) recommendedText else null,
            modifier = Modifier.fillMaxWidth(),
            onClick = { onDecide(defaultDecision) },
        )

        FlowRow(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(Space.sm),
            verticalArrangement = Arrangement.spacedBy(Space.sm),
            maxItemsInEachRow = 2,
        ) {
            val todayDecision = WeekDecision(ProposalOp.PLAN_DAY, today)
            if (defaultDecision != todayDecision) {
                BigActionButton(
                    label = stringResource(R.string.ritual_today),
                    icon = Icons.Outlined.Today,
                    highlighted = false,
                    neutralPreselected = false,
                    recommendedDescription = null,
                    modifier = Modifier.weight(1f),
                    onClick = { onDecide(todayDecision) },
                )
            }
            val tomorrowDecision = WeekDecision(ProposalOp.PLAN_DAY, tomorrow)
            if (defaultDecision != tomorrowDecision) {
                BigActionButton(
                    label = stringResource(R.string.ritual_tomorrow),
                    icon = Icons.Outlined.Event,
                    highlighted = false,
                    neutralPreselected = false,
                    recommendedDescription = null,
                    modifier = Modifier.weight(1f),
                    onClick = { onDecide(tomorrowDecision) },
                )
            }
            BigActionButton(
                label = stringResource(R.string.ritual_more),
                icon = Icons.Outlined.MoreHoriz,
                highlighted = false,
                neutralPreselected = false,
                recommendedDescription = null,
                modifier = Modifier.weight(1f),
                onClick = onMore,
            )
            val doneDecision = WeekDecision(ProposalOp.DONE)
            if (defaultDecision != doneDecision) {
                BigActionButton(
                    label = stringResource(R.string.ritual_done),
                    icon = Icons.Outlined.Check,
                    highlighted = false,
                    neutralPreselected = false,
                    recommendedDescription = null,
                    modifier = Modifier.weight(1f),
                    onClick = { onDecide(doneDecision) },
                )
            }
            val dropDecision = WeekDecision(ProposalOp.DROP)
            if (defaultDecision != dropDecision) {
                BigActionButton(
                    label = stringResource(R.string.ritual_drop),
                    icon = Icons.Outlined.Close,
                    highlighted = false,
                    neutralPreselected = false,
                    recommendedDescription = null,
                    modifier = Modifier.weight(1f),
                    onClick = { onDecide(dropDecision) },
                )
            }
        }

        if (undoable) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                TertiaryAction(stringResource(R.string.ritual_undo), onClick = onUndo)
            }
        }
    }
}

@Composable
private fun BigActionButton(
    label: String,
    icon: ImageVector,
    highlighted: Boolean,
    neutralPreselected: Boolean,
    recommendedDescription: String?,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(14.dp)
    val bg = when {
        highlighted -> cadence.primaryContainer
        neutralPreselected -> cadence.containerHigh
        else -> cadence.containerLow
    }
    val borderColor = when {
        highlighted -> cadence.primary
        neutralPreselected -> cadence.outline
        else -> cadence.outlineVariant
    }
    val borderWidth = if (highlighted || neutralPreselected) 2.dp else 1.dp
    val tint = if (highlighted) cadence.onPrimaryContainer else cadence.onSurface

    Row(
        modifier
            .heightIn(min = 52.dp)
            .clip(shape)
            .background(bg)
            .border(borderWidth, borderColor, shape)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = Space.md, vertical = Space.sm)
            .semantics { if (recommendedDescription != null) stateDescription = recommendedDescription },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(Space.sm))
        Text(
            label,
            style = MaterialTheme.typography.labelLarge,
            color = tint,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun RitualDayStep(
    plan: MorningDayPlan,
    busy: Boolean,
    onToggleFocus: (String) -> Unit,
    onNotToday: (String) -> Unit,
    onChangeChoice: (String) -> Unit,
    onQuickOp: (String, ProposalOp) -> Unit,
    onStartDay: () -> Unit,
    onLater: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxSize()) {
        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Space.gutter, vertical = Space.md),
            verticalArrangement = Arrangement.spacedBy(Space.md),
        ) {
            Text(
                stringResource(
                    R.string.ritual_load_line,
                    formatMinutes(plan.plannedMinutes),
                    formatMinutes(plan.freeMinutes),
                ),
                style = MaterialTheme.typography.labelLarge,
                color = if (plan.overloaded) cadence.warning else cadence.onSurfaceVariant,
            )

            if (plan.focus.isNotEmpty()) {
                Text(
                    stringResource(R.string.ritual_focus_section),
                    style = MaterialTheme.typography.titleMedium,
                    color = cadence.onSurface,
                )
                plan.focus.forEach { item ->
                    FocusTaskCard(
                        item = item,
                        onToggleFocus = { onToggleFocus(item.taskUid) },
                        onChangeChoice = { onChangeChoice(item.taskUid) },
                        onQuickOp = { op -> onQuickOp(item.taskUid, op) },
                    )
                }
            }

            Text(
                stringResource(R.string.ritual_day_section),
                style = MaterialTheme.typography.titleMedium,
                color = cadence.onSurface,
            )

            if (plan.timeline.isEmpty()) {
                Text(
                    stringResource(R.string.ritual_empty_day),
                    style = MaterialTheme.typography.bodyMedium,
                    color = cadence.onSurfaceVariant,
                )
            } else {
                plan.timeline.forEach { entry ->
                    when (entry) {
                        is MorningTimelineEntry.Event -> DayEventRow(entry)
                        is MorningTimelineEntry.Task -> DayTaskRow(
                            item = entry.item,
                            onNotToday = { onNotToday(entry.item.taskUid) },
                            onToggleFocus = { onToggleFocus(entry.item.taskUid) },
                            onChangeChoice = { onChangeChoice(entry.item.taskUid) },
                            onQuickOp = { op -> onQuickOp(entry.item.taskUid, op) },
                        )
                    }
                }
            }
        }

        Column(
            Modifier
                .fillMaxWidth()
                .background(cadence.background)
                .padding(horizontal = Space.gutter, vertical = Space.md),
            verticalArrangement = Arrangement.spacedBy(Space.sm),
        ) {
            PrimaryAction(
                stringResource(R.string.ritual_start_day),
                modifier = Modifier.fillMaxWidth(),
                enabled = !busy,
                onClick = onStartDay,
            )
            SecondaryAction(
                stringResource(R.string.ritual_later),
                modifier = Modifier.fillMaxWidth(),
                enabled = !busy,
                onClick = onLater,
            )
        }
    }
}

@Composable
private fun FocusTaskCard(
    item: MorningDayItem,
    onToggleFocus: () -> Unit,
    onChangeChoice: () -> Unit,
    onQuickOp: (ProposalOp) -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    Panel(Modifier.fillMaxWidth()) {
        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Space.sm),
        ) {
            IconButton(onClick = onToggleFocus, modifier = Modifier.size(Size.touch)) {
                Icon(
                    Icons.Outlined.Star,
                    contentDescription = stringResource(R.string.ritual_unmark_focus),
                    tint = cadence.primary,
                )
            }
            Column(Modifier.weight(1f)) {
                Text(item.name, style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
                val meta = listOfNotNull(item.project, formatMinutes(item.minutes)).joinToString(" · ")
                Text(meta, style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
            }
            Box {
                IconButton(onClick = { menuOpen = true }, modifier = Modifier.size(Size.touch)) {
                    Icon(Icons.Outlined.MoreHoriz, contentDescription = stringResource(R.string.ritual_change_choice), tint = cadence.onSurfaceVariant)
                }
                TaskChoiceMenu(
                    expanded = menuOpen,
                    isFocus = true,
                    onDismiss = { menuOpen = false },
                    onToggleFocus = { menuOpen = false; onToggleFocus() },
                    onChangeChoice = { menuOpen = false; onChangeChoice() },
                    onDone = { menuOpen = false; onQuickOp(ProposalOp.DONE) },
                    onDrop = { menuOpen = false; onQuickOp(ProposalOp.DROP) },
                )
            }
        }
    }
}

@Composable
private fun DayEventRow(event: MorningTimelineEntry.Event) {
    val timeLabel = when {
        event.allDay -> stringResource(R.string.proposal_all_day)
        !event.start.isNullOrBlank() && !event.end.isNullOrBlank() -> "${event.start}–${event.end}"
        !event.start.isNullOrBlank() -> event.start
        else -> ""
    }
    Row(
        Modifier
            .fillMaxWidth()
            .clip(Radius.Control)
            .background(cadence.containerLow)
            .padding(horizontal = Space.md, vertical = Space.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Space.md),
    ) {
        Icon(Icons.Outlined.Event, contentDescription = null, tint = cadence.info, modifier = Modifier.size(Size.icon))
        Column(Modifier.weight(1f)) {
            Text(event.title, style = MaterialTheme.typography.bodyLarge, color = cadence.onSurface)
            if (timeLabel.isNotBlank()) {
                Text(timeLabel, style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun DayTaskRow(
    item: MorningDayItem,
    onNotToday: () -> Unit,
    onToggleFocus: () -> Unit,
    onChangeChoice: () -> Unit,
    onQuickOp: (ProposalOp) -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    Panel(Modifier.fillMaxWidth()) {
        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Space.sm),
        ) {
            IconButton(onClick = onToggleFocus, modifier = Modifier.size(Size.touch)) {
                Icon(
                    Icons.Outlined.StarOutline,
                    contentDescription = stringResource(R.string.ritual_mark_focus),
                    tint = cadence.onSurfaceVariant,
                )
            }
            Column(Modifier.weight(1f)) {
                Text(item.name, style = MaterialTheme.typography.bodyLarge, color = cadence.onSurface)
                val meta = listOfNotNull(item.project, formatMinutes(item.minutes)).joinToString(" · ")
                Text(meta, style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
            }
            TertiaryAction(stringResource(R.string.ritual_not_today), onClick = onNotToday)
            Box {
                IconButton(onClick = { menuOpen = true }, modifier = Modifier.size(Size.touch)) {
                    Icon(Icons.Outlined.MoreHoriz, contentDescription = stringResource(R.string.ritual_change_choice), tint = cadence.onSurfaceVariant)
                }
                TaskChoiceMenu(
                    expanded = menuOpen,
                    isFocus = false,
                    onDismiss = { menuOpen = false },
                    onToggleFocus = { menuOpen = false; onToggleFocus() },
                    onChangeChoice = { menuOpen = false; onChangeChoice() },
                    onDone = { menuOpen = false; onQuickOp(ProposalOp.DONE) },
                    onDrop = { menuOpen = false; onQuickOp(ProposalOp.DROP) },
                )
            }
        }
    }
}

@Composable
private fun TaskChoiceMenu(
    expanded: Boolean,
    isFocus: Boolean,
    onDismiss: () -> Unit,
    onToggleFocus: () -> Unit,
    onChangeChoice: () -> Unit,
    onDone: () -> Unit,
    onDrop: () -> Unit,
) {
    DropdownMenu(expanded = expanded, onDismissRequest = onDismiss) {
        DropdownMenuItem(
            text = { Text(stringResource(if (isFocus) R.string.ritual_unmark_focus else R.string.ritual_mark_focus)) },
            onClick = onToggleFocus,
        )
        DropdownMenuItem(
            text = { Text(stringResource(R.string.ritual_change_choice)) },
            onClick = onChangeChoice,
        )
        DropdownMenuItem(
            text = { Text(stringResource(R.string.ritual_done)) },
            onClick = onDone,
        )
        DropdownMenuItem(
            text = { Text(stringResource(R.string.ritual_drop)) },
            onClick = onDrop,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RitualMoreSheet(
    today: LocalDate,
    loads: List<DayLoad>,
    onPick: (WeekDecision) -> Unit,
    onPickDate: () -> Unit,
    onDismiss: () -> Unit,
) {
    val days = remember(today) { (0L..6L).map { today.plusDays(it) } }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = cadence.containerLow,
        contentColor = cadence.onSurface,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Space.gutter, vertical = Space.md),
            verticalArrangement = Arrangement.spacedBy(Space.xs),
        ) {
            Text(
                stringResource(R.string.ritual_more_title),
                style = MaterialTheme.typography.titleMedium,
                color = cadence.onSurface,
                modifier = Modifier.padding(bottom = Space.xs),
            )
            days.forEach { date ->
                val count = loads.firstOrNull { it.date == date }?.items?.size ?: 0
                val dayText = when (date) {
                    today -> stringResource(R.string.ritual_today)
                    today.plusDays(1) -> stringResource(R.string.ritual_tomorrow)
                    else -> date.format(ritualDayChip)
                }
                val countText = pluralStringResource(R.plurals.ritual_day_tasks, count, count)
                MoreOptionRow(
                    label = if (count > 0) "$dayText · $countText" else dayText,
                    onClick = { onPick(WeekDecision(ProposalOp.PLAN_DAY, date)) },
                )
            }
            HorizontalDivider(Modifier.padding(vertical = Space.xs), color = cadence.outlineVariant)
            listOf(
                ProposalOp.THIS_WEEK to stringResource(R.string.proposal_op_this_week),
                ProposalOp.NEXT_WEEK to stringResource(R.string.proposal_op_next_week),
                ProposalOp.THIS_MONTH to stringResource(R.string.proposal_op_this_month),
                ProposalOp.NEXT_MONTH to stringResource(R.string.proposal_op_next_month),
                ProposalOp.LATER to stringResource(R.string.proposal_op_later),
            ).forEach { (op, label) ->
                MoreOptionRow(label = label, onClick = { onPick(WeekDecision(op)) })
            }
            MoreOptionRow(
                label = stringResource(R.string.ritual_other_date),
                icon = Icons.Outlined.CalendarMonth,
                onClick = onPickDate,
            )
            Spacer(Modifier.height(Space.md))
        }
    }
}

@Composable
private fun MoreOptionRow(label: String, icon: ImageVector? = null, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(Radius.Control)
            .clickable(role = Role.Button, onClick = onClick)
            .heightIn(min = Size.touch)
            .padding(horizontal = Space.sm, vertical = Space.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Space.sm),
    ) {
        if (icon != null) {
            Icon(icon, contentDescription = null, tint = cadence.onSurfaceVariant, modifier = Modifier.size(Size.icon))
        }
        Text(label, style = MaterialTheme.typography.bodyLarge, color = cadence.onSurface)
    }
}

@Composable
private fun decisionLabel(decision: WeekDecision, today: LocalDate): String = when (decision.op) {
    ProposalOp.PLAN_DAY -> when (decision.date) {
        today -> stringResource(R.string.ritual_today)
        today.plusDays(1) -> stringResource(R.string.ritual_tomorrow)
        else -> decision.date?.format(ritualDayChip).orEmpty()
    }
    ProposalOp.THIS_WEEK -> stringResource(R.string.proposal_op_this_week)
    ProposalOp.NEXT_WEEK -> stringResource(R.string.proposal_op_next_week)
    ProposalOp.THIS_MONTH -> stringResource(R.string.proposal_op_this_month)
    ProposalOp.NEXT_MONTH -> stringResource(R.string.proposal_op_next_month)
    ProposalOp.LATER -> stringResource(R.string.proposal_op_later)
    ProposalOp.DUE -> stringResource(R.string.proposal_op_due, decision.date?.format(ritualDueDay).orEmpty())
    ProposalOp.DONE -> stringResource(R.string.ritual_done)
    ProposalOp.DROP -> stringResource(R.string.ritual_drop)
    ProposalOp.KEEP -> stringResource(R.string.proposal_op_keep)
}

private fun iconForDecision(decision: WeekDecision, today: LocalDate): ImageVector = when (decision.op) {
    ProposalOp.PLAN_DAY -> if (decision.date == today) Icons.Outlined.Today else Icons.Outlined.Event
    ProposalOp.DONE -> Icons.Outlined.Check
    ProposalOp.DROP -> Icons.Outlined.Close
    ProposalOp.LATER, ProposalOp.THIS_WEEK, ProposalOp.NEXT_WEEK, ProposalOp.THIS_MONTH, ProposalOp.NEXT_MONTH -> Icons.Outlined.Schedule
    ProposalOp.DUE -> Icons.Outlined.CalendarMonth
    ProposalOp.KEEP -> Icons.Outlined.Check
}

@Composable
private fun formatMinutes(minutes: Int): String = when {
    minutes < 60 -> stringResource(R.string.proposal_minutes, minutes)
    minutes % 60 == 0 -> stringResource(R.string.proposal_hours, minutes / 60)
    else -> stringResource(R.string.proposal_hours_minutes, minutes / 60, minutes % 60)
}
