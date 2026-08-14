package ch.nicolab.cadence

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.animation.Crossfade
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Analytics
import androidx.compose.material.icons.outlined.Archive
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.DateRange
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.KeyboardArrowUp
import androidx.compose.material.icons.outlined.Pause
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Restore
import androidx.compose.material.icons.outlined.Sell
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.TrackChanges
import androidx.compose.material.icons.outlined.TrendingFlat
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.data.local.model.IdentifiedPause
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.GoalAttainment
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitGoal
import ch.nicolab.cadence.domain.HabitEntry
import ch.nicolab.cadence.domain.HabitGroup
import ch.nicolab.cadence.domain.GoalDirection
import ch.nicolab.cadence.domain.GoalProgression
import ch.nicolab.cadence.domain.ProgressionCadence
import ch.nicolab.cadence.domain.LimitStatus
import ch.nicolab.cadence.domain.WeekEntry
import ch.nicolab.cadence.domain.WeekOutlook
import ch.nicolab.cadence.domain.WeekStage
import ch.nicolab.cadence.domain.HabitSchedule
import ch.nicolab.cadence.domain.HabitStreak
import ch.nicolab.cadence.domain.HabitTimer
import ch.nicolab.cadence.domain.MeasurementUnit
import ch.nicolab.cadence.domain.PeriodType
import ch.nicolab.cadence.domain.ScheduleMode
import ch.nicolab.cadence.domain.UnitDimension
import ch.nicolab.cadence.ui.HabitFormatter
import ch.nicolab.cadence.ui.HabitLabels
import ch.nicolab.cadence.ui.components.ActionRow
import ch.nicolab.cadence.ui.components.CadenceField
import ch.nicolab.cadence.ui.components.CadenceNavigation
import ch.nicolab.cadence.ui.components.CadenceScreen
import ch.nicolab.cadence.ui.components.CadenceSheet
import ch.nicolab.cadence.ui.components.ChoiceChip
import ch.nicolab.cadence.ui.components.ValueChip
import ch.nicolab.cadence.ui.components.EmptyState
import ch.nicolab.cadence.ui.components.ErrorText
import ch.nicolab.cadence.ui.components.FieldGroup
import ch.nicolab.cadence.ui.components.HabitFacet
import ch.nicolab.cadence.ui.components.Hairline
import ch.nicolab.cadence.ui.components.HeaderAction
import ch.nicolab.cadence.ui.components.NavDestination
import ch.nicolab.cadence.ui.components.NavigationSpacer
import ch.nicolab.cadence.ui.components.PageHeader
import ch.nicolab.cadence.ui.components.Panel
import ch.nicolab.cadence.ui.components.PrimaryAction
import ch.nicolab.cadence.ui.components.SecondaryAction
import ch.nicolab.cadence.ui.components.SectionLabel
import ch.nicolab.cadence.ui.components.TertiaryAction
import ch.nicolab.cadence.ui.components.ToggleRow
import ch.nicolab.cadence.ui.components.onColorOf
import ch.nicolab.cadence.ui.icon.HabitIconPicker
import ch.nicolab.cadence.ui.icon.HabitIconRegistry
import ch.nicolab.cadence.ui.theme.CadenceTheme
import ch.nicolab.cadence.ui.theme.MetricStyle
import ch.nicolab.cadence.ui.theme.Radius
import ch.nicolab.cadence.ui.theme.Size
import ch.nicolab.cadence.ui.theme.Space
import ch.nicolab.cadence.ui.theme.cadence
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime
import java.time.temporal.ChronoUnit
import java.util.UUID

class MainActivity : ComponentActivity() {
    private val viewModel by viewModels<MainViewModel> { MainViewModelFactory(application as CadenceApp) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { CadenceTheme { CadenceAppScreen(viewModel) } }
    }
}

private enum class Tab(val label: Int, val icon: ImageVector) {
    TODAY(R.string.tab_today, Icons.Outlined.TrackChanges),
    WEEK(R.string.tab_week, Icons.Outlined.DateRange),
    HABITS(R.string.tab_habits, Icons.Outlined.Check),
    STATS(R.string.tab_stats, Icons.Outlined.Analytics),
    SETTINGS(R.string.tab_settings, Icons.Outlined.Settings),
}

@Composable
private fun CadenceAppScreen(viewModel: MainViewModel) {
    val habits by viewModel.habits.collectAsStateWithLifecycle()
    val groups by viewModel.groups.collectAsStateWithLifecycle()
    val timers by viewModel.timers.collectAsStateWithLifecycle()
    var tab by remember { mutableStateOf(Tab.TODAY) }
    var editor by remember { mutableStateOf<HabitCardState?>(null) }
    var creating by remember { mutableStateOf(false) }
    var quick by remember { mutableStateOf<HabitCardState?>(null) }
    var correcting by remember { mutableStateOf<HabitEntry?>(null) }
    var options by remember { mutableStateOf<HabitCardState?>(null) }
    var skipping by remember { mutableStateOf<HabitCardState?>(null) }
    var travelling by remember { mutableStateOf(false) }
    var groupFilter by remember { mutableStateOf<String?>(null) }
    // Un groupe supprimé pendant qu'il filtrait la vue ne doit pas la laisser vide.
    if (groupFilter != null && groups.isNotEmpty() && groups.none { it.id == groupFilter }) groupFilter = null
    var movingToGroup by remember { mutableStateOf<HabitCardState?>(null) }
    var deleting by remember { mutableStateOf<PersistedHabit?>(null) }
    var backupMessage by remember { mutableStateOf<String?>(null) }
    val context = LocalContext.current
    val exportedMessage = stringResource(R.string.backup_exported)
    val importedMessage = stringResource(R.string.backup_imported)
    val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    val exportLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        uri?.let { destination -> viewModel.exportBackup { content -> context.contentResolver.openOutputStream(destination)?.bufferedWriter()?.use { it.write(content) }; backupMessage = exportedMessage } }
    }
    val importLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let { source ->
            val content = context.contentResolver.openInputStream(source)?.bufferedReader()?.use { it.readText() } ?: return@let
            viewModel.importBackup(content, { backupMessage = importedMessage }, { backupMessage = it })
        }
    }
    val destinations = Tab.entries.map { NavDestination(stringResource(it.label), it.icon) }

    CadenceScreen {
        Crossfade(tab, label = "tab") { current ->
            when (current) {
                Tab.TODAY -> TodayScreen(habits, groups, groupFilter, { groupFilter = it }, { quick = it }, { options = it }, { creating = true })
                Tab.WEEK -> WeekScreen(habits) { quick = it }
                Tab.HABITS -> HabitsScreen(habits, groups, groupFilter, { groupFilter = it }, { creating = true }, { options = it })
                Tab.STATS -> StatsScreen(habits)
                Tab.SETTINGS -> SettingsScreen(
                    groups = groups,
                    habitCountByGroup = habits.groupingBy { it.stored.groupId }.eachCount(),
                    saveGroup = viewModel::saveGroup,
                    addGroup = { viewModel.addGroup(it, 8 * 60, 12 * 60) },
                    deleteGroup = viewModel::deleteGroup,
                    moveGroup = viewModel::moveGroup,
                    startTravel = { travelling = true },
                    export = { exportLauncher.launch("cadence-backup.json") },
                    import = { importLauncher.launch(arrayOf("application/json")) },
                    message = backupMessage,
                )
            }
        }
        CadenceNavigation(destinations, tab.ordinal, Modifier.align(Alignment.BottomCenter)) { index -> tab = Tab.entries[index] }
    }

    quick?.let { item ->
        val sessionId = remember(item.stored.id) { UUID.randomUUID().toString() }
        QuickSheet(
            item,
            { value, note -> viewModel.addEntry(item, value, "APP", sessionId, note) },
            viewModel::undoLastEntry,
            { correcting = it },
            timers[item.stored.id],
            { viewModel.startTimer(item.stored.id) },
            { viewModel.pauseTimer(item.stored.id) },
            { viewModel.finishTimer(item) },
            { viewModel.resetTimer(item.stored.id) },
            { quick = null },
        )
    }
    correcting?.let { entry ->
        val habit = habits.firstOrNull { it.stored.id == entry.habitId }
        EntryEditor(
            entry = entry,
            goalType = habit?.stored?.goal?.goalType ?: GoalType.QUANTITY,
            unit = habit?.stored?.goal?.unit,
            accent = habit?.let { habitTint(it) } ?: cadence.accent,
            dismiss = { correcting = null },
            save = { value, date, time, note ->
                viewModel.correctEntry(entry, value, date, time, note)
                correcting = null
            },
            delete = { viewModel.deleteEntry(entry.id); correcting = null },
        )
    }
    options?.let { item ->
        HabitOptionsSheet(
            item,
            dismiss = { options = null },
            edit = { editor = item; options = null },
            pause = { viewModel.togglePause(item); options = null },
            skipToday = { skipping = item; options = null },
            cancelSkip = { viewModel.cancelSkip(it); options = null },
            resumePause = { viewModel.resumePause(it); options = null },
            moveToGroup = { movingToGroup = item; options = null },
            stopProgression = { viewModel.stopProgression(item.stored); options = null },
            archive = { viewModel.archiveHabit(item.stored, !item.stored.archived); options = null },
            duplicate = { viewModel.duplicateHabit(item.stored); options = null },
            up = { viewModel.moveHabit(item.stored.id, -1); options = null },
            down = { viewModel.moveHabit(item.stored.id, 1); options = null },
            delete = { deleting = item.stored; options = null },
        )
    }
    movingToGroup?.let { item ->
        GroupPickerSheet(item, groups, { movingToGroup = null }) { groupId ->
            viewModel.moveHabitToGroup(item.stored, groupId)
            movingToGroup = null
        }
    }
    skipping?.let { item ->
        SkipSheet(habitTint(item), { skipping = null }) { reason, label ->
            viewModel.skipToday(item, reason, label)
            skipping = null
        }
    }
    if (travelling) {
        TravelSheet(habits, groups, LocalDate.now(), { travelling = false }) { ids, from, to ->
            viewModel.startTravel(ids, from, to)
            travelling = false
        }
    }
    if (creating || editor != null) HabitEditor(editor, groups, { creating = false; editor = null }) { habit, quickValues, reminderTimes, conditional, isNew ->
        if (reminderTimes.isNotEmpty() && android.os.Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        viewModel.saveHabit(habit, quickValues, reminderTimes, conditional, isNew)
        creating = false
        editor = null
    }
    deleting?.let { habit -> DeleteDialog({ deleting = null }) { viewModel.deleteHabit(habit.id); deleting = null } }
}

