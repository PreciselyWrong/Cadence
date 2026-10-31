package ch.nicolab.cadence

import ch.nicolab.cadence.habits.habitTint
import ch.nicolab.cadence.habits.QuickSheet
import android.os.Bundle
import android.content.Intent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.HabitFacet
import ch.nicolab.cadence.designsystem.components.Hairline
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.components.ValueChip
import ch.nicolab.cadence.designsystem.theme.CadenceTheme
import ch.nicolab.cadence.designsystem.theme.Elevation
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.habits.EntryEditor
import ch.nicolab.cadence.ui.HabitFormatter
import ch.nicolab.cadence.ui.icon.HabitIconRegistry
import java.util.UUID

class QuickEntryActivity : ComponentActivity() {
    companion object {
        const val EXTRA_HABIT_ID = "habit_id"
        const val EXTRA_ALCOHOL_CONSUMPTION_ID = "alcohol_consumption_id"
    }
    private val viewModel by viewModels<MainViewModel> { MainViewModelFactory(application as CadenceApp) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val habitId = intent.getStringExtra(EXTRA_HABIT_ID)
        val alcoholConsumptionId = intent.getStringExtra(EXTRA_ALCOHOL_CONSUMPTION_ID)
        setContent { CadenceTheme { QuickEntryScreen(viewModel, habitId, alcoholConsumptionId, ::finish) } }
    }
}

