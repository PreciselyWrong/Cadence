package ch.nicolab.cadence

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.glance.appwidget.updateAll
import ch.nicolab.cadence.data.local.entities.WidgetConfigurationEntity
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.ui.theme.CadenceTheme
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking

class WidgetConfigurationActivity : ComponentActivity() {
    private val appWidgetId by lazy { intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return }
        val repository = (application as CadenceApp).repository
        val habits = runBlocking { repository.observeHabits().first() }
        setContent { CadenceTheme { WidgetConfiguration(habits) { selected, style ->
            runBlocking {
                repository.saveWidgetConfig(WidgetConfigurationEntity(appWidgetId, null, style), selected)
                ch.nicolab.cadence.widget.CadenceWidget().updateAll(this@WidgetConfigurationActivity)
            }
            setResult(Activity.RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)); finish()
        } } }
    }
}

@Composable
private fun WidgetConfiguration(habits: List<PersistedHabit>, save: (List<String>, String) -> Unit) {
    var all by remember { mutableStateOf(true) }
    var selected by remember { mutableStateOf(emptySet<String>()) }
    var style by remember { mutableStateOf("HALO") }
    Column(Modifier.fillMaxSize().padding(24.dp)) {
        Text("Configurer le widget", style = MaterialTheme.typography.headlineSmall)
        Text("Une seule ligne, uniquement les objectifs en attente.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(20.dp))
        Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(all, { all = it; if (it) selected = emptySet() }); Text("Toutes les habitudes actives") }
        if (!all) LazyColumn(Modifier.weight(1f)) { items(habits, key = { it.id }) { habit -> Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { Checkbox(habit.id in selected, { checked -> selected = if (checked) selected + habit.id else selected - habit.id }); Text(habit.name) } } }
        Spacer(Modifier.height(12.dp)); Text("Style", style = MaterialTheme.typography.titleMedium)
        listOf("HALO" to "Halo", "MONO" to "Monochrome").forEach { (value, label) -> Row(verticalAlignment = Alignment.CenterVertically) { RadioButton(style == value, { style = value }); Text(label) } }
        Spacer(Modifier.height(16.dp)); Button({ save(if (all) emptyList() else selected.toList(), style) }, Modifier.fillMaxWidth()) { Text("Enregistrer") }
    }
}
