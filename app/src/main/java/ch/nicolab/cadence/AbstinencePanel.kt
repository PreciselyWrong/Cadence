package ch.nicolab.cadence

import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.domain.AbstinenceProfile
import ch.nicolab.cadence.domain.AbstinenceStats
import ch.nicolab.cadence.ui.components.Panel
import ch.nicolab.cadence.ui.components.HabitFacet
import ch.nicolab.cadence.ui.icon.HabitIconRegistry
import ch.nicolab.cadence.ui.theme.Size
import ch.nicolab.cadence.ui.theme.Space
import ch.nicolab.cadence.ui.theme.cadence
import ch.nicolab.cadence.ui.theme.habitAccent

fun abstinenceProfileLabel(profile: AbstinenceProfile): Int = AbstinenceGuide.content(profile).label

@Composable
fun AbstinenceHomeCard(item: HabitCardState, onOpen: () -> Unit, onLongClick: () -> Unit) {
    val accent = cadence.habitAccent(item.stored.colorArgb)
    val next = AbstinenceGuide.milestones(item.stored.abstinenceProfile)
        .firstOrNull { !it.reached(item.abstinenceStats?.currentDays ?: 0L) }
    Panel(onClick = onOpen, onLongClick = onLongClick) {
        Column(verticalArrangement = Arrangement.spacedBy(Space.md)) {
            Row(horizontalArrangement = Arrangement.spacedBy(Space.md), verticalAlignment = Alignment.CenterVertically) {
                HabitFacet(
                    icon = HabitIconRegistry.getIcon(item.stored.iconId).imageVector,
                    label = null,
                    progress = 0f,
                    tint = accent,
                    trackColor = cadence.sunken,
                    size = Size.badge,
                )
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                    Text(item.stored.name, style = MaterialTheme.typography.titleMedium, color = cadence.ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text(stringResource(abstinenceProfileLabel(item.stored.abstinenceProfile)), style = MaterialTheme.typography.labelMedium, color = cadence.inkMuted)
                }
            }
            Text(abstinenceStatus(item), style = MaterialTheme.typography.headlineSmall, color = accent)
            Text(stringResource(when {
                item.evaluation.isPaused -> R.string.abstinence_today_paused
                item.abstinenceJournalSummary?.checkedInToday == true -> R.string.catalogue_home_checked_in
                else -> R.string.catalogue_home_check_in
            }), style = MaterialTheme.typography.bodyMedium, color = cadence.inkMuted)
            next?.let {
                Text(stringResource(R.string.catalogue_home_next, milestoneTime(it)), style = MaterialTheme.typography.bodySmall, color = cadence.inkMuted)
            }
        }
    }
}

@Composable
private fun milestoneTime(milestone: AbstinenceMilestone): String =
    milestone.timeLabel?.let { stringResource(it) }
        ?: stringResource(R.string.abstinence_milestone_day, milestone.days)

@Composable
fun abstinenceStatus(item: HabitCardState): String = when {
    item.evaluation.isPaused -> stringResource(R.string.abstinence_today_paused)
    item.evaluation.progressMinor > 0 -> stringResource(R.string.abstinence_today_event)
    else -> stringResource(R.string.abstinence_days, item.abstinenceStats?.currentDays ?: 0L)
}

@Composable
fun AbstinenceSummary(stats: AbstinenceStats, accent: Color, centered: Boolean = false) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Space.sm),
        horizontalAlignment = if (centered) Alignment.CenterHorizontally else Alignment.Start,
    ) {
        Text(stringResource(R.string.abstinence_days, stats.currentDays), style = MaterialTheme.typography.headlineMedium, color = accent)
        Text(stringResource(R.string.abstinence_current), style = MaterialTheme.typography.bodySmall, color = cadence.inkMuted,
            textAlign = if (centered) TextAlign.Center else TextAlign.Start)
        Text(stringResource(R.string.abstinence_best, stats.bestDays), style = MaterialTheme.typography.bodyMedium, color = cadence.ink)
        Text(stringResource(when {
            stats.isPaused -> R.string.abstinence_today_paused
            stats.todayHasOccurrence -> R.string.abstinence_today_event
            else -> R.string.abstinence_today_clear
        }), style = MaterialTheme.typography.bodySmall, color = cadence.inkMuted)
    }
}

