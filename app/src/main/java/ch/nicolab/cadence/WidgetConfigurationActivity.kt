package ch.nicolab.cadence

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
    LazyColumn(Modifier.fillMaxSize().safeDrawingPadding().padding(24.dp)) {
        item { Text(stringResource(R.string.widget_config_title), style = MaterialTheme.typography.headlineSmall); Text(stringResource(R.string.widget_config_subtitle), color = MaterialTheme.colorScheme.onSurfaceVariant); Spacer(Modifier.height(16.dp)) }
        item { Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(all, { all = it }); Text(stringResource(R.string.widget_config_all_habits)) } }
        if (!all) items(habits, key = { it.id }) { habit -> Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { Checkbox(habit.id in selected, { checked -> selected = if (checked) selected + habit.id else selected - habit.id }); Text(habit.name) } }
        item { Text(stringResource(R.string.widget_config_style_label), style = MaterialTheme.typography.titleMedium); listOf("HALO" to R.string.widget_config_style_halo, "MONO" to R.string.widget_config_style_mono).forEach { (value, label) -> Row(verticalAlignment = Alignment.CenterVertically) { RadioButton(style == value, { style = value }); Text(stringResource(label)) } }; Text(stringResource(R.string.widget_config_opacity_label, opacity.toInt())); Slider(opacity, { opacity = it }, valueRange = 0f..100f, steps = 9); SettingSwitch(stringResource(R.string.widget_config_show_values), showValues) { showValues = it }; Text(stringResource(R.string.widget_config_icon_size, iconSize.toInt())); Slider(iconSize, { iconSize = it }, valueRange = 24f..44f, steps = 4); Text(stringResource(R.string.widget_config_progress_style)); Row { listOf("RING", "COMPACT").forEach { mode -> RadioButton(progressStyle == mode, { progressStyle = mode }); Text(if (mode == "RING") stringResource(R.string.widget_config_progress_ring) else stringResource(R.string.widget_config_progress_compact), modifier = Modifier.align(Alignment.CenterVertically)) } }; SettingSwitch(stringResource(R.string.widget_config_show_done), showDone) { showDone = it }; Spacer(Modifier.height(16.dp)); Button({ save(initial.copy(theme = style, selectAll = all, opacity = opacity.toInt(), showValues = showValues, iconSizeDp = iconSize.toInt(), progressStyle = progressStyle, showDoneIndicator = showDone), if (all) emptyList() else selected.toList()) }, Modifier.fillMaxWidth()) { Text(stringResource(R.string.widget_config_save)) } }
    }
}

@Composable
private fun SettingSwitch(label: String, checked: Boolean, onChecked: (Boolean) -> Unit) = Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { Text(label, Modifier.weight(1f)); Switch(checked, onChecked) }
