package ch.nicolab.cadence

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.res.stringResource
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
        val initial = runBlocking { repository.getWidgetConfig(appWidgetId) } ?: WidgetConfigurationEntity(appWidgetId, null, "HALO")
        val selected = runBlocking { repository.getWidgetHabitIds(appWidgetId).toSet() }
        setContent { CadenceTheme { WidgetConfiguration(habits, initial, selected) { config, ids ->
            runBlocking { repository.saveWidgetConfig(config, ids); ch.nicolab.cadence.widget.CadenceWidget().updateAll(this@WidgetConfigurationActivity) }
            setResult(Activity.RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)); finish()
        } } }
    }
}

@Composable
private fun WidgetConfiguration(habits: List<PersistedHabit>, initial: WidgetConfigurationEntity, initialSelected: Set<String>, save: (WidgetConfigurationEntity, List<String>) -> Unit) {
    var all by remember { mutableStateOf(initial.selectAll) }
    var selected by remember { mutableStateOf(initialSelected) }
    var style by remember { mutableStateOf(initial.theme) }
    var opacity by remember { mutableFloatStateOf(initial.opacity.toFloat()) }
    var showValues by remember { mutableStateOf(initial.showValues) }
    var iconSize by remember { mutableFloatStateOf(initial.iconSizeDp.toFloat()) }
    var progressStyle by remember { mutableStateOf(initial.progressStyle) }
    var showDone by remember { mutableStateOf(initial.showDoneIndicator) }
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background, contentColor = MaterialTheme.colorScheme.onBackground) {
        LazyColumn(Modifier.fillMaxSize().safeDrawingPadding().padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item { Spacer(Modifier.height(8.dp)); Text(stringResource(R.string.widget_config_title), style = MaterialTheme.typography.headlineMedium); Text(stringResource(R.string.widget_config_subtitle), color = MaterialTheme.colorScheme.onSurfaceVariant) }
            item { ConfigCard("Habitudes") { SettingSwitch(stringResource(R.string.widget_config_all_habits), all) { all = it } } }
            if (!all) items(habits, key = { it.id }) { habit -> Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) { Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) { Checkbox(habit.id in selected, { checked -> selected = if (checked) selected + habit.id else selected - habit.id }); Text(habit.name, color = MaterialTheme.colorScheme.onSurfaceVariant) } } }
            item {
                ConfigCard(stringResource(R.string.widget_config_style_label)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        listOf("HALO" to Color(0xFF171B2E), "OCEAN" to Color(0xFF00677D), "FOREST" to Color(0xFF08705A), "AUBERGINE" to Color(0xFF5926A6), "CORAL" to Color(0xFFA43845), "MONO" to Color(0xFFF7F8FC)).forEach { (value, color) ->
                            androidx.compose.foundation.layout.Box(Modifier.size(44.dp).background(color, CircleShape).then(if (style == value) Modifier.border(3.dp, MaterialTheme.colorScheme.primary, CircleShape) else Modifier).clickable { style = value })
                        }
                    }
                    Spacer(Modifier.height(18.dp))
                    Text(stringResource(R.string.widget_config_opacity_label, opacity.toInt()), color = MaterialTheme.colorScheme.onSurface)
                    Slider(opacity, { opacity = it }, valueRange = 0f..100f, steps = 9)
                    Text(stringResource(R.string.widget_config_icon_size, iconSize.toInt()), color = MaterialTheme.colorScheme.onSurface)
                    Slider(iconSize, { iconSize = it }, valueRange = 24f..48f, steps = 5)
                }
            }
            item {
                ConfigCard("Contenu") {
                    SettingSwitch(stringResource(R.string.widget_config_show_values), showValues) { showValues = it }
                    SettingSwitch(stringResource(R.string.widget_config_show_done), showDone) { showDone = it }
                    Text(stringResource(R.string.widget_config_progress_style), color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.padding(top = 8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) { listOf("RING", "COMPACT").forEach { mode -> RadioButton(progressStyle == mode, { progressStyle = mode }); Text(if (mode == "RING") stringResource(R.string.widget_config_progress_ring) else stringResource(R.string.widget_config_progress_compact), color = MaterialTheme.colorScheme.onSurface) } }
                }
            }
            item { Button({ save(initial.copy(theme = style, selectAll = all, opacity = opacity.toInt(), showValues = showValues, iconSizeDp = iconSize.toInt(), progressStyle = progressStyle, showDoneIndicator = showDone), if (all) emptyList() else selected.toList()) }, Modifier.fillMaxWidth().height(54.dp)) { Text(stringResource(R.string.widget_config_save)) }; Spacer(Modifier.height(12.dp)) }
        }
    }
}

@Composable
private fun ConfigCard(title: String, content: @Composable ColumnScope.() -> Unit) = Card(shape = RoundedCornerShape(26.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) { Column(Modifier.fillMaxWidth().padding(18.dp)) { Text(title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface); Spacer(Modifier.height(10.dp)); content() } }

@Composable
private fun SettingSwitch(label: String, checked: Boolean, onChecked: (Boolean) -> Unit) = Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { Text(label, Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurface); Switch(checked, onChecked) }
