@file:OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui

import androidx.annotation.StringRes
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.KeyboardArrowUp
import androidx.compose.material3.Icon
import androidx.compose.ui.Alignment
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.ChoiceChip
import ch.nicolab.cadence.designsystem.components.SectionHeader
import ch.nicolab.cadence.designsystem.components.SectionTone
import ch.nicolab.cadence.designsystem.components.SegmentedTabs
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.InboxEntry
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.planning.Horizon
import ch.nicolab.cadence.tasks.planning.PlanBoard
import ch.nicolab.cadence.tasks.planning.PlanCard
import ch.nicolab.cadence.tasks.planning.PlanDay
import ch.nicolab.cadence.tasks.planning.formatMinutes
import ch.nicolab.cadence.tasks.plugins.PluginActionButtons
import ch.nicolab.cadence.tasks.ui.triage.TriageEntry
import ch.nicolab.cadence.tasks.ui.triage.TriageScreen
import ch.nicolab.cadence.tasks.ui.triage.TriageViewModel
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/** Ce que la feuille « Planifier » déplace : une carte d'un jour, une tâche sans jour, ou une idée de l'Inbox. */
private sealed interface PlanTarget {
    val name: String

    data class Card(val card: PlanCard) : PlanTarget {
        override val name: String get() = card.task.name
    }

    data class Task(val task: TaskItem) : PlanTarget {
        override val name: String get() = task.name
    }

    data class Idea(val entry: InboxEntry) : PlanTarget {
        override val name: String get() = entry.content
    }
}

/** Où le « + » d'une section crée la tâche. */
private sealed interface AddTarget {
    data object Inbox : AddTarget
    data class Day(val date: LocalDate) : AddTarget
    data class InHorizon(val horizon: Horizon) : AddTarget
}

@StringRes
internal fun horizonLabel(horizon: Horizon): Int = when (horizon) {
    Horizon.WEEK -> R.string.plan_horizon_week
    Horizon.NEXT_WEEK -> R.string.plan_horizon_next_week
    Horizon.THIS_MONTH -> R.string.plan_horizon_this_month
    Horizon.NEXT_MONTH -> R.string.plan_horizon_next_month
    Horizon.SOMEDAY -> R.string.plan_horizon_someday
}

/**
 * Planifier (web : page `/upcoming`) en une colonne pour le téléphone : l'Inbox (tâches à classer, puis idées), le
 * retard, puis 14 jours en sections ; ou les quatre horizons. Toucher une ligne ouvre la tâche, l'appui long ouvre
 * « Planifier » (un jour, un horizon, retirer du jour). Tout passe par le plan du jour, `week_of`, `month_of` ou
 * `#someday` : jamais par l'échéance. [hideDone] masque les terminées des jours.
 */