@Composable
fun AbstinencePanel(item: HabitCardState, accent: Color) {
    val stats = item.abstinenceStats ?: return
    val milestones = AbstinenceGuide.milestones(item.stored.abstinenceProfile)
    val recent = listOfNotNull(
        milestones.lastOrNull { it.reached(stats.currentDays) },
        milestones.firstOrNull { !it.reached(stats.currentDays) },
    )
    Column(verticalArrangement = Arrangement.spacedBy(Space.lg)) {
        AbstinenceSummary(stats, accent)
        Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
            Text(stringResource(R.string.abstinence_window), style = MaterialTheme.typography.titleSmall, color = cadence.ink)
            if (stats.observedDays30 == 0) {
                Text(stringResource(R.string.abstinence_no_days), style = MaterialTheme.typography.bodyMedium, color = cadence.inkMuted)
            } else {
                Text(stringResource(R.string.abstinence_clear_days, stats.clearDays30, stats.observedDays30), style = MaterialTheme.typography.bodyLarge, color = accent)
                Text(stringResource(R.string.abstinence_events, stats.occurrences30, stats.occurrenceDays30), style = MaterialTheme.typography.bodySmall, color = cadence.inkMuted)
            }
        }
        Text(stringResource(R.string.abstinence_assumption), style = MaterialTheme.typography.bodySmall, color = cadence.inkMuted)
        recent.forEach { MilestoneItem(it, stats.currentDays, accent, expanded = false) }
    }
}

@Composable
fun AbstinenceMilestones(profile: AbstinenceProfile, currentDays: Long, accent: Color) {
    val milestones = AbstinenceGuide.milestones(profile)
    if (milestones.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(Space.lg)) {
        Text(stringResource(R.string.abstinence_milestones), style = MaterialTheme.typography.titleMedium, color = cadence.ink)
        milestones.forEach { milestone ->
            MilestoneItem(milestone, currentDays, accent, expanded = true)
        }
    }
}

@Composable
private fun MilestoneItem(milestone: AbstinenceMilestone, currentDays: Long, accent: Color, expanded: Boolean) {
    Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
        Text(milestoneTime(milestone), style = MaterialTheme.typography.titleLarge, color = accent)
        Text(stringResource(if (milestone.reached(currentDays)) R.string.abstinence_reached else R.string.abstinence_upcoming), style = MaterialTheme.typography.labelMedium, color = cadence.inkMuted)
        Text(stringResource(if (milestone.scientific) R.string.abstinence_scientific else R.string.abstinence_personal), style = MaterialTheme.typography.labelMedium, color = cadence.ink)
        if (expanded) {
            Text(stringResource(milestone.detail), style = MaterialTheme.typography.bodyMedium, color = cadence.inkMuted)
            milestone.sources.forEach { SourceLink(it) }
        }
    }
}

@Composable
fun AbstinenceGuidance(profile: AbstinenceProfile, accent: Color) {
    if (profile == AbstinenceProfile.NONE) return
    val content = AbstinenceGuide.content(profile)
    Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
        Text(stringResource(R.string.abstinence_tips), style = MaterialTheme.typography.titleSmall, color = accent)
        Text(stringResource(content.tip), style = MaterialTheme.typography.bodyMedium, color = cadence.inkMuted)
        content.notice?.let { Text(stringResource(it), style = MaterialTheme.typography.bodyMedium, color = cadence.ink) }
        content.sources.forEach { SourceLink(it) }
    }
}

@Composable
private fun SourceLink(source: EvidenceSource) {
    val handler = LocalUriHandler.current
    val context = LocalContext.current
    val unavailable = stringResource(R.string.abstinence_source_unavailable)
    TextButton(onClick = {
        try {
            handler.openUri(source.url)
        } catch (_: IllegalArgumentException) {
            Toast.makeText(context, unavailable, Toast.LENGTH_SHORT).show()
        } catch (_: android.content.ActivityNotFoundException) {
            Toast.makeText(context, unavailable, Toast.LENGTH_SHORT).show()
        }
    }) { Text(stringResource(source.label)) }
}

