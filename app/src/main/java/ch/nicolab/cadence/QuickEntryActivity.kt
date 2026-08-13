package ch.nicolab.cadence

import android.os.Bundle
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.ui.HabitFormatter
import ch.nicolab.cadence.ui.components.CadenceField
import ch.nicolab.cadence.ui.components.ChoiceChip
import ch.nicolab.cadence.ui.components.ValueChip
import ch.nicolab.cadence.ui.components.Hairline
import ch.nicolab.cadence.ui.components.PrimaryAction
import ch.nicolab.cadence.ui.components.SecondaryAction
import ch.nicolab.cadence.ui.components.TertiaryAction
import ch.nicolab.cadence.ui.components.HabitFacet
import ch.nicolab.cadence.ui.icon.HabitIconRegistry
import ch.nicolab.cadence.ui.theme.CadenceTheme
import ch.nicolab.cadence.ui.theme.Elevation
import ch.nicolab.cadence.ui.theme.Radius
import ch.nicolab.cadence.ui.theme.Size
import ch.nicolab.cadence.ui.theme.Space
import ch.nicolab.cadence.ui.theme.cadence
import java.util.UUID

class QuickEntryActivity : ComponentActivity() {
    companion object { const val EXTRA_HABIT_ID = "habit_id" }
    private val viewModel by viewModels<MainViewModel> { MainViewModelFactory(application as CadenceApp) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val habitId = intent.getStringExtra(EXTRA_HABIT_ID)
        setContent { CadenceTheme { QuickEntryScreen(viewModel, habitId, ::finish) } }
    }
}

@Composable
private fun QuickEntryScreen(viewModel: MainViewModel, habitId: String?, dismiss: () -> Unit) {
    val palette = cadence
    val habits by viewModel.habits.collectAsStateWithLifecycle()
    val lastEntryId by viewModel.lastEntryId.collectAsStateWithLifecycle()
    val pending = habits.filter { it.evaluation.needsAttentionNow && (habitId == null || it.stored.id == habitId) }
    Box(
        Modifier.fillMaxSize().background(palette.structural.copy(alpha = .55f)).clickable(onClick = dismiss),
        contentAlignment = Alignment.BottomCenter,
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .pointerInput(Unit) { detectVerticalDragGestures { _, drag -> if (drag > 120f) dismiss() } }
                .clickable(onClick = {}),
            shape = Radius.Sheet,
            color = palette.surface,
            contentColor = palette.ink,
            shadowElevation = Elevation.floating,
        ) {
            Column(Modifier.navigationBarsPadding().padding(horizontal = Space.xl, vertical = Space.lg)) {
                Box(Modifier.align(Alignment.CenterHorizontally).width(36.dp).height(4.dp).background(palette.hairline, CircleShape))
                Spacer(Modifier.height(Space.lg))
                Text(stringResource(R.string.quick_sheet_subtitle), style = MaterialTheme.typography.labelMedium, color = palette.inkFaint)
                Text(stringResource(R.string.quick_sheet_title), style = MaterialTheme.typography.headlineSmall, color = palette.ink)
                Spacer(Modifier.height(Space.lg))
                if (pending.isEmpty()) {
                    Row(Modifier.fillMaxWidth().padding(vertical = Space.xl), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(36.dp).clip(CircleShape).background(palette.success.copy(alpha = .16f)), contentAlignment = Alignment.Center) {
                            Icon(Icons.Outlined.Check, null, tint = palette.success, modifier = Modifier.size(Size.icon))
                        }
                        Spacer(Modifier.width(Space.md))
                        Text(stringResource(R.string.quick_all_done), style = MaterialTheme.typography.bodyLarge, color = palette.ink)
                    }
                } else {
                    LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(Space.lg),
                        modifier = Modifier.heightIn(max = 420.dp),
                    ) {
                        items(pending, key = { it.stored.id }) { habit ->
                            QuickHabit(habit) { value, sessionId -> viewModel.addEntry(habit, value, "QUICK_MODAL", sessionId) }
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
private fun QuickHabit(habit: HabitCardState, add: (Long, String) -> Unit) {
    val palette = cadence
    var custom by remember { mutableStateOf("") }
    val sessionId = remember(habit.stored.id) { UUID.randomUUID().toString() }
    val goal = habit.stored.goal
    val icon = HabitIconRegistry.getIcon(habit.stored.iconId)
    val tint = habit.stored.colorArgb?.let(::Color) ?: palette.accent
    val target = goal.targetMinor.takeIf { it > 0 } ?: 1L
    Column(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            HabitFacet(icon.imageVector, icon.labelFr, (habit.evaluation.progressMinor.toFloat() / target), tint, tint.copy(alpha = 0.20f), size = Size.badge)
            Spacer(Modifier.width(Space.md))
            Column(Modifier.weight(1f)) {
                Text(habit.stored.name, style = MaterialTheme.typography.titleMedium, color = palette.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    HabitFormatter.formatProgress(habit.evaluation.progressMinor, goal.targetMinor, goal.goalType, goal.unit),
                    style = MaterialTheme.typography.bodySmall,
                    color = palette.inkFaint,
                )
            }
        }
        Spacer(Modifier.height(Space.md))
        if (goal.goalType == GoalType.BINARY) {
            PrimaryAction(stringResource(R.string.quick_btn_validate), Modifier.fillMaxWidth(), accent = tint) { add(1, sessionId) }
        } else {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                habit.quickValues.ifEmpty { listOf(goal.unit?.scaleToCanonical ?: 1) }.forEach { value ->
                    ValueChip("+${HabitFormatter.formatValue(value, goal.goalType, goal.unit)}", accent = tint) { add(value, sessionId) }
                }
            }
            Spacer(Modifier.height(Space.md))
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                CadenceField(
                    custom,
                    { custom = it.filter(Char::isDigit) },
                    stringResource(R.string.quick_custom_value_label),
                    modifier = Modifier.weight(1f),
                    suffix = goal.unit?.symbol,
                    accent = tint,
                    numeric = true,
                )
                PrimaryAction(stringResource(R.string.quick_btn_add), accent = tint, enabled = (custom.toLongOrNull() ?: 0) > 0) {
                    custom.toLongOrNull()?.takeIf { it > 0 }?.let { add(it * (goal.unit?.scaleToCanonical ?: 1), sessionId); custom = "" }
                }
            }
        }
        Spacer(Modifier.height(Space.lg))
        Hairline()
    }
}
