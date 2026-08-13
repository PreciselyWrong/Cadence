package ch.nicolab.cadence

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.lifecycle.lifecycleScope
import ch.nicolab.cadence.data.local.entities.WidgetConfigurationEntity
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.ui.HabitLabels
import ch.nicolab.cadence.ui.components.CadenceScreen
import ch.nicolab.cadence.ui.components.ChoiceChip
import ch.nicolab.cadence.ui.components.ErrorText
import ch.nicolab.cadence.ui.components.PageHeader
import ch.nicolab.cadence.ui.components.Panel
import ch.nicolab.cadence.ui.components.PrimaryAction
import ch.nicolab.cadence.ui.components.SectionLabel
import ch.nicolab.cadence.ui.components.ToggleRow
import ch.nicolab.cadence.ui.components.onColorOf
import ch.nicolab.cadence.ui.theme.CadenceTheme
import ch.nicolab.cadence.ui.theme.Radius
import ch.nicolab.cadence.ui.theme.Size
import ch.nicolab.cadence.ui.theme.Space
import ch.nicolab.cadence.ui.theme.cadence
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

class WidgetConfigurationActivity : ComponentActivity() {
    private val appWidgetId by lazy { intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return }
        enableEdgeToEdge()
        val app = application as CadenceApp
        val repository = app.repository
        val habits = runBlocking { repository.observeHabits().first() }
        val initial = runBlocking { repository.getWidgetConfig(appWidgetId) } ?: WidgetConfigurationEntity(appWidgetId, null, "HALO")
        val selected = runBlocking { repository.getWidgetHabitIds(appWidgetId).toSet() }
        setContent {
            CadenceTheme {
                var saving by remember { mutableStateOf(false) }
                var saveError by remember { mutableStateOf<String?>(null) }
                WidgetConfiguration(habits, initial, selected, saving, saveError) { config, ids ->
                    if (saving) return@WidgetConfiguration
                    saving = true
                    saveError = null
                    lifecycleScope.launch {
                        runCatching {
                            repository.saveWidgetConfig(config, ids)
                        }.onSuccess {
                            setResult(Activity.RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId))
                            finish()
                            app.applicationScope.launch {
                                runCatching {
                                    val glanceId = GlanceAppWidgetManager(app).getGlanceIdBy(appWidgetId)
                                    ch.nicolab.cadence.widget.CadenceWidget().update(app, glanceId)
                                }
                            }
                        }.onFailure {
                            saving = false
                            saveError = getString(R.string.widget_config_save_error)
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun WidgetConfiguration(
    habits: List<PersistedHabit>,
    initial: WidgetConfigurationEntity,
    initialSelected: Set<String>,
    saving: Boolean,
    saveError: String?,
    save: (WidgetConfigurationEntity, List<String>) -> Unit,
) {
    val palette = cadence
    var all by remember { mutableStateOf(initial.selectAll) }
    var selected by remember { mutableStateOf(initialSelected) }
    var style by remember { mutableStateOf(initial.theme) }
    var opacity by remember { mutableFloatStateOf(initial.opacity.toFloat()) }
    var showValues by remember { mutableStateOf(initial.showValues) }
    var iconSize by remember { mutableFloatStateOf(initial.iconSizeDp.toFloat()) }
    var progressStyle by remember { mutableStateOf(initial.progressStyle) }
    var showDone by remember { mutableStateOf(initial.showDoneIndicator) }

    CadenceScreen {
        LazyColumn(
            Modifier.fillMaxSize().safeDrawingPadding().padding(horizontal = Space.gutter),
            verticalArrangement = Arrangement.spacedBy(Space.md),
        ) {
            item { PageHeader(stringResource(R.string.widget_config_subtitle), stringResource(R.string.widget_config_title)) }

            item { SectionLabel(stringResource(R.string.widget_config_habits_section)) }
            item {
                Panel {
                    ToggleRow(stringResource(R.string.widget_config_all_habits), all) { all = it }
                    if (!all) {
                        Spacer(Modifier.height(Space.md))
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                            habits.forEach { habit ->
                                ChoiceChip(habit.name, habit.id in selected) {
                                    selected = if (habit.id in selected) selected - habit.id else selected + habit.id
                                }
                            }
                        }
                    }
                }
            }

            item { SectionLabel(stringResource(R.string.widget_config_style_label)) }
            item {
                Panel {
                    val swatches = mapOf(
                        "HALO" to Color(0xFF171B2E), "OCEAN" to Color(0xFF00677D), "FOREST" to Color(0xFF08705A),
                        "AUBERGINE" to Color(0xFF5926A6), "CORAL" to Color(0xFFA43845), "MONO" to Color(0xFFF7F8FC),
                    )
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.md), verticalArrangement = Arrangement.spacedBy(Space.md)) {
                        HabitLabels.WIDGET_STYLES.forEach { (value, label) ->
                            val swatch = swatches.getValue(value)
                            val active = style == value
                            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(64.dp)) {
                                Box(
                                    Modifier
                                        .size(Size.touch)
                                        .clip(CircleShape)
                                        .background(swatch)
                                        .then(if (active) Modifier.border(2.dp, palette.accent, CircleShape) else Modifier)
                                        .clickable { style = value },
                                    contentAlignment = Alignment.Center,
                                ) {
                                    if (active) Icon(Icons.Outlined.Check, null, tint = onColorOf(swatch), modifier = Modifier.size(Size.icon))
                                }
                                Spacer(Modifier.height(Space.xs))
                                Text(
                                    stringResource(label),
                                    style = MaterialTheme.typography.labelMedium,
                                    color = if (active) palette.accent else palette.inkFaint,
                                )
                            }
                        }
                    }
                    Spacer(Modifier.height(Space.xl))
                    SliderRow(stringResource(R.string.widget_config_opacity_label, opacity.toInt()), opacity, 0f..100f, 9) { opacity = it }
                    Spacer(Modifier.height(Space.md))
                    SliderRow(stringResource(R.string.widget_config_icon_size, iconSize.toInt()), iconSize, 24f..48f, 5) { iconSize = it }
                }
            }

            item { SectionLabel(stringResource(R.string.widget_config_content_section)) }
            item {
                Panel {
                    ToggleRow(stringResource(R.string.widget_config_show_values), showValues) { showValues = it }
                    ToggleRow(stringResource(R.string.widget_config_show_done), showDone) { showDone = it }
                    Spacer(Modifier.height(Space.md))
                    Text(stringResource(R.string.widget_config_progress_style), style = MaterialTheme.typography.labelMedium, color = palette.inkFaint)
                    Spacer(Modifier.height(Space.sm))
                    Row(horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                        ChoiceChip(stringResource(R.string.widget_config_progress_ring), progressStyle == "RING") { progressStyle = "RING" }
                        ChoiceChip(stringResource(R.string.widget_config_progress_compact), progressStyle == "COMPACT") { progressStyle = "COMPACT" }
                    }
                }
            }

            item {
                saveError?.let { Spacer(Modifier.height(Space.sm)); ErrorText(it); Spacer(Modifier.height(Space.md)) }
                PrimaryAction(
                    stringResource(if (saving) R.string.widget_config_saving else R.string.widget_config_save),
                    Modifier.fillMaxWidth(),
                    enabled = !saving,
                ) {
                    save(
                        initial.copy(
                            theme = style,
                            selectAll = all,
                            opacity = opacity.toInt(),
                            showValues = showValues,
                            iconSizeDp = iconSize.toInt(),
                            progressStyle = progressStyle,
                            showDoneIndicator = showDone,
                        ),
                        if (all) emptyList() else selected.toList(),
                    )
                }
                Spacer(Modifier.height(Space.xl))
            }
        }
    }
}

@Composable
private fun ColumnScope.SliderRow(label: String, value: Float, range: ClosedFloatingPointRange<Float>, steps: Int, onValue: (Float) -> Unit) {
    val palette = cadence
    Text(label, style = MaterialTheme.typography.labelMedium, color = palette.inkFaint)
    Slider(
        value,
        onValue,
        valueRange = range,
        steps = steps,
        colors = SliderDefaults.colors(
            thumbColor = palette.accent,
            activeTrackColor = palette.accent,
            inactiveTrackColor = palette.sunken,
            activeTickColor = Color.Transparent,
            inactiveTickColor = Color.Transparent,
        ),
    )
}
