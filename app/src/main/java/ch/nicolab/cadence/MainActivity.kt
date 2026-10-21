package ch.nicolab.cadence

import ch.nicolab.cadence.domain.AbstinenceElapsedCalculator
import ch.nicolab.cadence.domain.AbstinenceSavingsCalculator
import ch.nicolab.cadence.domain.AbstinenceStatisticsDayStatus
import ch.nicolab.cadence.domain.PeriodType
import ch.nicolab.cadence.domain.StatisticsConfidence
import ch.nicolab.cadence.domain.StatisticsTrend
import ch.nicolab.cadence.ui.components.ActivityCalendar
import ch.nicolab.cadence.ui.components.ActivityCalendarCell
import ch.nicolab.cadence.ui.components.ActivityCalendarTone
import ch.nicolab.cadence.ui.components.CalendarPeriod
import ch.nicolab.cadence.ui.components.CalendarPeriodSelector
import ch.nicolab.cadence.ui.theme.habitAccent

import kotlinx.coroutines.launch
import androidx.compose.foundation.layout.navigationBarsPadding
import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.health.connect.client.PermissionController
import androidx.compose.animation.Crossfade
import androidx.compose.foundation.background
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.ui.graphics.graphicsLayer
import ch.nicolab.cadence.ui.components.rememberCadenceHaptic
import ch.nicolab.cadence.ui.theme.Motion
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxHeight
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
import androidx.compose.material.icons.automirrored.outlined.TrendingFlat
import androidx.compose.material.icons.automirrored.outlined.TrendingDown
import androidx.compose.material.icons.automirrored.outlined.TrendingUp
import androidx.compose.material.icons.automirrored.outlined.ShowChart
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.LocalFireDepartment
import androidx.compose.material.icons.outlined.Savings
import androidx.compose.material.icons.outlined.Speed
import ch.nicolab.cadence.domain.SavingsPeriod
import ch.nicolab.cadence.ui.components.MetricCard
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.data.local.model.IdentifiedPause
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.GoalAttainment
import ch.nicolab.cadence.domain.AbstinenceProfile
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.GoalDirection
import ch.nicolab.cadence.domain.HabitEntry
import ch.nicolab.cadence.domain.HabitEntrySource
import ch.nicolab.cadence.domain.HabitStatisticsSummary
import ch.nicolab.cadence.domain.HabitActivityStats
import ch.nicolab.cadence.domain.HabitStatisticsDay
import ch.nicolab.cadence.domain.HabitStatisticsDayStatus
import ch.nicolab.cadence.domain.HabitGroup
import ch.nicolab.cadence.domain.LimitStatus
import ch.nicolab.cadence.domain.WeekEntry
import ch.nicolab.cadence.domain.WeekOutlook
import ch.nicolab.cadence.domain.WeekStage
import ch.nicolab.cadence.domain.HabitStreak
import ch.nicolab.cadence.domain.HabitTimer
import ch.nicolab.cadence.domain.MeasurementUnit
import ch.nicolab.cadence.health.HealthConnectGateway
import ch.nicolab.cadence.health.HealthConnectRulesSheet
import ch.nicolab.cadence.health.HealthConnectSettingsPanel
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
import ch.nicolab.cadence.ui.components.onColorOf
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
import java.util.Locale
import java.util.UUID

class MainActivity : ComponentActivity() {
    companion object { const val EXTRA_EDIT_HABIT_ID = "edit_habit_id" }
    private val viewModel by viewModels<MainViewModel> { MainViewModelFactory(application as CadenceApp) }

