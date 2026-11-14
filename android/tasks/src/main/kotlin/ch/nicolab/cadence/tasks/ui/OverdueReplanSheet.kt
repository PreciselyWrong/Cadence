package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import ch.nicolab.cadence.designsystem.theme.Glass
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.planning.OverdueReplan
import ch.nicolab.cadence.tasks.planning.ReplanChoice
import ch.nicolab.cadence.tasks.planning.ReplanKind
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/** État d'une ligne : en cours, faite (avec son « Annuler », null pour un saut) ou en échec. */
private sealed interface RowState {
    data object Busy : RowState
    data class Done(val choice: ReplanChoice, val undo: (suspend () -> Unit)?) : RowState
    data object Failed : RowState
}

/**
 * Feuille « Replanifier les échues » d'Aujourd'hui. En tête, « Tout à demain » et « Étaler sur 7 jours » ; puis
 * chaque échue avec Aujourd'hui, Demain, Fait et « Plus… » (les cinq jours suivants avec leur charge, les horizons,
 * une date, Abandonner). Un toucher écrit tout de suite ; la ligne reste en place avec son choix et « Annuler », pour
 * que rien ne saute sous le doigt. Le titre ouvre la fiche.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun OverdueReplanSheet(
    tasks: List<TaskItem>,
    today: LocalDate,
    dayCounts: Map<LocalDate, Int>,
    onChoose: suspend (TaskItem, ReplanChoice) -> (suspend () -> Unit)?,
    onChooseMany: suspend (List<Pair<TaskItem, ReplanChoice>>) -> Map<String, suspend () -> Unit>,
    onSpread: suspend (List<TaskItem>) -> List<Pair<TaskItem, ReplanChoice>>,
    onOpen: (TaskItem) -> Unit,
    onDismiss: () -> Unit,
) {
    val palette = cadence
    val rows = remember { tasks.toList() }
    val states = remember { mutableStateMapOf<String, RowState>() }
    val scope = rememberCoroutineScope()
    var datePickFor by remember { mutableStateOf<TaskItem?>(null) }
    val days = remember(today, dayCounts) { OverdueReplan.weekDays(today, dayCounts) }

    fun run(uid: String, action: suspend () -> RowState?) {
        val before = states[uid]
        states[uid] = RowState.Busy
        scope.launch {
            val next = try {
                action()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                RowState.Failed
            }
            when {
                next == RowState.Failed && before is RowState.Done -> states[uid] = before
                next == null -> states.remove(uid)
                else -> states[uid] = next
            }
        }
    }

    /** Une action groupée ne touche que les lignes encore ouvertes. */
    fun runMany(plan: suspend (List<TaskItem>) -> List<Pair<TaskItem, ReplanChoice>>) {
        val open = rows.filter { states[it.uid] == null || states[it.uid] == RowState.Failed }
        if (open.isEmpty()) return
        open.forEach { states[it.uid] = RowState.Busy }
        scope.launch {
            try {
                val choices = plan(open)
                val undos = onChooseMany(choices)
                val chosen = choices.associate { (task, choice) -> task.uid to choice }
                open.forEach { task ->
                    val choice = chosen[task.uid]
                    val undo = undos[task.uid]
                    if (choice != null && undo != null) states[task.uid] = RowState.Done(choice, undo) else states.remove(task.uid)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                open.forEach { if (states[it.uid] == RowState.Busy) states[it.uid] = RowState.Failed }
            }
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = palette.background,
        contentColor = palette.onSurface,
        scrimColor = palette.scrim.copy(alpha = Glass.ScrimAlpha),
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = Space.gutter)) {
            Text(stringResource(R.string.overdue_replan_title), style = MaterialTheme.typography.titleLarge)
            Text(
                stringResource(R.string.overdue_replan_hint),
                style = MaterialTheme.typography.bodyMedium,
                color = palette.onSurfaceVariant,
                modifier = Modifier.padding(top = Space.xs, bottom = Space.sm),
            )
            if (rows.count { !it.isRecurring } >= 2) {
                Row(horizontalArrangement = Arrangement.spacedBy(Space.sm), modifier = Modifier.padding(bottom = Space.sm)) {
                    QuickPill(stringResource(R.string.overdue_replan_all_tomorrow), onClick = {
                        runMany { open -> OverdueReplan.allTomorrow(open, today) }
                    }, quiet = true)
                    QuickPill(stringResource(R.string.overdue_replan_spread), onClick = { runMany(onSpread) }, quiet = true)
                }
            }
            LazyColumn(Modifier.weight(1f, fill = false)) {
                items(rows, key = { it.uid }) { task ->
                    ReplanRow(
                        task = task,
                        today = today,
                        days = days,
                        state = states[task.uid],
                        onOpen = { onOpen(task) },
                        onChoose = { choice -> run(task.uid) { RowState.Done(choice, onChoose(task, choice)) } },
                        onPickDate = { datePickFor = task },
                        onUndo = { undo -> run(task.uid) { undo(); null } },
                    )
                }
            }
            TextButton(onClick = onDismiss, modifier = Modifier.align(Alignment.End).padding(vertical = Space.sm)) {
                Text(stringResource(R.string.overdue_replan_close))
            }
        }
    }
    datePickFor?.let { task ->
        TaskDatePickerDialog(
            initial = today.plusDays(OverdueReplan.WEEK_DAYS.toLong()),
            onConfirm = { date ->
                datePickFor = null
                run(task.uid) { RowState.Done(ReplanChoice.Day(date), onChoose(task, ReplanChoice.Day(date))) }
            },
            onDismiss = { datePickFor = null },
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ReplanRow(
    task: TaskItem,
    today: LocalDate,
    days: List<Pair<LocalDate, Int>>,
    state: RowState?,
    onOpen: () -> Unit,
    onChoose: (ReplanChoice) -> Unit,
    onPickDate: () -> Unit,
    onUndo: (suspend () -> Unit) -> Unit,
) {
    val palette = cadence
    val kinds = remember(task) { OverdueReplan.kinds(task) }
    var more by remember { mutableStateOf(false) }
    fun choose(choice: ReplanChoice) {
        if (state != RowState.Busy) onChoose(choice)
    }
    Column(Modifier.fillMaxWidth().padding(vertical = Space.sm)) {
        Text(
            task.name,
            style = MaterialTheme.typography.bodyLarge,
            color = if (state is RowState.Done) palette.onSurfaceVariant else palette.onSurface,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .fillMaxWidth()
                .clickable(role = Role.Button, onClick = onOpen)
                .padding(bottom = Space.sm),
        )
        if (state is RowState.Done) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "→ " + choiceText(state.choice, today, done = true),
                    style = MaterialTheme.typography.labelLarge,
                    color = palette.primary,
                    modifier = Modifier.weight(1f),
                )
                state.undo?.let { undo ->
                    TextButton(onClick = { onUndo(undo) }) { Text(stringResource(R.string.tasks_undo)) }
                }
            }
            return@Column
        }
        if (state == RowState.Failed) {
            Text(
                stringResource(R.string.overdue_replan_failed),
                style = MaterialTheme.typography.bodySmall,
                color = palette.error,
                modifier = Modifier.padding(bottom = Space.xs),
            )
        }
        val pills = Arrangement.spacedBy(Space.sm)
        FlowRow(horizontalArrangement = pills, verticalArrangement = pills) {
            if (ReplanKind.DAY in kinds) {
                QuickPill(stringResource(R.string.overdue_replan_today), { choose(ReplanChoice.Day(today)) })
                QuickPill(stringResource(R.string.overdue_replan_tomorrow), { choose(ReplanChoice.Day(today.plusDays(1))) })
            }
            QuickPill(stringResource(R.string.overdue_replan_done), { choose(ReplanChoice.Done) }, quiet = true)
            if (ReplanKind.SKIP in kinds) {
                QuickPill(stringResource(R.string.overdue_replan_skip), { choose(ReplanChoice.Skip) }, quiet = true)
            }
            if (ReplanKind.HORIZON in kinds || ReplanKind.DROP in kinds) {
                QuickPill(
                    stringResource(if (more) R.string.overdue_replan_less else R.string.overdue_replan_more),
                    { more = !more },
                    quiet = true,
                )
            }
        }
        if (more) {
            if (ReplanKind.DAY in kinds) {
                Row(
                    Modifier.padding(top = Space.sm).horizontalScroll(rememberScrollState()),
                    horizontalArrangement = pills,
                ) {
                    days.drop(2).forEach { (date, count) -> DayPill(date, count) { choose(ReplanChoice.Day(date)) } }
                }
            }
            FlowRow(Modifier.padding(top = Space.sm), horizontalArrangement = pills, verticalArrangement = pills) {
                if (ReplanKind.HORIZON in kinds) {
                    listOf(ReplanChoice.ThisWeek, ReplanChoice.NextWeek, ReplanChoice.ThisMonth, ReplanChoice.Later).forEach {
                        QuickPill(choiceText(it, today, done = false), { choose(it) }, quiet = true)
                    }
                }
                if (ReplanKind.DAY in kinds) {
                    QuickPill(stringResource(R.string.overdue_replan_pick_date), { if (state != RowState.Busy) onPickDate() }, quiet = true)
                }
                if (ReplanKind.DROP in kinds) {
                    QuickPill(stringResource(R.string.overdue_replan_drop), { choose(ReplanChoice.Drop) }, quiet = true)
                }
            }
        }
    }
}

