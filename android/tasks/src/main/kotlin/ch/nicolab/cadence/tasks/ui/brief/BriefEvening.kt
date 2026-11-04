package ch.nicolab.cadence.tasks.ui.brief

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
                    EveningTask(task, context, subtitle = entry.minutes?.let { durationLabel(it) }, carryable = entry.taskUid in evening.carryOver)
                }
            }
        }
    }

    val done = evening.done.mapNotNull { context.tasks[it] }
    if (done.isNotEmpty()) {
        item(key = "evening-done") {
            BriefSection(stringResource(R.string.evening_done_title), evening.counters.done.takeIf { it > 0 }?.toString()) {
                done.forEach { task -> EveningTask(task, context, subtitle = null, carryable = false) }
            }
        }
    }

    if (evening.slipped.isNotEmpty()) {
        item(key = "evening-slipped") {
            BriefSection(stringResource(R.string.evening_slipped_title), evening.counters.slipped.takeIf { it > 0 }?.toString()) {
                evening.slipped.forEach { entry ->
                    val task = context.tasks[entry.taskUid] ?: return@forEach
                    EveningTask(task, context, subtitle = entry.reason.ifBlank { null }, carryable = entry.taskUid in evening.carryOver)
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
 * Ligne du bilan : se coche à l'instant ; « Reporter à demain » se remplace par « Reporté à demain » dès l'appui. Pas de
 * report pour une tâche déjà terminée.
 */
@Composable
private fun EveningTask(task: TaskItem, context: EveningContext, subtitle: String?, carryable: Boolean) {
    val carried = task.uid in context.pending.carried
    Column(Modifier.animateContentSize()) {
        BriefTaskRow(
            task = task,
            today = context.today,
            zone = context.zone,
            pending = context.pending,
            subtitle = subtitle,
            onOpen = context.onOpen,
            onToggle = { context.onToggle(task) },
        )
        if (carryable && !task.isClosed && !context.pending.isCompleting(task.uid)) {
            Row(Modifier.fillMaxWidth().padding(start = RowContentInset)) {
                if (carried) {
                    DecisionTag(stringResource(R.string.evening_carried))
                } else {
                    TertiaryAction(stringResource(R.string.evening_carry), onClick = { context.onCarry(listOf(task.uid)) })
                }
            }
        }
    }
}