@Composable
private fun DeleteDialog(dismiss: () -> Unit, confirm: () -> Unit) {
    val palette = cadence
    AlertDialog(
        onDismissRequest = dismiss,
        shape = Radius.Panel,
        containerColor = palette.surface,
        titleContentColor = palette.ink,
        textContentColor = palette.inkMuted,
        icon = { Icon(Icons.Outlined.Delete, null, tint = palette.danger) },
        title = { Text(stringResource(R.string.delete_dialog_title), style = MaterialTheme.typography.headlineSmall) },
        text = { Text(stringResource(R.string.delete_dialog_message), style = MaterialTheme.typography.bodySmall) },
        confirmButton = { PrimaryAction(stringResource(R.string.delete_dialog_confirm), accent = palette.danger, onClick = confirm) },
        dismissButton = { TertiaryAction(stringResource(R.string.delete_dialog_cancel), onClick = dismiss) },
    )
}

/** Ossature commune des écrans principaux : même gouttière, même en-tête, même respiration. */
@Composable
private fun ScreenList(
    context: String,
    title: String,
    action: (@Composable () -> Unit)? = null,
    content: androidx.compose.foundation.lazy.LazyListScope.() -> Unit,
) = LazyColumn(
    Modifier.fillMaxSize().statusBarsPadding().padding(horizontal = Space.gutter),
    verticalArrangement = Arrangement.spacedBy(Space.md),
) {
    item { PageHeader(context, title, action) }
    content()
    item { NavigationSpacer() }
}

@Composable
private fun TodayScreen(
    habits: List<HabitCardState>,
    groups: List<HabitGroup>,
    selectedGroupId: String?,
    onSelectGroup: (String?) -> Unit,
    quick: (HabitCardState) -> Unit,
    options: (HabitCardState) -> Unit,
    create: () -> Unit,
) {
    val visible = habits.inGroup(selectedGroupId)
    val active = visible.filter { !it.stored.archived }
    val pending = visible.filter { it.evaluation.needsAttentionNow }
    val completed = active.filter { it.evaluation.isCompleted }
    ScreenList(
        context = stringResource(R.string.today_subtitle),
        title = stringResource(R.string.today_title),
        action = { HeaderAction(Icons.Outlined.Add, stringResource(R.string.create_habit_button), accent = true, onClick = create) },
    ) {
        if (groups.size > 1) item { GroupFilter(groups, habits, selectedGroupId, onSelectGroup) }
        when {
            // Un groupe vide n'est pas une application vide : ne pas proposer de créer.
            active.isEmpty() && selectedGroupId != null -> item {
                EmptyState(Icons.Outlined.AutoAwesome, stringResource(R.string.group_filter_empty), stringResource(R.string.empty_habits_message))
            }
            active.isEmpty() -> item {
                EmptyState(Icons.Outlined.AutoAwesome, stringResource(R.string.empty_habits_title), stringResource(R.string.empty_habits_message)) {
                    PrimaryAction(stringResource(R.string.create_habit_button), onClick = create)
                }
            }
            pending.isEmpty() -> item {
                EmptyState(Icons.Outlined.Check, stringResource(R.string.empty_today_done_title), stringResource(R.string.empty_today_done_message))
            }
            else -> items(pending, key = { it.stored.id }) { HabitRow(it, onClick = { quick(it) }, onLongClick = { options(it) }) }
        }
        if (completed.isNotEmpty()) {
            item { SectionLabel(stringResource(R.string.today_completed_section)) }
            items(completed, key = { "done-${it.stored.id}" }) { HabitRow(it, done = true, onClick = { quick(it) }, onLongClick = { options(it) }) }
        }
    }
}

@Composable
private fun HabitsScreen(
    habits: List<HabitCardState>,
    groups: List<HabitGroup>,
    selectedGroupId: String?,
    onSelectGroup: (String?) -> Unit,
    create: () -> Unit,
    options: (HabitCardState) -> Unit,
) {
    val visible = habits.inGroup(selectedGroupId)
    val active = visible.filter { !it.stored.archived }
    val archived = visible.filter { it.stored.archived }
    ScreenList(
        context = stringResource(R.string.habits_subtitle),
        title = stringResource(R.string.habits_title),
        action = { HeaderAction(Icons.Outlined.Add, stringResource(R.string.create_habit_button), accent = true, onClick = create) },
    ) {
        if (groups.size > 1) item { GroupFilter(groups, habits, selectedGroupId, onSelectGroup) }
        if (active.isEmpty() && archived.isEmpty() && selectedGroupId != null) {
            item {
                EmptyState(Icons.Outlined.AutoAwesome, stringResource(R.string.group_filter_empty), stringResource(R.string.empty_habits_message))
            }
        } else if (active.isEmpty() && archived.isEmpty()) {
            item {
                EmptyState(Icons.Outlined.AutoAwesome, stringResource(R.string.empty_habits_title), stringResource(R.string.empty_habits_message)) {
                    PrimaryAction(stringResource(R.string.create_habit_button), onClick = create)
                }
            }
        }
        items(active, key = { it.stored.id }) { HabitRow(it, onClick = { options(it) }, onLongClick = { options(it) }) }
        if (archived.isNotEmpty()) {
            item { SectionLabel(stringResource(R.string.habits_archived_section)) }
            items(archived, key = { "archived-${it.stored.id}" }) { HabitRow(it, done = true, onClick = { options(it) }, onLongClick = { options(it) }) }
        }
    }
}

/**
 * Unité fonctionnelle de l'application : une habitude, sa facette de progression,
 * son nom et sa mesure. Aucune sous-carte, la hiérarchie vient de la typographie.
 */