    override fun onStart() {
        super.onStart()
        viewModel.onAppVisible()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { CadenceTheme { CadenceAppScreen(viewModel, intent.getStringExtra(EXTRA_EDIT_HABIT_ID)) } }
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
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
private fun CadenceAppScreen(viewModel: MainViewModel, editHabitId: String? = null) {
    val habits by viewModel.habits.collectAsStateWithLifecycle()
    val groups by viewModel.groups.collectAsStateWithLifecycle()
    val timers by viewModel.timers.collectAsStateWithLifecycle()
    val busy by viewModel.isSaving.collectAsStateWithLifecycle()
    val saveError by viewModel.saveError.collectAsStateWithLifecycle()
    val healthConnectState by viewModel.healthConnectState.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableStateOf(Tab.TODAY) }
    var editorId by rememberSaveable { mutableStateOf<String?>(null) }
    val editor = habits.firstOrNull { it.stored.id == editorId }
    var creating by rememberSaveable { mutableStateOf(false) }
    var choosingCreation by rememberSaveable { mutableStateOf(false) }
    var creatingAbstinence by rememberSaveable { mutableStateOf(false) }
    var creatingTracker by rememberSaveable { mutableStateOf(false) }
    var editIntentHandled by rememberSaveable { mutableStateOf(false) }
    androidx.compose.runtime.LaunchedEffect(editHabitId, habits) {
        if (!editIntentHandled && editHabitId != null) habits.firstOrNull { it.stored.id == editHabitId }?.let {
            editorId = it.stored.id
            editIntentHandled = true
        }
    }
    var quickHabitId by rememberSaveable { mutableStateOf<String?>(null) }
    val quick = habits.firstOrNull { it.stored.id == quickHabitId }
    var correctingId by rememberSaveable { mutableStateOf<String?>(null) }
    val correcting = habits.asSequence().flatMap { it.recentEntries.asSequence() }.firstOrNull { it.id == correctingId }
    var options by remember { mutableStateOf<HabitCardState?>(null) }
    var skipping by remember { mutableStateOf<HabitCardState?>(null) }
    var travelling by remember { mutableStateOf(false) }
    var groupFilter by rememberSaveable { mutableStateOf<String?>(null) }
    // Un groupe supprimé pendant qu'il filtrait la vue ne doit pas la laisser vide.
    if (groupFilter != null && groups.isNotEmpty() && groups.none { it.id == groupFilter }) groupFilter = null
    var movingToGroup by remember { mutableStateOf<HabitCardState?>(null) }
    var deleting by remember { mutableStateOf<PersistedHabit?>(null) }
    var backupMessage by remember { mutableStateOf<String?>(null) }
    var healthConnectRulesOpen by rememberSaveable { mutableStateOf(false) }
    val context = LocalContext.current
    val offerReturn by viewModel.offerReturn.collectAsStateWithLifecycle()
    val snackbar = remember { androidx.compose.material3.SnackbarHostState() }
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    androidx.compose.runtime.LaunchedEffect(saveError) {
        saveError?.let { snackbar.showSnackbar(it) }
    }
    val exportedMessage = stringResource(R.string.backup_exported)
    val importedMessage = stringResource(R.string.backup_imported)
    val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    val healthConnectPermission = rememberLauncherForActivityResult(
        PermissionController.createRequestPermissionResultContract(),
        viewModel::onHealthConnectPermissionResult,
    )
    val exportLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        uri?.let { destination -> viewModel.exportBackup { content -> context.contentResolver.openOutputStream(destination)?.bufferedWriter()?.use { it.write(content) }; backupMessage = exportedMessage } }
    }
    val importLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let { source ->
            val content = context.contentResolver.openInputStream(source)?.bufferedReader()?.use { it.readText() } ?: return@let
            viewModel.importBackup(content, { backupMessage = importedMessage }, { backupMessage = it })
        }
    }
    val destinations = Tab.entries.map {
        val label = stringResource(it.label)
        val shortLabel = stringResource(when (it) {
            Tab.TODAY -> R.string.tab_today_navigation
            Tab.HABITS -> R.string.tab_habits_navigation
            Tab.STATS -> R.string.habit_stats_navigation
            else -> it.label
        })
        NavDestination(label, it.icon, shortLabel)
    }

    CadenceScreen {
        Crossfade(tab, label = "tab") { current ->
            when (current) {
                Tab.TODAY -> TodayScreen(
                    habits, groups, groupFilter, { groupFilter = it },
                    { viewModel.clearSaveError(); quickHabitId = it.stored.id },
                    { options = it }, { choosingCreation = true }, timers, busy,
                    direct = { item -> viewModel.directAction(item) { receipt ->
                        snackbar.currentSnackbarData?.dismiss()
                        scope.launch {
                            val result = snackbar.showSnackbar(
                                context.getString(if (receipt.entryId != null) R.string.today_saved else R.string.today_timer_started, item.stored.name),
                                actionLabel = context.getString(R.string.today_undo),
                                duration = androidx.compose.material3.SnackbarDuration.Short,
                            )
                            if (result == androidx.compose.material3.SnackbarResult.ActionPerformed) viewModel.undoDirectAction(receipt)
                        }
                    } },
                    offerReturn = offerReturn,
                    resume = viewModel::dismissReturn,
                    edit = { viewModel.clearSaveError(); editorId = it.stored.id },
                )
                Tab.WEEK -> WeekScreen(habits, { viewModel.clearSaveError(); quickHabitId = it.stored.id }, { options = it })
                Tab.HABITS -> HabitsScreen(habits, groups, groupFilter, { groupFilter = it }, { choosingCreation = true }, { options = it }, { viewModel.clearSaveError(); quickHabitId = it.stored.id })
                Tab.STATS -> StatsScreen(
                    habits = habits,
                    open = { viewModel.clearSaveError(); quickHabitId = it.stored.id },
                    onCorrect = { viewModel.clearSaveError(); correctingId = it.id },
                )
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
                    healthConnectState = healthConnectState,
                    hasDurationHabits = habits.any { it.stored.active && !it.stored.archived && it.stored.goal.goalType == GoalType.DURATION },
                    connectHealth = { healthConnectPermission.launch(HealthConnectGateway.permissions) },
                    syncHealth = viewModel::syncHealthConnect,
                    setHealthSyncEnabled = viewModel::setHealthConnectSyncEnabled,
                    manageHealthAccess = { runCatching { context.startActivity(viewModel.healthConnectManageIntent()) } },
                    configureHealth = { healthConnectRulesOpen = true },
                )
            }
        }
        CadenceNavigation(destinations, tab.ordinal, Modifier.align(Alignment.BottomCenter)) { index -> tab = Tab.entries[index] }
        androidx.compose.material3.SnackbarHost(
            snackbar,
            Modifier.align(Alignment.BottomCenter).navigationBarsPadding()
                .padding(start = Space.gutter, end = Space.gutter, bottom = Size.navBar + Space.xl),
        )
    }

    quick?.let { item ->
        if (item.stored.abstinenceProfile == AbstinenceProfile.ALCOHOL) AlcoholDetailSheet(
            item = item,
            dismiss = { if (!busy) quickHabitId = null },
            recordToday = { saved -> viewModel.recordAlcoholToday(item, saved) },
            saveConsumption = { existing, date, drinks, saved -> viewModel.saveAlcoholConsumption(item, existing, date, drinks, saved) },
            deleteConsumption = viewModel::deleteAlcoholConsumption,
            editHabit = { quickHabitId = null; viewModel.clearSaveError(); editorId = item.stored.id },
            busy = busy,
            error = saveError,
        ) else if (item.stored.goal.isAbstinence) AbstinenceDetailSheet(
            item = item,
            dismiss = { if (!busy) quickHabitId = null },
            onRecordOccurrence = { saved -> viewModel.recordAbstinenceOccurrence(item, null, saved) },
            onEdit = { quickHabitId = null; viewModel.clearSaveError(); editorId = item.stored.id },
            busy = busy,
            error = saveError,
        ) else QuickSheet(
            item,
            { value, note -> viewModel.addEntry(item, value, "APP", UUID.randomUUID().toString(), note) },
            viewModel::undoLastEntry,
            { viewModel.clearSaveError(); correctingId = it.id },
            timers[item.stored.id],
            { viewModel.startTimer(item.stored.id) },
            { viewModel.pauseTimer(item.stored.id) },
            { viewModel.finishTimer(item) },
            { viewModel.resetTimer(item.stored.id) },
            { quickHabitId = null },
        )
    }
    correcting?.let { entry ->
        val habit = habits.firstOrNull { it.stored.id == entry.habitId }
        EntryEditor(
            entry = entry,
            goalType = habit?.stored?.goal?.goalType ?: GoalType.QUANTITY,
            unit = habit?.stored?.goal?.unit,
            accent = habit?.let { habitTint(it) } ?: cadence.accent,
            dismiss = { if (!busy) correctingId = null },
            save = { value, date, time, note ->
                viewModel.correctEntry(entry, value, date, time, note) { correctingId = null }
            },
            delete = { viewModel.deleteEntry(entry.id) { correctingId = null } },
            busy = busy,
            saveError = saveError,
            occurrenceOnly = habit?.stored?.goal?.isAbstinence == true,
        )
    }
    options?.let { item ->
        HabitOptionsSheet(
            item,
            dismiss = { options = null },
            edit = { viewModel.clearSaveError(); editorId = item.stored.id; options = null },
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
    if (choosingCreation) CadenceSheet(
        title = stringResource(R.string.create_choose_title),
        subtitle = stringResource(R.string.create_choose_subtitle),
        dismiss = { choosingCreation = false },
    ) {
        PrimaryAction(stringResource(R.string.create_regular_habit), Modifier.fillMaxWidth()) {
            viewModel.clearSaveError(); choosingCreation = false; creating = true
        }
        Spacer(Modifier.height(Space.md))
        SecondaryAction(stringResource(R.string.create_activity), Modifier.fillMaxWidth()) {
            viewModel.clearSaveError(); choosingCreation = false; creatingTracker = true
        }
        Spacer(Modifier.height(Space.md))
        SecondaryAction(stringResource(R.string.create_abstinence), Modifier.fillMaxWidth()) {
            viewModel.clearSaveError(); choosingCreation = false; creatingAbstinence = true
        }
    }
    if (creating || creatingTracker || creatingAbstinence || editor != null) {
        val dismissEditor = { if (!busy) { creating = false; creatingTracker = false; creatingAbstinence = false; editorId = null } }
        val save: (PersistedHabit, List<Long>, List<String>, Boolean, Boolean) -> Unit = { habit, quickValues, reminderTimes, conditional, isNew ->
            if (!busy) {
                val needsNotifications = reminderTimes.isNotEmpty() ||
                    (habit.goal.isAbstinence && AbstinenceGuide.milestones(habit.abstinenceProfile).isNotEmpty())
                if (needsNotifications && android.os.Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                viewModel.saveHabit(habit, quickValues, reminderTimes, conditional, isNew) {
                    creating = false; creatingTracker = false; creatingAbstinence = false; editorId = null
                }
            }
        }
        if (creatingAbstinence || editor?.stored?.goal?.isAbstinence == true) {
            AbstinenceSetupSheet(editor, groups, dismissEditor, save, busy, saveError)
        } else HabitEditor(editor, groups, dismissEditor, busy, saveError,
            initialDirection = if (creatingTracker) GoalDirection.TRACK_ONLY else GoalDirection.AT_LEAST, save = save)
    }
    if (healthConnectRulesOpen) {
        HealthConnectRulesSheet(
            habits = habits.filter { it.stored.active && !it.stored.archived && it.stored.goal.goalType == GoalType.DURATION },
            rules = healthConnectState.rules,
            sources = healthConnectState.sources,
            dismiss = { healthConnectRulesOpen = false },
            save = { viewModel.saveHealthConnectRule(it) },
            delete = { viewModel.deleteHealthConnectRule(it) },
        )
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
internal fun ScreenList(
    context: String,
    title: String,
    action: (@Composable () -> Unit)? = null,
    content: androidx.compose.foundation.lazy.LazyListScope.() -> Unit,
) = LazyColumn(
    modifier = Modifier.fillMaxSize().statusBarsPadding().padding(horizontal = Space.gutter),
    contentPadding = PaddingValues(top = Space.sm, bottom = Space.md),
    verticalArrangement = Arrangement.spacedBy(Space.md),
) {
    item { PageHeader(context, title, action) }
    content()
    item { NavigationSpacer() }
}

@Composable
private fun HabitsScreen(
    habits: List<HabitCardState>,
    groups: List<HabitGroup>,
    selectedGroupId: String?,
    onSelectGroup: (String?) -> Unit,
    create: () -> Unit,
    options: (HabitCardState) -> Unit,
    open: (HabitCardState) -> Unit,
) {
    val visible = habits.inGroup(selectedGroupId)
    val active = visible.filter { !it.stored.archived }
    val archived = visible.filter { it.stored.archived }
    val populatedGroups = remember(groups, habits) {
        groups.filter { g -> habits.any { it.stored.groupId == g.id } }
    }
    ScreenList(
        context = stringResource(R.string.habits_subtitle),
        title = stringResource(R.string.habits_title),
        action = { HeaderAction(Icons.Outlined.Add, stringResource(R.string.create_habit_button), accent = true, onClick = create) },
    ) {
        if (populatedGroups.size > 1) item { GroupFilter(populatedGroups, habits, selectedGroupId, onSelectGroup) }
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
        val activeHabits = active.filter { !it.stored.goal.isTracker && !it.stored.goal.isAbstinence }
        val activeTrackers = active.filter { it.stored.goal.isTracker }
        val activeAbstinences = active.filter { it.stored.goal.isAbstinence }
        if (activeHabits.isNotEmpty()) item { SectionLabel(stringResource(R.string.today_regular_section)) }
        items(activeHabits, key = { it.stored.id }) {
            Box(Modifier.animateItem().fillMaxWidth()) {
                HabitRow(it, onClick = { options(it) }, onLongClick = { options(it) })
            }
        }
        if (activeTrackers.isNotEmpty()) item { SectionLabel(stringResource(R.string.today_activities_section)) }
        items(activeTrackers, key = { it.stored.id }) {
            Box(Modifier.animateItem().fillMaxWidth()) {
                HabitRow(it, onClick = { options(it) }, onLongClick = { options(it) })
            }
        }
        if (activeAbstinences.isNotEmpty()) item { SectionLabel(stringResource(R.string.today_abstinences_section)) }
        items(activeAbstinences, key = { it.stored.id }) {
            Box(Modifier.animateItem().fillMaxWidth()) {
                HabitRow(it, onClick = { open(it) }, onLongClick = { options(it) })
            }
        }
        if (archived.isNotEmpty()) {
            item { SectionLabel(stringResource(R.string.habits_archived_section)) }
            items(archived, key = { "archived-${it.stored.id}" }) {
                Box(Modifier.animateItem().fillMaxWidth()) {
                    HabitRow(it, done = true, onClick = { options(it) }, onLongClick = { options(it) })
                }
            }
        }
    }
}

/**
 * Unité fonctionnelle de l'application : une habitude, sa facette de progression,
 * son nom et sa mesure. Aucune sous-carte, la hiérarchie vient de la typographie.
 */
@Composable
internal fun HabitRow(
    item: HabitCardState,
    done: Boolean = false,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    actionLabel: String? = null,
    actionEnabled: Boolean = true,
    action: (() -> Unit)? = null,
) {
    val palette = cadence
    val tint = habitTint(item)
    val target = item.evaluation.targetMinor.takeIf { it > 0 } ?: 1L
    val ratio = if (item.stored.goal.isAbstinence || item.stored.goal.isTracker) 0f else (item.evaluation.progressMinor.toFloat() / target).coerceIn(0f, 1f)
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
                Text(conciseHabitStatus(item), style = MaterialTheme.typography.bodySmall, color = palette.inkMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (actionLabel != null && action != null) {
                Spacer(Modifier.width(Space.sm))
                val description = stringResource(R.string.today_action_description, item.stored.name, actionLabel)
                val haptic = rememberCadenceHaptic()
                val actionInteraction = remember { MutableInteractionSource() }
                val actionPressed by actionInteraction.collectIsPressedAsState()
                val actionScale by animateFloatAsState(
                    targetValue = if (actionPressed && actionEnabled) 0.94f else 1f,
                    animationSpec = Motion.interactive(),
                    label = "habitActionPress",
                )
                val isBinary = item.stored.goal.goalType == GoalType.BINARY
                if (isBinary) {
                    Box(
                        Modifier
                            .graphicsLayer {
                                scaleX = actionScale
                                scaleY = actionScale
                            }
                            .size(Size.actionSm)
                            .clip(CircleShape)
                            .background(tint.copy(alpha = if (palette.isDark) 0.20f else 0.10f))
                            .clickable(
                                interactionSource = actionInteraction,
                                indication = androidx.compose.foundation.LocalIndication.current,
                                enabled = actionEnabled,
                                role = androidx.compose.ui.semantics.Role.Button,
                                onClick = {
                                    haptic.confirm()
                                    action()
                                },
                            )
                            .semantics { contentDescription = description },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Outlined.Check, null, tint = if (actionEnabled) tint else palette.inkFaint, modifier = Modifier.size(Size.iconSm))
                    }
                } else {
                    Box(
                        Modifier
                            .graphicsLayer {
                                scaleX = actionScale
                                scaleY = actionScale
                            }
                            .clip(Radius.Pill)
                            .background(tint.copy(alpha = if (palette.isDark) 0.20f else 0.10f))
                            .clickable(
                                interactionSource = actionInteraction,
                                indication = androidx.compose.foundation.LocalIndication.current,
                                enabled = actionEnabled,
                                role = androidx.compose.ui.semantics.Role.Button,
                                onClick = {
                                    haptic.confirm()
                                    action()
                                },
                            )
                            .heightIn(min = Size.actionSm)
                            .padding(horizontal = Space.md, vertical = Space.xs)
                            .semantics { contentDescription = description },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(actionLabel, style = MaterialTheme.typography.labelMedium, color = if (actionEnabled) tint else palette.inkFaint)
                    }
                }
            }
            if (done) {
                Spacer(Modifier.width(Space.sm))
                Box(Modifier.size(Size.actionSm).clip(CircleShape).background(palette.success.copy(alpha = 0.16f)), contentAlignment = Alignment.Center) {
                    Icon(Icons.Outlined.Check, null, tint = palette.success, modifier = Modifier.size(Size.iconSm))
                }
            }
        }
    }
}

@Composable
private fun habitTint(item: HabitCardState): Color = cadence.habitAccent(item.stored.colorArgb)

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
    if (goal.isAbstinence) return abstinenceStatus(item)
    if (goal.isTracker) return stringResource(R.string.tracker_today_total,
        HabitFormatter.formatWithUnit(item.evaluation.progressMinor, goal.goalType, goal.unit))
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
 * dont plus aucun jour n'est planifié d'ici dimanche ne s'affiche pas - la lister ne
 * proposerait aucune action.
 */
@Composable
private fun WeekScreen(
    habits: List<HabitCardState>,
    quick: (HabitCardState) -> Unit,
    options: (HabitCardState) -> Unit,
) {
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
                    Box(Modifier.animateItem().fillMaxWidth()) {
                        HabitRow(
                            card,
                            done = stage == WeekStage.DONE,
                            onClick = { quick(card) },
                            onLongClick = { options(card) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun StatsScreen(
    habits: List<HabitCardState>,
    open: (HabitCardState) -> Unit,
    onCorrect: (HabitEntry) -> Unit,
) {
    val visible = habits.filterNot { it.stored.archived }
    val archived = habits.filter { it.stored.archived }
    val regular = visible.filter { !it.stored.goal.isAbstinence && !it.stored.goal.isTracker }
    val trackers = visible.filter { it.stored.goal.isTracker }
    val abstinences = visible.filter { it.stored.goal.isAbstinence }
    var detailId by rememberSaveable { mutableStateOf<String?>(null) }
    var alcoholDetailId by rememberSaveable { mutableStateOf<String?>(null) }
    var abstinenceDetailId by rememberSaveable { mutableStateOf<String?>(null) }
    ScreenList(context = stringResource(R.string.habit_stats_subtitle), title = stringResource(R.string.tab_stats)) {
        if (visible.isEmpty() && archived.isEmpty()) item {
            EmptyState(Icons.Outlined.Analytics, stringResource(R.string.empty_habits_title), stringResource(R.string.empty_habits_message))
        }
        if (regular.isNotEmpty()) {
            item { SectionLabel(stringResource(R.string.today_regular_section)) }
            items(regular, key = { it.stored.id }) { item ->
                HabitStatisticsOverview(item) { detailId = item.stored.id }
            }
        }
        if (trackers.isNotEmpty()) {
            item { SectionLabel(stringResource(R.string.today_activities_section)) }
            items(trackers, key = { it.stored.id }) { item ->
                TrackerStatisticsOverview(item) { detailId = item.stored.id }
            }
        }
        if (abstinences.isNotEmpty()) {
            item { SectionLabel(stringResource(R.string.today_abstinences_section)) }
            items(abstinences, key = { it.stored.id }) { item ->
                AbstinenceStatisticsOverview(item) {
                    if (item.stored.abstinenceProfile == AbstinenceProfile.ALCOHOL) alcoholDetailId = item.stored.id
                    else abstinenceDetailId = item.stored.id
                }
            }
        }
        if (archived.isNotEmpty()) {
            item { SectionLabel(stringResource(R.string.habits_archived_section)) }
            items(archived, key = { "stats-archived-${it.stored.id}" }) { item ->
                Panel(onClick = {
                    when {
                        item.stored.abstinenceProfile == AbstinenceProfile.ALCOHOL -> alcoholDetailId = item.stored.id
                        item.stored.goal.isAbstinence -> abstinenceDetailId = item.stored.id
                        else -> detailId = item.stored.id
                    }
                }) {
                    Text(item.stored.name, style = MaterialTheme.typography.titleMedium, color = cadence.ink)
                    Text(stringResource(R.string.status_archived), style = MaterialTheme.typography.bodySmall, color = cadence.inkMuted)
                }
            }
        }
    }
    (regular + trackers + archived.filterNot { it.stored.goal.isAbstinence }).firstOrNull { it.stored.id == detailId }?.let { item ->
        val tint = habitTint(item)
        val isTracker = item.stored.goal.isTracker
        val progress = if (isTracker) 0f else (item.statistics?.successRatePercent ?: 0) / 100f
        CadenceSheet(
            title = item.stored.name,
            subtitle = stringResource(if (isTracker) R.string.tracker_stats_detail_subtitle else R.string.habit_stats_detail_subtitle),
            dismiss = { detailId = null },
            modifier = Modifier.fillMaxHeight(0.94f),
            leading = {
                HabitFacet(
                    icon = HabitIconRegistry.getIcon(item.stored.iconId).imageVector,
                    label = null,
                    progress = progress,
                    tint = tint,
                    trackColor = cadence.sunken,
                    size = Size.touch,
                )
            },
        ) {
            LazyColumn(
                Modifier.fillMaxWidth().weight(1f),
                verticalArrangement = Arrangement.spacedBy(Space.lg),
            ) {
                if (!isTracker) {
                    item { item.statistics?.let { HabitStatisticsHero(it, item.streak, tint) } }
                } else {
                    item { item.activityStats?.let { TrackerStatisticsHero(it, item.stored.goal.goalType, item.stored.goal.unit, tint) } }
                }
                if (!isTracker) {
                    item { item.activityStats?.let { HabitActivityNumbers(it, item.stored.goal.goalType, item.stored.goal.unit, tint) } }
                }
                item { Hairline() }
                if (isTracker) item { TrackerActivityCalendar(item) }
                else item { item.statistics?.let { StatisticsCalendar(it.calendarDays) } }
                if (!item.stored.goal.isLimit && !isTracker) {
                    item { HabitInsightsPanel(item.insights, item.stored.goal, Modifier.fillMaxWidth()) }
                }
                item { Hairline() }
                item { Text(stringResource(R.string.entries_section), style = MaterialTheme.typography.titleMedium, color = cadence.ink) }
                if (item.recentEntries.isEmpty()) item {
                    Text(stringResource(R.string.entries_empty), style = MaterialTheme.typography.bodySmall, color = cadence.inkMuted)
                }
                items(item.recentEntries, key = { "entry-${it.id}" }) { entry ->
                    EntryRow(entry, item.stored.goal.goalType, item.stored.goal.unit) { onCorrect(entry) }
                }
            }
        }
    }
    (abstinences + archived).firstOrNull { it.stored.id == alcoholDetailId }?.let { item ->
        AlcoholStatisticsSheet(item) { alcoholDetailId = null }
    }
    (abstinences + archived).firstOrNull { it.stored.id == abstinenceDetailId }?.let { item ->
        AbstinenceStatisticsSheet(item, { abstinenceDetailId = null }, onCorrect = onCorrect) {
            abstinenceDetailId = null
            open(item)
        }
    }
}

@Composable
private fun HabitStatisticsOverview(item: HabitCardState, onClick: () -> Unit) {
    val palette = cadence
    val tint = habitTint(item)
    val stats = item.statistics
    val rate = stats?.successRatePercent
    Panel(onClick = onClick) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.md), verticalAlignment = Alignment.CenterVertically) {
            HabitFacet(
                icon = HabitIconRegistry.getIcon(item.stored.iconId).imageVector,
                label = null,
                progress = 0f,
                tint = tint,
                trackColor = palette.sunken,
                size = Size.badge,
            )
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                Text(item.stored.name, style = MaterialTheme.typography.titleMedium, color = palette.ink)
                Text(stringResource(when (item.stored.goal.period) {
                    PeriodType.DAY -> R.string.stats_rhythm_daily
                    PeriodType.WEEK -> R.string.stats_rhythm_weekly
                    PeriodType.MONTH -> R.string.stats_rhythm_monthly
                }), style = MaterialTheme.typography.labelMedium, color = palette.inkMuted)
            }
        }
        if (stats == null || stats.evaluatedPeriods == 0) {
            Spacer(Modifier.height(Space.xl))
            Text(stringResource(R.string.habit_stats_waiting), style = MaterialTheme.typography.bodySmall, color = palette.inkMuted)
            item.activityStats?.let { activity ->
                Spacer(Modifier.height(Space.sm))
                Text(stringResource(R.string.habit_stats_activity_overview, activity.entries30, activity.activeDays30),
                    style = MaterialTheme.typography.bodySmall, color = palette.inkMuted)
            }
            return@Panel
        }
        Spacer(Modifier.height(Space.xl))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            Text(stringResource(R.string.habit_stats_rate_value, rate ?: 0), style = MaterialTheme.typography.displayMedium, color = palette.ink)
            Spacer(Modifier.weight(1f))
            Text(stringResource(R.string.habit_stats_success), style = MaterialTheme.typography.labelMedium, color = palette.success)
        }
        Spacer(Modifier.height(Space.lg))
        StatisticsPulse(stats.periods.toStatisticsPulse())
        Spacer(Modifier.height(Space.sm))
        val reculLabel = when (stats.confidence) {
            StatisticsConfidence.ESTABLISHED -> stringResource(R.string.stats_confidence_established)
            StatisticsConfidence.LIMITED -> stringResource(R.string.stats_confidence_limited)
            StatisticsConfidence.INSUFFICIENT -> stringResource(R.string.stats_confidence_insufficient)
        }
        val periodType = stats.periods.map { it.periodType }.distinct().singleOrNull()
        val pulseLabel = stringResource(when (periodType) {
            PeriodType.DAY -> R.string.stats_pulse_days
            PeriodType.WEEK -> R.string.stats_pulse_weeks
            PeriodType.MONTH -> R.string.stats_pulse_months
            null -> R.string.stats_pulse_periods
        }, stats.periods.takeLast(14).size)
        Text("$reculLabel · $pulseLabel", style = MaterialTheme.typography.bodySmall, color = palette.inkMuted)
        Spacer(Modifier.height(Space.xl))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            OverviewMetric(stringResource(R.string.habit_stats_goal_count, stats.validatedPeriods, stats.evaluatedPeriods), stringResource(R.string.habit_stats_goals_label))
            OverviewMetric(item.streak.current.toString(), stringResource(R.string.habit_stats_streak_label))
            val comp = stats.comparison
            val trendText = when {
                comp == null -> "—"
                comp.deltaPercentagePoints > 0 -> stringResource(R.string.habit_stats_trend_short_up, comp.deltaPercentagePoints)
                comp.deltaPercentagePoints < 0 -> stringResource(R.string.habit_stats_trend_short_down, -comp.deltaPercentagePoints)
                else -> stringResource(R.string.habit_stats_trend_short_stable)
            }
            val trendColor = when {
                comp == null -> palette.inkMuted
                comp.deltaPercentagePoints > 0 -> palette.success
                else -> palette.ink
            }
            OverviewMetric(
                trendText,
                stringResource(R.string.habit_stats_trend_label),
                trendColor,
            )
        }
        item.activityStats?.let { activity ->
            Spacer(Modifier.height(Space.sm))
            Text(stringResource(R.string.habit_stats_activity_overview, activity.entries30, activity.activeDays30),
                style = MaterialTheme.typography.bodySmall, color = palette.inkMuted)
        }
    }
}

