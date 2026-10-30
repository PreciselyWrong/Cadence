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
import androidx.compose.foundation.layout.BoxWithConstraints
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
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.unit.sp
import java.time.LocalTime
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.lifecycle.lifecycleScope
import ch.nicolab.cadence.data.local.entities.WidgetConfigurationEntity
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.HabitGroup
import ch.nicolab.cadence.domain.WidgetGroupMode
import ch.nicolab.cadence.domain.WidgetGroupSelection
import ch.nicolab.cadence.ui.components.HabitFacet
import ch.nicolab.cadence.ui.HabitFormatter
import ch.nicolab.cadence.ui.HabitLabels
import ch.nicolab.cadence.ui.icon.HabitIconRegistry
import ch.nicolab.cadence.domain.WidgetSlotAlignment
import ch.nicolab.cadence.domain.WidgetSlotMode
import ch.nicolab.cadence.domain.AbstinenceElapsedCalculator
import java.time.Instant
import ch.nicolab.cadence.ui.widget.WidgetLayoutCalculator
import ch.nicolab.cadence.ui.widget.WidgetSlotSolver
import ch.nicolab.cadence.ui.widget.WidgetRenderStyle
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
        val groups = runBlocking { repository.getGroups() }
        setContent {
            CadenceTheme {
                var saving by remember { mutableStateOf(false) }
                var saveError by remember { mutableStateOf<String?>(null) }
                WidgetConfiguration(habits, groups, initial, selected, saving, saveError) { config, ids ->
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
    groups: List<HabitGroup>,
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
    var maxHabitsPerRow by remember { mutableFloatStateOf(initial.maxHabitsPerRow.toFloat()) }
    var showLabels by remember { mutableStateOf(initial.showLabels) }
    var labelTextSize by remember { mutableFloatStateOf(initial.labelTextSizeSp.toFloat()) }
    var labelOpacity by remember { mutableFloatStateOf(initial.labelOpacity.toFloat()) }
    var valueTextSize by remember { mutableFloatStateOf(initial.valueTextSizeSp.toFloat()) }
    var valueOpacity by remember { mutableFloatStateOf(initial.valueOpacity.toFloat()) }
    var iconOpacity by remember { mutableFloatStateOf(initial.iconOpacity.toFloat()) }
    var iconSaturation by remember { mutableFloatStateOf(initial.iconSaturation.toFloat()) }
    var monochromeIcons by remember { mutableStateOf(initial.monochromeIcons) }
    var slotMode by remember { mutableStateOf(WidgetSlotMode.fromStorage(initial.slotMode)) }
    var slotAlignment by remember { mutableStateOf(WidgetSlotAlignment.fromStorage(initial.slotAlignment)) }
    var groupMode by remember { mutableStateOf(WidgetGroupMode.fromStorage(initial.groupMode)) }
    var groupId by remember { mutableStateOf(initial.groupId ?: groups.firstOrNull()?.id) }

    // L'aperçu applique les mêmes filtres que le widget : sélection d'habitudes puis groupe.
    val previewHabits = remember(all, selected, groupMode, groupId, habits, groups) {
        val chosen = if (all) habits else habits.filter { it.id in selected }
        val visible = WidgetGroupSelection.visibleGroupIds(groupMode, groups, groupId, LocalTime.now())
        (visible?.let { ids -> chosen.filter { it.groupId in ids } } ?: chosen).filter { !it.archived }
    }

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

            item { SectionLabel(stringResource(R.string.widget_config_preview_section)) }
            item {
                WidgetPreview(
                    habits = previewHabits,
                    theme = style,
                    opacity = opacity.toInt(),
                    iconSizeDp = iconSize.toInt(),
                    iconOpacity = iconOpacity.toInt(),
                    iconSaturation = iconSaturation.toInt(),
                    monochromeIcons = monochromeIcons,
                    showLabels = showLabels,
                    labelTextSizeSp = labelTextSize.toInt(),
                    labelOpacity = labelOpacity.toInt(),
                    showValues = showValues,
                    valueTextSizeSp = valueTextSize.toInt(),
                    valueOpacity = valueOpacity.toInt(),
                    showDoneIndicator = showDone,
                    maxHabitsPerRow = maxHabitsPerRow.toInt(),
                    slotMode = slotMode,
                    slotAlignment = slotAlignment,
                )
                Spacer(Modifier.height(Space.sm))
                Text(
                    stringResource(R.string.widget_config_preview_hint),
                    style = MaterialTheme.typography.bodySmall,
                    color = palette.inkFaint,
                )
            }

            item { SectionLabel(stringResource(R.string.widget_config_groups_section)) }
            item {
                Panel {
                    Row(horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                        ChoiceChip(stringResource(R.string.widget_config_group_all), groupMode == WidgetGroupMode.ALL) {
                            groupMode = WidgetGroupMode.ALL
                        }
                        ChoiceChip(stringResource(R.string.widget_config_group_automatic), groupMode == WidgetGroupMode.AUTOMATIC) {
                            groupMode = WidgetGroupMode.AUTOMATIC
                        }
                    }
                    Spacer(Modifier.height(Space.sm))
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                        groups.forEach { group ->
                            ChoiceChip(group.name, groupMode == WidgetGroupMode.SINGLE && groupId == group.id) {
                                groupMode = WidgetGroupMode.SINGLE
                                groupId = group.id
                            }
                        }
                    }
                    Spacer(Modifier.height(Space.sm))
                    Text(
                        stringResource(
                            when (groupMode) {
                                WidgetGroupMode.ALL -> R.string.widget_config_group_all_hint
                                WidgetGroupMode.AUTOMATIC -> R.string.widget_config_group_automatic_hint
                                WidgetGroupMode.SINGLE -> R.string.widget_config_group_single_hint
                            },
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = palette.inkFaint,
                    )
                }
            }

            item { SectionLabel(stringResource(R.string.widget_config_style_label)) }
            item {
                Panel {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.md), verticalArrangement = Arrangement.spacedBy(Space.md)) {
                        HabitLabels.WIDGET_STYLES.forEach { (renderStyle, label) ->
                            val value = renderStyle.id
                            val swatch = Color(renderStyle.swatchArgb)
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
                    SliderRow(stringResource(R.string.widget_config_icon_opacity, iconOpacity.toInt()), iconOpacity, 0f..100f, 9) { iconOpacity = it }
                    SliderRow(stringResource(R.string.widget_config_icon_saturation, iconSaturation.toInt()), iconSaturation, 0f..100f, 9) { iconSaturation = it }
                    ToggleRow(stringResource(R.string.widget_config_monochrome_icons), monochromeIcons) { monochromeIcons = it }
                }
            }

            item { SectionLabel(stringResource(R.string.widget_config_content_section)) }
            item {
                Panel {
                    ToggleRow(stringResource(R.string.widget_config_show_labels), showLabels) { showLabels = it }
                    if (showLabels) {
                        Spacer(Modifier.height(Space.sm))
                        SliderRow(stringResource(R.string.widget_config_label_size, labelTextSize.toInt()), labelTextSize, 8f..18f, 9) { labelTextSize = it }
                        SliderRow(stringResource(R.string.widget_config_label_opacity, labelOpacity.toInt()), labelOpacity, 0f..100f, 9) { labelOpacity = it }
                    }
                    ToggleRow(stringResource(R.string.widget_config_show_values), showValues) { showValues = it }
                    if (showValues) {
                        Spacer(Modifier.height(Space.sm))
                        SliderRow(stringResource(R.string.widget_config_value_size, valueTextSize.toInt()), valueTextSize, 8f..18f, 9) { valueTextSize = it }
                        SliderRow(stringResource(R.string.widget_config_value_opacity, valueOpacity.toInt()), valueOpacity, 0f..100f, 9) { valueOpacity = it }
                    }
                    ToggleRow(stringResource(R.string.widget_config_show_done), showDone) { showDone = it }
                    Spacer(Modifier.height(Space.md))
                    SliderRow(
                        stringResource(R.string.widget_config_habits_per_row, maxHabitsPerRow.toInt()),
                        maxHabitsPerRow,
                        1f..6f,
                        4,
                    ) { maxHabitsPerRow = it }
                    Spacer(Modifier.height(Space.md))
                    Text(stringResource(R.string.widget_config_slot_mode), style = MaterialTheme.typography.labelMedium, color = palette.inkFaint)
                    Spacer(Modifier.height(Space.sm))
                    Row(horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                        ChoiceChip(stringResource(R.string.widget_config_slot_flexible), slotMode == WidgetSlotMode.FLEXIBLE) {
                            slotMode = WidgetSlotMode.FLEXIBLE
                        }
                        ChoiceChip(stringResource(R.string.widget_config_slot_fixed), slotMode == WidgetSlotMode.FIXED) {
                            slotMode = WidgetSlotMode.FIXED
                        }
                    }
                    if (slotMode == WidgetSlotMode.FIXED) {
                        Spacer(Modifier.height(Space.sm))
                        Row(horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                            ChoiceChip(stringResource(R.string.widget_config_slot_start), slotAlignment == WidgetSlotAlignment.START) {
                                slotAlignment = WidgetSlotAlignment.START
                            }
                            ChoiceChip(stringResource(R.string.widget_config_slot_center), slotAlignment == WidgetSlotAlignment.CENTER) {
                                slotAlignment = WidgetSlotAlignment.CENTER
                            }
                            ChoiceChip(stringResource(R.string.widget_config_slot_end), slotAlignment == WidgetSlotAlignment.END) {
                                slotAlignment = WidgetSlotAlignment.END
                            }
                        }
                    }
                    Spacer(Modifier.height(Space.sm))
                    Text(
                        stringResource(
                            if (slotMode == WidgetSlotMode.FIXED) R.string.widget_config_slot_fixed_hint
                            else R.string.widget_config_slot_flexible_hint,
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = palette.inkFaint,
                    )
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
                            maxHabitsPerRow = maxHabitsPerRow.toInt(),
                            showLabels = showLabels,
                            labelTextSizeSp = labelTextSize.toInt(),
                            labelOpacity = labelOpacity.toInt(),
                            valueTextSizeSp = valueTextSize.toInt(),
                            valueOpacity = valueOpacity.toInt(),
                            iconOpacity = iconOpacity.toInt(),
                            iconSaturation = iconSaturation.toInt(),
                            monochromeIcons = monochromeIcons,
                            groupMode = groupMode.name,
                            groupId = groupId.takeIf { groupMode == WidgetGroupMode.SINGLE },
                            slotMode = slotMode.name,
                            slotAlignment = slotAlignment.name,
                        ),
                        if (all) emptyList() else selected.toList(),
                    )
                }
                Spacer(Modifier.height(Space.xl))
            }
        }
    }
}

