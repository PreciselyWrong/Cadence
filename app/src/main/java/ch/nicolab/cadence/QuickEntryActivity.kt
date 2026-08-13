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
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.ui.theme.CadenceTheme

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
    val pending = habits.filter { it.evaluation.requiresAction }
    Box(
        modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.scrim.copy(alpha = 0.45f)).clickable(onClick = dismiss),
        contentAlignment = Alignment.BottomCenter,
    ) {
        Card(
            modifier = Modifier.fillMaxWidth().navigationBarsPadding().pointerInput(Unit) { detectVerticalDragGestures { _, drag -> if (drag > 120f) dismiss() } }.clickable(enabled = false) {},
            shape = RoundedCornerShape(topStart = 30.dp, topEnd = 30.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        ) {
            Column(Modifier.padding(horizontal = 20.dp, vertical = 16.dp)) {
                Box(Modifier.align(Alignment.CenterHorizontally).fillMaxWidth(0.12f).height(4.dp).background(MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(4.dp)))
                Spacer(Modifier.height(18.dp))
                Text("Saisie rapide", style = MaterialTheme.typography.headlineSmall)
                Text("Uniquement ce qui reste à faire", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(16.dp))
                if (pending.isEmpty()) {
                    Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Outlined.Check, null); Spacer(Modifier.width(10.dp)); Text("Tout est à jour") }
                } else LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.height(360.dp)) {
                    items(pending, key = { it.stored.id }) { habit -> QuickHabit(habit, viewModel::addEntry) }
                }
                Spacer(Modifier.height(12.dp))
                Button(onClick = dismiss, modifier = Modifier.fillMaxWidth()) { Text("Fermer") }
            }
        }
    }
}

@Composable
private fun QuickHabit(habit: HabitCardState, add: (HabitCardState, Long) -> Unit) = Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer)) {
    Column(Modifier.fillMaxWidth().padding(16.dp)) {
        Text(habit.stored.name, style = MaterialTheme.typography.titleMedium)
        Text("${habit.evaluation.progressMinor} / ${habit.stored.goal.targetMinor}", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(10.dp))
        if (habit.stored.goal.targetMinor == 1L) Button(onClick = { add(habit, 1L) }, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Outlined.Check, null); Spacer(Modifier.width(8.dp)); Text("Valider") }
        else Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { habit.quickValues.ifEmpty { listOf(1L) }.forEach { value -> FilledTonalButton(onClick = { add(habit, value) }) { Icon(Icons.Outlined.Add, null); Text(value.toString()) } } }
    }
}