@Composable
private fun TrackerStatisticsOverview(item: HabitCardState, onClick: () -> Unit) {
    val stats = item.activityStats ?: return
    val palette = cadence
    Panel(onClick = onClick) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.md), verticalAlignment = Alignment.CenterVertically) {
            HabitFacet(
                icon = HabitIconRegistry.getIcon(item.stored.iconId).imageVector,
                label = null,
                progress = 0f,
                tint = habitTint(item),
                trackColor = palette.sunken,
                size = Size.badge,
            )
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                Text(item.stored.name, style = MaterialTheme.typography.titleMedium, color = palette.ink)
                Text(stringResource(R.string.today_activities_section), style = MaterialTheme.typography.labelMedium, color = palette.inkMuted)
            }
        }
        Spacer(Modifier.height(Space.xl))
        Row(verticalAlignment = Alignment.Bottom) {
            Text(stats.activeDays30.toString(), style = MaterialTheme.typography.displayMedium, color = palette.ink)
            Spacer(Modifier.width(Space.sm))
            Text(stringResource(R.string.tracker_stats_active_days_short), style = MaterialTheme.typography.labelMedium, color = palette.success)
        }
        Spacer(Modifier.height(Space.lg))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.xxl)) {
            OverviewMetric(stats.entries30.toString(), stringResource(R.string.habit_stats_entries_30))
            if (item.stored.goal.goalType != GoalType.BINARY && stats.entries30 > 0) {
                OverviewMetric(HabitFormatter.formatWithUnit(stats.totalMinor30, item.stored.goal.goalType, item.stored.goal.unit), stringResource(R.string.habit_stats_total_30))
            } else {
                OverviewMetric(stringResource(R.string.tracker_stats_calendar_days, stats.calendarDays30), stringResource(R.string.tracker_stats_observed_label))
            }
        }
    }
}