@Composable
private fun HabitRow(item: HabitCardState, done: Boolean = false, onClick: () -> Unit, onLongClick: () -> Unit) {
    val palette = cadence
    val tint = habitTint(item)
    val target = item.evaluation.targetMinor.takeIf { it > 0 } ?: 1L
    val ratio = (item.evaluation.progressMinor.toFloat() / target).coerceIn(0f, 1f)
    Panel(onClick = onClick, onLongClick = onLongClick) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            HabitFacet(
                icon = HabitIconRegistry.getIcon(item.stored.iconId).imageVector,
                label = HabitIconRegistry.getIcon(item.stored.iconId).labelFr,
                progress = ratio,
                tint = if (done) palette.inkFaint else tint,
                trackColor = tint.copy(alpha = 0.20f),
                size = Size.badge,
            )
            Spacer(Modifier.width(Space.lg))
            Column(Modifier.weight(1f)) {
                Text(
                    item.stored.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = if (done) palette.inkMuted else palette.ink,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(habitStatus(item), style = MaterialTheme.typography.bodySmall, color = palette.inkFaint, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (done) {
                Spacer(Modifier.width(Space.sm))
                Box(Modifier.size(24.dp).clip(CircleShape).background(palette.success.copy(alpha = 0.16f)), contentAlignment = Alignment.Center) {
                    Icon(Icons.Outlined.Check, null, tint = palette.success, modifier = Modifier.size(14.dp))
                }
            }
        }
    }
}

@Composable
private fun habitTint(item: HabitCardState): Color = item.stored.colorArgb?.let(::Color) ?: cadence.accent

@Composable
private fun habitStatus(item: HabitCardState): String = when {
    item.stored.archived -> stringResource(R.string.status_archived)
    item.evaluation.isPaused -> stringResource(R.string.status_paused)
    // Sous un plafond, la position vis-à-vis de la limite prime sur la progression.
    item.evaluation.limitStatus != null -> "${limitLabel(item.evaluation.limitStatus!!)} · ${progress(item)}"
    // Le palier n'est annoncé que lorsque le minimum se distingue réellement de l'idéal.
    item.stored.goal.hasDistinctMinimum -> "${attainmentLabel(item.evaluation.attainment)} · ${progress(item)}"
    else -> progress(item)
}

@Composable
private fun limitLabel(status: LimitStatus): String = stringResource(
    when (status) {
        LimitStatus.UNDER -> R.string.status_limit_under
        LimitStatus.AT_LIMIT -> R.string.status_limit_at
        LimitStatus.EXCEEDED -> R.string.status_limit_exceeded
    },
)

@Composable
private fun attainmentLabel(attainment: GoalAttainment): String = stringResource(
    when (attainment) {
        GoalAttainment.TODO -> R.string.status_todo
        GoalAttainment.MINIMUM -> R.string.status_minimum_reached
        GoalAttainment.IDEAL -> R.string.status_ideal_reached
    },
)

@Composable
private fun progress(item: HabitCardState): String {
    val goal = item.stored.goal
    // `2 / 2` se lirait comme un objectif atteint : un plafond s'annonce comme un maximum.
    if (goal.isLimit) {
        return stringResource(
            R.string.limit_progress,
            HabitFormatter.formatValue(item.evaluation.progressMinor, goal.goalType, goal.unit),
            HabitFormatter.formatValue(item.evaluation.targetMinor, goal.goalType, goal.unit),
        )
    }
    val quantity = HabitFormatter.formatProgress(item.evaluation.progressMinor, item.evaluation.targetMinor, goal.goalType, goal.unit)
    val frequency = goal.frequencyTarget ?: return quantity
    return stringResource(R.string.habit_sessions_format, quantity, item.evaluation.sessionCount, frequency)
}

/**
 * Cette semaine : les habitudes regroupées par ce qu'il reste à en faire. Une habitude
 * dont plus aucun jour n'est planifié d'ici dimanche ne s'affiche pas — la lister ne
 * proposerait aucune action.
 */
@Composable
private fun WeekScreen(habits: List<HabitCardState>, quick: (HabitCardState) -> Unit) {
    val today = LocalDate.now()
    val byId = habits.associateBy { it.stored.id }
    val outlook = remember(habits) {
        WeekOutlook.of(
            habits = habits.map { it.stored.definition },
            today = today,
            entries = habits.flatMap(HabitCardState::recentEntries),
            pausesOf = { id -> byId[id]?.pauses?.map(IdentifiedPause::pause).orEmpty() },
        )
    }
    val labels = mapOf(
        WeekStage.TODO to R.string.week_stage_todo,
        WeekStage.WELL_UNDERWAY to R.string.week_stage_well_underway,
        WeekStage.MINIMUM to R.string.week_stage_minimum,
        WeekStage.DONE to R.string.week_stage_done,
    )

    ScreenList(context = stringResource(R.string.week_subtitle), title = stringResource(R.string.week_title)) {
        if (outlook.byStage.values.all(List<WeekEntry>::isEmpty)) {
            item {
                EmptyState(
                    Icons.Outlined.Check,
                    stringResource(R.string.week_empty_title),
                    stringResource(R.string.week_empty_message),
                )
            }
        }
        WeekStage.entries.forEach { stage ->
            val entries = outlook.byStage.getValue(stage).mapNotNull { byId[it.habit.id] }
            if (entries.isNotEmpty()) {
                item(key = "stage-$stage") { SectionLabel(stringResource(labels.getValue(stage))) }
                items(entries, key = { "$stage-${it.stored.id}" }) { card ->
                    HabitRow(
                        card,
                        done = stage == WeekStage.DONE,
                        onClick = { quick(card) },
                        onLongClick = { quick(card) },
                    )
                }
            }
        }
    }
}

@Composable
private fun StatsScreen(habits: List<HabitCardState>) {
    val palette = cadence
    val visible = habits.filterNot { it.stored.archived }
    ScreenList(context = stringResource(R.string.stats_subtitle), title = stringResource(R.string.tab_stats)) {
        if (visible.isEmpty()) {
            item { EmptyState(Icons.Outlined.Analytics, stringResource(R.string.empty_habits_title), stringResource(R.string.empty_habits_message)) }
        }
        items(visible, key = { it.stored.id }) { item ->
            val tint = habitTint(item)
            Panel {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                    Column(Modifier.weight(1f)) {
                        Text(item.stored.name, style = MaterialTheme.typography.titleMedium, color = palette.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Spacer(Modifier.height(Space.sm))
                        Text(progress(item), style = MetricStyle, color = tint)
                        Text(stringResource(R.string.stats_entry_count, item.entryCount), style = MaterialTheme.typography.labelMedium, color = palette.inkFaint)
                    }
                }
                Spacer(Modifier.height(Space.lg))
                Hairline()
                Spacer(Modifier.height(Space.lg))
                HabitHistoryGraph(item.history, tint, Modifier.fillMaxWidth())
                Spacer(Modifier.height(Space.xl))
                HabitHeatmap(item.dailyHistory, tint, Modifier.fillMaxWidth())
                Spacer(Modifier.height(Space.xl))
                Hairline()
                Spacer(Modifier.height(Space.lg))
                HabitInsightsPanel(item.insights, item.stored.goal, tint, Modifier.fillMaxWidth())
            }
        }
    }
}

@Composable
private fun SettingsScreen(
    groups: List<HabitGroup>,
    habitCountByGroup: Map<String, Int>,
    saveGroup: (HabitGroup) -> Unit,
    addGroup: (String) -> Unit,
    deleteGroup: (String) -> Unit,
    moveGroup: (String, Int) -> Unit,
    startTravel: () -> Unit,
    export: () -> Unit,
    import: () -> Unit,
    message: String?,
) {
    val palette = cadence
    ScreenList(context = stringResource(R.string.settings_data_subtitle), title = stringResource(R.string.tab_settings)) {
        item { SectionLabel(stringResource(R.string.travel_section)) }
        item {
            Panel {
                Text(stringResource(R.string.travel_subtitle), style = MaterialTheme.typography.bodyLarge, color = palette.ink)
                Spacer(Modifier.height(Space.xs))
                Text(stringResource(R.string.travel_reminders_silent), style = MaterialTheme.typography.bodySmall, color = palette.inkFaint)
                Spacer(Modifier.height(Space.md))
                SecondaryAction(stringResource(R.string.travel_title), Modifier.fillMaxWidth(), onClick = startTravel)
            }
        }

        item { SectionLabel(stringResource(R.string.group_section_title)) }
        item {
            Panel {
                Text(stringResource(R.string.group_overlap_notice), style = MaterialTheme.typography.bodySmall, color = palette.inkMuted)
            }
        }
        items(groups, key = HabitGroup::id) { group ->
            GroupPanel(group, habitCountByGroup[group.id] ?: 0, saveGroup, deleteGroup, moveGroup)
        }
        item {
            val newGroupName = stringResource(R.string.group_new_name)
            SecondaryAction(stringResource(R.string.group_add), Modifier.fillMaxWidth()) { addGroup(newGroupName) }
        }

        item { SectionLabel(stringResource(R.string.settings_widget_title)) }
        item {
            Panel {
                Text(stringResource(R.string.settings_widget_hint), style = MaterialTheme.typography.bodyLarge, color = palette.ink)
                Spacer(Modifier.height(Space.xs))
                Text(stringResource(R.string.settings_widget_options), style = MaterialTheme.typography.bodySmall, color = palette.inkFaint)
            }
        }
        item { SectionLabel(stringResource(R.string.settings_data_title)) }
        item {
            Panel {
                Text(stringResource(R.string.settings_data_subtitle), style = MaterialTheme.typography.bodySmall, color = palette.inkMuted)
                Spacer(Modifier.height(Space.lg))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.md)) {
                    PrimaryAction(stringResource(R.string.settings_export), Modifier.weight(1f), onClick = export)
                    SecondaryAction(stringResource(R.string.settings_import), Modifier.weight(1f), onClick = import)
                }
                message?.let {
                    Spacer(Modifier.height(Space.md))
                    Text(it, style = MaterialTheme.typography.bodySmall, color = palette.success)
                }
            }
        }
    }
}

