package ch.nicolab.cadence

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.TrendingUp
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.material.icons.outlined.EventBusy
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.ErrorText
import ch.nicolab.cadence.designsystem.components.MetricCard
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.designsystem.theme.habitAccent
import ch.nicolab.cadence.domain.AbstinenceLapseSummary

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AbstinenceDetailSheet(
    item: HabitCardState,
    dismiss: () -> Unit,
    onRecordOccurrence: (() -> Unit) -> Unit,
    onEdit: () -> Unit,
    busy: Boolean = false,
    error: String? = null,
) {
    var confirmingOccurrence by remember { mutableStateOf(false) }
    val accent = cadence.habitAccent(item.stored.colorArgb)
    val occurrenceAction = AbstinenceGuide.occurrenceAction(item.stored.abstinenceProfile)
    val enabled = !busy && !item.evaluation.isPaused
    val milestones = AbstinenceGuide.milestones(item.stored.abstinenceProfile)

    CadenceSheet(item.stored.name, null, dismiss = { if (!busy) dismiss() }) {
        LazyColumn(
            Modifier.weight(1f, fill = false).heightIn(max = Size.sheetContent),
            verticalArrangement = Arrangement.spacedBy(Space.xl),
        ) {
            if (error != null) item { ErrorText(error) }
            item { LiveAbstinenceCounter(item, accent) }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                    SecondaryAction(stringResource(occurrenceAction), Modifier.fillMaxWidth(), enabled) {
                        confirmingOccurrence = true
                    }
                    Text(
                        stringResource(R.string.abst_occurrence_help),
                        style = MaterialTheme.typography.bodySmall,
                        color = cadence.onSurfaceVariant,
                    )
                    if (item.evaluation.isPaused) {
                        Text(stringResource(R.string.abst_pause_help), color = cadence.onSurfaceVariant)
                    }
                }
            }
            item {
                val stats = item.abstinenceStats
                // Sans économies suivies, la place des économies revient à ces trois chiffres.
                if (item.alcoholStats == null && item.stored.abstinenceSpendingMinor == null && stats != null) {
                    LapseSummaryRow(AbstinenceLapseSummary.of(stats))
                }
            }
            item {
                if (milestones.isEmpty()) {
                    AbstinenceEvidenceEmpty(item.stored.abstinenceProfile)
                } else {
                    AbstinenceMilestones(
                        item.stored.abstinenceProfile,
                        item.abstinenceStats?.currentDays ?: 0L,
                    )
                }
            }
            item {
                Text(
                    stringResource(R.string.abstinence_assumption),
                    style = MaterialTheme.typography.bodySmall,
                    color = cadence.onSurfaceVariant,
                )
            }
        }
        Spacer(Modifier.height(Space.sm))
        TextButton(enabled = !busy, onClick = onEdit) { Text(stringResource(R.string.abst_edit)) }
    }

    if (confirmingOccurrence) {
        AlertDialog(
            onDismissRequest = { if (!busy) confirmingOccurrence = false },
            containerColor = cadence.card,
            titleContentColor = cadence.onSurface,
            textContentColor = cadence.onSurfaceVariant,
            title = { Text(stringResource(occurrenceAction)) },
            text = { Text(stringResource(R.string.abst_occurrence_confirm_help)) },
            confirmButton = {
                TextButton(enabled = !busy, onClick = {
                    onRecordOccurrence { confirmingOccurrence = false }
                }) { Text(stringResource(if (busy) R.string.abst_setup_saving else R.string.abst_occurrence_save)) }
            },
            dismissButton = {
                TextButton(enabled = !busy, onClick = { confirmingOccurrence = false }) {
                    Text(stringResource(R.string.form_btn_cancel))
                }
            },
        )
    }
}

@Composable
private fun LapseSummaryRow(summary: AbstinenceLapseSummary) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
        MetricCard(
            value = stringResource(R.string.abst_lapse_days, summary.recordDays),
            label = stringResource(R.string.abst_lapse_record),
            modifier = Modifier.weight(1f),
            icon = Icons.Outlined.EmojiEvents,
        )
        MetricCard(
            value = summary.averageGapDays?.let { stringResource(R.string.abst_lapse_days, it) }
                ?: stringResource(R.string.abst_lapse_none),
            label = stringResource(R.string.abst_lapse_average),
            modifier = Modifier.weight(1f),
            icon = Icons.AutoMirrored.Outlined.TrendingUp,
        )
        MetricCard(
            value = summary.lapsesLast30Days.toString(),
            label = stringResource(R.string.abst_lapse_last_30),
            modifier = Modifier.weight(1f),
            icon = Icons.Outlined.EventBusy,
            iconTint = cadence.error,
        )
    }
}