@Composable
private fun TrackerActivityCalendar(item: HabitCardState) {
    var period by rememberSaveable { mutableStateOf(CalendarPeriod.DAYS_90) }
    val today = LocalDate.now()
    val daysBack = when (period) {
        CalendarPeriod.DAYS_30 -> 29L
        CalendarPeriod.DAYS_90 -> 89L
        CalendarPeriod.YEAR_1 -> 364L
        CalendarPeriod.ALL_TIME -> ChronoUnit.DAYS.between(item.stored.startsOn, today).coerceAtLeast(0L)
    }
    val dailyTotals = item.recentEntries.groupBy(HabitEntry::localDate)
        .mapValues { (_, entries) -> entries.sumOf(HabitEntry::valueMinor) }
    val cells = (daysBack downTo 0L).map { offset ->
        val date = today.minusDays(offset)
        val value = dailyTotals[date]
        val label = when {
            date < item.stored.startsOn -> stringResource(R.string.tracker_calendar_before)
            value != null -> stringResource(R.string.tracker_calendar_activity,
                HabitFormatter.formatWithUnit(value, item.stored.goal.goalType, item.stored.goal.unit))
            else -> stringResource(R.string.tracker_calendar_empty)
        }
        ActivityCalendarCell(
            date = date,
            tone = if (value != null) ActivityCalendarTone.SUCCESS else ActivityCalendarTone.NEUTRAL,
            contentDescription = "$date : $label",
            detailText = "$date · $label",
        )
    }
    Column(verticalArrangement = Arrangement.spacedBy(Space.md)) {
        CalendarPeriodSelector(selected = period, onSelect = { period = it })
        ActivityCalendar(cells, title = stringResource(R.string.tracker_calendar_title))
    }
}

