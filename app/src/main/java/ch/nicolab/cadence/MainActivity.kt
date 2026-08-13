package ch.nicolab.cadence

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Analytics
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.TrackChanges
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.domain.PeriodType
import ch.nicolab.cadence.ui.theme.CadenceTheme

class MainActivity : ComponentActivity() {
    private val viewModel by viewModels<MainViewModel> { MainViewModelFactory(application as CadenceApp) }

    override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); enableEdgeToEdge(); setContent { CadenceTheme { App(viewModel) } } }
}

private enum class Tab(val label: String, val icon: ImageVector) {
    TODAY("Aujourd’hui", Icons.Outlined.TrackChanges), HABITS("Habitudes", Icons.Outlined.Check), STATS("Statistiques", Icons.Outlined.Analytics), SETTINGS("Réglages", Icons.Outlined.Settings)
}

@Composable
private fun App(viewModel: MainViewModel) {
    val habits by viewModel.habits.collectAsStateWithLifecycle()
    var tab by remember { mutableStateOf(Tab.TODAY) }
    var create by remember { mutableStateOf(false) }
    var quick by remember { mutableStateOf<HabitCardState?>(null) }
    Scaffold(bottomBar = { NavigationBar { Tab.entries.forEach { item -> NavigationBarItem(tab == item, { tab = item }, { Icon(item.icon, item.label) }, label = { Text(item.label) }) } } }) { inset ->
        when (tab) {
            Tab.TODAY -> Today(habits, Modifier.padding(inset), { quick = it }, { create = true })
            Tab.HABITS -> Habits(habits, Modifier.padding(inset), { create = true })
            Tab.STATS -> Stats(habits, Modifier.padding(inset))
            Tab.SETTINGS -> Settings(Modifier.padding(inset))
        }
    }
    quick?.let { QuickSheet(it, { value -> viewModel.addEntry(it, value) }, { quick = null }) }
    if (create) CreateDialog({ create = false }) { name, type, target, unit, period, values -> viewModel.createHabit(name, type, target, unit, period, values); create = false }
}

@Composable
private fun Today(habits: List<HabitCardState>, modifier: Modifier, quick: (HabitCardState) -> Unit, create: () -> Unit) {
    val pending = habits.filter { it.evaluation.requiresAction }
    LazyColumn(modifier.fillMaxSize().padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Spacer(Modifier.height(16.dp)); Title("Aujourd’hui", "Ce qui mérite encore votre attention", create) }
        if (pending.isEmpty()) item { EmptyDone() } else items(pending, key = { it.stored.id }) { HabitCard(it, quick) }
        if (habits.size > pending.size) item { Text("Terminé", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 12.dp)) }
        items(habits.filterNot { it.evaluation.requiresAction }, key = { "done-${it.stored.id}" }) { HabitCard(it, quick, true) }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun Title(title: String, caption: String, create: () -> Unit) = Row(verticalAlignment = Alignment.CenterVertically) {
    Column(Modifier.weight(1f)) { Text(title, style = MaterialTheme.typography.headlineMedium); Text(caption, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    IconButton(create, Modifier.background(MaterialTheme.colorScheme.primaryContainer, CircleShape)) { Icon(Icons.Outlined.Add, "Créer une habitude") }
}

@Composable
private fun HabitCard(item: HabitCardState, quick: (HabitCardState) -> Unit, done: Boolean = false) {
    val ratio = (item.evaluation.progressMinor.toFloat() / item.stored.goal.targetMinor).coerceIn(0f, 1f)
    Card(onClick = { quick(item) }, shape = RoundedCornerShape(24.dp), colors = CardDefaults.cardColors(containerColor = if (done) MaterialTheme.colorScheme.surfaceContainerLow else MaterialTheme.colorScheme.surfaceContainer)) {
        Row(Modifier.fillMaxWidth().padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(44.dp).background(if (done) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.primaryContainer, CircleShape), contentAlignment = Alignment.Center) { Icon(if (done) Icons.Outlined.Check else Icons.Outlined.TrackChanges, null) }
            Spacer(Modifier.width(14.dp)); Column(Modifier.weight(1f)) { Text(item.stored.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis); Spacer(Modifier.height(8.dp)); LinearProgressIndicator({ ratio }, Modifier.fillMaxWidth().height(5.dp).clip(CircleShape)); Text(progress(item), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp)) }
            if (!done) Icon(Icons.Outlined.Add, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(start = 12.dp))
        }
    }
}

private fun progress(item: HabitCardState): String = if (item.stored.goal.targetMinor == 1L) if (item.evaluation.progressMinor > 0) "Fait" else "À faire" else "${item.evaluation.progressMinor} / ${item.stored.goal.targetMinor}"