@Composable
private fun QuickEntryScreen(viewModel: MainViewModel, habitId: String?, alcoholConsumptionId: String?, dismiss: () -> Unit) {
    val palette = cadence
    val isLoaded by viewModel.isLoaded.collectAsStateWithLifecycle()
    val habits by viewModel.habits.collectAsStateWithLifecycle()
    val lastEntryId by viewModel.lastEntryId.collectAsStateWithLifecycle()
    val timers by viewModel.timers.collectAsStateWithLifecycle()
    val busy by viewModel.isSaving.collectAsStateWithLifecycle()
    val saveError by viewModel.saveError.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var selectedId by rememberSaveable(habitId) { mutableStateOf(habitId) }
    var correctingId by rememberSaveable { mutableStateOf<String?>(null) }
    val correcting = habits.asSequence().flatMap { it.recentEntries.asSequence() }.firstOrNull { it.id == correctingId }
    val selected = habits.firstOrNull { it.stored.id == selectedId && it.stored.goal.isAbstinence }
    val abstinences = habits.filter { !it.stored.archived && it.stored.goal.isAbstinence && (habitId == null || it.stored.id == habitId) }
    val pending = habits.filter {
        !it.stored.goal.isAbstinence &&
            (it.evaluation.needsAttentionNow || (it.stored.goal.isTracker && it.evaluation.isPlannedForDate && !it.evaluation.isPaused)) &&
            (habitId == null || it.stored.id == habitId)
    }
    if (selected != null) {
        Box(Modifier.fillMaxSize().background(palette.scrim.copy(alpha = .72f)))
        if (selected.stored.abstinenceProfile == ch.nicolab.cadence.domain.AbstinenceProfile.ALCOHOL) AlcoholDetailSheet(
            item = selected,
            dismiss = { if (!busy) { if (habitId != null) dismiss() else selectedId = null } },
            recordToday = { saved -> viewModel.recordAlcoholToday(selected, saved) },
            saveConsumption = { existing, date, drinks, saved ->
                viewModel.saveAlcoholConsumption(selected, existing, date, drinks, saved)
            },
            deleteConsumption = viewModel::deleteAlcoholConsumption,
            editHabit = {
                context.startActivity(Intent(context, MainActivity::class.java).putExtra(MainActivity.EXTRA_EDIT_HABIT_ID, selected.stored.id))
                dismiss()
            },
            initialConsumptionId = alcoholConsumptionId,
            busy = busy,
            error = saveError,
        ) else AbstinenceDetailSheet(
            item = selected,
            dismiss = { if (!busy) { if (habitId != null) dismiss() else selectedId = null } },
            onRecordOccurrence = { saved -> viewModel.recordAbstinenceOccurrence(selected, null, saved) },
            onEdit = {
                context.startActivity(Intent(context, MainActivity::class.java).putExtra(MainActivity.EXTRA_EDIT_HABIT_ID, selected.stored.id))
                dismiss()
            },
            busy = busy,
            error = saveError,
        )
        correcting?.let { entry ->
            EntryEditor(entry, selected.stored.goal.goalType, selected.stored.goal.unit,
                habitTint(selected),
                dismiss = { if (!busy) correctingId = null },
                save = { value, date, time, note -> viewModel.correctEntry(entry, value, date, time, note) { correctingId = null } },
                delete = { viewModel.deleteEntry(entry.id) { correctingId = null } },
                busy = busy,
                saveError = saveError,
                occurrenceOnly = selected.stored.goal.isAbstinence,
            )
        }
        return
    }
    // Une habitude précise (icône du widget, rappel) ouvre la même feuille que dans l'application :
    // couleur de l'habitude, rythme récent et saisies corrigeables.
    val single = habitId?.let { id -> habits.firstOrNull { it.stored.id == id && !it.stored.goal.isAbstinence } }
    if (single != null) {
        QuickSheet(
            single,
            { value, note -> viewModel.addEntry(single, value, "QUICK_MODAL", UUID.randomUUID().toString(), note) },
            viewModel::undoLastEntry,
            { viewModel.clearSaveError(); correctingId = it.id },
            timers[single.stored.id],
            { viewModel.startTimer(single.stored.id) },
            { viewModel.pauseTimer(single.stored.id) },
            { viewModel.finishTimer(single) },
            { viewModel.resetTimer(single.stored.id) },
            dismiss,
        )
        correcting?.let { entry ->
            EntryEditor(entry, single.stored.goal.goalType, single.stored.goal.unit, habitTint(single),
                dismiss = { if (!busy) correctingId = null },
                save = { value, date, time, note -> viewModel.correctEntry(entry, value, date, time, note) { correctingId = null } },
                delete = { viewModel.deleteEntry(entry.id) { correctingId = null } },
                busy = busy,
                saveError = saveError,
                occurrenceOnly = false,
            )
        }
        return
    }
    Box(
        Modifier.fillMaxSize().background(palette.scrim.copy(alpha = .72f)).clickable(onClick = dismiss),
        contentAlignment = Alignment.BottomCenter,
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .pointerInput(Unit) { detectVerticalDragGestures { _, drag -> if (drag > 120f) dismiss() } }
                .clickable(onClick = {}),
            shape = Radius.Sheet,
            color = palette.card,
            contentColor = palette.onSurface,
            shadowElevation = Elevation.floating,
        ) {
            Column(Modifier.navigationBarsPadding().padding(horizontal = Space.xl, vertical = Space.lg), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.align(Alignment.CenterHorizontally).width(36.dp).height(4.dp).background(palette.outlineVariant, CircleShape))
                Spacer(Modifier.height(Space.lg))
                Text(stringResource(R.string.quick_sheet_subtitle), style = MaterialTheme.typography.labelMedium, color = palette.outline, textAlign = TextAlign.Center)
                Text(stringResource(R.string.quick_sheet_title), style = MaterialTheme.typography.headlineSmall, color = palette.onSurface, textAlign = TextAlign.Center)
                Spacer(Modifier.height(Space.lg))
                if (!isLoaded) {
                    Spacer(Modifier.height(100.dp))
                } else if (pending.isEmpty() && abstinences.isEmpty()) {
                    Row(Modifier.fillMaxWidth().padding(vertical = Space.xl), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
                        Box(Modifier.size(36.dp).clip(CircleShape).background(palette.success.copy(alpha = .16f)), contentAlignment = Alignment.Center) {
                            Icon(Icons.Outlined.Check, null, tint = palette.success, modifier = Modifier.size(Size.icon))
                        }
                        Spacer(Modifier.width(Space.md))
                        Text(stringResource(if (habitId != null && habits.none { it.stored.id == habitId }) R.string.abstinence_quick_unavailable else R.string.quick_all_done), style = MaterialTheme.typography.bodyLarge, color = palette.onSurface)
                    }
                } else {
                    LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(Space.lg),
                        modifier = Modifier.heightIn(max = 420.dp),
                    ) {
                        items(abstinences, key = { "abstinence-${it.stored.id}" }) { habit ->
                            SecondaryAction(habit.stored.name, Modifier.fillMaxWidth()) {
                                viewModel.clearSaveError(); selectedId = habit.stored.id
                            }
                        }
                        items(pending, key = { it.stored.id }) { habit ->
                            QuickHabit(
                                habit,
                                timers[habit.stored.id],
                                start = { viewModel.startTimer(habit.stored.id) },
                                pauseTimer = { viewModel.pauseTimer(habit.stored.id) },
                                finishTimer = { viewModel.finishTimer(habit); dismiss() },
                                resetTimer = { viewModel.resetTimer(habit.stored.id) },
                            ) { value, sessionId, note -> viewModel.addEntry(habit, value, "QUICK_MODAL", sessionId, note) }
                        }
                    }
                }
                Spacer(Modifier.height(Space.lg))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.md)) {
                    if (lastEntryId != null) TertiaryAction(stringResource(R.string.quick_btn_undo), Modifier.weight(1f), onClick = viewModel::undoLastEntry)
                    SecondaryAction(stringResource(R.string.quick_btn_close), Modifier.weight(1f), onClick = dismiss)
                }
                Spacer(Modifier.height(Space.sm))
            }
        }
    }
}

