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
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Analytics
import androidx.compose.material.icons.outlined.Archive
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.KeyboardArrowUp
import androidx.compose.material.icons.outlined.Pause
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Restore
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.TrackChanges
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.core.content.ContextCompat
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitGoal
import ch.nicolab.cadence.domain.HabitSchedule
import ch.nicolab.cadence.domain.MeasurementUnit
import ch.nicolab.cadence.domain.PeriodType
import ch.nicolab.cadence.domain.ScheduleMode
import ch.nicolab.cadence.domain.UnitDimension
import ch.nicolab.cadence.ui.HabitFormatter
import ch.nicolab.cadence.ui.icon.HabitIconPicker
import ch.nicolab.cadence.ui.icon.HabitIconRegistry
import ch.nicolab.cadence.ui.theme.CadenceTheme
import java.time.DayOfWeek
import java.time.LocalDate
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
    HABITS(R.string.tab_habits, Icons.Outlined.Check),
    STATS(R.string.tab_stats, Icons.Outlined.Analytics),
    SETTINGS(R.string.tab_settings, Icons.Outlined.Settings),
}

@Composable
private fun CadenceAppScreen(viewModel: MainViewModel) {
    val habits by viewModel.habits.collectAsStateWithLifecycle()
    var tab by remember { mutableStateOf(Tab.TODAY) }
    var editor by remember { mutableStateOf<HabitCardState?>(null) }
    var creating by remember { mutableStateOf(false) }
    var quick by remember { mutableStateOf<HabitCardState?>(null) }
    var deleting by remember { mutableStateOf<PersistedHabit?>(null) }
    var backupMessage by remember { mutableStateOf<String?>(null) }
    val context = LocalContext.current
    val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    val exportLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        uri?.let { destination -> viewModel.exportBackup { content -> context.contentResolver.openOutputStream(destination)?.bufferedWriter()?.use { it.write(content) }; backupMessage = "Sauvegarde exportée" } }
    }
    val importLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let { source ->
            val content = context.contentResolver.openInputStream(source)?.bufferedReader()?.use { it.readText() } ?: return@let
            viewModel.importBackup(content, { backupMessage = "Sauvegarde restaurée" }, { backupMessage = it })
        }
    }

    Scaffold(bottomBar = { NavigationBar { Tab.entries.forEach { item -> NavigationBarItem(tab == item, { tab = item }, { Icon(item.icon, stringResource(item.label)) }, label = { Text(stringResource(item.label)) }) } } }) { inset ->
        when (tab) {
            Tab.TODAY -> TodayScreen(habits, Modifier.padding(inset), { quick = it }, { editor = it }, { creating = true })
            Tab.HABITS -> HabitsScreen(habits, Modifier.padding(inset), { creating = true }, { editor = it }, viewModel::duplicateHabit, { viewModel.archiveHabit(it, !it.archived) }, viewModel::togglePause, viewModel::moveHabit, { deleting = it })
            Tab.STATS -> StatsScreen(habits, Modifier.padding(inset))
            Tab.SETTINGS -> SettingsScreen(Modifier.padding(inset), { exportLauncher.launch("cadence-backup.json") }, { importLauncher.launch(arrayOf("application/json")) }, backupMessage)
        }
    }
    quick?.let { item ->
        val sessionId = remember(item.stored.id) { UUID.randomUUID().toString() }
        QuickSheet(item, { viewModel.addEntry(item, it, "APP", sessionId) }, viewModel::undoLastEntry, { quick = null })
    }
    if (creating || editor != null) HabitEditor(editor, { creating = false; editor = null }) { habit, quickValues, reminderTimes, conditional, isNew ->
        if (reminderTimes.isNotEmpty() && android.os.Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        viewModel.saveHabit(habit, quickValues, reminderTimes, conditional, isNew)
        creating = false
        editor = null
    }
    deleting?.let { habit -> AlertDialog(onDismissRequest = { deleting = null }, title = { Text(stringResource(R.string.delete_dialog_title)) }, text = { Text(stringResource(R.string.delete_dialog_message)) }, confirmButton = { TextButton({ viewModel.deleteHabit(habit.id); deleting = null }) { Text(stringResource(R.string.delete_dialog_confirm)) } }, dismissButton = { TextButton({ deleting = null }) { Text(stringResource(R.string.delete_dialog_cancel)) } }) }
}

