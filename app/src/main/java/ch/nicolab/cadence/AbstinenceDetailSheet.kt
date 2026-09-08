package ch.nicolab.cadence

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.domain.*
import ch.nicolab.cadence.ui.components.*
import ch.nicolab.cadence.ui.theme.Size
import ch.nicolab.cadence.ui.theme.Space
import ch.nicolab.cadence.ui.theme.cadence
import ch.nicolab.cadence.ui.theme.habitAccent
import java.time.Instant
import java.time.format.DateTimeFormatter
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun AbstinenceDetailSheet(
    item: HabitCardState,
    dismiss: () -> Unit,
    onCheckIn: () -> Unit,
    onUrge: (Int, String?, () -> Unit) -> Unit,
    onRecordOccurrence: (String?, () -> Unit) -> Unit,
    onCorrectOccurrence: (HabitEntry) -> Unit,
    onDeleteLog: (String, () -> Unit) -> Unit,
    onEdit: () -> Unit,
    busy: Boolean = false,
    error: String? = null,
) {
    var tab by rememberSaveable(item.stored.id) { mutableIntStateOf(0) }
    var form by rememberSaveable(item.stored.id) { mutableStateOf<String?>(null) }
    var deleting by remember { mutableStateOf<String?>(null) }
    var visibleCount by rememberSaveable(item.stored.id) { mutableIntStateOf(20) }
    val accent = cadence.habitAccent(item.stored.colorArgb)
    val enabled = !busy && !item.evaluation.isPaused
    val summary = item.abstinenceJournalSummary
    val rows = remember(item.abstinenceLogs, item.recentEntries) {
        (item.abstinenceLogs.map { JournalRow(it.occurredAt, log = it) } +
            item.recentEntries.map { JournalRow(it.occurredAt, entry = it) }).sortedByDescending { it.at }
    }
    CadenceSheet(item.stored.name, stringResource(abstinenceProfileLabel(item.stored.abstinenceProfile)),
        dismiss = { if (!busy) dismiss() }) {
        FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center,
            verticalArrangement = Arrangement.spacedBy(Space.xs)) {
            listOf(R.string.abst_overview, R.string.abst_support, R.string.abst_journal).forEachIndexed { index, label ->
                ChoiceChip(stringResource(label), tab == index, Modifier.heightIn(min = Size.touch), accent) { tab = index }
            }
        }
        Spacer(Modifier.height(Space.lg))
        LazyColumn(Modifier.weight(1f).heightIn(max = Size.sheetContent),
            verticalArrangement = Arrangement.spacedBy(Space.lg)) {
            if (error != null) item { ErrorText(error) }
            when (tab) {
                0 -> {
                    item { item.abstinenceStats?.let { AbstinenceSummary(it, accent, centered = true) } }
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                            PrimaryAction(stringResource(if (summary?.checkedInToday == true) R.string.abst_checkin_done else R.string.abst_checkin),
                                Modifier.fillMaxWidth(), accent, enabled && summary?.checkedInToday != true, onCheckIn)
                            Text(stringResource(R.string.abst_checkin_help), style = MaterialTheme.typography.bodySmall, color = cadence.inkMuted)
                            SecondaryAction(stringResource(R.string.abst_urge), Modifier.fillMaxWidth(), enabled) { form = "urge" }
                            if (item.evaluation.isPaused) Text(stringResource(R.string.abst_pause_help), color = cadence.inkMuted)
                        }
                    }
                    item.stored.description?.takeIf(String::isNotBlank)?.let { reason -> item {
                        Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                            Text(stringResource(R.string.abst_reason), style = MaterialTheme.typography.titleSmall, color = accent)
                            Text(reason, style = MaterialTheme.typography.bodyLarge)
                        }
                    } }
                    item { JournalCounts(item) }
                    val days = item.abstinenceStats?.currentDays ?: 0L
                    val next = AbstinenceGuide.milestones(item.stored.abstinenceProfile).firstOrNull { !it.reached(days) }
                    next?.let { milestone -> item {
                        Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                            val label = milestone.timeLabel?.let { stringResource(it) }
                                ?: stringResource(R.string.abstinence_milestone_day, milestone.days)
                            Text(stringResource(R.string.abst_home_next, label), style = MaterialTheme.typography.titleSmall, color = accent)
                            LinearProgressIndicator(progress = { (days.toFloat() / milestone.days).coerceIn(0f, 1f) },
                                modifier = Modifier.fillMaxWidth(), color = accent, trackColor = cadence.sunken)
                            Text(stringResource(if (milestone.scientific) R.string.abstinence_scientific else R.string.abstinence_personal),
                                style = MaterialTheme.typography.labelMedium, color = cadence.inkMuted)
                            Text(stringResource(milestone.detail), style = MaterialTheme.typography.bodyMedium)
                            TextButton(onClick = { tab = 1 }) { Text(stringResource(R.string.abst_support)) }
                        }
                    } }
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                            Text(stringResource(R.string.abstinence_assumption), style = MaterialTheme.typography.bodySmall, color = cadence.inkMuted)
                            TextButton(enabled = enabled, onClick = { form = "occurrence" }, modifier = Modifier.fillMaxWidth()) {
                                Text(stringResource(R.string.abst_occurrence_title))
                            }
                        }
                    }
                }
                1 -> {
                    item { AbstinenceGuidance(item.stored.abstinenceProfile, accent) }
                    item { Text(stringResource(R.string.abst_no_promises), style = MaterialTheme.typography.bodySmall, color = cadence.inkMuted) }
                    item { AbstinenceMilestones(item.stored.abstinenceProfile, item.abstinenceStats?.currentDays ?: 0L, accent) }
                }
                else -> {
                    item { JournalCounts(item) }
                    if (rows.isEmpty()) item { Text(stringResource(R.string.abst_journal_empty), color = cadence.inkMuted) }
                    items(rows.take(visibleCount), key = { it.log?.let { log -> "log:${log.id}" } ?: "entry:${it.entry!!.id}" }) { row ->
                        val log = row.log
                        val entry = row.entry
                        val zone = log?.observedZoneId ?: entry!!.observedZoneId
                        Column(verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                            Text(when {
                                log?.kind == AbstinenceLogKind.CHECK_IN -> stringResource(R.string.abst_journal_checkin)
                                log != null -> stringResource(R.string.abst_journal_urge, log.intensity ?: 0)
                                else -> stringResource(R.string.abst_journal_occurrence)
                            }, style = MaterialTheme.typography.titleSmall, color = accent)
                            Text(row.at.atZone(zone).format(DateTimeFormatter.ofPattern("d MMM yyyy · HH:mm", Locale.FRENCH)),
                                style = MaterialTheme.typography.bodySmall, color = cadence.inkMuted)
                            (log?.note ?: entry?.note)?.takeIf(String::isNotBlank)?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
                            TextButton(enabled = !busy, onClick = { if (log != null) deleting = log.id else onCorrectOccurrence(entry!!) }) {
                                Text(stringResource(if (log != null) R.string.abst_journal_delete else R.string.abst_journal_correct))
                            }
                        }
                    }
                    if (rows.size > visibleCount) item {
                        TertiaryAction(stringResource(R.string.abst_journal_more)) { visibleCount += 20 }
                    }
                }
            }
        }
        Spacer(Modifier.height(Space.sm))
        TextButton(enabled = !busy, onClick = onEdit) { Text(stringResource(R.string.abst_edit)) }
    }
    form?.let { kind ->
        JournalForm(kind == "urge", busy, error, dismiss = { form = null }) { intensity, note ->
            val saved = { form = null }
            if (kind == "urge") onUrge(intensity, note, saved) else onRecordOccurrence(note, saved)
        }
    }
    deleting?.let { id ->
        AlertDialog(onDismissRequest = { if (!busy) deleting = null }, containerColor = cadence.surface,
            titleContentColor = cadence.ink, textContentColor = cadence.inkMuted,
            title = { Text(stringResource(R.string.abst_journal_delete_title)) },
            text = { Column { Text(stringResource(R.string.abst_journal_delete_help)); error?.let { ErrorText(it) } } },
            confirmButton = { TextButton(enabled = !busy, onClick = { onDeleteLog(id) { deleting = null } }) { Text(stringResource(R.string.abst_journal_delete)) } },
            dismissButton = { TextButton(enabled = !busy, onClick = { deleting = null }) { Text(stringResource(R.string.form_btn_cancel)) } })
    }
}