@Composable
private fun HabitActivityNumbers(stats: HabitActivityStats, goalType: GoalType, unit: MeasurementUnit?, tint: Color) {
    val palette = cadence
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(Radius.Card)
            .background(palette.sunken)
            .padding(Space.lg),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(Space.md)) {
            Text(stringResource(R.string.habit_stats_activity_title), style = MaterialTheme.typography.titleMedium, color = palette.ink)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                MetricCard(
                    value = stats.entries30.toString(),
                    label = stringResource(R.string.habit_stats_entries_30),
                    icon = Icons.Outlined.Check,
                    iconTint = tint,
                    modifier = Modifier.weight(1f),
                )
                MetricCard(
                    value = "${stats.activeDays30} j",
                    label = stringResource(R.string.habit_stats_active_days_30),
                    icon = Icons.Outlined.DateRange,
                    iconTint = palette.accent,
                    modifier = Modifier.weight(1f),
                )
            }
            if (goalType != GoalType.BINARY && stats.entries30 > 0) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                    MetricCard(
                        value = HabitFormatter.formatWithUnit(stats.totalMinor30, goalType, unit),
                        label = stringResource(R.string.habit_stats_total_30),
                        icon = Icons.AutoMirrored.Outlined.ShowChart,
                        iconTint = tint,
                        modifier = Modifier.weight(1f),
                    )
                    stats.averagePerActiveDayMinor30?.let { average ->
                        MetricCard(
                            value = formatActivityAverage(average, unit),
                            label = stringResource(R.string.habit_stats_average_active_day_30),
                            icon = Icons.Outlined.Speed,
                            iconTint = palette.accent,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
                MetricCard(
                    value = HabitFormatter.formatWithUnit(stats.peakDayMinor30, goalType, unit),
                    label = stringResource(R.string.habit_stats_peak_day_30),
                    icon = Icons.Outlined.EmojiEvents,
                    iconTint = palette.success,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(Radius.Chip)
                    .background(palette.surface.copy(alpha = 0.5f))
                    .padding(horizontal = Space.md, vertical = Space.sm),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Space.sm),
            ) {
                Icon(Icons.Outlined.Info, contentDescription = null, tint = palette.inkMuted, modifier = Modifier.size(Size.iconSm))
                Column {
                    Text(
                        stringResource(R.string.tracker_stats_ninety_days, stats.activeDays90, stats.calendarDays90, stats.entries90),
                        style = MaterialTheme.typography.bodySmall, color = palette.inkMuted,
                    )
                    if (goalType != GoalType.BINARY && stats.entries90 > 0) {
                        Text(
                            stringResource(R.string.tracker_stats_ninety_total, HabitFormatter.formatWithUnit(stats.totalMinor90, goalType, unit)),
                            style = MaterialTheme.typography.bodySmall, color = palette.inkMuted,
                        )
                    }
                }
            }
        }
    }
}

private fun formatActivityAverage(minor: Double, unit: MeasurementUnit?): String {
    val value = String.format(Locale.FRENCH, "%.1f", minor / (unit?.scaleToCanonical ?: 1L))
    val symbol = unit?.symbol?.takeIf(String::isNotBlank) ?: return value
    return "$value $symbol"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AbstinenceStatisticsSheet(item: HabitCardState, dismiss: () -> Unit, onCorrect: (HabitEntry) -> Unit, openTracking: () -> Unit) {
    val stats = item.abstinenceStats ?: return
    var period by rememberSaveable { mutableStateOf(CalendarPeriod.DAYS_90) }
    val today = LocalDate.now()
    val targetFrom = when (period) {
        CalendarPeriod.DAYS_30 -> today.minusDays(29)
        CalendarPeriod.DAYS_90 -> today.minusDays(89)
        CalendarPeriod.YEAR_1 -> today.minusDays(364)
        CalendarPeriod.ALL_TIME -> item.stored.startsOn
    }
    val observedDays = when (period) {
        CalendarPeriod.DAYS_30 -> stats.observedDays30
        CalendarPeriod.DAYS_90 -> stats.observedDays90
        CalendarPeriod.YEAR_1 -> stats.observedDays365
        CalendarPeriod.ALL_TIME -> stats.observedDaysAllTime
    }
    val clearDays = when (period) {
        CalendarPeriod.DAYS_30 -> stats.clearDays30
        CalendarPeriod.DAYS_90 -> stats.clearDays90
        CalendarPeriod.YEAR_1 -> stats.clearDays365
        CalendarPeriod.ALL_TIME -> stats.clearDaysAllTime
    }
    val occurrences = when (period) {
        CalendarPeriod.DAYS_30 -> stats.occurrences30
        CalendarPeriod.DAYS_90 -> stats.occurrences90
        CalendarPeriod.YEAR_1 -> stats.occurrences365
        CalendarPeriod.ALL_TIME -> stats.occurrencesAllTime
    }
    val occurrenceDays = when (period) {
        CalendarPeriod.DAYS_30 -> stats.occurrenceDays30
        CalendarPeriod.DAYS_90 -> stats.occurrenceDays90
        CalendarPeriod.YEAR_1 -> stats.occurrenceDays365
        CalendarPeriod.ALL_TIME -> stats.occurrenceDaysAllTime
    }

    val tint = habitTint(item)
    val spending = item.stored.abstinenceSpendingMinor
    val spendingPeriod = item.stored.abstinenceSpendingPeriod
    val currency = item.stored.abstinenceSavingsCurrency
    val start = item.stored.abstinenceStartedAt
    val saved = if (spending != null && spendingPeriod != null && currency != null && start != null) {
        val now = java.time.Instant.now()
        val activeStart = AbstinenceElapsedCalculator.activeStart(item.stored.id, start, item.recentEntries)
        AbstinenceSavingsCalculator.calculate(
            spending,
            spendingPeriod,
            activeStart,
            now,
            java.time.ZoneId.systemDefault(),
        )
    } else null
    val palette = cadence

    CadenceSheet(
        title = item.stored.name,
        subtitle = stringResource(R.string.abstinence_stats_detail_subtitle),
        dismiss = dismiss,
        modifier = Modifier.fillMaxHeight(0.94f),
        leading = {
            HabitFacet(
                icon = HabitIconRegistry.getIcon(item.stored.iconId).imageVector,
                label = null,
                progress = 0f,
                tint = tint,
                trackColor = cadence.sunken,
                size = Size.touch,
            )
        },
    ) {
        LazyColumn(
            Modifier.fillMaxWidth().weight(1f),
            verticalArrangement = Arrangement.spacedBy(Space.lg),
        ) {
            item {
                AbstinenceStatisticsHero(
                    stats = stats,
                    saved = saved,
                    spending = spending,
                    spendingPeriod = spendingPeriod,
                    currency = currency,
                    tint = tint,
                )
            }
            item {
                CalendarPeriodSelector(
                    selected = period,
                    onSelect = { period = it },
                )
            }
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                    MetricCard(
                        value = stringResource(R.string.alcohol_stats_observed_days, clearDays, observedDays),
                        label = stringResource(R.string.abstinence_stats_clear_days_label),
                        icon = Icons.Outlined.CheckCircle,
                        iconTint = palette.success,
                        modifier = Modifier.weight(1f),
                    )
                    MetricCard(
                        value = occurrences.toString(),
                        label = stringResource(R.string.abstinence_stats_occurrences_label),
                        icon = Icons.Outlined.EventBusy,
                        iconTint = if (occurrences > 0) palette.danger else palette.inkMuted,
                        valueColor = if (occurrences > 0) palette.danger else palette.ink,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                    MetricCard(
                        value = occurrenceDays.toString(),
                        label = stringResource(R.string.abstinence_stats_occurrence_days_label),
                        icon = Icons.Outlined.DateRange,
                        iconTint = palette.inkMuted,
                        modifier = Modifier.weight(1f),
                    )
                    MetricCard(
                        value = stats.averageClearDaysBetweenOccurrences?.let { average ->
                            "${formatAlcoholAverage(average)} j"
                        } ?: "—",
                        label = stringResource(R.string.abstinence_stats_average_gap_short),
                        icon = Icons.Outlined.Speed,
                        iconTint = tint,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
            item {
                val filteredDays = stats.days.filter { it.date >= targetFrom }
                val cells = filteredDays.map { day ->
                    val tone = when (day.status) {
                        AbstinenceStatisticsDayStatus.CLEAR, AbstinenceStatisticsDayStatus.TODAY_CLEAR -> ActivityCalendarTone.SUCCESS
                        AbstinenceStatisticsDayStatus.OCCURRENCE, AbstinenceStatisticsDayStatus.TODAY_OCCURRENCE -> ActivityCalendarTone.DANGER
                        AbstinenceStatisticsDayStatus.PAUSED -> ActivityCalendarTone.NEUTRAL
                        AbstinenceStatisticsDayStatus.UNOBSERVED -> ActivityCalendarTone.NEUTRAL
                    }
                    val dateText = displayAbstinenceDate(day.date)
                    val label = when (day.status) {
                        AbstinenceStatisticsDayStatus.CLEAR -> stringResource(R.string.abstinence_stats_clear_day)
                        AbstinenceStatisticsDayStatus.TODAY_CLEAR -> stringResource(R.string.abstinence_stats_today_clear)
                        AbstinenceStatisticsDayStatus.OCCURRENCE -> stringResource(R.string.abstinence_stats_occurrence_day)
                        AbstinenceStatisticsDayStatus.TODAY_OCCURRENCE -> stringResource(R.string.abstinence_stats_today_occurrence)
                        AbstinenceStatisticsDayStatus.PAUSED -> stringResource(R.string.habit_stats_paused)
                        AbstinenceStatisticsDayStatus.UNOBSERVED -> stringResource(R.string.tracker_calendar_empty)
                    }
                    ActivityCalendarCell(
                        date = day.date,
                        tone = tone,
                        contentDescription = "$dateText : $label",
                        detailText = "$dateText · $label",
                    )
                }
                ActivityCalendar(
                    cells = cells,
                    title = stringResource(R.string.abstinence_stats_calendar_title),
                    helpText = stringResource(R.string.abstinence_assumption),
                )
            }
            item { SectionLabel(stringResource(R.string.abstinence_stats_history)) }
            if (item.recentEntries.isEmpty()) item {
                Text(stringResource(R.string.entries_empty), style = MaterialTheme.typography.bodySmall, color = cadence.inkMuted)
            }
            items(item.recentEntries, key = { "occurrence-${it.id}" }) { entry ->
                EntryRow(entry, GoalType.COUNT, null) { onCorrect(entry) }
            }
        }
        Spacer(Modifier.height(Space.sm))
        TextButton(onClick = openTracking) { Text(stringResource(R.string.abstinence_stats_open_tracking)) }
    }
}

@Composable
private fun StatisticsPulse(levels: List<StatisticsPulseLevel>) {
    val palette = cadence
    if (levels.isEmpty()) return
    Row(
        Modifier.fillMaxWidth().height(Size.statisticsPulse),
        horizontalArrangement = Arrangement.spacedBy(Space.xs),
        verticalAlignment = Alignment.Bottom,
    ) {
        levels.forEach { level ->
            val fraction = when (level) {
                StatisticsPulseLevel.QUIET -> 0.18f
                StatisticsPulseLevel.MISSED -> 0.42f
                StatisticsPulseLevel.ACTIVE -> 0.68f
                StatisticsPulseLevel.IDEAL -> 1f
            }
            val color = when (level) {
                StatisticsPulseLevel.QUIET -> palette.sunken
                StatisticsPulseLevel.MISSED -> palette.danger
                StatisticsPulseLevel.ACTIVE -> palette.successSoft
                StatisticsPulseLevel.IDEAL -> palette.success
            }
            Box(Modifier.weight(1f).fillMaxHeight(fraction).clip(Radius.Pill).background(color))
        }
    }
}

@Composable
private fun AbstinenceStatisticsOverview(item: HabitCardState, onClick: () -> Unit) {
    val palette = cadence
    val tint = habitTint(item)
    val stats = item.abstinenceStats
    val alcohol = item.alcoholStats
    Panel(onClick = onClick) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.md), verticalAlignment = Alignment.CenterVertically) {
            HabitFacet(
                icon = HabitIconRegistry.getIcon(item.stored.iconId).imageVector,
                label = null,
                progress = 0f,
                tint = tint,
                trackColor = palette.sunken,
                size = Size.badge,
            )
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                Text(item.stored.name, style = MaterialTheme.typography.titleMedium, color = palette.ink)
                Text(
                    stringResource(when {
                        alcohol?.isPaused == true || stats?.isPaused == true -> R.string.habit_stats_paused_short
                        alcohol?.todayHasConsumption == true || stats?.todayHasOccurrence == true -> R.string.habit_stats_today_occurrence_short
                        else -> R.string.habit_stats_active_short
                    }),
                    style = MaterialTheme.typography.labelMedium,
                    color = if (alcohol?.isPaused == true || alcohol?.todayHasConsumption == true || stats?.isPaused == true || stats?.todayHasOccurrence == true) palette.inkMuted else palette.success,
                )
            }
        }
        if (alcohol != null) {
            Spacer(Modifier.height(Space.xl))
            Row(verticalAlignment = Alignment.Bottom) {
                Text(alcohol.currentSoberDays.toString(), style = MaterialTheme.typography.displayMedium, color = palette.ink)
                Spacer(Modifier.width(Space.sm))
                Text(stringResource(R.string.alcohol_days_hero), style = MaterialTheme.typography.labelMedium, color = palette.success)
            }
            Spacer(Modifier.height(Space.xl))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.xxl)) {
                OverviewMetric(stringResource(R.string.alcohol_stats_observed_days, alcohol.drinkingDays30, alcohol.observedDays30),
                    stringResource(R.string.alcohol_stats_drinking_30))
                OverviewMetric(
                    alcohol.averageDaysBetweenDrinking?.let(::formatAlcoholAverage) ?: "—",
                    stringResource(R.string.alcohol_stats_frequency_label),
                )
            }
        } else stats?.let {
            Spacer(Modifier.height(Space.xl))
            Row(verticalAlignment = Alignment.Bottom) {
                Text(it.currentDays.toString(), style = MaterialTheme.typography.displayMedium, color = palette.ink)
                Spacer(Modifier.width(Space.sm))
                Text(stringResource(R.string.habit_stats_abstinence_hero), style = MaterialTheme.typography.labelMedium, color = palette.success)
            }
            Spacer(Modifier.height(Space.lg))
            val observed = it.observedDays30.coerceAtLeast(1)
            Box(Modifier.fillMaxWidth().height(Space.sm).clip(Radius.Pill).background(palette.sunken)) {
                Box(
                    Modifier.fillMaxWidth(it.clearDays30.toFloat() / observed).fillMaxHeight()
                        .clip(Radius.Pill).background(palette.success),
                )
            }
            Spacer(Modifier.height(Space.sm))
            Text(
                stringResource(R.string.habit_stats_abstinence_clear, it.clearDays30, it.observedDays30),
                style = MaterialTheme.typography.bodySmall,
                color = palette.inkMuted,
            )
            Spacer(Modifier.height(Space.xl))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.xxl)) {
                OverviewMetric(stringResource(R.string.habit_stats_days_short, it.bestDays), stringResource(R.string.habit_stats_record_label))
                OverviewMetric(it.occurrences30.toString(), stringResource(R.string.habit_stats_occurrences_label))
            }
        }
    }
}