@Composable
private fun TodayScreen(habits: List<HabitCardState>, modifier: Modifier, quick: (HabitCardState) -> Unit, edit: (HabitCardState) -> Unit, create: () -> Unit) {
    val pending = habits.filter { it.evaluation.needsAttentionNow }
    val completed = habits.filter { !it.stored.archived && it.evaluation.isCompleted }
    LazyColumn(modifier.fillMaxSize().padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Spacer(Modifier.height(16.dp)); ScreenTitle(stringResource(R.string.today_title), stringResource(R.string.today_subtitle), create) }
        if (habits.none { !it.stored.archived }) item { EmptyHabits(create) } else if (pending.isEmpty()) item { EmptyDone() } else items(pending, key = { it.stored.id }) { HabitCard(it, quick, edit = edit) }
        if (completed.isNotEmpty()) item { Text("Terminé", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 12.dp)) }
        items(completed, key = { "done-${it.stored.id}" }) { HabitCard(it, quick, done = true, edit = edit) }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun ScreenTitle(title: String, caption: String, create: () -> Unit) = Row(verticalAlignment = Alignment.CenterVertically) {
    Column(Modifier.weight(1f)) { Text(title, style = MaterialTheme.typography.headlineMedium); Text(caption, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    IconButton(create, Modifier.background(MaterialTheme.colorScheme.primaryContainer, CircleShape).size(48.dp)) { Icon(Icons.Outlined.Add, stringResource(R.string.create_habit_button)) }
}

@Composable
private fun HabitCard(item: HabitCardState, quick: (HabitCardState) -> Unit, done: Boolean = false, edit: ((HabitCardState) -> Unit)? = null) {
    val ratio by animateFloatAsState((item.evaluation.progressMinor.toFloat() / item.stored.goal.targetMinor).coerceIn(0f, 1f), tween(420), label = "ratio")
    val icon = HabitIconRegistry.getIcon(item.stored.iconId)
    val tint = item.stored.colorArgb?.let(::Color) ?: MaterialTheme.colorScheme.primary
    Card(shape = RoundedCornerShape(24.dp), colors = CardDefaults.cardColors(containerColor = if (done) MaterialTheme.colorScheme.surfaceContainerLow else tint.copy(alpha = .12f))) {
        Row(Modifier.fillMaxWidth().combinedClickable(onClick = { quick(item) }, onLongClick = { edit?.invoke(item) }).padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            RingBadge(icon.imageVector, icon.labelFr, tint, ratio)
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(item.stored.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.height(7.dp)); LinearProgressIndicator({ ratio }, Modifier.fillMaxWidth().height(5.dp).clip(CircleShape), color = tint)
                Text(progress(item), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
            }
        }
    }
}

/** Icon badge ringed by the habit's own progress — the cadence completing a turn. */
@Composable
private fun RingBadge(icon: ImageVector, label: String?, tint: Color, ratio: Float, size: androidx.compose.ui.unit.Dp = 48.dp) {
    Box(Modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val stroke = Stroke(width = 2.6.dp.toPx(), cap = StrokeCap.Round)
            val inset = stroke.width / 2
            drawArc(tint.copy(alpha = .18f), 0f, 360f, false, topLeft = androidx.compose.ui.geometry.Offset(inset, inset), size = androidx.compose.ui.geometry.Size(size.toPx() - stroke.width, size.toPx() - stroke.width), style = stroke)
            if (ratio > 0f) drawArc(tint, -90f, 360f * ratio, false, topLeft = androidx.compose.ui.geometry.Offset(inset, inset), size = androidx.compose.ui.geometry.Size(size.toPx() - stroke.width, size.toPx() - stroke.width), style = stroke)
        }
        Box(Modifier.size(size - 10.dp).background(tint.copy(alpha = .16f), CircleShape), contentAlignment = Alignment.Center) { Icon(icon, label, tint = tint) }
    }
}

private fun progress(item: HabitCardState): String {
    val quantity = HabitFormatter.formatProgress(item.evaluation.progressMinor, item.stored.goal.targetMinor, item.stored.goal.goalType, item.stored.goal.unit)
    val frequency = item.stored.goal.frequencyTarget ?: return quantity
    return "$quantity · ${item.evaluation.sessionCount} / $frequency séances"
}

@Composable private fun EmptyDone() = Card(shape = RoundedCornerShape(24.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) { Column(Modifier.padding(22.dp)) { Icon(Icons.Outlined.Check, null); Spacer(Modifier.height(10.dp)); Text(stringResource(R.string.empty_today_done_title), style = MaterialTheme.typography.titleLarge); Text(stringResource(R.string.empty_today_done_message)) } }
@Composable private fun EmptyHabits(create: () -> Unit) = Card(shape = RoundedCornerShape(24.dp)) { Column(Modifier.padding(22.dp)) { Text(stringResource(R.string.empty_habits_title), style = MaterialTheme.typography.titleLarge); Text(stringResource(R.string.empty_habits_message)); FilledTonalButton(create, modifier = Modifier.padding(top = 16.dp)) { Text(stringResource(R.string.create_habit_button)) } } }

@Composable
private fun HabitsScreen(habits: List<HabitCardState>, modifier: Modifier, create: () -> Unit, edit: (HabitCardState) -> Unit, duplicate: (PersistedHabit) -> Unit, archive: (PersistedHabit) -> Unit, pause: (HabitCardState) -> Unit, move: (String, Int) -> Unit, delete: (PersistedHabit) -> Unit) {
    var options by remember { mutableStateOf<HabitCardState?>(null) }
    LazyColumn(modifier.fillMaxSize().padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Spacer(Modifier.height(16.dp)); ScreenTitle(stringResource(R.string.habits_title), stringResource(R.string.habits_subtitle), create) }
        items(habits, key = { it.stored.id }) { item -> HabitCard(item, {}, edit = { options = it }) }
        item { Spacer(Modifier.height(24.dp)) }
    }
    options?.let { item -> HabitOptionsDialog(item, { options = null }, { edit(item); options = null }, { pause(item); options = null }, { archive(item.stored); options = null }, { duplicate(item.stored); options = null }, { move(item.stored.id, -1); options = null }, { move(item.stored.id, 1); options = null }, { delete(item.stored); options = null }) }
}

@Composable
private fun HabitOptionsDialog(item: HabitCardState, dismiss: () -> Unit, edit: () -> Unit, pause: () -> Unit, archive: () -> Unit, duplicate: () -> Unit, up: () -> Unit, down: () -> Unit, delete: () -> Unit) {
    AlertDialog(onDismissRequest = dismiss, title = { Text(item.stored.name) }, text = {
        Column {
            Option(Icons.Outlined.Edit, stringResource(R.string.action_edit), edit)
            Option(if (item.evaluation.isPaused) Icons.Outlined.PlayArrow else Icons.Outlined.Pause, stringResource(if (item.evaluation.isPaused) R.string.action_resume else R.string.action_pause), pause)
            Option(if (item.stored.archived) Icons.Outlined.Restore else Icons.Outlined.Archive, stringResource(if (item.stored.archived) R.string.action_restore else R.string.action_archive), archive)
            Option(Icons.Outlined.ContentCopy, stringResource(R.string.action_duplicate), duplicate)
            Option(Icons.Outlined.KeyboardArrowUp, stringResource(R.string.action_reorder_up), up)
            Option(Icons.Outlined.KeyboardArrowDown, stringResource(R.string.action_reorder_down), down)
            HorizontalDivider()
            Option(Icons.Outlined.Delete, stringResource(R.string.action_delete), delete)
        }
    }, confirmButton = { TextButton(dismiss) { Text(stringResource(R.string.form_btn_cancel)) } })
}

@Composable
private fun Option(icon: ImageVector, label: String, action: () -> Unit) = Row(Modifier.fillMaxWidth().height(52.dp).clickable(onClick = action).padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) { Icon(icon, null); Spacer(Modifier.width(12.dp)); Text(label) }

@Composable
private fun StatsScreen(habits: List<HabitCardState>, modifier: Modifier) = LazyColumn(modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
    item { Text(stringResource(R.string.tab_stats), style = MaterialTheme.typography.headlineMedium); Text("Six dernières périodes", color = MaterialTheme.colorScheme.onSurfaceVariant) }
    items(habits.filterNot { it.stored.archived }, key = { it.stored.id }) { item ->
        Card(shape = RoundedCornerShape(22.dp)) {
            Column(Modifier.fillMaxWidth().padding(18.dp)) {
                Text(item.stored.name, style = MaterialTheme.typography.titleMedium)
                Text("${item.entryCount} saisies conservées", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(Modifier.fillMaxWidth().height(100.dp).padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.Bottom) {
                    item.history.forEach { period ->
                        val ratio = if (period.targetMinor == 0L) 0f else (period.progressMinor.toFloat() / period.targetMinor).coerceIn(0f, 1f)
                        val color = when { period.excludedByPause -> MaterialTheme.colorScheme.outlineVariant; period.succeeded -> MaterialTheme.colorScheme.primary; else -> MaterialTheme.colorScheme.tertiary }
                        Box(Modifier.weight(1f).height((8 + ratio * 80).dp).background(color, RoundedCornerShape(topStart = 6.dp, topEnd = 6.dp)))
                    }
                }
                Text(progress(item), style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 8.dp))
            }
        }
    }
}

@Composable
private fun SettingsScreen(modifier: Modifier, export: () -> Unit, import: () -> Unit, message: String?) = Column(modifier.fillMaxSize().padding(20.dp)) {
    Text(stringResource(R.string.tab_settings), style = MaterialTheme.typography.headlineMedium)
    Spacer(Modifier.height(20.dp))
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer), shape = RoundedCornerShape(26.dp)) {
        Column(Modifier.fillMaxWidth().padding(20.dp)) {
            Text("Widget", style = MaterialTheme.typography.titleLarge)
            Text("Appui long sur le widget, puis Configurer.", color = MaterialTheme.colorScheme.onPrimaryContainer)
            Text("Taille · couleur · transparence · valeurs · habitudes", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 10.dp))
        }
    }
    Spacer(Modifier.height(20.dp))
    Text("Données", style = MaterialTheme.typography.titleMedium)
    Text("Sauvegarde locale versionnée", color = MaterialTheme.colorScheme.onSurfaceVariant)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 10.dp)) { FilledTonalButton(export) { Text("Exporter") }; FilledTonalButton(import) { Text("Importer") } }
    message?.let { Text(it, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 12.dp)) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun QuickSheet(item: HabitCardState, add: (Long) -> Unit, undo: () -> Unit, dismiss: () -> Unit) {
    var custom by remember { mutableStateOf("") }
    ModalBottomSheet(onDismissRequest = dismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) { val icon = HabitIconRegistry.getIcon(item.stored.iconId); val tint = item.stored.colorArgb?.let(::Color) ?: MaterialTheme.colorScheme.primary; Box(Modifier.size(58.dp).background(tint, RoundedCornerShape(20.dp)), contentAlignment = Alignment.Center) { Icon(icon.imageVector, icon.labelFr, tint = Color.White) }; Spacer(Modifier.width(14.dp)); Column { Text(item.stored.name, style = MaterialTheme.typography.headlineSmall); Text(progress(item), color = MaterialTheme.colorScheme.onSurfaceVariant) } }
            HabitHistoryGraph(item.history, item.stored.colorArgb?.let(::Color) ?: MaterialTheme.colorScheme.primary, Modifier.fillMaxWidth().padding(vertical = 18.dp))
            if (item.stored.goal.goalType == GoalType.BINARY) Button({ add(1); dismiss() }, Modifier.fillMaxWidth().height(56.dp)) { Text(stringResource(R.string.quick_btn_validate)) } else {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { item.quickValues.ifEmpty { listOf(item.stored.goal.unit?.scaleToCanonical ?: 1) }.forEach { value -> FilledTonalButton({ add(value) }) { Text("+${HabitFormatter.formatValue(value, item.stored.goal.goalType, item.stored.goal.unit)}") } } }
                OutlinedTextField(custom, { custom = it.filter(Char::isDigit) }, label = { Text(stringResource(R.string.quick_custom_value_label)) }, singleLine = true, modifier = Modifier.fillMaxWidth().padding(top = 12.dp), suffix = { Text(item.stored.goal.unit?.symbol.orEmpty()) })
                Button({ custom.toLongOrNull()?.takeIf { it > 0 }?.let { add(it * (item.stored.goal.unit?.scaleToCanonical ?: 1)); custom = "" } }, enabled = (custom.toLongOrNull() ?: 0) > 0, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) { Text(stringResource(R.string.quick_btn_add)) }
            }
            TextButton(undo, Modifier.fillMaxWidth()) { Text(stringResource(R.string.quick_btn_undo)) }
            Spacer(Modifier.height(24.dp))
        }
    }
}

