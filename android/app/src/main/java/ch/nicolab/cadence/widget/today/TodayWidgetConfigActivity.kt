package ch.nicolab.cadence.widget.today

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.lifecycle.lifecycleScope
import ch.nicolab.cadence.CadenceApp
import ch.nicolab.cadence.R
import ch.nicolab.cadence.designsystem.components.CadenceScreen
import ch.nicolab.cadence.designsystem.components.ChoiceChip
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.ScreenHeader
import ch.nicolab.cadence.designsystem.components.SectionHeader
import ch.nicolab.cadence.designsystem.components.ToggleRow
import ch.nicolab.cadence.designsystem.theme.CadenceTheme
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.tasks.TasksGraph
import kotlin.math.roundToInt
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * Réglages d'un widget « Aujourd'hui ». Ouvert depuis le `⋮` du widget, à son placement, ou
 * depuis Réglages › Widgets (premier widget placé). Sans identifiant, il édite le premier widget.
 */
class TodayWidgetConfigActivity : ComponentActivity() {
    private val appWidgetId by lazy {
        intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
            .takeIf { it != AppWidgetManager.INVALID_APPWIDGET_ID }
            ?: firstPlacedWidgetId(this)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish()
            return
        }
        enableEdgeToEdge()
        val app = application as CadenceApp
        val store = TodayWidgetConfigStore(this)
        val initial = store.load(appWidgetId)
        setContent {
            CadenceTheme {
                TodayWidgetConfiguration(
                    repository = app.repository,
                    initial = initial,
                    onBack = { finish() },
                    onSave = { config ->
                        store.save(appWidgetId, config)
                        setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId))
                        lifecycleScope.launch {
                            val glanceId = GlanceAppWidgetManager(app).getGlanceIdBy(appWidgetId)
                            TodayWidget().update(app, glanceId)
                        }
                        finish()
                    },
                )
            }
        }
    }

    companion object {
        /** Premier widget « Aujourd'hui » placé, ou [AppWidgetManager.INVALID_APPWIDGET_ID]. */
        fun firstPlacedWidgetId(context: Context): Int {
            val manager = AppWidgetManager.getInstance(context)
            return manager.getAppWidgetIds(ComponentName(context, TodayWidgetReceiver::class.java)).firstOrNull()
                ?: AppWidgetManager.INVALID_APPWIDGET_ID
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TodayWidgetConfiguration(
    repository: ch.nicolab.cadence.data.local.CadenceRepository,
    initial: TodayWidgetConfig,
    onBack: () -> Unit,
    onSave: (TodayWidgetConfig) -> Unit,
) {
    val palette = cadence
    var config by remember { mutableStateOf(initial) }
    val habits by produceState<List<PersistedHabit>>(emptyList()) { value = repository.observeHabits().first() }
    val tasksRepository = TasksGraph.repository(LocalContext.current)
    val projects by tasksRepository.observeProjects().collectAsState(emptyList())
    val tags by tasksRepository.observeTags().collectAsState(emptyList())
    fun edit(change: (TodayWidgetConfig) -> TodayWidgetConfig) {
        config = change(config)
    }

    CadenceScreen {
        Column(modifier = Modifier.fillMaxWidth().safeDrawingPadding().padding(horizontal = Space.gutter)) {
            ScreenHeader(title = stringResource(R.string.today_config_title), onBack = onBack, backDescription = stringResource(R.string.today_config_back))
            WidgetPreviewBand(config)
            Spacer(Modifier.height(Space.sm))
            Column(modifier = Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            SectionHeader(stringResource(R.string.today_config_section_background))
            Panel {
                Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                    ChoiceRow(TodayBackground.entries, config.background, ::backgroundLabel) { edit { c -> c.copy(background = it) } }
                    if (config.background == TodayBackground.VERRE) {
                        val glass = TodayWidgetLimits.GLASS
                        SliderRow(stringResource(R.string.today_config_glass_opacity), config.glassOpacity, glass) { edit { c -> c.copy(glassOpacity = it) } }
                        SliderRow(stringResource(R.string.today_config_glass_sheen), config.glassSheen, glass) { edit { c -> c.copy(glassSheen = it) } }
                        SliderRow(stringResource(R.string.today_config_glass_rim), config.glassRim, glass) { edit { c -> c.copy(glassRim = it) } }
                    }
                }
            }
            SectionHeader(stringResource(R.string.today_config_section_controls))
            Panel {
                Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                    ChoiceRow(ControlColour.entries, config.controlColour, ::controlLabel) { edit { c -> c.copy(controlColour = it) } }
                    if (config.controlColour == ControlColour.LIBRE) {
                        FreeColourPicker(config.freeControlArgb) { argb -> edit { c -> c.copy(freeControlArgb = argb) } }
                    }
                    ToggleRow(stringResource(R.string.today_config_discrete), config.discreteButtons) { edit { c -> c.copy(discreteButtons = it) } }
                }
            }
            SectionHeader(stringResource(R.string.today_config_section_modules))
            Panel {
                Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                    ToggleRow(stringResource(R.string.today_config_show_tasks), config.showTasks) { edit { c -> c.copy(showTasks = it) } }
                    Text(stringResource(R.string.today_config_habit_placement), style = MaterialTheme.typography.bodySmall, color = palette.onSurfaceVariant)
                    ChoiceRow(HabitPlacement.entries, config.habitPlacement, ::placementLabel) { edit { c -> c.copy(habitPlacement = it) } }
                    Text(stringResource(R.string.today_config_habit_selection), style = MaterialTheme.typography.bodySmall, color = palette.onSurfaceVariant)
                    ChoiceRow(HabitSelection.entries, config.habitSelection, ::selectionLabel) { edit { c -> c.copy(habitSelection = it) } }
                    if (config.habitSelection == HabitSelection.CHOOSE) {
                        habits.forEach { habit ->
                            ToggleRow(habit.name, habit.id in config.habitIds) { checked ->
                                edit { c -> c.copy(habitIds = if (checked) c.habitIds + habit.id else c.habitIds - habit.id) }
                            }
                        }
                    }
                    SliderRow(stringResource(R.string.today_config_max_facets), config.maxFacets, TodayWidgetLimits.FACETS.first..TodayWidgetLimits.FACETS.last) { edit { c -> c.copy(maxFacets = it) } }
                }
            }
            if (config.showTasks) {
                SectionHeader(stringResource(R.string.today_config_section_tasks))
                Panel {
                    Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                        ChoiceRow(TaskScope.entries, config.taskScope, ::scopeLabel) { edit { c -> c.copy(taskScope = it) } }
                        FilterChips(projects, tags, config) { updated -> config = updated }
                        ToggleRow(stringResource(R.string.today_config_high_priority), config.highPriorityOnly) { edit { c -> c.copy(highPriorityOnly = it) } }
                        ToggleRow(stringResource(R.string.today_config_hide_recurring), config.hideRecurring) { edit { c -> c.copy(hideRecurring = it) } }
                        ChoiceRow(TaskSort.entries, config.sort, ::sortLabel) { edit { c -> c.copy(sort = it) } }
                        ToggleRow(stringResource(R.string.today_config_group_by_day), config.groupByDay) { edit { c -> c.copy(groupByDay = it) } }
                        ToggleRow(stringResource(R.string.today_config_overdue_section), config.showOverdueSection) { edit { c -> c.copy(showOverdueSection = it) } }
                        ToggleRow(stringResource(R.string.today_config_check_from_widget), config.checkFromWidget) { edit { c -> c.copy(checkFromWidget = it) } }
                        ToggleRow(stringResource(R.string.today_config_project_rail), config.projectRail) { edit { c -> c.copy(projectRail = it) } }
                        ToggleRow(stringResource(R.string.today_config_show_events), config.showEvents) { edit { c -> c.copy(showEvents = it) } }
                    }
                }
            }
            SectionHeader(stringResource(R.string.today_config_section_shape))
            Panel {
                Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                    ChoiceRow(TodayTextSize.entries, config.textSize, ::textSizeLabel) { edit { c -> c.copy(textSize = it) } }
                    SliderRow(stringResource(R.string.today_config_corner), config.cornerRadiusDp, TodayWidgetLimits.CORNER_DP.first..TodayWidgetLimits.CORNER_DP.last) { edit { c -> c.copy(cornerRadiusDp = it) } }
                }
            }
            Spacer(Modifier.height(Space.md))
            PrimaryAction(label = stringResource(R.string.today_config_save), modifier = Modifier.fillMaxWidth()) { onSave(config) }
            Spacer(Modifier.height(Space.lg))
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun <T> ChoiceRow(options: List<T>, selected: T, label: (T) -> Int, onSelect: (T) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.xs), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
        options.forEach { option ->
            ChoiceChip(label = stringResource(label(option)), selected = option == selected) { onSelect(option) }
        }
    }
}