/** Un jour de la rangée : « lun. 16 » et son nombre de tâches (« libre » sans tâche), pour choisir un jour qui a de la place. */
@Composable
private fun DayPill(date: LocalDate, count: Int, onClick: () -> Unit) {
    val palette = cadence
    Column(
        Modifier
            .widthIn(min = Size.touch)
            .heightIn(min = Size.touch)
            .clip(Radius.Pill)
            .background(palette.containerHigh)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = Space.md, vertical = Space.xs),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            date.format(DateTimeFormatter.ofPattern("EEE d", tasksLocale)),
            style = MaterialTheme.typography.labelLarge,
            color = palette.onSurface,
        )
        Text(
            if (count == 0) stringResource(R.string.overdue_replan_day_free) else pluralStringResource(R.plurals.overdue_replan_day_count, count, count),
            style = MaterialTheme.typography.labelSmall,
            color = palette.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun choiceText(choice: ReplanChoice, today: LocalDate, done: Boolean): String = when (choice) {
    is ReplanChoice.Day ->
        if (choice.date.isAfter(today.plusDays(1))) choice.date.format(DateTimeFormatter.ofPattern("EEE d", tasksLocale))
        else dayLabel(choice.date, today, DayLabelStyle.SHORT)
    ReplanChoice.ThisWeek -> stringResource(R.string.plan_horizon_week)
    ReplanChoice.NextWeek -> stringResource(R.string.plan_horizon_next_week)
    ReplanChoice.ThisMonth -> stringResource(R.string.plan_horizon_this_month)
    ReplanChoice.Later -> stringResource(R.string.overdue_replan_later)
    ReplanChoice.Done -> stringResource(if (done) R.string.overdue_replan_done_done else R.string.overdue_replan_done)
    ReplanChoice.Drop -> stringResource(if (done) R.string.overdue_replan_done_drop else R.string.overdue_replan_drop)
    ReplanChoice.Skip -> stringResource(if (done) R.string.overdue_replan_done_skip else R.string.overdue_replan_skip)
}
