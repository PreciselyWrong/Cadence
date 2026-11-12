@file:OptIn(ExperimentalLayoutApi::class, androidx.compose.material3.ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.EventNote
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.ChoiceChip
import ch.nicolab.cadence.designsystem.components.RowGroup
import ch.nicolab.cadence.designsystem.components.SettingRow
import ch.nicolab.cadence.designsystem.components.rowGroupShape
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.model.Funnel
import ch.nicolab.cadence.tasks.model.FunnelStage
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.review.PostponementEntries
import ch.nicolab.cadence.tasks.review.PostponementKind
import ch.nicolab.cadence.tasks.review.Postponements
import java.time.LocalDate
import java.time.format.DateTimeFormatter

private val reviewDay: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMM", tasksLocale)

internal fun formatReviewDay(day: LocalDate): String = day.format(reviewDay)

@androidx.annotation.StringRes
internal fun funnelLabel(stage: FunnelStage): Int = when (stage) {
    FunnelStage.IN_VIEW -> R.string.funnel_in_view
    FunnelStage.THIS_WEEK -> R.string.funnel_this_week
    FunnelStage.LATER -> R.string.funnel_later
}

/**
 * Puces En vue / Cette semaine / Plus tard de la fiche, puis la date de réexamen, visible seulement
 * pour une tâche mise de côté ou qui en a déjà une. Rien ici n'est une échéance.
 */
@Composable
internal fun FunnelSection(
    task: TaskItem,
    weekStart: LocalDate,
    today: LocalDate,
    onToggle: (FunnelStage) -> Unit,
    onReviewOn: (LocalDate?) -> Unit,
) {
    var picking by remember { mutableStateOf(false) }
    val palette = cadence
    Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
            FunnelStage.entries.forEach { stage ->
                ChoiceChip(
                    label = stringResource(funnelLabel(stage)),
                    selected = Funnel.has(task, stage, weekStart),
                    leadingIcon = funnelIcon(stage),
                    onClick = { onToggle(stage) },
                )
            }
        }
        if (task.someday || task.reviewOn != null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Row(
                    Modifier
                        .weight(1f)
                        .heightIn(min = Size.touch)
                        .clickable(role = Role.Button) { picking = true }
                        .padding(vertical = Space.xs),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Outlined.EventNote, null, tint = palette.onSurfaceVariant, modifier = Modifier.size(Size.iconSm))
                    Spacer(Modifier.width(Space.sm))
                    Text(
                        task.reviewOn?.let { stringResource(R.string.funnel_review_on, formatReviewDay(it)) }
                            ?: stringResource(R.string.funnel_review_on_pick),
                        style = MaterialTheme.typography.bodyMedium,
                        color = palette.onSurfaceVariant,
                    )
                }
                if (task.reviewOn != null) {
                    // Cible de 48 dp : l'icône seule (20 dp) se ratait au doigt.
                    IconButton(onClick = { onReviewOn(null) }) {
                        Icon(
                            Icons.Outlined.Close,
                            contentDescription = stringResource(R.string.funnel_review_on_clear),
                            tint = palette.outline,
                            modifier = Modifier.size(Size.icon),
                        )
                    }
                }
            }
        }
    }
    if (picking) {
        TaskDatePickerDialog(
            initial = task.reviewOn ?: today.plusDays(30),
            onConfirm = { picking = false; onReviewOn(it) },
            onDismiss = { picking = false },
        )
    }
}

/**
 * Une ligne grise une fois la tâche déplacée (« Déplacée 4 fois, 2 ces 30 derniers jours · 28 oct. »),
 * l'historique au toucher. Lue en ligne, dernière lecture hors ligne ; rien sans serveur.
 */
@Composable
internal fun PostponementLine(taskUid: String, version: Any?) {
    val context = LocalContext.current
    val review = remember(context) { TasksGraph.review(context) }
    var history by remember(taskUid) { mutableStateOf<Postponements?>(null) }
    var open by remember { mutableStateOf(false) }
    LaunchedEffect(taskUid, version) {
        review.postponements(taskUid).onSuccess { history = it.value }
    }
    val current = history?.takeIf { it.shown } ?: return
    val palette = cadence
    val summary = pluralStringResource(R.plurals.history_summary, current.totalCount, current.totalCount, current.recentCount)
    Text(
        current.lastPostponedOn?.let { stringResource(R.string.history_last, summary, formatReviewDay(it)) } ?: summary,
        style = MaterialTheme.typography.labelMedium,
        color = palette.outline,
        modifier = Modifier
            .fillMaxWidth()
            .clickable { open = true }
            .padding(vertical = Space.xs),
    )
    if (open) {
        val entries = remember(current) { PostponementEntries.of(current) }
        CadenceSheet(title = stringResource(R.string.history_title), subtitle = summary, dismiss = { open = false }) {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                RowGroup {
                    entries.forEachIndexed { index, entry ->
                        val move = if (entry.kind != PostponementKind.MISSED && (entry.from != null || entry.to != null)) {
                            stringResource(
                                R.string.history_move,
                                entry.from?.let(::formatReviewDay) ?: "—",
                                entry.to?.let(::formatReviewDay) ?: "—",
                            )
                        } else null
                        SettingRow(
                            title = stringResource(historyLabel(entry.kind)),
                            subtitle = listOfNotNull(formatReviewDay(entry.at), move).joinToString(" · "),
                            shape = rowGroupShape(index, entries.size),
                        )
                    }
                }
            }
        }
    }
}

private fun historyLabel(kind: PostponementKind): Int = when (kind) {
    PostponementKind.POSTPONED -> R.string.history_postponed
    PostponementKind.RESCHEDULED -> R.string.history_rescheduled
    PostponementKind.UNSCHEDULED -> R.string.history_unscheduled
    PostponementKind.ADVANCED -> R.string.history_advanced
    PostponementKind.MISSED -> R.string.history_missed
}