/**
 * Réglage d'un moment de la journée. `Journée` garde sa nature de groupe sans horaire :
 * son nom reste modifiable, mais il ne prend jamais de plage et ne se supprime pas —
 * c'est la destination de repli des habitudes d'un groupe supprimé.
 */
@Composable
private fun GroupPanel(
    group: HabitGroup,
    habitCount: Int,
    save: (HabitGroup) -> Unit,
    delete: (String) -> Unit,
    move: (String, Int) -> Unit,
) {
    val palette = cadence
    var name by remember(group.id, group.name) { mutableStateOf(group.name) }
    var start by remember(group.id, group.startMinute) { mutableStateOf(formatMinuteOfDay(group.startMinute)) }
    var end by remember(group.id, group.endMinute) { mutableStateOf(formatMinuteOfDay(group.endMinute)) }
    val fixedAllDay = group.id == HabitGroup.ALL_DAY_ID

    fun commit() {
        val startMinute = if (fixedAllDay) null else parseMinuteOfDay(start)
        val endMinute = if (fixedAllDay) null else parseMinuteOfDay(end)
        val bounded = if (startMinute == null || endMinute == null) null to null else startMinute to endMinute
        runCatching {
            HabitGroup(group.id, name.trim().ifBlank { group.name }, bounded.first, bounded.second, group.sortOrder)
        }.onSuccess(save)
    }

    Panel {
        CadenceField(name, { name = it }, stringResource(R.string.group_name_label), accent = palette.accent)
        if (!fixedAllDay) {
            Spacer(Modifier.height(Space.md))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.md)) {
                CadenceField(start, { start = it }, stringResource(R.string.group_start_label), Modifier.weight(1f), accent = palette.accent)
                CadenceField(end, { end = it }, stringResource(R.string.group_end_label), Modifier.weight(1f), accent = palette.accent)
            }
        } else {
            Spacer(Modifier.height(Space.xs))
            Text(stringResource(R.string.group_all_day), style = MaterialTheme.typography.bodySmall, color = palette.inkFaint)
        }
        Spacer(Modifier.height(Space.md))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.md)) {
            PrimaryAction(stringResource(R.string.form_btn_save), Modifier.weight(1f)) { commit() }
            if (!fixedAllDay) {
                TertiaryAction(stringResource(R.string.group_delete), Modifier.weight(1f)) { delete(group.id) }
            }
        }
        if (!fixedAllDay) {
            Spacer(Modifier.height(Space.sm))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.md)) {
                TertiaryAction(stringResource(R.string.group_move_up), Modifier.weight(1f)) { move(group.id, -1) }
                TertiaryAction(stringResource(R.string.group_move_down), Modifier.weight(1f)) { move(group.id, 1) }
            }
        }
        if (habitCount > 0) {
            Spacer(Modifier.height(Space.xs))
            Text(
                stringResource(R.string.group_habit_count, habitCount) +
                    if (fixedAllDay) "" else " · " + stringResource(R.string.group_delete_notice),
                style = MaterialTheme.typography.bodySmall,
                color = palette.inkFaint,
            )
        }
    }
}

private fun formatMinuteOfDay(minute: Int?): String =
    minute?.let { String.format(java.util.Locale.ROOT, "%02d:%02d", it / 60, it % 60) }.orEmpty()

/** Lit `HH:mm`; toute autre écriture laisse le groupe sans horaire plutôt que d'inventer une plage. */
private fun parseMinuteOfDay(raw: String): Int? =
    runCatching { java.time.LocalTime.parse(raw.trim()) }.getOrNull()?.let { it.hour * 60 + it.minute }

/**
 * Où mène la progression, avant de s'y engager. Les cibles sont calculées avec le même
 * code que celui qui les appliquera, plafond compris.
 */
@Composable
private fun ProgressionPreview(state: EditorState, accent: Color) {
    val palette = cadence
    val scale = if (state.customUnit) 1L else state.unit.scaleToCanonical
    val target = state.target.toLongOrNull()?.times(scale)
    val step = state.progressionStep.toLongOrNull()?.times(scale)
    if (target == null || target <= 0 || step == null || step <= 0) return

    val progression = runCatching {
        GoalProgression(
            step = step,
            cadence = if (state.progressionMonthly) ProgressionCadence.MONTHLY else ProgressionCadence.WEEKLY,
            capMinor = state.progressionCap.toLongOrNull()?.times(scale)?.takeIf { it > 0 },
            startsOn = LocalDate.now(),
        )
    }.getOrNull() ?: return
    val unit = if (state.customUnit) null else state.unit

    FieldGroup(stringResource(R.string.form_progression_preview)) {
        progression.preview(target, LocalDate.now(), count = 5).forEach { entry ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(entry.from.toString(), style = MaterialTheme.typography.bodySmall, color = palette.inkFaint)
                Text(
                    HabitFormatter.formatValue(entry.targetMinor, state.goalType, unit),
                    style = MaterialTheme.typography.bodyMedium,
                    color = accent,
                )
            }
        }
    }
}

/** Déplacement d'une habitude d'un groupe à l'autre, sans passer par le formulaire complet. */
@OptIn(ExperimentalLayoutApi::class, androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun GroupPickerSheet(
    item: HabitCardState,
    groups: List<HabitGroup>,
    dismiss: () -> Unit,
    choose: (String) -> Unit,
) {
    val tint = habitTint(item)
    CadenceSheet(
        title = stringResource(R.string.group_move_title),
        subtitle = item.stored.name,
        dismiss = dismiss,
        leading = { HabitAvatar(item, tint) },
    ) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
            groups.forEach { group ->
                ChoiceChip(group.name, item.stored.groupId == group.id, accent = tint) { choose(group.id) }
            }
        }
        Spacer(Modifier.height(Space.xl))
        SecondaryAction(stringResource(R.string.form_btn_cancel), Modifier.fillMaxWidth(), onClick = dismiss)
    }
}

/** `null` signifie l'ensemble : le filtre restreint la vue, il ne cache jamais le reste. */
private fun List<HabitCardState>.inGroup(groupId: String?): List<HabitCardState> =
    if (groupId == null) this else filter { it.stored.groupId == groupId }

/**
 * Filtre par groupe. `Tous` reste toujours en tête et sélectionnable : accéder à
 * l'ensemble ne doit jamais demander de deviner quel groupe choisir.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun GroupFilter(
    groups: List<HabitGroup>,
    habits: List<HabitCardState>,
    selectedGroupId: String?,
    onSelect: (String?) -> Unit,
) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
        ChoiceChip(stringResource(R.string.group_filter_all), selectedGroupId == null) { onSelect(null) }
        groups.forEach { group ->
            // Un groupe sans aucune habitude n'encombre pas le filtre.
            if (habits.any { it.stored.groupId == group.id }) {
                ChoiceChip(group.name, selectedGroupId == group.id) {
                    onSelect(group.id.takeIf { it != selectedGroupId })
                }
            }
        }
    }
}

/**
 * La série se lit en périodes planifiées réussies, pas en jours calendaires : le libellé
 * évite donc de parler de jours, qui serait faux pour un objectif hebdomadaire ou un
 * rythme tous les N jours.
 */
@Composable
private fun StreakLine(streak: HabitStreak) {
    val palette = cadence
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            if (streak.current > 0) {
                pluralStringResource(R.plurals.streak_current, streak.current, streak.current)
            } else {
                stringResource(R.string.streak_none)
            },
            style = MaterialTheme.typography.titleMedium,
            color = if (streak.current > 0) palette.ink else palette.inkFaint,
        )
        if (streak.best > streak.current) {
            Text(
                stringResource(R.string.streak_best, streak.best),
                style = MaterialTheme.typography.bodySmall,
                color = palette.inkFaint,
            )
        }
    }
}