@Composable
internal fun PlanTab(
    viewModel: TasksViewModel,
    onOpen: (TaskItem) -> Unit,
    hideDone: Boolean,
    modifier: Modifier = Modifier,
) {
    val board by viewModel.planBoard.collectAsStateWithLifecycle()
    val unsorted by viewModel.unsorted.collectAsStateWithLifecycle()
    val ideas by viewModel.inbox.collectAsStateWithLifecycle()
    val moment by viewModel.moment.collectAsStateWithLifecycle()
    val projectNames = rememberProjectNames(viewModel)
    val projectColors = rememberProjectColors(viewModel)
    val projectIcons = rememberProjectIcons(viewModel)
    val context = LocalContext.current
    val layouts = remember(context) { LayoutStore(context) }
    var horizons by rememberSaveable { mutableStateOf(layouts.isOn(LayoutStore.PLAN_HORIZONS)) }
    var planning by remember { mutableStateOf<PlanTarget?>(null) }
    var adding by remember { mutableStateOf<AddTarget?>(null) }
    // « Ce mois-ci » d'« À planifier » est replié par défaut ; son compte reste visible.
    var monthOpen by rememberSaveable { mutableStateOf(false) }
    // « Choisir une date » du menu « Replanifier » des échues.
    var pickingOverdue by remember { mutableStateOf(false) }
    // Horizon à montrer après un appui sur la bande « Plus tard » de Jours.
    var focusHorizon by remember { mutableStateOf<Horizon?>(null) }
    val listState = rememberLazyListState()
    // « À trier (N) » au-dessus de l'Inbox : seulement en ligne, comme l'ancien écran Inbox.
    val triage: TriageViewModel = androidx.lifecycle.viewmodel.compose.viewModel()
    val triageItems by triage.items.collectAsStateWithLifecycle()
    val triageOnline by triage.online.collectAsStateWithLifecycle()
    var triageOpen by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(triage) { triage.refresh() }
    val triageCount = if (triageOnline) triageItems.size else 0
    val today = moment.today

    @Composable
    fun Row(task: TaskItem, card: PlanCard? = null, onMenu: () -> Unit) {
        val start = card?.line?.startMinute
        val minutes = card?.minutes
        TaskRow(
            task = task,
            projectName = task.projectUid?.let { projectNames[it] },
            projectIcon = task.projectUid?.let { projectIcons[it] },
            projectColor = task.projectUid?.let { projectColors[it] },
            today = today,
            zone = moment.zone,
            onToggle = { viewModel.toggle(task, hold = true) },
            onOpen = { onOpen(task) },
            onSwipeAction = { viewModel.swipe(task, it) },
            onMenu = onMenu,
            sectionDay = card?.day,
            plannedAt = start?.let { card.day.atStartOfDay(moment.zone).plusMinutes(it.toLong()).toInstant() },
            trailing = minutes?.takeIf { it > 0 }?.let {
                { Text(formatMinutes(it), style = MaterialTheme.typography.labelMedium, color = cadence.onSurfaceVariant) }
            },
        )
    }

    LaunchedEffect(horizons, focusHorizon) {
        val target = focusHorizon ?: return@LaunchedEffect
        if (horizons) listState.scrollToItem(horizonHeaderIndex(board, target))
        focusHorizon = null
    }

    LazyColumn(modifier = modifier, state = listState, contentPadding = tasksListPadding()) {
        item(key = "mode") {
            SegmentedTabs(
                labels = listOf(stringResource(R.string.plan_mode_days), stringResource(R.string.plan_mode_horizons)),
                selected = if (horizons) 1 else 0,
                onSelect = { index ->
                    horizons = index == 1
                    layouts.set(LayoutStore.PLAN_HORIZONS, horizons)
                },
                modifier = Modifier.padding(bottom = Space.xs),
            )
        }
        if (!horizons) {
            if (triageCount > 0) {
                item(key = "triage") { TriageEntry(triageCount, onOpen = { triageOpen = true }) }
            }
            item(key = "inbox-header") {
                SectionHeader(
                    title = stringResource(R.string.plan_inbox),
                    count = unsorted.size + ideas.size,
                    actionLabel = stringResource(R.string.plan_add),
                    onAction = { adding = AddTarget.Inbox },
                )
            }
            items(unsorted, key = { "inbox-task-${it.uid}" }) { task ->
                Column {
                    Row(task) { planning = PlanTarget.Task(task) }
                    if (task.needsWhen) WhenChoices(task, viewModel)
                }
            }
            items(ideas, key = { "inbox-idea-${it.uid}" }) { entry ->
                IdeaItem(
                    entry = entry,
                    viewModel = viewModel,
                    onPlan = { planning = PlanTarget.Idea(entry) },
                    modifier = Modifier.padding(bottom = Space.sm),
                )
            }
            if (unsorted.isEmpty() && ideas.isEmpty()) {
                item(key = "inbox-empty") { QuietLine(R.string.plan_inbox_empty) }
            }
            val toSchedule = board.toSchedule
            if (!toSchedule.isEmpty) {
                item(key = "schedule-header") {
                    SectionHeader(
                        title = stringResource(R.string.plan_to_schedule),
                        count = toSchedule.stale.size + toSchedule.week.size + toSchedule.month.size,
                    )
                }
                if (toSchedule.stale.isNotEmpty()) {
                    item(key = "schedule-stale") { SubHeading(stringResource(R.string.plan_to_reschedule), toSchedule.stale.size, error = true) }
                    items(toSchedule.stale, key = { "schedule-stale-${it.uid}" }) { task -> Row(task) { planning = PlanTarget.Task(task) } }
                }
                if (toSchedule.week.isNotEmpty()) {
                    item(key = "schedule-week") { SubHeading(stringResource(R.string.plan_horizon_week), toSchedule.week.size) }
                    items(toSchedule.week, key = { "schedule-week-${it.uid}" }) { task -> Row(task) { planning = PlanTarget.Task(task) } }
                }
                if (toSchedule.month.isNotEmpty()) {
                    item(key = "schedule-month") {
                        SubHeading(stringResource(R.string.plan_horizon_this_month), toSchedule.month.size, expanded = monthOpen) {
                            monthOpen = !monthOpen
                        }
                    }
                    if (monthOpen) {
                        items(toSchedule.month, key = { "schedule-month-${it.uid}" }) { task -> Row(task) { planning = PlanTarget.Task(task) } }
                    }
                }
            }
            if (board.overdue.isNotEmpty()) {
                item(key = "overdue-header") {
                    OverdueHeader(
                        count = board.overdue.size,
                        today = today,
                        onDay = { viewModel.planOn(board.overdue, it) },
                        onSpread = { viewModel.spreadOverdue() },
                        onPick = { pickingOverdue = true },
                    )
                }
                items(board.overdue, key = { "overdue-${it.rowKey}" }) { task ->
                    Row(task) { planning = PlanTarget.Task(task) }
                }
            }
            board.days.forEach { day -> planDay(day, today, hideDone, onAdd = { adding = AddTarget.Day(day.date) }) { card ->
                Row(card.task, card) { if (card.task.virtual) onOpen(card.task) else planning = PlanTarget.Card(card) }
            } }
            item(key = "horizon-strip") {
                HorizonStrip(board) { horizon ->
                    horizons = true
                    layouts.set(LayoutStore.PLAN_HORIZONS, true)
                    focusHorizon = horizon
                }
            }
        } else {
            Horizon.entries.forEach { horizon ->
                val tasks = board.horizons.buckets[horizon].orEmpty()
                item(key = "horizon-$horizon") {
                    SectionHeader(
                        title = stringResource(horizonLabel(horizon)),
                        count = tasks.size,
                        actionLabel = stringResource(R.string.plan_add),
                        onAction = { adding = AddTarget.InHorizon(horizon) },
                    )
                }
                items(tasks, key = { "horizon-$horizon-${it.uid}" }) { task ->
                    Row(task) { planning = PlanTarget.Task(task) }
                }
                if (horizon == Horizon.WEEK && board.horizons.plannedThisWeek.isNotEmpty()) {
                    item(key = "planned-week") {
                        Text(
                            stringResource(R.string.plan_planned_on_day),
                            style = MaterialTheme.typography.labelLarge,
                            color = cadence.onSurfaceVariant,
                            modifier = Modifier.padding(top = Space.sm, bottom = Space.xs),
                        )
                    }
                    items(board.horizons.plannedThisWeek, key = { "planned-week-${it.first.uid}" }) { (task, date) ->
                        val card = board.days.firstOrNull { it.date == date }?.open?.firstOrNull { it.task.uid == task.uid }
                        Row(task, card) { planning = card?.let { PlanTarget.Card(it) } ?: PlanTarget.Task(task) }
                    }
                }
                if (tasks.isEmpty() && (horizon != Horizon.WEEK || board.horizons.plannedThisWeek.isEmpty())) {
                    item(key = "horizon-empty-$horizon") { QuietLine(R.string.plan_horizon_empty) }
                }
            }
        }
    }

    planning?.let { target ->
        PlanSheet(
            target = target,
            days = board.days.map { it.date },
            today = today,
            currentHorizon = when (target) {
                is PlanTarget.Card -> board.horizons.of(target.card.task.uid)
                is PlanTarget.Task -> board.horizons.of(target.task.uid)
                is PlanTarget.Idea -> null
            },
            onDay = { date ->
                when (target) {
                    is PlanTarget.Card -> viewModel.planMove(target.card, date)
                    is PlanTarget.Task -> {
                        val planned = board.days.flatMap { it.open }.firstOrNull { it.task.uid == target.task.uid && it.planned }
                        if (planned != null) viewModel.planMove(planned, date) else viewModel.planOn(listOf(target.task), date)
                    }
                    is PlanTarget.Idea -> viewModel.planIdea(target.entry, day = date)
                }
                planning = null
            },
            onHorizon = { horizon ->
                when (target) {
                    is PlanTarget.Card -> viewModel.sendToHorizon(target.card, horizon)
                    is PlanTarget.Task -> viewModel.moveToHorizon(target.task, horizon)
                    is PlanTarget.Idea -> viewModel.planIdea(target.entry, horizon = horizon)
                }
                planning = null
            },
            onDropCommitment = when (target) {
                is PlanTarget.Card -> target.card.task
                is PlanTarget.Task -> target.task
                is PlanTarget.Idea -> null
            }?.takeIf { PlanBoard.dropCommitment(it) != null }?.let { task ->
                {
                    viewModel.dropCommitment(task)
                    planning = null
                }
            },
            onRemove = (target as? PlanTarget.Card)?.card?.takeIf { it.planned }?.let { card ->
                {
                    viewModel.planRemove(card)
                    planning = null
                }
            },
            onMore = when (target) {
                is PlanTarget.Card -> target.card.task
                is PlanTarget.Task -> target.task
                is PlanTarget.Idea -> null
            }?.let { task ->
                {
                    planning = null
                    viewModel.openMenu(task)
                }
            },
            onDismiss = { planning = null },
        )
    }

    if (pickingOverdue) {
        TaskDatePickerDialog(
            initial = today,
            onConfirm = { date ->
                pickingOverdue = false
                viewModel.planOn(board.overdue, date)
            },
            onDismiss = { pickingOverdue = false },
        )
    }

    if (triageOpen) TriageScreen(today = LocalDate.now(), onBack = { triageOpen = false })

    adding?.let { target ->
        QuickAddSheet(
            onDismiss = { adding = null },
            onSave = { draft ->
                when (target) {
                    AddTarget.Inbox -> viewModel.addToPlan(draft, null)
                    is AddTarget.Day -> viewModel.addToPlan(draft, target.date)
                    is AddTarget.InHorizon -> viewModel.addToHorizon(draft, target.horizon)
                }
            },
        )
    }
}