private data class JournalRow(val at: Instant, val log: AbstinenceLog? = null, val entry: HabitEntry? = null)

@Composable
private fun JournalCounts(item: HabitCardState) {
    val summary = item.abstinenceJournalSummary ?: return
    Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
        Text(stringResource(R.string.abst_journal_window), style = MaterialTheme.typography.labelMedium, color = cadence.inkMuted)
        Text(stringResource(R.string.abst_journal_counts, summary.checkInDays30, summary.urgeCount30), style = MaterialTheme.typography.bodyLarge)
        Text(stringResource(R.string.abst_journal_strong, summary.strongUrges30), style = MaterialTheme.typography.bodySmall, color = cadence.inkMuted)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun JournalForm(urge: Boolean, busy: Boolean, error: String?, dismiss: () -> Unit, save: (Int, String?) -> Unit) {
    var intensity by rememberSaveable { mutableIntStateOf(3) }
    var note by rememberSaveable { mutableStateOf("") }
    AlertDialog(onDismissRequest = { if (!busy) dismiss() }, containerColor = cadence.surface,
        titleContentColor = cadence.ink, textContentColor = cadence.inkMuted,
        title = { Text(stringResource(if (urge) R.string.abst_urge else R.string.abst_occurrence_title)) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(Space.md)) {
                Text(stringResource(if (urge) R.string.abst_urge_help else R.string.abst_occurrence_help))
                if (urge) {
                    Text(stringResource(R.string.abst_urge_intensity))
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
                        (1..5).forEach { value -> ChoiceChip(value.toString(), intensity == value, Modifier.heightIn(min = Size.touch)) { if (!busy) intensity = value } }
                    }
                    Text(stringResource(R.string.abst_urge_scale), style = MaterialTheme.typography.bodySmall)
                    Text(stringResource(R.string.abst_urge_tip))
                }
                CadenceField(note, { if (!busy) note = it.take(500) }, stringResource(if (urge) R.string.abst_urge_note else R.string.abst_occurrence_note))
                error?.let { ErrorText(it) }
            }
        },
        confirmButton = { TextButton(enabled = !busy, onClick = { save(intensity, note.trim().ifBlank { null }) }) {
            Text(stringResource(if (busy) R.string.abst_setup_saving else if (urge) R.string.abst_urge_save else R.string.abst_occurrence_save))
        } },
        dismissButton = { TextButton(enabled = !busy, onClick = dismiss) { Text(stringResource(R.string.form_btn_cancel)) } })
}
