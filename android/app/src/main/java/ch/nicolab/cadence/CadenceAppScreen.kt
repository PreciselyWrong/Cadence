package ch.nicolab.cadence

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.StringRes
import androidx.compose.animation.Crossfade
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoGraph
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.Hexagon
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.outlined.AutoGraph
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Checklist
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Hexagon
import androidx.compose.material.icons.outlined.Inbox
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
import ch.nicolab.cadence.agenda.AgendaScreen
import ch.nicolab.cadence.bilan.BilanScreen
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.designsystem.components.CadenceNavigation
import ch.nicolab.cadence.designsystem.components.CadenceScreen
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.NavDestination
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.components.backdropSource
import ch.nicolab.cadence.designsystem.components.navigationClearance
import ch.nicolab.cadence.designsystem.components.rememberBackdrop
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.domain.AbstinenceProfile
import ch.nicolab.cadence.domain.GoalDirection
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.habits.EntryEditor
import ch.nicolab.cadence.habits.GroupPickerSheet
import ch.nicolab.cadence.habits.HabitOptionsSheet
import ch.nicolab.cadence.habits.LearnedQuestionSheet
import ch.nicolab.cadence.habits.LearnedQuestionsPanelHost
import ch.nicolab.cadence.habits.HabitsTab
import ch.nicolab.cadence.habits.QuickSheet
import ch.nicolab.cadence.habits.RoutineStrip
import ch.nicolab.cadence.habits.habitTint
import ch.nicolab.cadence.health.HealthConnectGateway
import ch.nicolab.cadence.health.HealthConnectRulesSheet
import ch.nicolab.cadence.settings.SettingsDeps
import ch.nicolab.cadence.settings.SettingsScreen
import ch.nicolab.cadence.tasks.ui.InboxScreen
import ch.nicolab.cadence.tasks.search.SearchEntry
import ch.nicolab.cadence.tasks.search.SearchKind
import ch.nicolab.cadence.tasks.ui.SearchScreen
import ch.nicolab.cadence.tasks.ui.TasksScreen
import java.time.LocalDate
import java.util.UUID
import kotlinx.coroutines.launch

private enum class Tab(@param:StringRes val label: Int, val icon: ImageVector, val selectedIcon: ImageVector) {
    INBOX(R.string.tab_inbox, Icons.Outlined.Inbox, Icons.Filled.Inbox),
    TASKS(R.string.tab_tasks, Icons.Outlined.Checklist, Icons.Filled.Checklist),
    AGENDA(R.string.tab_agenda, Icons.Outlined.CalendarMonth, Icons.Filled.CalendarMonth),
    HABITS(R.string.tab_habits, Icons.Outlined.Hexagon, Icons.Filled.Hexagon),
    BILAN(R.string.tab_bilan, Icons.Outlined.AutoGraph, Icons.Filled.AutoGraph),
}

