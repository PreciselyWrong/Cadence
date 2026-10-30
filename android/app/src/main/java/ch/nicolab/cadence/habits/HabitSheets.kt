package ch.nicolab.cadence.habits

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.TrendingFlat
import androidx.compose.material.icons.outlined.Archive
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.KeyboardArrowUp
import androidx.compose.material.icons.outlined.Pause
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Restore
import androidx.compose.material.icons.outlined.Sell
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.HabitCardState
import ch.nicolab.cadence.HabitHistoryGraph
import ch.nicolab.cadence.R
import ch.nicolab.cadence.TimerPanel
import ch.nicolab.cadence.designsystem.components.ActionRow
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.ChoiceChip
import ch.nicolab.cadence.designsystem.components.Hairline
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.components.SectionHeader
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.components.ValueChip
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitEntry
import ch.nicolab.cadence.domain.HabitGroup
import ch.nicolab.cadence.domain.HabitTimer
import ch.nicolab.cadence.ui.HabitFormatter
import java.time.LocalDate

/** Déplacement d'une habitude d'un groupe à l'autre, sans passer par le formulaire complet. */
@OptIn(ExperimentalLayoutApi::class, androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
internal fun GroupPickerSheet(
    item: HabitCardState,
    groups: List<HabitGroup>,
    dismiss: () -> Unit,
    choose: (String) -> Unit,
) {
    val tint = habitTint(item)
    CadenceSheet(
        title = stringResource(R.string.group_move_title),
        subtitle = item.stored.name,
        dismiss = dismiss,
        leading = { HabitAvatar(item, tint) },
    ) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
            groups.forEach { group ->
                ChoiceChip(group.name, item.stored.groupId == group.id, accent = tint) { choose(group.id) }
            }
        }
        Spacer(Modifier.height(Space.xl))
        SecondaryAction(stringResource(R.string.form_btn_cancel), Modifier.fillMaxWidth(), onClick = dismiss)
    }
}

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
internal fun HabitOptionsSheet(
    item: HabitCardState,
    dismiss: () -> Unit,
    edit: () -> Unit,
    pause: () -> Unit,
    skipToday: () -> Unit,
    cancelSkip: (String) -> Unit,
    resumePause: (String) -> Unit,
    moveToGroup: () -> Unit,
    stopProgression: () -> Unit,
    archive: () -> Unit,
    duplicate: () -> Unit,
    up: () -> Unit,
    down: () -> Unit,
    delete: () -> Unit,
) {
    val palette = cadence
    val tint = habitTint(item)
    CadenceSheet(
        title = item.stored.name,
        subtitle = conciseHabitStatus(item),
        dismiss = dismiss,
        leading = { HabitAvatar(item, tint) },
    ) {
        ActionRow(Icons.Outlined.Edit, stringResource(R.string.action_edit), tint, edit)
        ActionRow(
            if (item.evaluation.isPaused) Icons.Outlined.PlayArrow else Icons.Outlined.Pause,
            stringResource(if (item.evaluation.isPaused) R.string.action_resume else R.string.action_pause),
            tint,
            pause,
        )
        val today = LocalDate.now()
        val skip = item.cancellableSkip(today)
        val suspension = item.activePause(today)
        when {
            skip != null -> ActionRow(Icons.Outlined.Restore, stringResource(R.string.skip_cancel_today), tint) { cancelSkip(skip.id) }
            suspension != null -> ActionRow(
                Icons.Outlined.PlayArrow,
                stringResource(
                    R.string.travel_active,
                    suspension.pause.endExclusive?.minusDays(1)?.toString().orEmpty(),
                ),
                tint,
            ) { resumePause(suspension.id) }
            !item.evaluation.isPaused ->
                ActionRow(Icons.Outlined.EventBusy, stringResource(R.string.action_skip_today), tint, skipToday)
        }
        ActionRow(
            if (item.stored.archived) Icons.Outlined.Restore else Icons.Outlined.Archive,
            stringResource(if (item.stored.archived) R.string.action_restore else R.string.action_archive),
            tint,
            archive,
        )
        ActionRow(Icons.Outlined.Sell, stringResource(R.string.action_move_to_group), tint, moveToGroup)
        if (item.stored.goal.progression != null) {
            ActionRow(Icons.AutoMirrored.Outlined.TrendingFlat, stringResource(R.string.progression_stop), tint, stopProgression)
        }
        ActionRow(Icons.Outlined.ContentCopy, stringResource(R.string.action_duplicate), tint, duplicate)
        ActionRow(Icons.Outlined.KeyboardArrowUp, stringResource(R.string.action_reorder_up), tint, up)
        ActionRow(Icons.Outlined.KeyboardArrowDown, stringResource(R.string.action_reorder_down), tint, down)
        Spacer(Modifier.height(Space.sm))
        Hairline()
        Spacer(Modifier.height(Space.sm))
        ActionRow(Icons.Outlined.Delete, stringResource(R.string.action_delete), palette.error, delete)
    }
}