@Composable
private fun HabitAvatar(item: HabitCardState, tint: Color) {
    val icon = HabitIconRegistry.getIcon(item.stored.iconId)
    Box(Modifier.size(Size.badge).clip(Radius.Control).background(tint), contentAlignment = Alignment.Center) {
        Icon(icon.imageVector, icon.labelFr, tint = onColorOf(tint), modifier = Modifier.size(Size.iconLarge))
    }
}

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun HabitOptionsSheet(
    item: HabitCardState,
    dismiss: () -> Unit,
    edit: () -> Unit,
    pause: () -> Unit,
    skipToday: () -> Unit,
    cancelSkip: (String) -> Unit,
    resumePause: (String) -> Unit,
    moveToGroup: () -> Unit,
    stopProgression: () -> Unit,
    archive: () -> Unit,
    duplicate: () -> Unit,
    up: () -> Unit,
    down: () -> Unit,
    delete: () -> Unit,
) {
    val palette = cadence
    val tint = habitTint(item)
    CadenceSheet(
        title = item.stored.name,
        subtitle = habitStatus(item),
        dismiss = dismiss,
        leading = { HabitAvatar(item, tint) },
    ) {
        ActionRow(Icons.Outlined.Edit, stringResource(R.string.action_edit), tint, edit)
        ActionRow(
            if (item.evaluation.isPaused) Icons.Outlined.PlayArrow else Icons.Outlined.Pause,
            stringResource(if (item.evaluation.isPaused) R.string.action_resume else R.string.action_pause),
            tint,
            pause,
        )
        val today = LocalDate.now()
        val skip = item.cancellableSkip(today)
        val suspension = item.activePause(today)
        when {
            skip != null -> ActionRow(Icons.Outlined.Restore, stringResource(R.string.skip_cancel_today), tint) { cancelSkip(skip.id) }
            suspension != null -> ActionRow(
                Icons.Outlined.PlayArrow,
                stringResource(
                    R.string.travel_active,
                    suspension.pause.endExclusive?.minusDays(1)?.toString().orEmpty(),
                ),
                tint,
            ) { resumePause(suspension.id) }
            !item.evaluation.isPaused ->
                ActionRow(Icons.Outlined.EventBusy, stringResource(R.string.action_skip_today), tint, skipToday)
        }
        ActionRow(
            if (item.stored.archived) Icons.Outlined.Restore else Icons.Outlined.Archive,
            stringResource(if (item.stored.archived) R.string.action_restore else R.string.action_archive),
            tint,
            archive,
        )
        ActionRow(Icons.Outlined.Sell, stringResource(R.string.action_move_to_group), tint, moveToGroup)
        if (item.stored.goal.progression != null) {
            ActionRow(Icons.Outlined.TrendingFlat, stringResource(R.string.progression_stop), tint, stopProgression)
        }
        ActionRow(Icons.Outlined.ContentCopy, stringResource(R.string.action_duplicate), tint, duplicate)
        ActionRow(Icons.Outlined.KeyboardArrowUp, stringResource(R.string.action_reorder_up), tint, up)
        ActionRow(Icons.Outlined.KeyboardArrowDown, stringResource(R.string.action_reorder_down), tint, down)
        Spacer(Modifier.height(Space.sm))
        Hairline()
        Spacer(Modifier.height(Space.sm))
        ActionRow(Icons.Outlined.Delete, stringResource(R.string.action_delete), palette.danger, delete)
    }
}

@OptIn(ExperimentalLayoutApi::class, androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun QuickSheet(
    item: HabitCardState,
    add: (Long, String?) -> Unit,
    undo: () -> Unit,
    correct: (HabitEntry) -> Unit,
    timer: HabitTimer?,
    startTimer: () -> Unit,
    pauseTimer: () -> Unit,
    finishTimer: () -> Unit,
    resetTimer: () -> Unit,
    dismiss: () -> Unit,
) {
    var custom by remember { mutableStateOf("") }
    // La note accompagne la prochaine saisie, quelle que soit la façon de la déclencher.
    var note by remember(item.stored.id) { mutableStateOf("") }
    val record: (Long) -> Unit = { value -> add(value, note); note = "" }
    val tint = habitTint(item)
    val scale = item.stored.goal.unit?.scaleToCanonical ?: 1
    CadenceSheet(
        title = item.stored.name,
        subtitle = progress(item),
        dismiss = dismiss,
        leading = { HabitAvatar(item, tint) },
    ) {
        HabitHistoryGraph(item.history, tint, Modifier.fillMaxWidth().padding(bottom = Space.xl))
        StreakLine(item.streak)
        Spacer(Modifier.height(Space.xl))
        if (item.stored.timerEnabled && item.stored.goal.goalType == GoalType.DURATION) {
            SectionLabel(stringResource(R.string.timer_section))
            Spacer(Modifier.height(Space.sm))
            TimerPanel(
                timer = timer,
                goal = item.stored.goal,
                progressMinor = item.evaluation.progressMinor,
                accent = tint,
                start = startTimer,
                pause = pauseTimer,
                finish = { finishTimer(); dismiss() },
                reset = resetTimer,
            )
            Spacer(Modifier.height(Space.xl))
        }
        CadenceField(note, { note = it }, stringResource(R.string.quick_note_label), accent = tint)
        Spacer(Modifier.height(Space.lg))
        if (item.stored.goal.goalType == GoalType.BINARY) {
            PrimaryAction(stringResource(R.string.quick_btn_validate), Modifier.fillMaxWidth(), accent = tint) { record(1); dismiss() }
        } else {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                item.quickValues.ifEmpty { listOf(scale) }.forEach { value ->
                    ValueChip("+${HabitFormatter.formatValue(value, item.stored.goal.goalType, item.stored.goal.unit)}", accent = tint) { record(value) }
                }
            }
            Spacer(Modifier.height(Space.lg))
            CadenceField(
                custom,
                { custom = it.filter(Char::isDigit) },
                stringResource(R.string.quick_custom_value_label),
                suffix = item.stored.goal.unit?.symbol,
                accent = tint,
                numeric = true,
            )
            Spacer(Modifier.height(Space.md))
            PrimaryAction(stringResource(R.string.quick_btn_add), Modifier.fillMaxWidth(), accent = tint, enabled = (custom.toLongOrNull() ?: 0) > 0) {
                custom.toLongOrNull()?.takeIf { it > 0 }?.let { record(it * scale); custom = "" }
            }
        }
        Spacer(Modifier.height(Space.xs))
        TertiaryAction(stringResource(R.string.quick_btn_undo), Modifier.fillMaxWidth(), onClick = undo)

        Spacer(Modifier.height(Space.xl))
        SectionLabel(stringResource(R.string.entries_section))
        Spacer(Modifier.height(Space.sm))
        if (item.recentEntries.isEmpty()) {
            Text(stringResource(R.string.entries_empty), style = MaterialTheme.typography.bodySmall, color = cadence.inkFaint)
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                item.recentEntries.take(VISIBLE_ENTRIES).forEach { entry ->
                    EntryRow(entry, item.stored.goal.goalType, item.stored.goal.unit) { correct(entry) }
                }
            }
        }
    }
}

