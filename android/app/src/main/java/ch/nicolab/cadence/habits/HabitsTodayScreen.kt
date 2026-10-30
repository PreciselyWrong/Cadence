package ch.nicolab.cadence.habits

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import ch.nicolab.cadence.AbstinenceHomeCard
import ch.nicolab.cadence.HabitCardState
import ch.nicolab.cadence.R
import ch.nicolab.cadence.ToCompleteItem
import ch.nicolab.cadence.ToCompleteRow
import ch.nicolab.cadence.abstinenceStatus
import ch.nicolab.cadence.designsystem.components.ActionRow
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.EmptyState
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.SectionHeader
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.components.rememberCadenceHaptic
import ch.nicolab.cadence.designsystem.theme.Motion
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.designsystem.theme.habitAccent
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitGroup
import ch.nicolab.cadence.domain.HabitTimer
import ch.nicolab.cadence.domain.PeriodType
import ch.nicolab.cadence.domain.TodayPresentation
import ch.nicolab.cadence.ui.HabitFormatter
import ch.nicolab.cadence.ui.ScreenList
import java.time.LocalTime
import kotlinx.coroutines.delay

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
internal fun HabitsTodayScreen(
    header: @Composable () -> Unit,
    habits: List<HabitCardState>,
    groups: List<HabitGroup>,
    selectedGroupId: String?,
    onSelectGroup: (String?) -> Unit,
    quick: (HabitCardState) -> Unit,
    options: (HabitCardState) -> Unit,
    create: () -> Unit,
    timers: Map<String, HabitTimer>,
    busy: Boolean,
    direct: (HabitCardState) -> Unit,
    offerReturn: Boolean,
    resume: () -> Unit,
    edit: (HabitCardState) -> Unit,
) {
    val time by produceState(LocalTime.now()) {
        while (true) {
            value = LocalTime.now()
            delay(30_000)
        }
    }
    var completedOpen by rememberSaveable(selectedGroupId) { mutableStateOf(false) }
    var adjustOpen by rememberSaveable { mutableStateOf(false) }
    val active = habits.filter { !it.stored.archived && (selectedGroupId == null || it.stored.groupId == selectedGroupId) }
    val byId = active.associateBy { it.stored.id }
    val sections = TodayPresentation.sections(active.map { it.evaluation }, groups, time)
    val now = if (selectedGroupId == null) sections.now else active.map { it.evaluation }
        .filter { it in sections.now || it in sections.later || it in sections.earlier }
    val goalNow = now.filterNot { it.habit.goal.isTracker }
    val goalLater = sections.later.filterNot { it.habit.goal.isTracker }
    val goalEarlier = sections.earlier.filterNot { it.habit.goal.isTracker }
    val pendingHabits = if (selectedGroupId == null) {
        (goalNow + goalLater + goalEarlier).distinctBy { it.habit.id }
    } else {
        now.filterNot { it.habit.goal.isTracker }
    }
    val trackers = active.filter { it.stored.goal.isTracker && it.evaluation.isPlannedForDate && !it.evaluation.isPaused }
    val abstinences = active.filter { it.stored.goal.isAbstinence }
    val toComplete = remember(active, timers) { ToCompleteItem.resolve(active, timers) }
    val populatedGroups = remember(groups, habits) {
        groups.filter { g -> habits.any { it.stored.groupId == g.id && !it.stored.archived } }
    }

    ScreenList(header = header) {
        if (populatedGroups.size > 1) item { GroupFilter(populatedGroups, habits, selectedGroupId, onSelectGroup) }
        if (offerReturn) item {
            Column(Modifier.fillMaxWidth().padding(vertical = Space.md), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                Text(stringResource(R.string.today_return_title), style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
                Text(stringResource(R.string.today_return_message), style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
                PrimaryAction(stringResource(R.string.today_return_resume), Modifier.fillMaxWidth(), onClick = resume)
                TertiaryAction(stringResource(R.string.today_return_adjust), Modifier.fillMaxWidth()) { adjustOpen = true }
            }
        }
        if (toComplete.isNotEmpty()) {
            item(key = "section_to_complete") {
                SectionHeader(stringResource(R.string.today_to_complete_section, toComplete.size))
            }
            items(toComplete, key = { it.key }) { item ->
                ToCompleteRow(item, onClick = { quick(item.habit) })
            }
        }
        when {
            active.isEmpty() -> item {
                EmptyState(
                    Icons.Outlined.AutoAwesome,
                    stringResource(if (selectedGroupId == null) R.string.empty_habits_title else R.string.group_filter_empty),
                    stringResource(R.string.empty_habits_message),
                ) {
                    if (selectedGroupId == null) PrimaryAction(stringResource(R.string.create_habit_button), onClick = create)
                }
            }
            toComplete.isEmpty() && pendingHabits.isEmpty() && trackers.isEmpty() && abstinences.isEmpty() -> item {
                EmptyState(Icons.Outlined.Check, stringResource(R.string.empty_today_done_title), stringResource(R.string.empty_today_done_message))
            }
        }
        if (pendingHabits.isNotEmpty()) {
            items(pendingHabits, key = { it.habit.id }) { evaluation ->
                byId[evaluation.habit.id]?.let { item ->
                    Box(Modifier.animateItem().fillMaxWidth()) {
                        TodayHabitRow(item, timers[item.stored.id], busy, quick, options, direct)
                    }
                }
            }
        }
        if (sections.completed.isNotEmpty()) {
            item { FoldHeading(stringResource(R.string.today_completed_count, sections.completed.size), completedOpen) { completedOpen = !completedOpen } }
            if (completedOpen) items(sections.completed, key = { it.habit.id }) { evaluation ->
                byId[evaluation.habit.id]?.let { item ->
                    Box(Modifier.animateItem().fillMaxWidth()) {
                        HabitRow(item, done = true, onClick = { quick(item) }, onLongClick = { options(item) })
                    }
                }
            }
        }
        if (trackers.isNotEmpty()) {
            item { SectionHeader(stringResource(R.string.today_activities_section)) }
            items(trackers, key = { it.stored.id }) { item ->
                Box(Modifier.animateItem().fillMaxWidth()) {
                    TodayHabitRow(item, timers[item.stored.id], busy, quick, options, direct)
                }
            }
        }
        if (abstinences.isNotEmpty()) {
            item { SectionHeader(stringResource(R.string.today_abstinences_section)) }
            items(abstinences, key = { it.stored.id }) {
                Box(Modifier.animateItem().fillMaxWidth()) {
                    AbstinenceHomeCard(it, { quick(it) }, { options(it) })
                }
            }
        }
    }
    if (adjustOpen) CadenceSheet(
        title = stringResource(R.string.today_return_choose),
        subtitle = stringResource(R.string.today_return_choose_help),
        dismiss = { adjustOpen = false },
    ) {
        androidx.compose.foundation.lazy.LazyColumn(
            Modifier.heightIn(max = Size.sheetContent),
            verticalArrangement = Arrangement.spacedBy(Space.sm),
        ) {
            items(habits.filter { it.stored.active && !it.stored.archived && !it.stored.goal.isAbstinence }, key = { it.stored.id }) { item ->
                ActionRow(Icons.Outlined.Edit, item.stored.name, cadence.habitAccent(item.stored.colorArgb)) {
                    adjustOpen = false
                    resume()
                    edit(item)
                }
            }
        }
    }
}

@Composable
private fun TodayHabitRow(
    item: HabitCardState,
    timer: HabitTimer?,
    busy: Boolean,
    quick: (HabitCardState) -> Unit,
    options: (HabitCardState) -> Unit,
    direct: (HabitCardState) -> Unit,
) {
    val amount = TodayPresentation.directAmount(item.evaluation, item.quickValues)
    val label = when {
        amount == null -> null
        item.stored.timerEnabled && item.stored.goal.goalType == GoalType.DURATION -> stringResource(when {
            timer?.isRunning == true -> R.string.today_action_timer
            timer != null && timer.accumulatedSeconds > 0 -> R.string.today_action_resume
            else -> R.string.today_action_start
        })
        item.stored.goal.goalType == GoalType.BINARY -> stringResource(R.string.today_action_done)
        else -> stringResource(R.string.today_action_add, quantityWithUnit(amount, item))
    }
    HabitRow(item, onClick = { quick(item) }, onLongClick = { options(item) }, actionLabel = label, actionEnabled = !busy) {
        if (timer?.isRunning == true) quick(item) else direct(item)
    }
}

@Composable
internal fun FoldHeading(label: String, expanded: Boolean, toggle: () -> Unit) {
    val state = stringResource(if (expanded) R.string.today_expand else R.string.today_collapse)
    val haptic = rememberCadenceHaptic()
    val rotation by animateFloatAsState(
        targetValue = if (expanded) 180f else 0f,
        animationSpec = Motion.normal(),
        label = "foldHeadingArrow",
    )
    Row(
        Modifier
            .fillMaxWidth()
            .clip(Radius.Control)
            .clickable(role = Role.Button, onClick = {
                haptic.tap()
                toggle()
            })
            .heightIn(min = Size.touch)
            .semantics { stateDescription = state }
            .padding(horizontal = Space.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, Modifier.weight(1f), style = MaterialTheme.typography.labelLarge, color = cadence.onSurfaceVariant)
        Icon(
            Icons.Outlined.KeyboardArrowDown,
            null,
            tint = cadence.onSurfaceVariant,
            modifier = Modifier
                .size(Size.icon)
                .graphicsLayer { rotationZ = rotation },
        )
    }
}

internal fun quantityWithUnit(value: Long, item: HabitCardState): String {
    val goal = item.stored.goal
    return HabitFormatter.formatWithUnit(value, goal.goalType, goal.unit)
}

@Composable
internal fun conciseHabitStatus(item: HabitCardState): String {
    val evaluation = item.evaluation
    val goal = item.stored.goal
    return when {
        item.stored.archived -> stringResource(R.string.status_archived)
        !item.stored.active || evaluation.isPaused -> stringResource(R.string.status_paused)
        goal.isAbstinence -> abstinenceStatus(item)
        goal.isTracker -> stringResource(R.string.tracker_today_total, quantityWithUnit(evaluation.progressMinor, item))
        goal.isLimit -> stringResource(
            if (evaluation.progressMinor > evaluation.targetMinor) R.string.today_limit_exceeded else R.string.today_limit,
            quantityWithUnit(evaluation.progressMinor, item), quantityWithUnit(evaluation.targetMinor, item),
        )
        evaluation.isCompleted -> stringResource(R.string.status_ideal_reached)
        evaluation.completedQuantity && !evaluation.completedFrequency -> stringResource(R.string.today_frequency, (goal.frequencyTarget ?: 0) - evaluation.sessionCount)
        goal.goalType == GoalType.BINARY -> stringResource(R.string.status_todo)
        evaluation.validatesPeriod && goal.hasDistinctMinimum -> stringResource(R.string.today_minimum, quantityWithUnit((evaluation.targetMinor - evaluation.progressMinor).coerceAtLeast(0), item))
        else -> stringResource(when (goal.period) {
            PeriodType.DAY -> R.string.today_remaining
            PeriodType.WEEK -> R.string.today_remaining_week
            PeriodType.MONTH -> R.string.today_remaining_month
        }, quantityWithUnit((evaluation.targetMinor - evaluation.progressMinor).coerceAtLeast(0), item))
    }
}