/** Les horizons après cette semaine, dans la bande « Plus tard » de Jours (web : `STRIP_KEYS`). */
private val STRIP = listOf(Horizon.NEXT_WEEK, Horizon.THIS_MONTH, Horizon.NEXT_MONTH, Horizon.SOMEDAY)

/** Position de l'en-tête de [horizon] dans la liste du mode Horizons (même ordre que [PlanTab]). */
private fun horizonHeaderIndex(board: PlanBoardState, horizon: Horizon): Int {
    var index = 1
    for (key in Horizon.entries) {
        if (key == horizon) return index
        val tasks = board.horizons.buckets[key].orEmpty().size
        val planned = if (key == Horizon.WEEK) board.horizons.plannedThisWeek.size else 0
        index += 1 + tasks + (if (planned > 0) 1 + planned else 0) + (if (tasks == 0 && planned == 0) 1 else 0)
    }
    return 0
}

/**
 * En-tête des échues : titre, boutons des plugins du lieu `overdue` (web : « Proposer un plan »), puis
 * « Replanifier » : Aujourd'hui, Demain, Étaler sur 7 jours, Choisir une date. Rien n'y touche l'échéance.
 */
@Composable
private fun OverdueHeader(
    count: Int,
    today: LocalDate,
    onDay: (LocalDate) -> Unit,
    onSpread: () -> Unit,
    onPick: () -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    androidx.compose.foundation.layout.Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
        SectionHeader(
            title = stringResource(R.string.plan_overdue),
            count = count,
            tone = SectionTone.Error,
            modifier = Modifier.weight(1f),
        )
        androidx.compose.foundation.layout.Row(verticalAlignment = Alignment.CenterVertically) {
            PluginActionButtons(place = "overdue", context = mapOf("date" to today.toString()))
            Box {
                TextButton(onClick = { open = true }, modifier = Modifier.heightIn(min = Size.touch)) {
                    Text(stringResource(R.string.plan_overdue_reschedule), style = MaterialTheme.typography.labelLarge)
                    Icon(Icons.Outlined.KeyboardArrowDown, contentDescription = null, modifier = Modifier.size(Size.icon))
                }
                DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                    DropdownMenuItem(text = { Text(stringResource(R.string.tasks_day_today)) }, onClick = { open = false; onDay(today) })
                    DropdownMenuItem(text = { Text(stringResource(R.string.tasks_day_tomorrow)) }, onClick = { open = false; onDay(today.plusDays(1)) })
                    DropdownMenuItem(text = { Text(stringResource(R.string.plan_overdue_spread)) }, onClick = { open = false; onSpread() })
                    DropdownMenuItem(text = { Text(stringResource(R.string.tasks_chip_custom_date)) }, onClick = { open = false; onPick() })
                }
            }
        }
    }
}