@Composable
private fun OverviewMetric(value: String, label: String, color: Color = cadence.ink, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(Space.xs)) {
        Text(value, style = MaterialTheme.typography.titleLarge, color = color)
        Text(label, style = MaterialTheme.typography.bodySmall, color = cadence.inkMuted)
    }
}

@Composable
private fun HabitStatisticsHero(summary: HabitStatisticsSummary, streak: HabitStreak, tint: Color) {
    val palette = cadence
    if (summary.evaluatedPeriods == 0) {
        Box(
            Modifier
                .fillMaxWidth()
                .clip(Radius.Card)
                .background(palette.sunken)
                .padding(Space.lg),
        ) {
            Text(stringResource(R.string.habit_stats_no_period), style = MaterialTheme.typography.bodyLarge, color = palette.inkMuted)
        }
        return
    }
    val comp = summary.comparison
    val confidenceLabel = when (summary.confidence) {
        StatisticsConfidence.ESTABLISHED -> stringResource(R.string.stats_confidence_established)
        StatisticsConfidence.LIMITED -> stringResource(R.string.stats_confidence_limited)
        StatisticsConfidence.INSUFFICIENT -> stringResource(R.string.stats_confidence_insufficient)
    }
    val completenessText = if (summary.observablePeriods != summary.evaluatedPeriods) {
        stringResource(R.string.stats_completeness_detail, summary.evaluatedPeriods, summary.observablePeriods)
    } else {
        stringResource(R.string.stats_completeness_detail_single, summary.evaluatedPeriods)
    }
    val comparisonText = when {
        comp != null -> when (comp.trend) {
            StatisticsTrend.IMPROVING -> stringResource(R.string.stats_comparison_up, comp.deltaPercentagePoints, comp.previousRatePercent)
            StatisticsTrend.DECLINING -> stringResource(R.string.stats_comparison_down, -comp.deltaPercentagePoints, comp.previousRatePercent)
            StatisticsTrend.STABLE -> stringResource(R.string.stats_comparison_stable, comp.previousRatePercent)
        }
        !summary.isHomogeneous -> stringResource(R.string.stats_comparison_inhomogeneous)
        else -> stringResource(R.string.stats_comparison_insufficient)
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(Radius.Card)
            .background(palette.sunken)
            .padding(Space.lg),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(Space.md)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(Space.md),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier
                            .clip(Radius.Chip)
                            .background(palette.successSoft)
                            .padding(horizontal = Space.md, vertical = Space.sm),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = stringResource(R.string.habit_stats_rate_value, summary.successRatePercent ?: 0),
                            style = MaterialTheme.typography.headlineMedium,
                            color = palette.success,
                        )
                    }
                    Column(Modifier.weight(1f)) {
                        Text(
                            text = stringResource(R.string.habit_stats_success),
                            style = MaterialTheme.typography.titleMedium,
                            color = palette.ink,
                        )
                        Text(
                            text = stringResource(R.string.habit_stats_validated_compact, summary.validatedPeriods, summary.evaluatedPeriods),
                            style = MaterialTheme.typography.bodySmall,
                            color = palette.inkMuted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                if (comp != null) {
                    val isUp = comp.deltaPercentagePoints > 0
                    val isDown = comp.deltaPercentagePoints < 0
                    val chipBg = if (isUp) palette.successSoft else if (isDown) palette.danger.copy(alpha = 0.15f) else palette.surface
                    val chipColor = if (isUp) palette.success else if (isDown) palette.danger else palette.ink
                    val trendText = when {
                        isUp -> stringResource(R.string.habit_stats_trend_short_up, comp.deltaPercentagePoints)
                        isDown -> stringResource(R.string.habit_stats_trend_short_down, -comp.deltaPercentagePoints)
                        else -> stringResource(R.string.habit_stats_trend_short_stable)
                    }
                    val trendIcon = when {
                        isUp -> Icons.AutoMirrored.Outlined.TrendingUp
                        isDown -> Icons.AutoMirrored.Outlined.TrendingDown
                        else -> Icons.AutoMirrored.Outlined.TrendingFlat
                    }
                    Row(
                        modifier = Modifier
                            .padding(start = Space.sm)
                            .clip(Radius.Pill)
                            .background(chipBg)
                            .padding(horizontal = Space.md, vertical = Space.xs),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(Space.xs),
                    ) {
                        Icon(trendIcon, contentDescription = null, tint = chipColor, modifier = Modifier.size(Size.iconSm))
                        Text(
                            trendText,
                            style = MaterialTheme.typography.labelMedium,
                            color = chipColor,
                            maxLines = 1,
                            softWrap = false,
                        )
                    }
                }
            }

            val progressRate = ((summary.successRatePercent ?: 0) / 100f).coerceIn(0f, 1f)
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(Size.counterTrack)
                    .clip(CircleShape)
                    .background(palette.surface),
            ) {
                Box(
                    Modifier
                        .fillMaxWidth(fraction = progressRate)
                        .fillMaxHeight()
                        .background(palette.success, CircleShape)
                )
            }

            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Space.sm),
            ) {
                MetricCard(
                    value = streak.current.toString(),
                    label = stringResource(R.string.habit_stats_streak_label),
                    icon = Icons.Outlined.LocalFireDepartment,
                    iconTint = palette.accent,
                    modifier = Modifier.weight(1f),
                )
                MetricCard(
                    value = summary.idealPeriods.toString(),
                    label = stringResource(R.string.habit_stats_day_ideal),
                    icon = Icons.Outlined.EmojiEvents,
                    iconTint = palette.success,
                    modifier = Modifier.weight(1f),
                )
                MetricCard(
                    value = summary.evaluatedPeriods.toString(),
                    label = stringResource(R.string.stats_confidence_label),
                    icon = Icons.Outlined.DateRange,
                    iconTint = tint,
                    modifier = Modifier.weight(1f),
                )
            }

            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(Radius.Chip)
                    .background(palette.surface.copy(alpha = 0.5f))
                    .padding(horizontal = Space.md, vertical = Space.sm),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Space.sm),
            ) {
                Icon(Icons.Outlined.Info, contentDescription = null, tint = palette.inkMuted, modifier = Modifier.size(Size.iconSm))
                Text(
                    text = "$confidenceLabel · $completenessText\n$comparisonText",
                    style = MaterialTheme.typography.bodySmall,
                    color = palette.inkMuted,
                )
            }
        }
    }
}

