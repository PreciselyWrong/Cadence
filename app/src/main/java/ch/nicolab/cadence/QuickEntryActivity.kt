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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.ui.HabitFormatter
import ch.nicolab.cadence.ui.icon.HabitIconRegistry
import ch.nicolab.cadence.ui.theme.CadenceTheme
import java.util.UUID

class QuickEntryActivity : ComponentActivity() {
    private val viewModel by viewModels<MainViewModel> { MainViewModelFactory(application as CadenceApp) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { CadenceTheme { QuickEntryScreen(viewModel, ::finish) } }
    }
}

@Composable
private fun QuickEntryScreen(viewModel: MainViewModel, dismiss: () -> Unit) {
    val habits by viewModel.habits.collectAsStateWithLifecycle()
    val lastEntryId by viewModel.lastEntryId.collectAsStateWithLifecycle()
    val pending = habits.filter { it.evaluation.needsAttentionNow }
    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.scrim.copy(alpha = .45f)).clickable(onClick = dismiss), contentAlignment = Alignment.BottomCenter) {
        Card(
            modifier = Modifier.fillMaxWidth().navigationBarsPadding().pointerInput(Unit) { detectVerticalDragGestures { _, drag -> if (drag > 120f) dismiss() } }.clickable(onClick = {}),
            shape = RoundedCornerShape(topStart = 30.dp, topEnd = 30.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        ) {
            Column(Modifier.padding(horizontal = 20.dp, vertical = 16.dp)) {
                Box(Modifier.align(Alignment.CenterHorizontally).fillMaxWidth(.12f).height(4.dp).background(MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(4.dp)))
                Spacer(Modifier.height(18.dp)); Text(stringResource(R.string.quick_sheet_title), style = MaterialTheme.typography.headlineSmall); Text(stringResource(R.string.quick_sheet_subtitle), color = MaterialTheme.colorScheme.onSurfaceVariant); Spacer(Modifier.height(16.dp))
                if (pending.isEmpty()) Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Outlined.Check, null); Spacer(Modifier.width(10.dp)); Text(stringResource(R.string.quick_all_done)) }
                else LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.height(380.dp)) { items(pending, key = { it.stored.id }) { habit -> QuickHabit(habit) { value, sessionId -> viewModel.addEntry(habit, value, "QUICK_MODAL", sessionId) } } }
                if (lastEntryId != null) TextButton(viewModel::undoLastEntry, Modifier.fillMaxWidth()) { Text(stringResource(R.string.quick_btn_undo)) }
                Button(dismiss, Modifier.fillMaxWidth()) { Text(stringResource(R.string.quick_btn_close)) }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun QuickHabit(habit: HabitCardState, add: (Long, String) -> Unit) {
    var custom by remember { mutableStateOf("") }
    val sessionId = remember(habit.stored.id) { UUID.randomUUID().toString() }
    val goal = habit.stored.goal
    val icon = HabitIconRegistry.getIcon(habit.stored.iconId)
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer)) {
        Column(Modifier.fillMaxWidth().padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(44.dp).background(MaterialTheme.colorScheme.primaryContainer, CircleShape), contentAlignment = Alignment.Center) { Icon(icon.imageVector, icon.labelFr) }; Spacer(Modifier.width(12.dp)); Column { Text(habit.stored.name, style = MaterialTheme.typography.titleMedium); Text(HabitFormatter.formatProgress(habit.evaluation.progressMinor, goal.targetMinor, goal.goalType, goal.unit), color = MaterialTheme.colorScheme.onSurfaceVariant) } }
            Spacer(Modifier.height(10.dp))
            if (goal.goalType == GoalType.BINARY) Button({ add(1, sessionId) }, Modifier.fillMaxWidth().height(52.dp)) { Text(stringResource(R.string.quick_btn_validate)) }
            else {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { habit.quickValues.ifEmpty { listOf(goal.unit?.scaleToCanonical ?: 1) }.forEach { value -> FilledTonalButton({ add(value, sessionId) }) { Text("+${HabitFormatter.formatValue(value, goal.goalType, goal.unit)}") } } }
                OutlinedTextField(value = custom, onValueChange = { custom = it.filter(Char::isDigit) }, label = { Text(stringResource(R.string.quick_custom_value_label)) }, singleLine = true, suffix = { Text(goal.unit?.symbol.orEmpty()) }, trailingIcon = { TextButton({ custom.toLongOrNull()?.takeIf { it > 0 }?.let { add(it * (goal.unit?.scaleToCanonical ?: 1), sessionId); custom = "" } }) { Text(stringResource(R.string.quick_btn_add)) } }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
            }
        }
    }
}