/**
 * Bande « Plus tard » sous les jours (web : `HorizonStrip`) : les horizons après cette semaine avec leur compte ; un
 * appui ouvre Horizons sur la colonne. On y envoie une carte par son appui long (« Planifier » › Horizon).
 */
@Composable
private fun HorizonStrip(board: PlanBoardState, onOpen: (Horizon) -> Unit) {
    Column(Modifier.fillMaxWidth().padding(top = Space.lg), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
        Text(stringResource(R.string.plan_strip_title), style = MaterialTheme.typography.titleSmall, color = cadence.onSurfaceVariant)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
            STRIP.forEach { horizon ->
                val count = board.horizons.buckets[horizon].orEmpty().size
                val label = stringResource(horizonLabel(horizon))
                ChoiceChip(label = if (count > 0) "$label · $count" else label, selected = false, onClick = { onOpen(horizon) })
            }
        }
    }
}

/** Un jour : en-tête (jour, date, charge) avec « Ajouter », ses cartes ouvertes, puis ses terminées sauf [hideDone]. */
private fun LazyListScope.planDay(
    day: PlanDay,
    today: LocalDate,
    hideDone: Boolean,
    onAdd: () -> Unit,
    row: @Composable (PlanCard) -> Unit,
) {
    item(key = "day-${day.date}") {
        val label = dayLabel(day.date, today)
        val date = day.date.format(DateTimeFormatter.ofPattern("d MMM", tasksLocale))
        val head = if (day.date == today || day.date == today.plusDays(1)) "$label · $date" else label
        val title = day.minutes.takeIf { it > 0 }?.let { "$head (${formatMinutes(it)})" } ?: head
        SectionHeader(title = title, count = day.open.size, actionLabel = stringResource(R.string.plan_add), onAction = onAdd)
    }
    items(day.open, key = { "day-${day.date}-${it.task.rowKey}" }) { row(it) }
    if (day.open.isEmpty() && (hideDone || day.done.isEmpty())) {
        item(key = "day-empty-${day.date}") { QuietLine(R.string.plan_day_empty) }
    }
    if (!hideDone && day.done.isNotEmpty()) {
        items(day.done, key = { "day-done-${day.date}-${it.task.rowKey}" }) { row(it) }
    }
}

