package ch.nicolab.cadence

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.KeyboardArrowUp
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitGroup
import ch.nicolab.cadence.domain.HabitTimer
import ch.nicolab.cadence.domain.PeriodType
import ch.nicolab.cadence.domain.TodayPresentation
import ch.nicolab.cadence.ui.HabitFormatter
import ch.nicolab.cadence.ui.components.ActionRow
import ch.nicolab.cadence.ui.components.CadenceSheet
import ch.nicolab.cadence.ui.components.EmptyState
import ch.nicolab.cadence.ui.components.HeaderAction
import ch.nicolab.cadence.ui.components.PrimaryAction
import ch.nicolab.cadence.ui.components.SectionLabel
import ch.nicolab.cadence.ui.components.TertiaryAction
import ch.nicolab.cadence.ui.theme.Radius
import ch.nicolab.cadence.ui.theme.Size
import ch.nicolab.cadence.ui.theme.Space
import ch.nicolab.cadence.ui.theme.cadence
import ch.nicolab.cadence.ui.theme.habitAccent
import java.time.LocalTime
import kotlinx.coroutines.delay

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
internal fun TodayScreen(
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
    var laterOpen by rememberSaveable(selectedGroupId) { mutableStateOf(false) }
    var earlierOpen by rememberSaveable(selectedGroupId) { mutableStateOf(false) }
    var adjustOpen by rememberSaveable { mutableStateOf(false) }
    val active = habits.filter { !it.stored.archived && (selectedGroupId == null || it.stored.groupId == selectedGroupId) }
    val byId = active.associateBy { it.stored.id }
    val sections = TodayPresentation.sections(active.map { it.evaluation }, groups, time)
    val now = if (selectedGroupId == null) sections.now else active.map { it.evaluation }
        .filter { it in sections.now || it in sections.later || it in sections.earlier }
    val goalNow = now.filterNot { it.habit.goal.isTracker }
    val goalLater = sections.later.filterNot { it.habit.goal.isTracker }
    val goalEarlier = sections.earlier.filterNot { it.habit.goal.isTracker }
    val trackers = active.filter { it.stored.goal.isTracker && it.evaluation.isPlannedForDate && !it.evaluation.isPaused }
    val abstinences = active.filter { it.stored.goal.isAbstinence }
    val toComplete = remember(active, timers) { ToCompleteItem.resolve(active, timers) }

    ScreenList(
        context = stringResource(R.string.today_subtitle),
        title = stringResource(R.string.today_title),
        action = { HeaderAction(Icons.Outlined.Add, stringResource(R.string.create_habit_button), accent = true, onClick = create) },
    ) {
        if (groups.size > 1) item { GroupFilter(groups, habits, selectedGroupId, onSelectGroup) }
        if (offerReturn) item {
            Column(Modifier.fillMaxWidth().padding(vertical = Space.md), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                Text(stringResource(R.string.today_return_title), style = MaterialTheme.typography.titleMedium, color = cadence.ink)
                Text(stringResource(R.string.today_return_message), style = MaterialTheme.typography.bodySmall, color = cadence.inkMuted)
                PrimaryAction(stringResource(R.string.today_return_resume), Modifier.fillMaxWidth(), onClick = resume)
                TertiaryAction(stringResource(R.string.today_return_adjust), Modifier.fillMaxWidth()) { adjustOpen = true }
            }
        }
        if (toComplete.isNotEmpty()) {
            item(key = "section_to_complete") {
                SectionLabel(stringResource(R.string.today_to_complete_section, toComplete.size))
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
            toComplete.isEmpty() && goalNow.isEmpty() && goalLater.isEmpty() && goalEarlier.isEmpty() && trackers.isEmpty() && abstinences.isEmpty() -> item {
                EmptyState(Icons.Outlined.Check, stringResource(R.string.empty_today_done_title), stringResource(R.string.empty_today_done_message))
            }
        }
        if (goalNow.isNotEmpty() && selectedGroupId == null && (goalLater.isNotEmpty() || goalEarlier.isNotEmpty())) {
            item { SectionLabel(stringResource(R.string.today_now)) }
        }
        items(goalNow, key = { it.habit.id }) { evaluation ->
            byId[evaluation.habit.id]?.let { item -> TodayHabitRow(item, timers[item.stored.id], busy, quick, options, direct) }
        }
        if (selectedGroupId == null && goalLater.isNotEmpty()) {
            item { FoldHeading(stringResource(R.string.today_later_count, goalLater.size), laterOpen) { laterOpen = !laterOpen } }
            if (laterOpen) items(goalLater, key = { it.habit.id }) { evaluation ->
                byId[evaluation.habit.id]?.let { item -> TodayHabitRow(item, timers[item.stored.id], busy, quick, options, direct) }
            }
        }
        if (selectedGroupId == null && goalEarlier.isNotEmpty()) {
            item { FoldHeading(stringResource(R.string.today_earlier_count, goalEarlier.size), earlierOpen) { earlierOpen = !earlierOpen } }
            if (earlierOpen) items(goalEarlier, key = { it.habit.id }) { evaluation ->
                byId[evaluation.habit.id]?.let { item -> TodayHabitRow(item, timers[item.stored.id], busy, quick, options, direct) }
            }
        }
        if (sections.completed.isNotEmpty()) {
            item { FoldHeading(stringResource(R.string.today_completed_count, sections.completed.size), completedOpen) { completedOpen = !completedOpen } }
            if (completedOpen) items(sections.completed, key = { it.habit.id }) { evaluation ->
                byId[evaluation.habit.id]?.let { item -> HabitRow(item, done = true, onClick = { quick(item) }, onLongClick = { options(item) }) }
            }
        }
        if (trackers.isNotEmpty()) {
            item { SectionLabel(stringResource(R.string.today_activities_section)) }
            items(trackers, key = { it.stored.id }) { item ->
                TodayHabitRow(item, timers[item.stored.id], busy, quick, options, direct)
            }
        }
        if (abstinences.isNotEmpty()) {
            item { SectionLabel(stringResource(R.string.today_abstinences_section)) }
            items(abstinences, key = { it.stored.id }) { AbstinenceHomeCard(it, { quick(it) }, { options(it) }) }
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
    Row(
        Modifier.fillMaxWidth().clip(Radius.Control).clickable(role = Role.Button, onClick = toggle)
            .heightIn(min = Size.touch).semantics { stateDescription = state }.padding(horizontal = Space.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, Modifier.weight(1f), style = MaterialTheme.typography.labelLarge, color = cadence.inkMuted)
        Icon(if (expanded) Icons.Outlined.KeyboardArrowUp else Icons.Outlined.KeyboardArrowDown, null, tint = cadence.inkMuted, modifier = Modifier.size(Size.icon))
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