@Composable
private fun TrackerStatisticsHero(
    stats: HabitActivityStats,
    goalType: GoalType,
    unit: MeasurementUnit?,
    tint: Color,
) {
    val palette = cadence
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(Radius.Card)
            .background(palette.sunken)
            .padding(Space.lg),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(Space.md)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(Space.md),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier
                            .clip(Radius.Chip)
                            .background(tint.copy(alpha = 0.15f))
                            .padding(horizontal = Space.md, vertical = Space.sm),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = stringResource(R.string.habit_stats_days_short, stats.activeDays30),
                            style = MaterialTheme.typography.headlineMedium,
                            color = tint,
                        )
                    }
                    Column(Modifier.weight(1f)) {
                        Text(
                            text = stringResource(R.string.habit_stats_active_days_30),
                            style = MaterialTheme.typography.titleMedium,
                            color = palette.ink,
                        )
                        Text(
                            text = stringResource(R.string.habit_stats_entries_30),
                            style = MaterialTheme.typography.bodySmall,
                            color = palette.inkMuted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                Box(
                    Modifier
                        .padding(start = Space.sm)
                        .clip(Radius.Pill)
                        .background(palette.surface)
                        .padding(horizontal = Space.md, vertical = Space.xs),
                ) {
                    Text(
                        text = "${stats.entries30} ${stringResource(R.string.habit_stats_goals_label)}",
                        style = MaterialTheme.typography.labelMedium,
                        color = palette.ink,
                        maxLines = 1,
                        softWrap = false,
                    )
                }
            }

            val activeRatio = (stats.activeDays30 / 30f).coerceIn(0f, 1f)
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(Size.counterTrack)
                    .clip(CircleShape)
                    .background(palette.surface),
            ) {
                Box(
                    Modifier
                        .fillMaxWidth(fraction = activeRatio)
                        .fillMaxHeight()
                        .background(tint, CircleShape)
                )
            }

            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Space.sm),
            ) {
                val totalFormatted = if (goalType != GoalType.BINARY && stats.entries30 > 0) {
                    HabitFormatter.formatWithUnit(stats.totalMinor30, goalType, unit)
                } else stats.entries30.toString()

                MetricCard(
                    value = totalFormatted,
                    label = stringResource(R.string.habit_stats_total_30),
                    icon = Icons.AutoMirrored.Outlined.ShowChart,
                    iconTint = tint,
                    modifier = Modifier.weight(1f),
                )
                MetricCard(
                    value = stats.averagePerActiveDayMinor30?.let { formatActivityAverage(it, unit) } ?: "—",
                    label = stringResource(R.string.habit_stats_average_active_day_30),
                    icon = Icons.Outlined.Speed,
                    iconTint = palette.accent,
                    modifier = Modifier.weight(1f),
                )
                MetricCard(
                    value = "${stats.activeDays90} j",
                    label = stringResource(R.string.stats_period_90d),
                    icon = Icons.Outlined.DateRange,
                    iconTint = palette.inkMuted,
                    modifier = Modifier.weight(1f),
                )
            }

            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(Radius.Chip)
                    .background(palette.surface.copy(alpha = 0.5f))
                    .padding(horizontal = Space.md, vertical = Space.sm),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Space.sm),
            ) {
                Icon(Icons.Outlined.Info, contentDescription = null, tint = palette.inkMuted, modifier = Modifier.size(Size.iconSm))
                Text(
                    text = stringResource(R.string.tracker_stats_ninety_days, stats.activeDays90, stats.calendarDays90, stats.entries90),
                    style = MaterialTheme.typography.bodySmall,
                    color = palette.inkMuted,
                )
            }
        }
    }
}