/** Une saisie corrigeable : sa date civile, son heure et sa valeur, sans carte imbriquée. */
@Composable
private fun EntryRow(entry: HabitEntry, goalType: GoalType, unit: MeasurementUnit?, onClick: () -> Unit) {
    val palette = cadence
    Row(
        Modifier.fillMaxWidth().clip(Radius.Control).clickable(onClick = onClick).padding(vertical = Space.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column(Modifier.weight(1f)) {
            Text(entry.localDate.toString(), style = MaterialTheme.typography.bodyMedium, color = palette.ink)
            Text(
                // La note prime sur l'heure : c'est elle qui rappelle de quoi il s'agissait.
                entry.note ?: entry.occurredAt.atZone(entry.observedZoneId).toLocalTime()
                    .truncatedTo(ChronoUnit.MINUTES).toString(),
                style = MaterialTheme.typography.bodySmall,
                color = palette.inkFaint,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Text(
            HabitFormatter.formatValue(entry.valueMinor, goalType, unit),
            style = MaterialTheme.typography.titleMedium,
            color = palette.ink,
        )
    }
}

/** Nombre de saisies proposées directement; l'ensemble reste corrigeable par défilement. */
private const val VISIBLE_ENTRIES = 12

/**
 * Correction d'une saisie. La date et l'heure sont lues dans le fuseau enregistré avec la
 * saisie, pour qu'une correction passée reste attribuée à la bonne période.
 */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun EntryEditor(
    entry: HabitEntry,
    goalType: GoalType,
    unit: MeasurementUnit?,
    accent: Color,
    dismiss: () -> Unit,
    save: (Long, LocalDate, LocalTime, String) -> Unit,
    delete: () -> Unit,
) {
    val palette = cadence
    val scale = unit?.scaleToCanonical ?: 1L
    val zoned = remember(entry.id) { entry.occurredAt.atZone(entry.observedZoneId) }
    var value by remember(entry.id) { mutableStateOf((entry.valueMinor / scale).toString()) }
    var date by remember(entry.id) { mutableStateOf(entry.localDate.toString()) }
    var time by remember(entry.id) { mutableStateOf(zoned.toLocalTime().truncatedTo(ChronoUnit.MINUTES).toString()) }
    var note by remember(entry.id) { mutableStateOf(entry.note.orEmpty()) }
    var error by remember(entry.id) { mutableStateOf<String?>(null) }
    val badValue = stringResource(R.string.entry_error_value)
    val badDate = stringResource(R.string.entry_error_date)
    val badTime = stringResource(R.string.entry_error_time)

    CadenceSheet(
        title = stringResource(R.string.entry_edit_title),
        subtitle = stringResource(R.string.entry_edit_subtitle),
        dismiss = dismiss,
    ) {
        CadenceField(value, { value = it.filter(Char::isDigit) }, stringResource(R.string.entry_value_label), suffix = unit?.symbol, accent = accent, numeric = true)
        Spacer(Modifier.height(Space.md))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.md)) {
            CadenceField(date, { date = it }, stringResource(R.string.entry_date_label), Modifier.weight(1f), accent = accent)
            CadenceField(time, { time = it }, stringResource(R.string.entry_time_label), Modifier.weight(1f), accent = accent)
        }
        Spacer(Modifier.height(Space.md))
        CadenceField(note, { note = it }, stringResource(R.string.entry_note_label), accent = accent)
        Spacer(Modifier.height(Space.sm))
        Text(
            stringResource(R.string.entry_zone_notice, entry.observedZoneId.id),
            style = MaterialTheme.typography.bodySmall,
            color = palette.inkFaint,
        )
        error?.let { Spacer(Modifier.height(Space.md)); ErrorText(it) }
        Spacer(Modifier.height(Space.xl))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.md)) {
            SecondaryAction(stringResource(R.string.form_btn_cancel), Modifier.weight(1f), onClick = dismiss)
            PrimaryAction(stringResource(R.string.form_btn_save), Modifier.weight(1f), accent = accent) {
                val amount = value.toLongOrNull() ?: 0
                val parsedDate = runCatching { LocalDate.parse(date.trim()) }.getOrNull()
                val parsedTime = runCatching { LocalTime.parse(time.trim()) }.getOrNull()
                when {
                    amount <= 0 -> error = badValue
                    parsedDate == null -> error = badDate
                    parsedTime == null -> error = badTime
                    else -> save(amount * scale, parsedDate, parsedTime, note)
                }
            }
        }
        Spacer(Modifier.height(Space.sm))
        TertiaryAction(stringResource(R.string.entry_delete), Modifier.fillMaxWidth(), onClick = delete)
    }
}

private class EditorState(
    step: Int = 0, name: String = "", description: String = "",
    iconId: String = HabitIconRegistry.DEFAULT_ICON_ID, colorArgb: Int = 0xFF5546EE.toInt(),
    goalType: GoalType = GoalType.BINARY, target: String = "1", unit: MeasurementUnit = MeasurementUnit.COUNT,
    customUnit: Boolean = false, customName: String = "", customSymbol: String = "",
    period: PeriodType = PeriodType.DAY, scheduleMode: ScheduleMode = ScheduleMode.EVERY_DAY,
    activeDays: Set<DayOfWeek> = DayOfWeek.entries.toSet(), firstDay: DayOfWeek = DayOfWeek.MONDAY,
    quickValues: String = "1", reminderTimes: String = "", conditionalReminders: Boolean = true,
    frequencyTarget: String = "",
    intervalDays: String = "2",
    groupId: String = HabitGroup.ALL_DAY_ID,
    minimum: String = "",
    timerEnabled: Boolean = false,
    limited: Boolean = false,
    progressive: Boolean = false,
    progressionStep: String = "",
    progressionMonthly: Boolean = false,
    progressionCap: String = "",
) {
    var step by mutableIntStateOf(step)
    var name by mutableStateOf(name)
    var description by mutableStateOf(description)
    var iconId by mutableStateOf(iconId)
    var colorArgb by mutableIntStateOf(colorArgb)
    var goalType by mutableStateOf(goalType)
    var target by mutableStateOf(target)
    var unit by mutableStateOf(unit)
    var customUnit by mutableStateOf(customUnit)
    var customName by mutableStateOf(customName)
    var customSymbol by mutableStateOf(customSymbol)
    var period by mutableStateOf(period)
    var scheduleMode by mutableStateOf(scheduleMode)
    var activeDays by mutableStateOf(activeDays)
    var firstDay by mutableStateOf(firstDay)
    var quickValues by mutableStateOf(quickValues)
    var reminderTimes by mutableStateOf(reminderTimes)
    var conditionalReminders by mutableStateOf(conditionalReminders)
    var frequencyTarget by mutableStateOf(frequencyTarget)
    var intervalDays by mutableStateOf(intervalDays)
    var groupId by mutableStateOf(groupId)
    var minimum by mutableStateOf(minimum)
    var timerEnabled by mutableStateOf(timerEnabled)
    var limited by mutableStateOf(limited)
    var progressive by mutableStateOf(progressive)
    var progressionStep by mutableStateOf(progressionStep)
    var progressionMonthly by mutableStateOf(progressionMonthly)
    var progressionCap by mutableStateOf(progressionCap)
}