private class EditorState(
    step: Int = 0, name: String = "", description: String = "",
    iconId: String = HabitIconRegistry.DEFAULT_ICON_ID, colorArgb: Int = 0xFF526AA0.toInt(),
    goalType: GoalType = GoalType.BINARY, target: String = "1", unit: MeasurementUnit = MeasurementUnit.COUNT,
    customUnit: Boolean = false, customName: String = "", customSymbol: String = "",
    period: PeriodType = PeriodType.DAY, scheduleMode: ScheduleMode = ScheduleMode.EVERY_DAY,
    activeDays: Set<DayOfWeek> = DayOfWeek.entries.toSet(), firstDay: DayOfWeek = DayOfWeek.MONDAY,
    quickValues: String = "1", reminderTimes: String = "", conditionalReminders: Boolean = true,
    frequencyTarget: String = "",
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
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun HabitEditor(existing: HabitCardState?, dismiss: () -> Unit, save: (PersistedHabit, List<Long>, List<String>, Boolean, Boolean) -> Unit) {
    val stored = existing?.stored
    val state = remember(stored?.id) {
        mutableStateOf(
            EditorState(
                name = stored?.name.orEmpty(),
                description = stored?.description.orEmpty(),
                iconId = stored?.iconId ?: HabitIconRegistry.DEFAULT_ICON_ID,
                colorArgb = stored?.colorArgb ?: 0xFF526AA0.toInt(),
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
            ),
        )
    }.value
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(onDismissRequest = dismiss, title = { Text(if (stored == null) stringResource(R.string.form_title_create) else stringResource(R.string.form_title_edit)) }, text = {
        LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.height(480.dp)) {
            item { Text(listOf(stringResource(R.string.form_step_identity_title), stringResource(R.string.form_step_goal_title), stringResource(R.string.form_step_schedule_title), stringResource(R.string.form_step_quick_title))[state.step], style = MaterialTheme.typography.titleMedium) }
            when (state.step) {
                0 -> { item { OutlinedTextField(state.name, { state.name = it }, label = { Text(stringResource(R.string.form_name_label)) }, modifier = Modifier.fillMaxWidth()) }; item { OutlinedTextField(state.description, { state.description = it }, label = { Text(stringResource(R.string.form_description_label)) }, modifier = Modifier.fillMaxWidth()) }; item { val chosen = HabitIconRegistry.getIcon(state.iconId); Card(colors = CardDefaults.cardColors(containerColor = Color(state.colorArgb).copy(alpha = .22f))) { Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(52.dp).background(Color(state.colorArgb), CircleShape), contentAlignment = Alignment.Center) { Icon(chosen.imageVector, chosen.labelFr, tint = Color.White) }; Spacer(Modifier.width(12.dp)); Column { Text("Icône choisie", style = MaterialTheme.typography.labelMedium); Text(chosen.labelFr, style = MaterialTheme.typography.titleMedium) } } } }; item { HabitIconPicker(state.iconId, { state.iconId = it }) }; item { FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) { listOf(0xFF5B8CFF, 0xFF00BFA5, 0xFFFF6B6B, 0xFFB388FF, 0xFFFFB74D, 0xFF4DD0E1, 0xFFEC407A, 0xFF8BC34A).forEach { color -> Box(Modifier.size(if (state.colorArgb == color.toInt()) 52.dp else 44.dp).background(Color(color), CircleShape).clickable { state.colorArgb = color.toInt() }) } } } }
                1 -> { item { FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) { GoalType.entries.forEach { Choice(it.name.lowercase(), state.goalType == it) { state.goalType = it; if (it == GoalType.BINARY) state.target = "1" } } } }; if (state.goalType != GoalType.BINARY) item { OutlinedTextField(state.target, { state.target = it.filter(Char::isDigit) }, label = { Text(stringResource(R.string.form_target_label)) }, modifier = Modifier.fillMaxWidth()) }; if (state.goalType != GoalType.BINARY) item { val units = when (state.goalType) { GoalType.DURATION -> listOf(MeasurementUnit.SECONDS, MeasurementUnit.MINUTES, MeasurementUnit.HOURS); GoalType.COUNT -> MeasurementUnit.BUILT_INS.filter { it.dimension == UnitDimension.COUNT }; else -> MeasurementUnit.BUILT_INS.filter { it.dimension != UnitDimension.TIME } }; FlowRow(horizontalArrangement = Arrangement.spacedBy(5.dp)) { units.forEach { Choice(it.symbol.ifBlank { it.nameFr }, !state.customUnit && state.unit.id == it.id) { state.unit = it; state.customUnit = false } }; Choice(stringResource(R.string.form_unit_custom), state.customUnit) { state.customUnit = true } } }; if (state.customUnit) item { OutlinedTextField(state.customName, { state.customName = it }, label = { Text(stringResource(R.string.form_custom_unit_name)) }, modifier = Modifier.fillMaxWidth()); OutlinedTextField(state.customSymbol, { state.customSymbol = it }, label = { Text(stringResource(R.string.form_custom_unit_symbol)) }, modifier = Modifier.fillMaxWidth()) }; item { OutlinedTextField(state.frequencyTarget, { state.frequencyTarget = it.filter(Char::isDigit) }, label = { Text("Nombre minimal de séances (facultatif)") }, supportingText = { Text("Distinct de la quantité visée") }, modifier = Modifier.fillMaxWidth()) } }
                2 -> { item { FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) { PeriodType.entries.forEach { Choice(it.name.lowercase(), state.period == it) { state.period = it } } } }; item { FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) { ScheduleMode.entries.forEach { Choice(it.name.lowercase(), state.scheduleMode == it) { state.scheduleMode = it } } } }; if (state.period == PeriodType.WEEK) item { Text(stringResource(R.string.form_first_day_of_week_label)); FlowRow(horizontalArrangement = Arrangement.spacedBy(5.dp)) { DayOfWeek.entries.forEach { Choice(it.name.take(3).lowercase(), state.firstDay == it) { state.firstDay = it } } } }; if (state.scheduleMode == ScheduleMode.SELECTED_DAYS) item { FlowRow(horizontalArrangement = Arrangement.spacedBy(5.dp)) { DayOfWeek.entries.forEach { day -> Choice(day.name.take(3).lowercase(), day in state.activeDays) { state.activeDays = if (day in state.activeDays) state.activeDays - day else state.activeDays + day } } } } }
                else -> { item { OutlinedTextField(state.quickValues, { state.quickValues = it.filter { c -> c.isDigit() || c == ',' || c == ' ' } }, label = { Text(stringResource(R.string.form_quick_values_label)) }, supportingText = { Text("Ex. 10, 20, 30") }, modifier = Modifier.fillMaxWidth()) }; item { OutlinedTextField(state.reminderTimes, { state.reminderTimes = it.filter { c -> c.isDigit() || c == ':' || c == ',' || c == ' ' } }, label = { Text("Rappels (HH:mm, HH:mm)") }, supportingText = { Text("Laissez vide pour aucun rappel") }, modifier = Modifier.fillMaxWidth()) }; item { Row(verticalAlignment = Alignment.CenterVertically) { androidx.compose.material3.Switch(state.conditionalReminders, { state.conditionalReminders = it }); Spacer(Modifier.width(8.dp)); Text("Seulement si l’objectif reste à faire") } } }
            }
            error?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }
        }
    }, confirmButton = { TextButton({
        if (state.step < 3) { if (state.step == 0 && state.name.isBlank()) error = "Le nom est requis" else { error = null; state.step++ } } else {
            val target = state.target.toLongOrNull() ?: 0
            val unit = if (state.goalType == GoalType.BINARY) null else if (state.customUnit) MeasurementUnit("custom-${state.customName.trim().lowercase()}", UnitDimension.CUSTOM, state.customName.trim(), state.customSymbol.trim()) else state.unit
            val quick = state.quickValues.split(',', ' ').mapNotNull(String::toLongOrNull).filter { it > 0 }.map { it * (unit?.scaleToCanonical ?: 1) }
            val reminderTimes = state.reminderTimes.split(',', ' ').map(String::trim).filter(String::isNotBlank)
            val frequency = state.frequencyTarget.toIntOrNull()
            when { target <= 0 -> error = "L’objectif doit être positif"; state.frequencyTarget.isNotBlank() && (frequency ?: 0) <= 0 -> error = "La fréquence doit être positive"; state.customUnit && (state.customName.isBlank() || state.customSymbol.isBlank()) -> error = "L’unité personnalisée est incomplète"; state.scheduleMode == ScheduleMode.SELECTED_DAYS && state.activeDays.isEmpty() -> error = "Choisissez au moins un jour"; reminderTimes.any { runCatching { java.time.LocalTime.parse(it) }.isFailure } -> error = "Utilisez le format HH:mm pour les rappels"; else -> { val base = stored; val habit = PersistedHabit(id = base?.id ?: UUID.randomUUID().toString(), name = state.name.trim(), description = state.description.trim().ifBlank { null }, iconId = state.iconId, colorArgb = state.colorArgb, active = base?.active ?: true, startsOn = base?.startsOn ?: LocalDate.now(), archived = base?.archived ?: false, sortOrder = base?.sortOrder ?: 0, createdAtEpochMs = base?.createdAtEpochMs ?: 0, updatedAtEpochMs = base?.updatedAtEpochMs ?: 0, goal = HabitGoal(target * (unit?.scaleToCanonical ?: 1), state.period, state.goalType, unit, frequency), schedule = HabitSchedule(state.scheduleMode, state.activeDays, state.firstDay)); save(habit, quick, reminderTimes, state.conditionalReminders, stored == null) } }
        }
    }) { Text(if (state.step < 3) stringResource(R.string.form_btn_next) else stringResource(R.string.form_btn_save)) } }, dismissButton = { TextButton({ if (state.step > 0) state.step-- else dismiss() }) { Text(if (state.step > 0) stringResource(R.string.form_btn_back) else stringResource(R.string.form_btn_cancel)) } })
}

@Composable
private fun Choice(label: String, selected: Boolean, action: () -> Unit) = Text(label, Modifier.padding(bottom = 4.dp).clip(RoundedCornerShape(12.dp)).background(if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant).clickable(onClick = action).padding(horizontal = 10.dp, vertical = 8.dp), style = MaterialTheme.typography.labelLarge)