@Composable
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
internal fun CadenceAppScreen(
    viewModel: MainViewModel,
    editHabitId: String? = null,
    openTaskUid: String? = null,
    openQuestionHabitId: String? = null,
) {
    val habits by viewModel.habits.collectAsStateWithLifecycle()
    val groups by viewModel.groups.collectAsStateWithLifecycle()
    val timers by viewModel.timers.collectAsStateWithLifecycle()
    val busy by viewModel.isSaving.collectAsStateWithLifecycle()
    val saveError by viewModel.saveError.collectAsStateWithLifecycle()
    val healthConnectState by viewModel.healthConnectState.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableStateOf(Tab.TASKS) }
    var settingsOpen by rememberSaveable { mutableStateOf(false) }
    var searchOpen by rememberSaveable { mutableStateOf(false) }
    var projectToShow by rememberSaveable { mutableStateOf<String?>(null) }
    BackHandler(enabled = settingsOpen) { settingsOpen = false }
    // Une tâche ouverte depuis un widget ou un rappel doit s'afficher dans Tâches, quel que soit l'onglet restauré.
    androidx.compose.runtime.LaunchedEffect(openTaskUid) {
        if (openTaskUid != null) {
            tab = Tab.TASKS
            settingsOpen = false
        }
    }
    val backdrop = rememberBackdrop()
    var editorId by rememberSaveable { mutableStateOf<String?>(null) }
    val editor = habits.firstOrNull { it.stored.id == editorId }
    var creating by rememberSaveable { mutableStateOf(false) }
    var choosingCreation by rememberSaveable { mutableStateOf(false) }
    var creatingAbstinence by rememberSaveable { mutableStateOf(false) }
    var creatingTracker by rememberSaveable { mutableStateOf(false) }
    var editIntentHandled by rememberSaveable { mutableStateOf(false) }
    val pendingQuestions by viewModel.pendingQuestions.collectAsStateWithLifecycle()
    var answeringHabitId by rememberSaveable { mutableStateOf<String?>(null) }
    var learningHabitId by rememberSaveable { mutableStateOf<String?>(null) }
    var questionIntentHandled by rememberSaveable { mutableStateOf(false) }
    androidx.compose.runtime.LaunchedEffect(openQuestionHabitId, pendingQuestions) {
        if (!questionIntentHandled && openQuestionHabitId != null && pendingQuestions.any { it.habitId == openQuestionHabitId }) {
            answeringHabitId = openQuestionHabitId
            questionIntentHandled = true
        }
    }
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
    val destinations = Tab.entries.map { NavDestination(stringResource(it.label), it.icon, it.selectedIcon) }
    val settingsDeps = SettingsDeps(
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

    CadenceScreen {
        Crossfade(
            targetState = if (settingsOpen) null else tab,
            modifier = Modifier.fillMaxSize().backdropSource(backdrop),
            label = "screen",
        ) { current ->
            when (current) {
                null -> SettingsScreen(settingsDeps, onBack = { settingsOpen = false })
                Tab.INBOX -> InboxScreen(onOpenSearch = { searchOpen = true }, onOpenSettings = { settingsOpen = true })
                Tab.TASKS -> TasksScreen(
                    openTaskUid = openTaskUid,
                    showProjectUid = projectToShow,
                    onProjectShown = { projectToShow = null },
                    onOpenSearch = { searchOpen = true },
                    onOpenSettings = { settingsOpen = true },
                    routineStrip = {
                        RoutineStrip(
                            habits = habits,
                            groups = groups,
                            quick = { viewModel.clearSaveError(); quickHabitId = it.stored.id },
                            openHabits = { tab = Tab.HABITS },
                        )
                    },
                )
                Tab.AGENDA -> AgendaScreen()
                Tab.HABITS -> HabitsTab(
                    habits = habits,
                    groups = groups,
                    selectedGroupId = groupFilter,
                    onSelectGroup = { groupFilter = it },
                    quick = { viewModel.clearSaveError(); quickHabitId = it.stored.id },
                    options = { options = it },
                    create = { choosingCreation = true },
                    openSettings = { settingsOpen = true },
                    timers = timers,
                    busy = busy,
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
                    questions = pendingQuestions,
                    answer = { answeringHabitId = it.habitId },
                )
                Tab.BILAN -> BilanScreen(
                    habits = habits,
                    quick = { viewModel.clearSaveError(); quickHabitId = it.stored.id },
                    options = { options = it },
                    onCorrect = { viewModel.clearSaveError(); correctingId = it.id },
                )
            }
        }
        if (searchOpen) SearchScreen(
            habits = habits.filter { !it.stored.archived }.map {
                SearchEntry(SearchKind.HABIT, it.stored.id, it.stored.name)
            },
            onBack = { searchOpen = false },
            onOpenProject = { uid ->
                searchOpen = false
                tab = Tab.TASKS
                projectToShow = uid
            },
            onOpenHabit = { id ->
                searchOpen = false
                viewModel.clearSaveError()
                quickHabitId = id
            },
        )
        if (!settingsOpen && !searchOpen) CadenceNavigation(destinations, tab.ordinal, Modifier.align(Alignment.BottomCenter), backdrop = backdrop) { index -> tab = Tab.entries[index] }
        androidx.compose.material3.SnackbarHost(
            snackbar,
            Modifier.align(Alignment.BottomCenter)
                .padding(start = Space.gutter, end = Space.gutter, bottom = navigationClearance() + Space.lg),
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
            accent = habit?.let { habitTint(it) } ?: cadence.primary,
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
    pendingQuestions.firstOrNull { it.habitId == answeringHabitId }?.let { question ->
        val habit = habits.firstOrNull { it.stored.id == question.habitId }
        LearnedQuestionSheet(
            question = question,
            habitName = habit?.stored?.name.orEmpty(),
            tint = habit?.let { habitTint(it) } ?: cadence.primary,
            busy = busy,
            error = saveError,
            dismiss = { if (!busy) answeringHabitId = null },
            answer = { viewModel.answerQuestion(question, it) { answeringHabitId = null } },
            ignore = { viewModel.dismissQuestion(question); answeringHabitId = null },
            muteWeekday = { viewModel.muteLearnedWeekday(question.habitId, question.weekday) { answeringHabitId = null } },
        )
    }
    learningHabitId?.let { id ->
        habits.firstOrNull { it.stored.id == id }?.let { item ->
            LearnedQuestionsPanelHost(item, viewModel) { learningHabitId = null }
        }
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
            learnedQuestions = { learningHabitId = item.stored.id; options = null }.takeIf { item.stored.goal.isTracker || item.stored.goal.isAbstinence },
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
        containerColor = palette.card,
        titleContentColor = palette.onSurface,
        textContentColor = palette.onSurfaceVariant,
        icon = { Icon(Icons.Outlined.Delete, null, tint = palette.error) },
        title = { Text(stringResource(R.string.delete_dialog_title), style = MaterialTheme.typography.headlineSmall) },
        text = { Text(stringResource(R.string.delete_dialog_message), style = MaterialTheme.typography.bodySmall) },
        confirmButton = { PrimaryAction(stringResource(R.string.delete_dialog_confirm), accent = palette.error, onClick = confirm) },
        dismissButton = { TertiaryAction(stringResource(R.string.delete_dialog_cancel), onClick = dismiss) },
    )
}