@OptIn(ExperimentalLayoutApi::class, androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun HabitEditor(existing: HabitCardState?, groups: List<HabitGroup>, dismiss: () -> Unit, save: (PersistedHabit, List<Long>, List<String>, Boolean, Boolean) -> Unit) {
    val palette = cadence
    val stored = existing?.stored
    val state = remember(stored?.id) {
        mutableStateOf(
            EditorState(
                name = stored?.name.orEmpty(),
                description = stored?.description.orEmpty(),
                iconId = stored?.iconId ?: HabitIconRegistry.DEFAULT_ICON_ID,
                colorArgb = stored?.colorArgb ?: 0xFF5546EE.toInt(),
                goalType = stored?.goal?.goalType ?: GoalType.BINARY,
                target = stored?.goal?.let { (it.targetMinor / (it.unit?.scaleToCanonical ?: 1)).toString() } ?: "1",
                unit = stored?.goal?.unit ?: MeasurementUnit.COUNT,
                period = stored?.goal?.period ?: PeriodType.DAY,
                scheduleMode = stored?.schedule?.mode ?: ScheduleMode.EVERY_DAY,
                activeDays = stored?.schedule?.activeDays ?: DayOfWeek.entries.toSet(),
                firstDay = stored?.schedule?.firstDayOfWeek ?: DayOfWeek.MONDAY,
                quickValues = existing?.quickValues?.joinToString(", ") { (it / (stored?.goal?.unit?.scaleToCanonical ?: 1)).toString() } ?: "1",
                reminderTimes = existing?.reminders?.joinToString(", ") { it.time }.orEmpty(),
                conditionalReminders = existing?.reminders?.all { it.conditional } ?: true,
                frequencyTarget = stored?.goal?.frequencyTarget?.toString().orEmpty(),
                intervalDays = stored?.schedule?.intervalDays?.toString() ?: "2",
                groupId = stored?.groupId ?: HabitGroup.ALL_DAY_ID,
                timerEnabled = stored?.timerEnabled ?: false,
                limited = stored?.goal?.isLimit ?: false,
                progressive = stored?.goal?.progression != null,
                progressionStep = stored?.goal?.progression
                    ?.let { (it.step / (stored.goal.unit?.scaleToCanonical ?: 1)).toString() }
                    .orEmpty(),
                progressionMonthly = stored?.goal?.progression?.cadence == ProgressionCadence.MONTHLY,
                progressionCap = stored?.goal?.progression?.capMinor
                    ?.let { (it / (stored.goal.unit?.scaleToCanonical ?: 1)).toString() }
                    .orEmpty(),
                minimum = stored?.goal?.minimumMinor
                    ?.let { (it / (stored.goal.unit?.scaleToCanonical ?: 1)).toString() }
                    .orEmpty(),
            ),
        )
    }.value
    var error by remember { mutableStateOf<String?>(null) }
    val accent = Color(state.colorArgb)
    val stepTitles = listOf(R.string.form_step_identity_title, R.string.form_step_goal_title, R.string.form_step_schedule_title, R.string.form_step_quick_title)
    val stepSubtitles = listOf(R.string.form_step_identity_subtitle, R.string.form_step_goal_subtitle, R.string.form_step_schedule_subtitle, R.string.form_step_quick_subtitle)
    val requiredName = stringResource(R.string.form_error_required_name)
    val positiveTarget = stringResource(R.string.form_error_positive_target)
    val positiveFrequency = stringResource(R.string.form_error_positive_frequency)
    val incompleteUnit = stringResource(R.string.form_error_incomplete_unit)
    val noDay = stringResource(R.string.form_error_no_day)
    val badTime = stringResource(R.string.form_error_time_format)
    val badInterval = stringResource(R.string.form_error_interval_days)
    val badMinimum = stringResource(R.string.form_error_minimum)
    val badProgressionStep = stringResource(R.string.form_error_progression_step)
    val badProgressionCap = stringResource(R.string.form_error_progression_cap)

    CadenceSheet(
        title = stringResource(stepTitles[state.step]),
        subtitle = stringResource(stepSubtitles[state.step]),
        dismiss = dismiss,
    ) {
        Row(Modifier.fillMaxWidth().padding(bottom = Space.xl), horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
            stepTitles.indices.forEach { index ->
                Box(Modifier.weight(1f).height(3.dp).clip(CircleShape).background(if (index <= state.step) accent else palette.sunken))
            }
        }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(Space.lg), modifier = Modifier.heightIn(max = 420.dp).weight(1f, fill = false)) {
            when (state.step) {
                0 -> {
                    item { CadenceField(state.name, { state.name = it }, stringResource(R.string.form_name_label), placeholder = stringResource(R.string.form_name_placeholder), accent = accent) }
                    item { CadenceField(state.description, { state.description = it }, stringResource(R.string.form_description_label), accent = accent) }
                    item {
                        val chosen = HabitIconRegistry.getIcon(state.iconId)
                        FieldGroup(stringResource(R.string.form_icon_selected_label)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.size(Size.badge).clip(Radius.Control).background(accent), contentAlignment = Alignment.Center) {
                                    Icon(chosen.imageVector, chosen.labelFr, tint = onColorOf(accent), modifier = Modifier.size(Size.iconLarge))
                                }
                                Spacer(Modifier.width(Space.md))
                                Text(chosen.labelFr, style = MaterialTheme.typography.titleMedium, color = palette.ink)
                            }
                        }
                    }
                    item { HabitIconPicker(state.iconId, { state.iconId = it }, accent = accent) }
                    item {
                        FieldGroup(stringResource(R.string.form_color_label)) {
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.md), verticalArrangement = Arrangement.spacedBy(Space.md)) {
                                HABIT_COLORS.forEach { color ->
                                    val selected = state.colorArgb == color.toInt()
                                    Box(
                                        Modifier.size(Size.touch).clip(CircleShape).background(Color(color)).clickable { state.colorArgb = color.toInt() },
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        if (selected) Icon(Icons.Outlined.Check, null, tint = onColorOf(Color(color)), modifier = Modifier.size(Size.icon))
                                    }
                                }
                            }
                        }
                    }
                }
                1 -> {
                    item {
                        FieldGroup(stringResource(R.string.form_goal_type_label)) {
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                                GoalType.entries.forEach { type ->
                                    ChoiceChip(stringResource(HabitLabels.goalTypeShort(type)), state.goalType == type, accent = accent) {
                                        state.goalType = type
                                        if (type == GoalType.BINARY) state.target = "1"
                                    }
                                }
                            }
                        }
                    }
                    if (state.goalType == GoalType.DURATION) {
                        item {
                            FieldGroup(stringResource(R.string.timer_form_support)) {
                                ToggleRow(stringResource(R.string.timer_form_label), state.timerEnabled, accent) {
                                    state.timerEnabled = it
                                }
                            }
                        }
                    }
                    if (state.goalType != GoalType.BINARY) {
                        item {
                            FieldGroup(stringResource(R.string.form_direction_label)) {
                                Row(horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                                    ChoiceChip(stringResource(R.string.form_direction_at_least), !state.limited, accent = accent) {
                                        state.limited = false
                                    }
                                    ChoiceChip(stringResource(R.string.form_direction_at_most), state.limited, accent = accent) {
                                        // Un plafond ne porte pas de minimum : il n'aurait aucun sens.
                                        state.limited = true
                                        state.minimum = ""
                                    }
                                }
                            }
                        }
                        item {
                            CadenceField(
                                state.target,
                                { state.target = it.filter(Char::isDigit) },
                                stringResource(if (state.limited) R.string.form_limit_label else R.string.form_target_label),
                                support = stringResource(R.string.form_limit_support).takeIf { state.limited },
                                accent = accent,
                                numeric = true,
                            )
                        }
                        item {
                            FieldGroup(stringResource(R.string.form_progression_support)) {
                                ToggleRow(stringResource(R.string.form_progression_label), state.progressive, accent) {
                                    state.progressive = it
                                }
                            }
                        }
                        if (state.progressive) {
                            item {
                                CadenceField(
                                    state.progressionStep,
                                    { state.progressionStep = it.filter(Char::isDigit) },
                                    stringResource(R.string.form_progression_step),
                                    accent = accent,
                                    numeric = true,
                                )
                            }
                            item {
                                FieldGroup(stringResource(R.string.form_progression_cadence)) {
                                    Row(horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                                        ChoiceChip(stringResource(R.string.form_progression_weekly), !state.progressionMonthly, accent = accent) {
                                            state.progressionMonthly = false
                                        }
                                        ChoiceChip(stringResource(R.string.form_progression_monthly), state.progressionMonthly, accent = accent) {
                                            state.progressionMonthly = true
                                        }
                                    }
                                }
                            }
                            item {
                                CadenceField(
                                    state.progressionCap,
                                    { state.progressionCap = it.filter(Char::isDigit) },
                                    stringResource(R.string.form_progression_cap),
                                    accent = accent,
                                    numeric = true,
                                )
                            }
                            item { ProgressionPreview(state, accent) }
                        }
                        if (!state.limited) item {
                            CadenceField(
                                state.minimum,
                                { state.minimum = it.filter(Char::isDigit) },
                                stringResource(R.string.form_minimum_label),
                                support = stringResource(R.string.form_minimum_support),
                                accent = accent,
                                numeric = true,
                            )
                        }
                        item {
                            val units = when (state.goalType) {
                                GoalType.DURATION -> listOf(MeasurementUnit.SECONDS, MeasurementUnit.MINUTES, MeasurementUnit.HOURS)
                                GoalType.COUNT -> MeasurementUnit.BUILT_INS.filter { it.dimension == UnitDimension.COUNT }
                                else -> MeasurementUnit.BUILT_INS.filter { it.dimension != UnitDimension.TIME }
                            }
                            FieldGroup(stringResource(R.string.form_unit_label)) {
                                FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                                    units.forEach { unit ->
                                        ChoiceChip(unit.symbol.ifBlank { unit.nameFr }, !state.customUnit && state.unit.id == unit.id, accent = accent) {
                                            state.unit = unit
                                            state.customUnit = false
                                        }
                                    }
                                    ChoiceChip(stringResource(R.string.form_unit_custom), state.customUnit, accent = accent) { state.customUnit = true }
                                }
                            }
                        }
                    }
                    if (state.customUnit) {
                        item { CadenceField(state.customName, { state.customName = it }, stringResource(R.string.form_custom_unit_name), accent = accent) }
                        item { CadenceField(state.customSymbol, { state.customSymbol = it }, stringResource(R.string.form_custom_unit_symbol), accent = accent) }
                    }
                    // La fréquence minimale n'a pas de sens sous un plafond.
                    if (!state.limited) item {
                        CadenceField(
                            state.frequencyTarget,
                            { state.frequencyTarget = it.filter(Char::isDigit) },
                            stringResource(R.string.form_frequency_label),
                            support = stringResource(R.string.form_frequency_support),
                            accent = accent,
                            numeric = true,
                        )
                    }
                }
                2 -> {
                    item {
                        FieldGroup(stringResource(R.string.habit_form_group_label)) {
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                                groups.forEach { group ->
                                    ChoiceChip(group.name, state.groupId == group.id, accent = accent) { state.groupId = group.id }
                                }
                            }
                        }
                    }
                    item {
                        FieldGroup(stringResource(R.string.form_period_label)) {
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                                PeriodType.entries.forEach { period ->
                                    ChoiceChip(stringResource(HabitLabels.periodShort(period)), state.period == period, accent = accent) { state.period = period }
                                }
                            }
                        }
                    }
                    item {
                        FieldGroup(stringResource(R.string.form_schedule_mode_label)) {
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                                ScheduleMode.entries.forEach { mode ->
                                    ChoiceChip(stringResource(HabitLabels.scheduleMode(mode)), state.scheduleMode == mode, accent = accent) { state.scheduleMode = mode }
                                }
                            }
                        }
                    }
                    if (state.period == PeriodType.WEEK) item {
                        FieldGroup(stringResource(R.string.form_first_day_of_week_label)) {
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                                DayOfWeek.entries.forEach { day ->
                                    ChoiceChip(stringResource(HabitLabels.dayShort(day)), state.firstDay == day, accent = accent) { state.firstDay = day }
                                }
                            }
                        }
                    }
                    if (state.scheduleMode == ScheduleMode.SELECTED_DAYS) item {
                        FieldGroup(stringResource(R.string.form_schedule_selected_days)) {
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                                DayOfWeek.entries.forEach { day ->
                                    ChoiceChip(stringResource(HabitLabels.dayShort(day)), day in state.activeDays, accent = accent) {
                                        state.activeDays = if (day in state.activeDays) state.activeDays - day else state.activeDays + day
                                    }
                                }
                            }
                        }
                    }
                    if (state.scheduleMode == ScheduleMode.FLEXIBLE_PERIOD) item {
                        Text(stringResource(R.string.form_schedule_flexible_support), style = MaterialTheme.typography.bodyMedium, color = palette.inkFaint)
                    }
                    if (state.scheduleMode == ScheduleMode.INTERVAL_DAYS) item {
                        CadenceField(
                            state.intervalDays,
                            { state.intervalDays = it.filter(Char::isDigit) },
                            stringResource(R.string.form_schedule_interval_days),
                            support = stringResource(R.string.form_schedule_interval_support),
                            accent = accent,
                            numeric = true,
                        )
                    }
                }
                else -> {
                    item {
                        CadenceField(
                            state.quickValues,
                            { state.quickValues = it.filter { c -> c.isDigit() || c == ',' || c == ' ' } },
                            stringResource(R.string.form_quick_values_label),
                            support = stringResource(R.string.form_quick_values_support),
                            accent = accent,
                        )
                    }
                    item {
                        CadenceField(
                            state.reminderTimes,
                            { state.reminderTimes = it.filter { c -> c.isDigit() || c == ':' || c == ',' || c == ' ' } },
                            stringResource(R.string.form_reminders_label),
                            support = stringResource(R.string.form_reminders_support),
                            accent = accent,
                        )
                    }
                    item { ToggleRow(stringResource(R.string.form_reminders_conditional), state.conditionalReminders, accent) { state.conditionalReminders = it } }
                }
            }
        }
        error?.let { Spacer(Modifier.height(Space.lg)); ErrorText(it) }
        Row(Modifier.fillMaxWidth().padding(top = Space.xl), horizontalArrangement = Arrangement.spacedBy(Space.md)) {
            SecondaryAction(stringResource(if (state.step > 0) R.string.form_btn_back else R.string.form_btn_cancel), Modifier.weight(1f)) {
                if (state.step > 0) state.step-- else dismiss()
            }
            PrimaryAction(
                stringResource(if (state.step < stepTitles.lastIndex) R.string.form_btn_next else if (stored == null) R.string.form_btn_create else R.string.form_btn_save),
                Modifier.weight(1f),
                accent = accent,
            ) {
                if (state.step < stepTitles.lastIndex) {
                    if (state.step == 0 && state.name.isBlank()) error = requiredName else { error = null; state.step++ }
                } else {
                    val target = state.target.toLongOrNull() ?: 0
                    val unit = if (state.goalType == GoalType.BINARY) null else if (state.customUnit) MeasurementUnit("custom-${state.customName.trim().lowercase()}", UnitDimension.CUSTOM, state.customName.trim(), state.customSymbol.trim()) else state.unit
                    val quick = state.quickValues.split(',', ' ').mapNotNull(String::toLongOrNull).filter { it > 0 }.map { it * (unit?.scaleToCanonical ?: 1) }
                    val reminderTimes = state.reminderTimes.split(',', ' ').map(String::trim).filter(String::isNotBlank)
                    val frequency = state.frequencyTarget.toIntOrNull()
                    val minimum = state.minimum.toLongOrNull()?.times(unit?.scaleToCanonical ?: 1)
                    val scale = unit?.scaleToCanonical ?: 1
                    val progressionStep = state.progressionStep.toLongOrNull()?.times(scale)
                    val progressionCap = state.progressionCap.toLongOrNull()?.times(scale)
                    when {
                        target <= 0 -> error = positiveTarget
                        state.progressive && (progressionStep == null || progressionStep <= 0) -> error = badProgressionStep
                        state.progressive && state.progressionCap.isNotBlank() && (progressionCap == null || progressionCap <= 0) -> error = badProgressionCap
                        state.minimum.isNotBlank() && (minimum == null || minimum <= 0 || minimum > target * (unit?.scaleToCanonical ?: 1)) -> error = badMinimum
                        state.frequencyTarget.isNotBlank() && (frequency ?: 0) <= 0 -> error = positiveFrequency
                        state.customUnit && (state.customName.isBlank() || state.customSymbol.isBlank()) -> error = incompleteUnit
                        state.scheduleMode == ScheduleMode.SELECTED_DAYS && state.activeDays.isEmpty() -> error = noDay
                        state.scheduleMode == ScheduleMode.INTERVAL_DAYS && (state.intervalDays.toIntOrNull() ?: 0) < 2 -> error = badInterval
                        reminderTimes.any { runCatching { java.time.LocalTime.parse(it) }.isFailure } -> error = badTime
                        else -> {
                            val base = stored
                            val habit = PersistedHabit(
                                id = base?.id ?: UUID.randomUUID().toString(),
                                name = state.name.trim(),
                                description = state.description.trim().ifBlank { null },
                                iconId = state.iconId,
                                colorArgb = state.colorArgb,
                                active = base?.active ?: true,
                                startsOn = base?.startsOn ?: LocalDate.now(),
                                archived = base?.archived ?: false,
                                sortOrder = base?.sortOrder ?: 0,
                                createdAtEpochMs = base?.createdAtEpochMs ?: 0,
                                updatedAtEpochMs = base?.updatedAtEpochMs ?: 0,
                                groupId = state.groupId,
                                timerEnabled = state.timerEnabled && state.goalType == GoalType.DURATION,
                                goal = HabitGoal(
                                    targetMinor = target * (unit?.scaleToCanonical ?: 1),
                                    period = state.period,
                                    goalType = state.goalType,
                                    unit = unit,
                                    frequencyTarget = frequency.takeUnless { state.limited },
                                    minimumMinor = minimum.takeUnless { state.limited },
                                    direction = if (state.limited) GoalDirection.AT_MOST else GoalDirection.AT_LEAST,
                                    progression = if (state.progressive && progressionStep != null) {
                                        GoalProgression(
                                            step = progressionStep,
                                            cadence = if (state.progressionMonthly) ProgressionCadence.MONTHLY else ProgressionCadence.WEEKLY,
                                            capMinor = progressionCap,
                                            // Une progression part de la date d'effet de l'objectif,
                                            // pas d'un passé qu'elle réinterpréterait.
                                            startsOn = base?.goal?.progression?.startsOn ?: LocalDate.now(),
                                        )
                                    } else {
                                        null
                                    },
                                ),
                                schedule = HabitSchedule(state.scheduleMode, state.activeDays, state.firstDay, state.intervalDays.toIntOrNull() ?: 2),
                            )
                            save(habit, quick, reminderTimes, state.conditionalReminders, stored == null)
                        }
                    }
                }
            }
        }
    }
}

/** Palette d'habitude : des teintes contrastées sur fond clair comme sur fond sombre. */
private val HABIT_COLORS = listOf(
    0xFF5546EE, 0xFF2E7BE8, 0xFF0F9E86, 0xFF3F9B32,
    0xFFC98A0B, 0xFFE0603C, 0xFFD1417A, 0xFF7A4BD6,
)