/**
 * Sous-titre d'« À planifier » : libellé et compte ; [error] pour « À replanifier » ; avec [onToggle], la ligne
 * replie ou déplie sa liste ([expanded]).
 */
@Composable
private fun SubHeading(title: String, count: Int, error: Boolean = false, expanded: Boolean = true, onToggle: (() -> Unit)? = null) {
    val palette = cadence
    val color = if (error) palette.error else palette.onSurfaceVariant
    androidx.compose.foundation.layout.Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = if (onToggle != null) Size.touch else Size.badgeHeight)
            .then(if (onToggle != null) Modifier.clickable(role = Role.Button, onClick = onToggle) else Modifier)
            .padding(top = Space.sm, bottom = Space.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("$title · $count", style = MaterialTheme.typography.labelLarge, color = color, modifier = Modifier.weight(1f))
        if (onToggle != null) {
            Icon(
                if (expanded) Icons.Outlined.KeyboardArrowUp else Icons.Outlined.KeyboardArrowDown,
                contentDescription = null,
                tint = palette.onSurfaceVariant,
                modifier = Modifier.size(Size.icon),
            )
        }
    }
}

@Composable
private fun QuietLine(@StringRes text: Int) {
    Text(
        stringResource(text),
        style = MaterialTheme.typography.bodyMedium,
        color = cadence.onSurfaceVariant,
        modifier = Modifier.padding(vertical = Space.xs),
    )
}