@Composable
private fun AbstinenceStatisticsHero(
    stats: ch.nicolab.cadence.domain.AbstinenceStats,
    saved: Long?,
    spending: Long?,
    spendingPeriod: SavingsPeriod?,
    currency: String?,
    tint: Color,
) {
    val palette = cadence
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(Radius.Card)
            .background(palette.sunken)
            .padding(Space.lg),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(Space.md)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(Space.md),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier
                            .clip(Radius.Chip)
                            .background(palette.successSoft)
                            .padding(horizontal = Space.md, vertical = Space.sm),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = stringResource(R.string.habit_stats_days_short, stats.currentDays),
                            style = MaterialTheme.typography.headlineMedium,
                            color = palette.success,
                        )
                    }
                    Column(Modifier.weight(1f)) {
                        Text(
                            text = stringResource(R.string.habit_stats_abstinence_hero),
                            style = MaterialTheme.typography.titleMedium,
                            color = palette.ink,
                        )
                        Text(
                            text = stringResource(R.string.habit_stats_active_short),
                            style = MaterialTheme.typography.bodySmall,
                            color = palette.inkMuted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                Row(
                    modifier = Modifier
                        .padding(start = Space.sm)
                        .clip(Radius.Pill)
                        .background(palette.accentSoft)
                        .padding(horizontal = Space.md, vertical = Space.xs),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(Space.xs),
                ) {
                    Icon(Icons.Outlined.EmojiEvents, contentDescription = null, tint = palette.accent, modifier = Modifier.size(Size.iconSm))
                    Text(
                        text = "${stringResource(R.string.habit_stats_record_label)} : ${stringResource(R.string.habit_stats_days_short, stats.bestDays)}",
                        style = MaterialTheme.typography.labelMedium,
                        color = palette.accent,
                        maxLines = 1,
                        softWrap = false,
                    )
                }
            }
            if (saved != null && spending != null && spendingPeriod != null && currency != null) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clip(Radius.Chip)
                        .background(palette.successSoft)
                        .padding(horizontal = Space.md, vertical = Space.sm),
                    horizontalArrangement = Arrangement.spacedBy(Space.sm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Outlined.Savings, contentDescription = null, tint = palette.success, modifier = Modifier.size(Size.icon))
                    Column {
                        Text(
                            text = stringResource(R.string.abst_savings_total, formatMoney(saved, currency)),
                            style = MaterialTheme.typography.titleMedium,
                            color = palette.success,
                        )
                        Text(
                            text = stringResource(R.string.abst_savings_basis, formatMoney(spending, currency), savingsPeriodLabel(spendingPeriod)),
                            style = MaterialTheme.typography.bodySmall,
                            color = palette.inkMuted,
                        )
                    }
                }
            }
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Space.sm),
            ) {
                MetricCard(
                    value = "${stats.clearDays90} / ${stats.observedDays90}",
                    label = stringResource(R.string.abstinence_stats_clear_days_label),
                    icon = Icons.Outlined.CheckCircle,
                    iconTint = palette.success,
                    modifier = Modifier.weight(1f),
                )
                MetricCard(
                    value = stats.occurrences90.toString(),
                    label = stringResource(R.string.abstinence_stats_occurrences_label),
                    icon = Icons.Outlined.EventBusy,
                    iconTint = if (stats.occurrences90 > 0) palette.danger else palette.inkMuted,
                    valueColor = if (stats.occurrences90 > 0) palette.danger else palette.ink,
                    modifier = Modifier.weight(1f),
                )
                MetricCard(
                    value = stats.averageClearDaysBetweenOccurrences?.let { "${formatAlcoholAverage(it)} j" } ?: "—",
                    label = stringResource(R.string.abstinence_stats_average_gap_short),
                    icon = Icons.Outlined.Speed,
                    iconTint = tint,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun StatisticsCalendar(days: List<HabitStatisticsDay>) {
    if (days.isEmpty()) return
    var period by rememberSaveable { mutableStateOf(CalendarPeriod.DAYS_90) }
    val today = LocalDate.now()
    val from = when (period) {
        CalendarPeriod.DAYS_30 -> today.minusDays(29)
        CalendarPeriod.DAYS_90 -> today.minusDays(89)
        CalendarPeriod.YEAR_1 -> today.minusDays(364)
        CalendarPeriod.ALL_TIME -> days.minOfOrNull { it.date } ?: today
    }
    val filteredDays = days.filter { it.date >= from }
    val cells = filteredDays.map { day ->
        val tone = when (day.status) {
            HabitStatisticsDayStatus.IDEAL, HabitStatisticsDayStatus.ACTIVITY -> ActivityCalendarTone.SUCCESS
            HabitStatisticsDayStatus.MINIMUM -> ActivityCalendarTone.SUCCESS_SOFT
            HabitStatisticsDayStatus.MISSED -> ActivityCalendarTone.DANGER
            else -> ActivityCalendarTone.NEUTRAL
        }
        val label = stringResource(statisticsDayLabel(day.status))
        val dateText = displayAbstinenceDate(day.date)
        ActivityCalendarCell(
            date = day.date,
            tone = tone,
            contentDescription = "$dateText : $label",
            detailText = stringResource(R.string.habit_stats_selected_day, dateText, label),
        )
    }
    Column(verticalArrangement = Arrangement.spacedBy(Space.md)) {
        CalendarPeriodSelector(
            selected = period,
            onSelect = { period = it },
        )
        ActivityCalendar(
            cells = cells,
            title = stringResource(R.string.habit_stats_calendar),
            helpText = stringResource(R.string.habit_stats_calendar_help),
        )
    }
}

private fun statisticsDayLabel(status: HabitStatisticsDayStatus): Int = when (status) {
    HabitStatisticsDayStatus.UNPLANNED -> R.string.habit_stats_unplanned
    HabitStatisticsDayStatus.PAUSED -> R.string.habit_stats_paused
    HabitStatisticsDayStatus.MISSED -> R.string.habit_stats_missed
    HabitStatisticsDayStatus.MINIMUM -> R.string.habit_stats_minimum
    HabitStatisticsDayStatus.IDEAL -> R.string.habit_stats_day_ideal
    HabitStatisticsDayStatus.ACTIVITY -> R.string.habit_stats_activity
    HabitStatisticsDayStatus.NO_ACTIVITY -> R.string.habit_stats_no_activity
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
    healthConnectState: HealthConnectUiState,
    hasDurationHabits: Boolean,
    connectHealth: () -> Unit,
    syncHealth: () -> Unit,
    setHealthSyncEnabled: (Boolean) -> Unit,
    manageHealthAccess: () -> Unit,
    configureHealth: () -> Unit,
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
        item { SectionLabel(stringResource(R.string.health_connect_title)) }
        item {
            HealthConnectSettingsPanel(
                state = healthConnectState,
                hasDurationHabits = hasDurationHabits,
                connect = connectHealth,
                sync = syncHealth,
                setEnabled = setHealthSyncEnabled,
                manageAccess = manageHealthAccess,
                configure = configureHealth,
            )
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
 * son nom reste modifiable, mais il ne prend jamais de plage et ne se supprime pas -
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
internal fun GroupFilter(
    groups: List<HabitGroup>,
    habits: List<HabitCardState>,
    selectedGroupId: String?,
    onSelect: (String?) -> Unit,
) {
    val populatedGroups = groups.filter { group -> habits.any { it.stored.groupId == group.id } }
    if (populatedGroups.size <= 1) return
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
        subtitle = conciseHabitStatus(item),
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
            ActionRow(Icons.AutoMirrored.Outlined.TrendingFlat, stringResource(R.string.progression_stop), tint, stopProgression)
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
        if (!item.stored.goal.isTracker) {
            HabitHistoryGraph(item.history, tint, Modifier.fillMaxWidth().padding(bottom = Space.xl))
            StreakLine(item.streak)
        }
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
    val context = LocalContext.current
    val healthPackage = HabitEntrySource.healthConnectPackage(entry.source)
    val healthSource = remember(entry.source) {
        healthPackage?.let { HealthConnectGateway(context).applicationLabel(it) }
    }
    val durationSource = when {
        goalType != GoalType.DURATION -> null
        healthPackage != null -> stringResource(R.string.health_connect_entry_source, healthSource ?: healthPackage)
        entry.source == "TIMER" -> stringResource(R.string.health_connect_entry_timer)
        else -> stringResource(R.string.health_connect_entry_manual)
    }
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
            durationSource?.let { sourceLabel ->
                Text(
                    sourceLabel,
                    style = MaterialTheme.typography.bodySmall,
                    color = if (healthPackage != null) palette.accent else palette.inkFaint,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
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
internal fun EntryEditor(
    entry: HabitEntry,
    goalType: GoalType,
    unit: MeasurementUnit?,
    accent: Color,
    dismiss: () -> Unit,
    save: (Long, LocalDate, LocalTime, String) -> Unit,
    delete: () -> Unit,
    busy: Boolean,
    saveError: String?,
    occurrenceOnly: Boolean,
) {
    val palette = cadence
    val scale = unit?.scaleToCanonical ?: 1L
    val zoned = remember(entry.id) { entry.occurredAt.atZone(entry.observedZoneId) }
    var value by rememberSaveable(entry.id) { mutableStateOf((entry.valueMinor / scale).toString()) }
    var date by rememberSaveable(entry.id) { mutableStateOf(entry.localDate.toString()) }
    var time by rememberSaveable(entry.id) { mutableStateOf(zoned.toLocalTime().truncatedTo(ChronoUnit.MINUTES).toString()) }
    var note by rememberSaveable(entry.id) { mutableStateOf(entry.note.orEmpty()) }
    var error by remember(entry.id) { mutableStateOf<String?>(null) }
    val badValue = stringResource(R.string.entry_error_value)
    val badDate = stringResource(R.string.entry_error_date)
    val badTime = stringResource(R.string.entry_error_time)
    val imported = HabitEntrySource.isHealthConnect(entry.source)

    CadenceSheet(
        title = stringResource(R.string.entry_edit_title),
        subtitle = stringResource(R.string.entry_edit_subtitle),
        dismiss = dismiss,
    ) {
        if (!occurrenceOnly) {
            CadenceField(value, { value = it.filter(Char::isDigit) }, stringResource(R.string.entry_value_label), suffix = unit?.symbol, accent = accent, numeric = true)
            Spacer(Modifier.height(Space.md))
        }
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
        if (imported) {
            Spacer(Modifier.height(Space.sm))
            Text(
                stringResource(R.string.health_connect_entry_detach_notice),
                style = MaterialTheme.typography.bodySmall,
                color = palette.inkMuted,
            )
        }
        (error ?: saveError)?.let { Spacer(Modifier.height(Space.md)); ErrorText(it) }
        Spacer(Modifier.height(Space.xl))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.md)) {
            SecondaryAction(stringResource(R.string.form_btn_cancel), Modifier.weight(1f), onClick = dismiss)
            PrimaryAction(stringResource(if (busy) R.string.abstinence_saving else R.string.form_btn_save), Modifier.weight(1f), accent = accent, enabled = !busy) {
                val amount = if (occurrenceOnly) entry.valueMinor else value.toLongOrNull() ?: 0
                val parsedDate = runCatching { LocalDate.parse(date.trim()) }.getOrNull()
                val parsedTime = runCatching { LocalTime.parse(time.trim()) }.getOrNull()
                when {
                    amount <= 0 -> error = badValue
                    parsedDate == null -> error = badDate
                    parsedTime == null -> error = badTime
                    else -> {
                        error = null
                        // Une correction de note ne doit pas arrondir l'instant d'origine à la minute.
                        val observedTime = zoned.toLocalTime()
                        val correctedTime = if (parsedTime == observedTime.truncatedTo(ChronoUnit.MINUTES)) observedTime else parsedTime
                        save(if (occurrenceOnly) entry.valueMinor else amount * scale, parsedDate, correctedTime, note)
                    }
                }
            }
        }
        Spacer(Modifier.height(Space.sm))
        TertiaryAction(
            stringResource(if (imported) R.string.health_connect_entry_ignore else R.string.entry_delete),
            Modifier.fillMaxWidth(),
            onClick = { if (!busy) { error = null; delete() } },
        )
    }
}