/**
 * Une habitude en attente. Pas de carte imbriquée : la séparation vient d'un filet
 * discret et de l'espacement, l'accent reste sur les boutons d'incrément.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun QuickHabit(
    habit: HabitCardState,
    timer: ch.nicolab.cadence.domain.HabitTimer?,
    start: () -> Unit,
    pauseTimer: () -> Unit,
    finishTimer: () -> Unit,
    resetTimer: () -> Unit,
    add: (Long, String, String?) -> Unit,
) {
    val palette = cadence
    var custom by remember { mutableStateOf("") }
    // La note accompagne la prochaine saisie de cette habitude.
    var note by remember(habit.stored.id) { mutableStateOf("") }
    var noteOpen by remember(habit.stored.id) { mutableStateOf(false) }
    val goal = habit.stored.goal
    val icon = HabitIconRegistry.getIcon(habit.stored.iconId)
    val tint = habitTint(habit)
    val target = habit.evaluation.targetMinor.takeIf { it > 0 } ?: 1L
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.Start) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            HabitFacet(icon.imageVector, icon.labelFr, if (goal.isTracker) 0f else habit.evaluation.progressMinor.toFloat() / target, tint, tint.copy(alpha = 0.20f), size = Size.badge)
            Spacer(Modifier.width(Space.md))
            Column(Modifier.weight(1f)) {
                Text(habit.stored.name, style = MaterialTheme.typography.titleMedium, color = palette.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    if (goal.isTracker) stringResource(R.string.tracker_today_total,
                        HabitFormatter.formatWithUnit(habit.evaluation.progressMinor, goal.goalType, goal.unit))
                    else HabitFormatter.formatProgress(habit.evaluation.progressMinor, habit.evaluation.targetMinor, goal.goalType, goal.unit),
                    style = MaterialTheme.typography.bodySmall,
                    color = palette.outline,
                )
            }
        }
        Spacer(Modifier.height(Space.md))
        if (habit.stored.timerEnabled && goal.goalType == GoalType.DURATION) {
            TimerPanel(
                timer = timer,
                goal = goal,
                progressMinor = habit.evaluation.progressMinor,
                accent = tint,
                start = start,
                pause = pauseTimer,
                finish = finishTimer,
                reset = resetTimer,
            )
            Spacer(Modifier.height(Space.lg))
        }
        if (goal.goalType == GoalType.BINARY) {
            PrimaryAction(stringResource(R.string.quick_btn_validate), Modifier.fillMaxWidth(), accent = tint) { add(1, UUID.randomUUID().toString(), note.ifBlank { null }) }
        } else {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                habit.quickValues.ifEmpty { listOf(goal.unit?.scaleToCanonical ?: 1) }.forEach { value ->
                    ValueChip("+${HabitFormatter.formatValue(value, goal.goalType, goal.unit)}", accent = tint) { add(value, UUID.randomUUID().toString(), note.ifBlank { null }); note = "" }
                }
            }
            Spacer(Modifier.height(Space.md))
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                CadenceField(
                    custom,
                    { custom = it.filter(Char::isDigit) },
                    stringResource(R.string.quick_custom_value_label),
                    modifier = Modifier.weight(1f),
                    placeholder = "0",
                    suffix = goal.unit?.symbol,
                    accent = tint,
                    numeric = true,
                )
                PrimaryAction(stringResource(R.string.quick_btn_add), accent = tint, enabled = (custom.toLongOrNull() ?: 0) > 0) {
                    custom.toLongOrNull()?.takeIf { it > 0 }?.let { add(it * (goal.unit?.scaleToCanonical ?: 1), UUID.randomUUID().toString(), note.ifBlank { null }); custom = ""; note = "" }
                }
            }
        }
        // La note reste repliée : elle est rare, et son champ alourdit chaque habitude.
        Spacer(Modifier.height(Space.sm))
        if (noteOpen) {
            CadenceField(note, { note = it }, stringResource(R.string.quick_note_label), accent = tint)
        } else {
            TertiaryAction(stringResource(R.string.quick_note_add), onClick = { noteOpen = true })
        }
        Spacer(Modifier.height(Space.lg))
        Hairline()
    }
}