/**
 * Aperçu vivant du widget. Il reprend la mise en page réelle - mêmes calculs de capacité
 * et de visibilité des textes - sans toucher au widget déjà placé, qui n'est mis à jour
 * qu'à l'enregistrement.
 */
@Composable
private fun WidgetPreview(
    habits: List<PersistedHabit>,
    theme: String,
    opacity: Int,
    iconSizeDp: Int,
    iconOpacity: Int,
    iconSaturation: Int,
    monochromeIcons: Boolean,
    showLabels: Boolean,
    labelTextSizeSp: Int,
    labelOpacity: Int,
    showValues: Boolean,
    valueTextSizeSp: Int,
    valueOpacity: Int,
    showDoneIndicator: Boolean,
    maxHabitsPerRow: Int,
    slotMode: WidgetSlotMode,
    slotAlignment: WidgetSlotAlignment,
) {
    val renderStyle = WidgetRenderStyle.byId(theme)
    val baseSurface = Color(renderStyle.surfaceArgb)
    val content = Color(renderStyle.contentArgb)
    val badge = Color(renderStyle.badgeArgb).copy(alpha = renderStyle.badgeAlpha)
    val height = (iconSizeDp + 8 + (if (showLabels) labelTextSizeSp + 6 else 0) + (if (showValues) valueTextSizeSp + 6 else 0) + 20).dp

    BoxWithConstraints(
        Modifier
            .fillMaxWidth()
            .height(height)
            .clip(RoundedCornerShape(renderStyle.cornerRadiusDp.dp))
            .background(baseSurface.copy(alpha = opacity.coerceIn(0, 100) / 100f)),
        contentAlignment = Alignment.Center,
    ) {
        val widthDp = maxWidth.value.toInt()
        val layout = WidgetSlotSolver.solve(widthDp, iconSizeDp, habits.size, maxHabitsPerRow, slotMode)
        val cellWidth = layout.slotWidthDp.dp
        val textVisibility = WidgetLayoutCalculator.resolve(
            height.value.toInt(),
            iconSizeDp,
            showLabels,
            showValues,
            labelTextSizeSp,
            valueTextSizeSp,
        )
        if (habits.isEmpty()) {
            if (showDoneIndicator) Icon(Icons.Outlined.Check, null, tint = content, modifier = Modifier.size(Size.icon))
        } else {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 10.dp),
                horizontalArrangement = when {
                    slotMode != WidgetSlotMode.FIXED -> Arrangement.Center
                    slotAlignment == WidgetSlotAlignment.START -> Arrangement.Start
                    slotAlignment == WidgetSlotAlignment.END -> Arrangement.End
                    else -> Arrangement.Center
                },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                habits.take(layout.visibleCount).forEach { habit ->
                    val tint = previewIconColor(habit.colorArgb, monochromeIcons, iconSaturation, renderStyle.contentArgb)
                    Column(Modifier.width(cellWidth), horizontalAlignment = Alignment.CenterHorizontally) {
                        val icon = HabitIconRegistry.getIcon(habit.iconId)
                        HabitFacet(
                            icon = icon.imageVector,
                            label = icon.labelFr,
                            progress = 0.5f,
                            tint = tint.copy(alpha = iconOpacity.coerceIn(0, 100) / 100f),
                            trackColor = tint.copy(alpha = 0.22f),
                            size = (iconSizeDp + 10).dp,
                        )
                        if (textVisibility.showLabels) {
                            Text(
                                habit.name,
                                maxLines = 1,
                                fontSize = labelTextSizeSp.sp,
                                color = content.copy(alpha = labelOpacity.coerceIn(0, 100) / 100f),
                            )
                        }
                        if (textVisibility.showValues) {
                            Text(
                                habit.abstinenceStartedAt?.takeIf { habit.goal.isAbstinence }?.let { start ->
                                    AbstinenceElapsedCalculator.calculate(habit.id, start, emptyList(), Instant.now()).formatCompact()
                                } ?: if (habit.goal.isTracker) HabitFormatter.formatWithUnit(0, habit.goal.goalType, habit.goal.unit)
                                else HabitFormatter.formatCompactProgress(0, habit.goal.targetMinor, habit.goal.goalType, habit.goal.unit),
                                maxLines = 1,
                                fontSize = valueTextSizeSp.sp,
                                color = content.copy(alpha = valueOpacity.coerceIn(0, 100) / 100f),
                            )
                        }
                    }
                }
                if (layout.showsOverflow) {
                    Box(Modifier.width(cellWidth), contentAlignment = Alignment.Center) {
                        Text("+${layout.overflowCount}", color = content)
                    }
                }
            }
        }
    }
}

/**
 * Même résultat que le filtre de saturation appliqué au rendu du widget : la saturation
 * ramène la teinte vers sa luminance, le mode monochrome ignore la couleur de l'habitude.
 */
private fun previewIconColor(colorArgb: Int?, monochrome: Boolean, saturation: Int, inkArgb: Int): Color {
    val base = Color(if (monochrome) inkArgb else colorArgb ?: inkArgb)
    val factor = saturation.coerceIn(0, 100) / 100f
    val luminance = 0.213f * base.red + 0.715f * base.green + 0.072f * base.blue
    return Color(
        red = luminance + (base.red - luminance) * factor,
        green = luminance + (base.green - luminance) * factor,
        blue = luminance + (base.blue - luminance) * factor,
        alpha = base.alpha,
    )
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
