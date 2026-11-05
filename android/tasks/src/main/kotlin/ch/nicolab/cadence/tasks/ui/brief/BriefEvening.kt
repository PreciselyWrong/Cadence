package ch.nicolab.cadence.tasks.ui.brief

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.brief.EveningDto
import ch.nicolab.cadence.tasks.model.TaskItem
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.serialization.json.JsonObject

/** Ce que le bilan du soir lit ou fait, comme [BriefContext] pour le résumé du matin. */
internal class EveningContext(
    val date: LocalDate,
    val today: LocalDate,
    val zone: ZoneId,
    val tasks: Map<String, TaskItem>,
    val settings: JsonObject?,
    val pending: BriefPending,
    val onOpen: (TaskItem) -> Unit,
    /** Termine une tâche ouverte (avec « Annuler »), rouvre une tâche terminée. */
    val onToggle: (TaskItem) -> Unit,
    val onCarry: (List<String>) -> Unit,
    /** Ouvre la feuille de date pour la tâche. */
    val onPickDate: (TaskItem) -> Unit,
    val onLater: (TaskItem) -> Unit,
    val onAbandon: (TaskItem) -> Unit,
    /** Le résumé du matin existe : le lien « Voir le résumé du matin » s'affiche. */
    val hasMorning: Boolean,
    val onShowMorning: () -> Unit,
    val audio: @Composable () -> Unit,
)

/**
 * Bilan du soir, dans l'ordre : verdict et compteurs, ce qui reste pour ce soir, ce qui est fait, ce qui a glissé, demain.
 * Les tâches viennent de Room ; une section vide n'est pas montrée.
 */
internal fun LazyListScope.eveningSections(evening: EveningDto, context: EveningContext) {
    item(key = "evening-header") { EveningHeader(evening, context) }

    if (evening.tonight.isNotEmpty()) {
        item(key = "evening-tonight") {
            val counters = evening.counters
            val detail = counters.capacityMinutes?.let {
                stringResource(R.string.brief_tonight_detail, durationLabel(counters.tonightMinutes), durationLabel(it))
            } ?: durationLabel(counters.tonightMinutes)
            BriefSection(stringResource(R.string.evening_tonight_title), detail) {
                evening.tonight.forEach { entry ->
                    val task = context.tasks[entry.taskUid] ?: return@forEach
                    EveningTask(task, context, subtitle = entry.minutes?.let { durationLabel(it) }, actionable = true)
                }
            }
        }
    }

    val done = evening.done.mapNotNull { context.tasks[it] }
    if (done.isNotEmpty()) {
        item(key = "evening-done") {
            BriefSection(stringResource(R.string.evening_done_title), evening.counters.done.takeIf { it > 0 }?.toString()) {
                done.forEach { task -> EveningTask(task, context, subtitle = null, actionable = false) }
            }
        }
    }

    if (evening.slipped.isNotEmpty()) {
        item(key = "evening-slipped") {
            BriefSection(stringResource(R.string.evening_slipped_title), evening.counters.slipped.takeIf { it > 0 }?.toString()) {
                evening.slipped.forEach { entry ->
                    val task = context.tasks[entry.taskUid] ?: return@forEach
                    EveningTask(task, context, subtitle = entry.reason.ifBlank { null }, actionable = true)
                }
            }
        }
    }

    evening.tomorrow?.let { day ->
        item(key = "evening-tomorrow") {
            BriefSection(stringResource(R.string.evening_tomorrow_title), null) {
                BriefTimelineSection(listOf(day), context.today, context.settings)
            }
        }
    }
}

@Composable
private fun EveningHeader(evening: EveningDto, context: EveningContext) {
    val palette = cadence
    Column(Modifier.fillMaxWidth().padding(bottom = Space.md)) {
        Text(BriefFormat.longDate(context.date), style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant)
        Text(
            evening.verdict.text,
            style = MaterialTheme.typography.headlineSmall,
            color = palette.onSurface,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(top = Space.xs),
        )
        Row(Modifier.padding(top = Space.md), verticalAlignment = Alignment.CenterVertically) {
            Text(
                countLine(R.string.evening_done_count, evening.counters.done),
                style = MaterialTheme.typography.bodyMedium,
                color = palette.onSurfaceVariant,
            )
            Spacer(Modifier.width(Space.lg))
            Text(
                countLine(R.string.evening_slipped_count, evening.counters.slipped),
                style = MaterialTheme.typography.bodyMedium,
                color = palette.onSurfaceVariant,
            )
        }
        context.audio()
        if (context.hasMorning) TertiaryAction(stringResource(R.string.evening_show_morning), onClick = context.onShowMorning)
    }
}

/**
 * Ligne du bilan : se coche à l'instant ; « … » ouvre Demain, Choisir une date, Plus tard, Abandonner. Dès qu'un choix est
 * fait, « … » laisse la place à son étiquette (« Demain », « Échéance : jeu 6 »…) et une tâche abandonnée est barrée.
 * Pas de choix pour une tâche déjà terminée.
 */
@Composable
private fun EveningTask(task: TaskItem, context: EveningContext, subtitle: String?, actionable: Boolean) {
    val outcome = context.pending.outcome(task.uid)
    val open = actionable && !task.isClosed && !context.pending.isCompleting(task.uid)
    Column(Modifier.animateContentSize()) {
        BriefTaskRow(
            task = task,
            today = context.today,
            zone = context.zone,
            pending = context.pending,
            subtitle = subtitle,
            onOpen = context.onOpen,
            onToggle = { context.onToggle(task) },
            forceClosed = outcome == RowOutcome.Abandoned,
            trailing = if (open && outcome == null) ({ EveningMenu(task, context) }) else null,
        )
        if (outcome != null && !context.pending.isCompleting(task.uid)) {
            Row(Modifier.fillMaxWidth().padding(start = RowContentInset)) {
                DecisionTag(outcomeLabel(outcome))
            }
        }
    }
}

@Composable
private fun outcomeLabel(outcome: RowOutcome): String = when (outcome) {
    RowOutcome.Tomorrow -> stringResource(R.string.evening_outcome_tomorrow)
    is RowOutcome.Due -> stringResource(R.string.evening_outcome_due, BriefFormat.dueChip(outcome.day))
    RowOutcome.Later -> stringResource(R.string.evening_outcome_later)
    RowOutcome.Abandoned -> stringResource(R.string.evening_outcome_abandoned)
}

@Composable
private fun EveningMenu(task: TaskItem, context: EveningContext) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { expanded = true }) {
            Icon(
                Icons.Outlined.MoreHoriz,
                contentDescription = stringResource(R.string.evening_more),
                tint = cadence.onSurfaceVariant,
            )
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            // A recurring task's due date belongs to its series: no single-date choice here.
            listOfNotNull<Pair<Int, () -> Unit>>(
                R.string.evening_action_tomorrow to { context.onCarry(listOf(task.uid)) },
                if (task.isRecurring) null else R.string.evening_action_date to { context.onPickDate(task) },
                R.string.evening_action_later to { context.onLater(task) },
                R.string.evening_action_abandon to { context.onAbandon(task) },
            ).forEach { (label, action) ->
                DropdownMenuItem(
                    text = { Text(stringResource(label)) },
                    onClick = {
                        expanded = false
                        action()
                    },
                )
            }
        }
    }
}