@Composable
private fun SliderRow(label: String, value: Int, range: IntRange, onChange: (Int) -> Unit) {
    Column {
        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            Text(label, style = MaterialTheme.typography.bodyLarge, color = cadence.onSurface, modifier = Modifier.fillMaxWidth(0.8f))
            Text(value.toString(), style = MaterialTheme.typography.bodyLarge, color = cadence.primary)
        }
        Slider(
            value = value.toFloat(),
            onValueChange = { onChange(it.roundToInt()) },
            valueRange = range.first.toFloat()..range.last.toFloat(),
        )
    }
}

@StringRes
private fun backgroundLabel(value: TodayBackground): Int = when (value) {
    TodayBackground.VERRE -> R.string.today_bg_glass
    TodayBackground.AUTO -> R.string.today_bg_auto
    TodayBackground.CLAIR -> R.string.today_bg_light
    TodayBackground.SOMBRE -> R.string.today_bg_dark
    TodayBackground.AUCUN -> R.string.today_bg_none
}

@StringRes
private fun controlLabel(value: ControlColour): Int = when (value) {
    ControlColour.PRIORITE -> R.string.today_control_priority
    ControlColour.BLANC -> R.string.today_control_white
    ControlColour.PROJET -> R.string.today_control_project
    ControlColour.INDIGO -> R.string.today_control_indigo
    ControlColour.CORAIL -> R.string.today_control_coral
    ControlColour.MENTHE -> R.string.today_control_mint
    ControlColour.AMBRE -> R.string.today_control_amber
    ControlColour.LIBRE -> R.string.today_control_free
}