@OptIn(ExperimentalLayoutApi::class, androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
internal fun QuickSheet(
    item: HabitCardState,
    add: (Long, String?) -> Unit,
    undo: () -> Unit,
    correct: (HabitEntry) -> Unit,
    timer: HabitTimer?,
    startTimer: () -> Unit,
    pauseTimer: () -> Unit,
    finishTimer: () -> Unit,
    resetTimer: () -> Unit,
    dismiss: () -> Unit,
) {
    var custom by remember { mutableStateOf("") }
    // La note accompagne la prochaine saisie, quelle que soit la façon de la déclencher.
    var note by remember(item.stored.id) { mutableStateOf("") }
    val record: (Long) -> Unit = { value -> add(value, note); note = "" }
    val tint = habitTint(item)
    val scale = item.stored.goal.unit?.scaleToCanonical ?: 1
    CadenceSheet(
        title = item.stored.name,
        subtitle = progress(item),
        dismiss = dismiss,
        leading = { HabitAvatar(item, tint) },
    ) {
        if (!item.stored.goal.isTracker) {
            HabitHistoryGraph(item.history, tint, Modifier.fillMaxWidth().padding(bottom = Space.xl))
            StreakLine(item.streak)
        }
        Spacer(Modifier.height(Space.xl))
        if (item.stored.timerEnabled && item.stored.goal.goalType == GoalType.DURATION) {
            SectionHeader(stringResource(R.string.timer_section))
            Spacer(Modifier.height(Space.sm))
            TimerPanel(
                timer = timer,
                goal = item.stored.goal,
                progressMinor = item.evaluation.progressMinor,
                accent = tint,
                start = startTimer,
                pause = pauseTimer,
                finish = { finishTimer(); dismiss() },
                reset = resetTimer,
            )
            Spacer(Modifier.height(Space.xl))
        }
        CadenceField(note, { note = it }, stringResource(R.string.quick_note_label), accent = tint)
        Spacer(Modifier.height(Space.lg))
        if (item.stored.goal.goalType == GoalType.BINARY) {
            PrimaryAction(stringResource(R.string.quick_btn_validate), Modifier.fillMaxWidth(), accent = tint) { record(1); dismiss() }
        } else {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                item.quickValues.ifEmpty { listOf(scale) }.forEach { value ->
                    ValueChip("+${HabitFormatter.formatValue(value, item.stored.goal.goalType, item.stored.goal.unit)}", accent = tint) { record(value) }
                }
            }
            Spacer(Modifier.height(Space.lg))
            CadenceField(
                custom,
                { custom = it.filter(Char::isDigit) },
                stringResource(R.string.quick_custom_value_label),
                suffix = item.stored.goal.unit?.symbol,
                accent = tint,
                numeric = true,
            )
            Spacer(Modifier.height(Space.md))
            PrimaryAction(stringResource(R.string.quick_btn_add), Modifier.fillMaxWidth(), accent = tint, enabled = (custom.toLongOrNull() ?: 0) > 0) {
                custom.toLongOrNull()?.takeIf { it > 0 }?.let { record(it * scale); custom = "" }
            }
        }
        Spacer(Modifier.height(Space.xs))
        TertiaryAction(stringResource(R.string.quick_btn_undo), Modifier.fillMaxWidth(), onClick = undo)

        Spacer(Modifier.height(Space.xl))
        SectionHeader(stringResource(R.string.entries_section))
        Spacer(Modifier.height(Space.sm))
        if (item.recentEntries.isEmpty()) {
            Text(stringResource(R.string.entries_empty), style = MaterialTheme.typography.bodySmall, color = cadence.outline)
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                item.recentEntries.take(VISIBLE_ENTRIES).forEach { entry ->
                    EntryRow(entry, item.stored.goal.goalType, item.stored.goal.unit) { correct(entry) }
                }
            }
        }
    }
}