@Composable private fun EmptyDone() = Card(shape = RoundedCornerShape(24.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) { Column(Modifier.padding(22.dp)) { Icon(Icons.Outlined.Check, null); Spacer(Modifier.height(10.dp)); Text("Rien d’urgent", style = MaterialTheme.typography.titleLarge); Text("Les habitudes prévues sont à jour.") } }

@Composable
private fun Habits(habits: List<HabitCardState>, modifier: Modifier, create: () -> Unit) = LazyColumn(modifier.fillMaxSize().padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { item { Spacer(Modifier.height(16.dp)); Title("Habitudes", "Gérer vos routines", create) }; items(habits, key = { it.stored.id }) { HabitCard(it, {}) } }

@Composable
private fun Stats(habits: List<HabitCardState>, modifier: Modifier) = LazyColumn(modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { item { Text("Statistiques", style = MaterialTheme.typography.headlineMedium); Text("Période en cours", color = MaterialTheme.colorScheme.onSurfaceVariant) }; items(habits, key = { it.stored.id }) { habit -> Card(shape = RoundedCornerShape(22.dp)) { Column(Modifier.padding(18.dp)) { Text(habit.stored.name, style = MaterialTheme.typography.titleMedium); Spacer(Modifier.height(8.dp)); Text(progress(habit), style = MaterialTheme.typography.headlineSmall); Text(if (habit.evaluation.requiresAction) "Objectif en cours" else "Objectif atteint", color = MaterialTheme.colorScheme.onSurfaceVariant) } } } }

@Composable
private fun Settings(modifier: Modifier) = Column(modifier.fillMaxSize().padding(20.dp)) { Text("Réglages", style = MaterialTheme.typography.headlineMedium); Spacer(Modifier.height(20.dp)); Setting("Thème", "Suit le système"); Setting("Début de semaine", "Lundi par défaut"); Setting("Widget", "Configuration par instance"); Setting("Données", "Export et import local") }
@Composable private fun Setting(title: String, detail: String) { Row(Modifier.fillMaxWidth().padding(vertical = 16.dp)) { Column(Modifier.weight(1f)) { Text(title, style = MaterialTheme.typography.titleMedium); Text(detail, color = MaterialTheme.colorScheme.onSurfaceVariant) }; Icon(Icons.Outlined.TrackChanges, null) }; HorizontalDivider() }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun QuickSheet(item: HabitCardState, add: (Long) -> Unit, dismiss: () -> Unit) {
    ModalBottomSheet(onDismissRequest = dismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) { Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 12.dp)) { Text(item.stored.name, style = MaterialTheme.typography.headlineSmall); Text(progress(item), color = MaterialTheme.colorScheme.onSurfaceVariant); Spacer(Modifier.height(20.dp)); if (item.stored.goal.targetMinor == 1L) Button({ add(1L); dismiss() }, Modifier.fillMaxWidth().height(56.dp)) { Icon(Icons.Outlined.Check, null); Spacer(Modifier.width(8.dp)); Text("Valider") } else Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) { item.quickValues.ifEmpty { listOf(1L) }.forEach { value -> FilledTonalButton({ add(value) }, Modifier.weight(1f)) { Text("+$value") } } }; Spacer(Modifier.height(28.dp)) } }
}

@Composable
private fun CreateDialog(dismiss: () -> Unit, create: (String, String, Long, String, PeriodType, List<Long>) -> Unit) {
    var name by remember { mutableStateOf("") }; var target by remember { mutableStateOf("1") }; var type by remember { mutableIntStateOf(0) }; var period by remember { mutableIntStateOf(0) }
    val types = listOf("Binaire" to "BINARY", "Compteur" to "COUNT", "Durée" to "DURATION", "Quantité" to "QUANTITY"); val periods = PeriodType.entries
    AlertDialog(onDismissRequest = dismiss, title = { Text("Nouvelle habitude") }, text = { Column(verticalArrangement = Arrangement.spacedBy(10.dp)) { OutlinedTextField(name, { name = it }, label = { Text("Nom") }); OutlinedTextField(target, { target = it.filter(Char::isDigit) }, label = { Text("Objectif") }); Row { types.forEachIndexed { i, option -> Choice(option.first, type == i) { type = i } } }; Row { periods.forEachIndexed { i, option -> Choice(option.name.lowercase(), period == i) { period = i } } } } }, confirmButton = { TextButton({ val value = target.toLongOrNull() ?: return@TextButton; create(name, types[type].second, value, if (types[type].second == "DURATION") "min" else "", periods[period], if (value == 1L) listOf(1) else listOf(1, value / 2, value)) }, enabled = name.isNotBlank() && (target.toLongOrNull() ?: 0) > 0) { Text("Créer") } }, dismissButton = { TextButton(dismiss) { Text("Annuler") } })
}

@Composable private fun Choice(label: String, selected: Boolean, action: () -> Unit) = Text(label, Modifier.padding(end = 6.dp).clip(RoundedCornerShape(12.dp)).background(if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant).clickable(onClick = action).padding(8.dp), style = MaterialTheme.typography.labelLarge)