@StringRes
private fun placementLabel(value: HabitPlacement): Int = when (value) {
    HabitPlacement.ABOVE -> R.string.today_placement_above
    HabitPlacement.BELOW -> R.string.today_placement_below
    HabitPlacement.HIDDEN -> R.string.today_placement_hidden
}

@StringRes
private fun selectionLabel(value: HabitSelection): Int = when (value) {
    HabitSelection.BY_TIME -> R.string.today_selection_by_time
    HabitSelection.ALL -> R.string.today_selection_all
    HabitSelection.CHOOSE -> R.string.today_selection_choose
}

@StringRes
private fun scopeLabel(value: TaskScope): Int = when (value) {
    TaskScope.OVERDUE_AND_TODAY -> R.string.today_scope_overdue_and_today
    TaskScope.TODAY -> R.string.today_scope_today
    TaskScope.TOMORROW -> R.string.today_scope_tomorrow
    TaskScope.NEXT_3 -> R.string.today_scope_next_3
    TaskScope.NEXT_7 -> R.string.today_scope_next_7
    TaskScope.NO_DATE -> R.string.today_scope_no_date
    TaskScope.INBOX -> R.string.today_scope_inbox
}

@StringRes
private fun sortLabel(value: TaskSort): Int = when (value) {
    TaskSort.DUE -> R.string.today_sort_due
    TaskSort.PRIORITY -> R.string.today_sort_priority
    TaskSort.PROJECT -> R.string.today_sort_project
}

@StringRes
private fun textSizeLabel(value: TodayTextSize): Int = when (value) {
    TodayTextSize.S -> R.string.today_text_small
    TodayTextSize.M -> R.string.today_text_medium
    TodayTextSize.L -> R.string.today_text_large
}
