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
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.KeyboardArrowUp
import androidx.compose.material.icons.outlined.Pause
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Restore
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.TrackChanges
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitGoal
import ch.nicolab.cadence.domain.HabitGroup
import ch.nicolab.cadence.domain.HabitSchedule
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
    val groups by viewModel.groups.collectAsStateWithLifecycle()
    var tab by remember { mutableStateOf(Tab.TODAY) }
    var editor by remember { mutableStateOf<HabitCardState?>(null) }
    var creating by remember { mutableStateOf(false) }
    var quick by remember { mutableStateOf<HabitCardState?>(null) }
    var options by remember { mutableStateOf<HabitCardState?>(null) }
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
                Tab.TODAY -> TodayScreen(habits, { quick = it }, { options = it }, { creating = true })
                Tab.HABITS -> HabitsScreen(habits, { creating = true }, { options = it })
                Tab.STATS -> StatsScreen(habits)
                Tab.SETTINGS -> SettingsScreen(
                    groups = groups,
                    habitCountByGroup = habits.groupingBy { it.stored.groupId }.eachCount(),
                    saveGroup = viewModel::saveGroup,
                    addGroup = { viewModel.addGroup(it, 8 * 60, 12 * 60) },
                    deleteGroup = viewModel::deleteGroup,
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
        QuickSheet(item, { viewModel.addEntry(item, it, "APP", sessionId) }, viewModel::undoLastEntry, { quick = null })
    }
    options?.let { item ->
        HabitOptionsSheet(
            item,
            dismiss = { options = null },
            edit = { editor = item; options = null },
            pause = { viewModel.togglePause(item); options = null },
            skipToday = { viewModel.skipToday(item); options = null },
            archive = { viewModel.archiveHabit(item.stored, !item.stored.archived); options = null },
            duplicate = { viewModel.duplicateHabit(item.stored); options = null },
            up = { viewModel.moveHabit(item.stored.id, -1); options = null },
            down = { viewModel.moveHabit(item.stored.id, 1); options = null },
            delete = { deleting = item.stored; options = null },
        )
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
private fun TodayScreen(habits: List<HabitCardState>, quick: (HabitCardState) -> Unit, options: (HabitCardState) -> Unit, create: () -> Unit) {
    val active = habits.filter { !it.stored.archived }
    val pending = habits.filter { it.evaluation.needsAttentionNow }
    val completed = active.filter { it.evaluation.isCompleted }
    ScreenList(
        context = stringResource(R.string.today_subtitle),
        title = stringResource(R.string.today_title),
        action = { HeaderAction(Icons.Outlined.Add, stringResource(R.string.create_habit_button), accent = true, onClick = create) },
    ) {
        when {
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
private fun HabitsScreen(habits: List<HabitCardState>, create: () -> Unit, options: (HabitCardState) -> Unit) {
    val active = habits.filter { !it.stored.archived }
    val archived = habits.filter { it.stored.archived }
    ScreenList(
        context = stringResource(R.string.habits_subtitle),
        title = stringResource(R.string.habits_title),
        action = { HeaderAction(Icons.Outlined.Add, stringResource(R.string.create_habit_button), accent = true, onClick = create) },
    ) {
        if (active.isEmpty() && archived.isEmpty()) {
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
    val target = item.stored.goal.targetMinor.takeIf { it > 0 } ?: 1L
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
    else -> progress(item)
}

@Composable
private fun progress(item: HabitCardState): String {
    val quantity = HabitFormatter.formatProgress(item.evaluation.progressMinor, item.stored.goal.targetMinor, item.stored.goal.goalType, item.stored.goal.unit)
    val frequency = item.stored.goal.frequencyTarget ?: return quantity
    return stringResource(R.string.habit_sessions_format, quantity, item.evaluation.sessionCount, frequency)
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
    export: () -> Unit,
    import: () -> Unit,
    message: String?,
) {
    val palette = cadence
    ScreenList(context = stringResource(R.string.settings_data_subtitle), title = stringResource(R.string.tab_settings)) {
        item { SectionLabel(stringResource(R.string.group_section_title)) }
        item {
            Panel {
                Text(stringResource(R.string.group_overlap_notice), style = MaterialTheme.typography.bodySmall, color = palette.inkMuted)
            }
        }
        items(groups, key = HabitGroup::id) { group ->
            GroupPanel(group, habitCountByGroup[group.id] ?: 0, saveGroup, deleteGroup)
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
        if (!fixedAllDay && habitCount > 0) {
            Spacer(Modifier.height(Space.xs))
            Text(stringResource(R.string.group_delete_notice), style = MaterialTheme.typography.bodySmall, color = palette.inkFaint)
        }
    }
}

private fun formatMinuteOfDay(minute: Int?): String =
    minute?.let { String.format(java.util.Locale.ROOT, "%02d:%02d", it / 60, it % 60) }.orEmpty()

/** Lit `HH:mm`; toute autre écriture laisse le groupe sans horaire plutôt que d'inventer une plage. */
private fun parseMinuteOfDay(raw: String): Int? =
    runCatching { java.time.LocalTime.parse(raw.trim()) }.getOrNull()?.let { it.hour * 60 + it.minute }

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
        if (!item.evaluation.isPaused) {
            ActionRow(Icons.Outlined.EventBusy, stringResource(R.string.action_skip_today), tint, skipToday)
        }
        ActionRow(
            if (item.stored.archived) Icons.Outlined.Restore else Icons.Outlined.Archive,
            stringResource(if (item.stored.archived) R.string.action_restore else R.string.action_archive),
            tint,
            archive,
        )
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
private fun QuickSheet(item: HabitCardState, add: (Long) -> Unit, undo: () -> Unit, dismiss: () -> Unit) {
    var custom by remember { mutableStateOf("") }
    val tint = habitTint(item)
    val scale = item.stored.goal.unit?.scaleToCanonical ?: 1
    CadenceSheet(
        title = item.stored.name,
        subtitle = progress(item),
        dismiss = dismiss,
        leading = { HabitAvatar(item, tint) },
    ) {
        HabitHistoryGraph(item.history, tint, Modifier.fillMaxWidth().padding(bottom = Space.xl))
        if (item.stored.goal.goalType == GoalType.BINARY) {
            PrimaryAction(stringResource(R.string.quick_btn_validate), Modifier.fillMaxWidth(), accent = tint) { add(1); dismiss() }
        } else {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                item.quickValues.ifEmpty { listOf(scale) }.forEach { value ->
                    ValueChip("+${HabitFormatter.formatValue(value, item.stored.goal.goalType, item.stored.goal.unit)}", accent = tint) { add(value) }
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
                custom.toLongOrNull()?.takeIf { it > 0 }?.let { add(it * scale); custom = "" }
            }
        }
        Spacer(Modifier.height(Space.xs))
        TertiaryAction(stringResource(R.string.quick_btn_undo), Modifier.fillMaxWidth(), onClick = undo)
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
                    if (state.goalType != GoalType.BINARY) {
                        item { CadenceField(state.target, { state.target = it.filter(Char::isDigit) }, stringResource(R.string.form_target_label), accent = accent, numeric = true) }
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
                    item {
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
                    when {
                        target <= 0 -> error = positiveTarget
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
                                goal = HabitGoal(target * (unit?.scaleToCanonical ?: 1), state.period, state.goalType, unit, frequency),
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