/** « Planifier » : un jour des 14, un horizon, retirer du jour, ou le menu habituel de la tâche. */
@Composable
private fun PlanSheet(
    target: PlanTarget,
    days: List<LocalDate>,
    today: LocalDate,
    currentHorizon: Horizon?,
    onDay: (LocalDate) -> Unit,
    onHorizon: (Horizon) -> Unit,
    onDropCommitment: (() -> Unit)?,
    onRemove: (() -> Unit)?,
    onMore: (() -> Unit)?,
    onDismiss: () -> Unit,
) {
    val currentDay = (target as? PlanTarget.Card)?.card?.takeIf { it.planned }?.day
    CadenceSheet(title = stringResource(R.string.plan_sheet_title), subtitle = target.name, dismiss = onDismiss) {
        Column(Modifier.fillMaxWidth().padding(horizontal = Space.gutter), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
            Text(stringResource(R.string.plan_sheet_days), style = MaterialTheme.typography.labelLarge, color = cadence.onSurfaceVariant)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                days.forEach { date ->
                    val label = if (date.isAfter(today.plusDays(1))) date.format(DateTimeFormatter.ofPattern("EEE d", tasksLocale)) else dayLabel(date, today, DayLabelStyle.SHORT)
                    ChoiceChip(label = label, selected = date == currentDay, onClick = { onDay(date) })
                }
            }
            Text(stringResource(R.string.plan_sheet_horizons), style = MaterialTheme.typography.labelLarge, color = cadence.onSurfaceVariant)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                Horizon.entries.forEach { horizon ->
                    ChoiceChip(label = stringResource(horizonLabel(horizon)), selected = horizon == currentHorizon, onClick = { onHorizon(horizon) })
                }
            }
            onDropCommitment?.let { TextButton(onClick = it, modifier = Modifier.heightIn(min = Size.touch)) { Text(stringResource(R.string.plan_sheet_drop_commitment)) } }
            onRemove?.let { TextButton(onClick = it, modifier = Modifier.heightIn(min = Size.touch)) { Text(stringResource(R.string.plan_sheet_remove)) } }
            onMore?.let { TextButton(onClick = it, modifier = Modifier.heightIn(min = Size.touch)) { Text(stringResource(R.string.plan_sheet_more)) } }
        }
    }
}
