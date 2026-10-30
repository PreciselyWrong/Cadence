package ch.nicolab.cadence

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.Crossfade
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Analytics
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.DateRange
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material.icons.outlined.TrackChanges
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.core.content.ContextCompat
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.bilan.StatsScreen
import ch.nicolab.cadence.bilan.WeekScreen
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.AbstinenceProfile
import ch.nicolab.cadence.domain.GoalDirection
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.habits.EntryEditor
import ch.nicolab.cadence.habits.GroupPickerSheet
import ch.nicolab.cadence.habits.HabitOptionsSheet
import ch.nicolab.cadence.habits.HabitsScreen
import ch.nicolab.cadence.habits.HabitsTodayScreen
import ch.nicolab.cadence.habits.QuickSheet
import ch.nicolab.cadence.habits.habitTint
import ch.nicolab.cadence.health.HealthConnectGateway
import ch.nicolab.cadence.health.HealthConnectRulesSheet
import ch.nicolab.cadence.settings.SettingsScreen
import ch.nicolab.cadence.tasks.ui.TasksScreen
import ch.nicolab.cadence.ui.components.CadenceNavigation
import ch.nicolab.cadence.ui.components.CadenceScreen
import ch.nicolab.cadence.ui.components.CadenceSheet
import ch.nicolab.cadence.ui.components.NavDestination
import ch.nicolab.cadence.ui.components.Panel
import ch.nicolab.cadence.ui.components.PrimaryAction
import ch.nicolab.cadence.ui.components.SecondaryAction
import ch.nicolab.cadence.ui.components.TertiaryAction
import ch.nicolab.cadence.ui.theme.Radius
import ch.nicolab.cadence.ui.theme.Size
import ch.nicolab.cadence.ui.theme.Space
import ch.nicolab.cadence.ui.theme.cadence
import java.time.LocalDate
import java.util.UUID
import kotlinx.coroutines.launch

private enum class Tab(val label: Int, val icon: ImageVector) {
    TASKS(R.string.tab_tasks, Icons.Outlined.TaskAlt),
    TODAY(R.string.tab_today, Icons.Outlined.TrackChanges),
    WEEK(R.string.tab_week, Icons.Outlined.DateRange),
    HABITS(R.string.tab_habits, Icons.Outlined.Check),
    STATS(R.string.tab_stats, Icons.Outlined.Analytics),
    SETTINGS(R.string.tab_settings, Icons.Outlined.Settings),
}

@Composable
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
internal fun CadenceAppScreen(viewModel: MainViewModel, editHabitId: String? = null, openTaskUid: String? = null) {
    val habits by viewModel.habits.collectAsStateWithLifecycle()
    val groups by viewModel.groups.collectAsStateWithLifecycle()
    val timers by viewModel.timers.collectAsStateWithLifecycle()
    val busy by viewModel.isSaving.collectAsStateWithLifecycle()
    val saveError by viewModel.saveError.collectAsStateWithLifecycle()
    val healthConnectState by viewModel.healthConnectState.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableStateOf(Tab.TASKS) }
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
                Tab.TASKS -> TasksScreen(
                    Modifier.navigationBarsPadding().padding(bottom = Size.navBar + Space.xl),
                    openTaskUid = openTaskUid,
                )
                Tab.TODAY -> HabitsTodayScreen(
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
