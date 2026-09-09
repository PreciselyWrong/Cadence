package ch.nicolab.cadence

import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.draw.clip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.graphics.Color
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Science
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.domain.AbstinenceProfile
import ch.nicolab.cadence.domain.AbstinenceElapsedCalculator
import ch.nicolab.cadence.domain.AbstinenceSavingsCalculator
import ch.nicolab.cadence.domain.SavingsPeriod
import ch.nicolab.cadence.ui.components.Panel
import ch.nicolab.cadence.ui.components.HabitFacet
import ch.nicolab.cadence.ui.components.FacetGauge
import ch.nicolab.cadence.ui.icon.HabitIconRegistry
import ch.nicolab.cadence.ui.theme.Size
import ch.nicolab.cadence.ui.theme.Radius
import ch.nicolab.cadence.ui.theme.Space
import ch.nicolab.cadence.ui.theme.cadence
import ch.nicolab.cadence.ui.theme.habitAccent
import java.time.Instant
import java.time.ZoneId
import kotlinx.coroutines.delay

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
                }
            }
            LiveAbstinenceCounter(item, accent, compact = true)
            Text(stringResource(when {
                item.evaluation.isPaused -> R.string.abstinence_today_paused
                else -> R.string.abst_home_open
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
fun LiveAbstinenceCounter(item: HabitCardState, accent: Color, compact: Boolean = false) {
    val start = item.stored.abstinenceStartedAt ?: return
    var now by remember(item.stored.id) { mutableStateOf(Instant.now()) }
    LaunchedEffect(item.stored.id, start, item.recentEntries) {
        while (true) {
            now = Instant.now()
            delay(1_000)
        }
    }
    val elapsed = AbstinenceElapsedCalculator.calculate(item.stored.id, start, item.recentEntries, now)
    val activeStart = AbstinenceElapsedCalculator.activeStart(item.stored.id, start, item.recentEntries)
    val saved = AbstinenceSavingsCalculator.calculate(
        item.stored.abstinenceSpendingMinor,
        item.stored.abstinenceSpendingPeriod,
        activeStart,
        now,
        ZoneId.systemDefault(),
    )
    if (compact) {
        Text(elapsed.formatCompact(), style = MaterialTheme.typography.headlineSmall, color = accent)
        SavingsTotal(item, saved, accent)
        return
    }
    val nextDays = AbstinenceGuide.milestones(item.stored.abstinenceProfile)
        .firstOrNull { it.days > elapsed.days }?.days ?: (elapsed.days + 1)
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
        Text(
            stringResource(R.string.abst_elapsed_intro),
            style = MaterialTheme.typography.bodyMedium,
            color = cadence.inkMuted,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
        TimeBand(elapsed.days, stringResource(R.string.abst_elapsed_days), elapsed.days.toFloat() / nextDays, accent, 1f)
        TimeBand(elapsed.hours.toLong(), stringResource(R.string.abst_elapsed_hours), elapsed.hours / 24f, accent, 0.82f)
        TimeBand(elapsed.minutes.toLong(), stringResource(R.string.abst_elapsed_minutes), elapsed.minutes / 60f, accent, 0.66f)
        TimeBand(elapsed.seconds.toLong(), stringResource(R.string.abst_elapsed_seconds), elapsed.seconds / 60f, accent, 0.5f)
        SavingsTotal(item, saved, accent, centered = true)
    }
}

@Composable
private fun SavingsTotal(item: HabitCardState, saved: Long, accent: Color, centered: Boolean = false) {
    val spending = item.stored.abstinenceSpendingMinor ?: return
    val period = item.stored.abstinenceSpendingPeriod ?: return
    val currency = item.stored.abstinenceSavingsCurrency ?: return
    val alignment = if (centered) Alignment.CenterHorizontally else Alignment.Start
    Column(Modifier.fillMaxWidth(), horizontalAlignment = alignment, verticalArrangement = Arrangement.spacedBy(Space.xs)) {
        Text(
            stringResource(R.string.abst_savings_total, formatMoney(saved, currency)),
            style = MaterialTheme.typography.titleMedium,
            color = accent,
            textAlign = if (centered) TextAlign.Center else TextAlign.Start,
        )
        Text(
            stringResource(R.string.abst_savings_basis, formatMoney(spending, currency), savingsPeriodLabel(period)),
            style = MaterialTheme.typography.bodySmall,
            color = cadence.inkMuted,
            textAlign = if (centered) TextAlign.Center else TextAlign.Start,
        )
    }
}

@Composable
private fun savingsPeriodLabel(period: SavingsPeriod): String = stringResource(when (period) {
    SavingsPeriod.DAY -> R.string.abst_setup_savings_day
    SavingsPeriod.WEEK -> R.string.abst_setup_savings_week
    SavingsPeriod.MONTH -> R.string.abst_setup_savings_month
}).lowercase()

@Composable
private fun TimeBand(value: Long, unit: String, progress: Float, accent: Color, alpha: Float) {
    Box(Modifier.fillMaxWidth().height(Size.control).clip(Radius.Control).background(cadence.sunken)) {
        Box(Modifier.fillMaxWidth(progress.coerceIn(0.08f, 1f)).height(Size.control).background(accent.copy(alpha = alpha)))
        Row(
            Modifier.fillMaxWidth().padding(horizontal = Space.lg).align(Alignment.CenterStart),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Space.sm),
        ) {
            Text(value.toString(), style = MaterialTheme.typography.headlineSmall, color = cadence.onAccent)
            Text(unit, style = MaterialTheme.typography.titleMedium, color = cadence.inkMuted)
        }
    }
}

@Composable
fun AbstinenceMilestones(profile: AbstinenceProfile, currentDays: Long) {
    val milestones = AbstinenceGuide.milestones(profile)
    if (milestones.isEmpty()) return
    val content = AbstinenceGuide.content(profile)
    val milestoneSources = milestones.flatMap(AbstinenceMilestone::sources).map(EvidenceSource::url).toSet()
    Column(verticalArrangement = Arrangement.spacedBy(Space.lg)) {
        Text(stringResource(R.string.abstinence_milestones), style = MaterialTheme.typography.titleMedium, color = cadence.ink)
        milestones.forEach { milestone ->
            MilestoneItem(milestone, currentDays, expanded = true)
        }
        content.notice?.let { Text(stringResource(it), style = MaterialTheme.typography.bodyMedium, color = cadence.inkMuted) }
        content.sources.filterNot { it.url in milestoneSources }.forEach { SourceLink(it) }
    }
}

@Composable
private fun MilestoneItem(milestone: AbstinenceMilestone, currentDays: Long, expanded: Boolean) {
    val reached = milestone.reached(currentDays)
    val tone = if (reached) cadence.success else cadence.inkMuted
    Row(horizontalArrangement = Arrangement.spacedBy(Space.md), verticalAlignment = Alignment.Top) {
        FacetGauge(
            progress = if (reached) 1f else (currentDays.toFloat() / milestone.days).coerceIn(0f, 1f),
            tint = tone,
            trackColor = cadence.sunken,
            size = Size.badge,
        ) {
            Icon(
                if (reached) Icons.Outlined.Check else Icons.Outlined.Lock,
                contentDescription = null,
                tint = tone,
            )
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
            Text(milestoneTime(milestone), style = MaterialTheme.typography.titleLarge, color = tone)
            Text(
                stringResource(if (reached) R.string.abstinence_reached else R.string.abstinence_upcoming),
                style = MaterialTheme.typography.labelMedium,
                color = cadence.inkMuted,
            )
            if (expanded) {
                Text(stringResource(milestone.detail), style = MaterialTheme.typography.bodyMedium, color = cadence.ink)
                milestone.sources.forEach { SourceLink(it) }
            }
        }
    }
}

@Composable
fun AbstinenceEvidenceEmpty(profile: AbstinenceProfile) {
    if (profile == AbstinenceProfile.NONE) return
    val content = AbstinenceGuide.content(profile)
    Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
        Icon(Icons.Outlined.Science, contentDescription = null, tint = cadence.inkMuted)
        Text(stringResource(R.string.abstinence_milestones), style = MaterialTheme.typography.titleMedium, color = cadence.ink)
        Text(stringResource(R.string.abstinence_evidence_empty), style = MaterialTheme.typography.bodyMedium, color = cadence.inkMuted)
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

