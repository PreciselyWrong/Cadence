package ch.nicolab.cadence.bilan

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ShowChart
import androidx.compose.material.icons.automirrored.outlined.TrendingDown
import androidx.compose.material.icons.automirrored.outlined.TrendingFlat
import androidx.compose.material.icons.automirrored.outlined.TrendingUp
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.DateRange
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.LocalFireDepartment
import androidx.compose.material.icons.outlined.Savings
import androidx.compose.material.icons.outlined.Speed
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.style.TextOverflow
import ch.nicolab.cadence.HabitCardState
import ch.nicolab.cadence.R
import ch.nicolab.cadence.designsystem.components.tintedSurface
import ch.nicolab.cadence.designsystem.components.readableTintOf
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.HabitFacet
import ch.nicolab.cadence.designsystem.components.MetricCard
import ch.nicolab.cadence.designsystem.components.SectionHeader
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.displayAbstinenceDate
import ch.nicolab.cadence.domain.AbstinenceElapsedCalculator
import ch.nicolab.cadence.domain.AbstinenceSavingsCalculator
import ch.nicolab.cadence.domain.AbstinenceStatisticsDayStatus
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitActivityStats
import ch.nicolab.cadence.domain.HabitEntry
import ch.nicolab.cadence.domain.HabitStatisticsDay
import ch.nicolab.cadence.domain.HabitStatisticsDayStatus
import ch.nicolab.cadence.domain.HabitStatisticsSummary
import ch.nicolab.cadence.domain.HabitStreak
import ch.nicolab.cadence.domain.MeasurementUnit
import ch.nicolab.cadence.domain.SavingsPeriod
import ch.nicolab.cadence.domain.StatisticsConfidence
import ch.nicolab.cadence.domain.StatisticsTrend
import ch.nicolab.cadence.formatAlcoholAverage
import ch.nicolab.cadence.formatMoney
import ch.nicolab.cadence.habits.EntryRow
import ch.nicolab.cadence.habits.habitTint
import ch.nicolab.cadence.savingsPeriodLabel
import ch.nicolab.cadence.ui.HabitFormatter
import ch.nicolab.cadence.ui.components.ActivityCalendar
import ch.nicolab.cadence.ui.components.ActivityCalendarCell
import ch.nicolab.cadence.ui.components.ActivityCalendarTone
import ch.nicolab.cadence.ui.components.CalendarPeriod
import ch.nicolab.cadence.ui.components.CalendarPeriodSelector
import ch.nicolab.cadence.ui.icon.HabitIconRegistry
import java.time.LocalDate

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun AbstinenceStatisticsSheet(item: HabitCardState, dismiss: () -> Unit, onCorrect: (HabitEntry) -> Unit, openTracking: () -> Unit) {
    val stats = item.abstinenceStats ?: return
    var period by rememberSaveable { mutableStateOf(CalendarPeriod.DAYS_90) }
    val today = LocalDate.now()
    val targetFrom = when (period) {
        CalendarPeriod.DAYS_30 -> today.minusDays(29)
        CalendarPeriod.DAYS_90 -> today.minusDays(89)
        CalendarPeriod.YEAR_1 -> today.minusDays(364)
        CalendarPeriod.ALL_TIME -> item.stored.startsOn
    }
    val observedDays = when (period) {
        CalendarPeriod.DAYS_30 -> stats.observedDays30
        CalendarPeriod.DAYS_90 -> stats.observedDays90
        CalendarPeriod.YEAR_1 -> stats.observedDays365
        CalendarPeriod.ALL_TIME -> stats.observedDaysAllTime
    }
    val clearDays = when (period) {
        CalendarPeriod.DAYS_30 -> stats.clearDays30
        CalendarPeriod.DAYS_90 -> stats.clearDays90
        CalendarPeriod.YEAR_1 -> stats.clearDays365
        CalendarPeriod.ALL_TIME -> stats.clearDaysAllTime
    }
    val occurrences = when (period) {
        CalendarPeriod.DAYS_30 -> stats.occurrences30
        CalendarPeriod.DAYS_90 -> stats.occurrences90
        CalendarPeriod.YEAR_1 -> stats.occurrences365
        CalendarPeriod.ALL_TIME -> stats.occurrencesAllTime
    }
    val occurrenceDays = when (period) {
        CalendarPeriod.DAYS_30 -> stats.occurrenceDays30
        CalendarPeriod.DAYS_90 -> stats.occurrenceDays90
        CalendarPeriod.YEAR_1 -> stats.occurrenceDays365
        CalendarPeriod.ALL_TIME -> stats.occurrenceDaysAllTime
    }

    val tint = habitTint(item)
    val spending = item.stored.abstinenceSpendingMinor
    val spendingPeriod = item.stored.abstinenceSpendingPeriod
    val currency = item.stored.abstinenceSavingsCurrency
    val start = item.stored.abstinenceStartedAt
    val saved = if (spending != null && spendingPeriod != null && currency != null && start != null) {
        val now = java.time.Instant.now()
        val activeStart = AbstinenceElapsedCalculator.activeStart(item.stored.id, start, item.recentEntries)
        AbstinenceSavingsCalculator.calculate(
            spending,
            spendingPeriod,
            activeStart,
            now,
            java.time.ZoneId.systemDefault(),
        )
    } else null
    val palette = cadence

    CadenceSheet(
        title = item.stored.name,
        subtitle = stringResource(R.string.abstinence_stats_detail_subtitle),
        dismiss = dismiss,
        modifier = Modifier.fillMaxHeight(0.94f),
        leading = {
            HabitFacet(
                icon = HabitIconRegistry.getIcon(item.stored.iconId).imageVector,
                label = null,
                progress = 0f,
                tint = tint,
                trackColor = cadence.containerHigh,
                size = Size.touch,
            )
        },
    ) {
        LazyColumn(
            Modifier.fillMaxWidth().weight(1f),
            verticalArrangement = Arrangement.spacedBy(Space.lg),
        ) {
            item {
                AbstinenceStatisticsHero(
                    stats = stats,
                    saved = saved,
                    spending = spending,
                    spendingPeriod = spendingPeriod,
                    currency = currency,
                    tint = tint,
                )
            }
            item {
                CalendarPeriodSelector(
                    selected = period,
                    onSelect = { period = it },
                )
            }
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                    MetricCard(
                        value = stringResource(R.string.alcohol_stats_observed_days, clearDays, observedDays),
                        label = stringResource(R.string.abstinence_stats_clear_days_label),
                        icon = Icons.Outlined.CheckCircle,
                        iconTint = palette.primary,
                        modifier = Modifier.weight(1f),
                    )
                    MetricCard(
                        value = occurrences.toString(),
                        label = stringResource(R.string.abstinence_stats_occurrences_label),
                        icon = Icons.Outlined.EventBusy,
                        iconTint = if (occurrences > 0) palette.error else palette.onSurfaceVariant,
                        valueColor = if (occurrences > 0) palette.error else palette.onSurface,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                    MetricCard(
                        value = occurrenceDays.toString(),
                        label = stringResource(R.string.abstinence_stats_occurrence_days_label),
                        icon = Icons.Outlined.DateRange,
                        iconTint = palette.onSurfaceVariant,
                        modifier = Modifier.weight(1f),
                    )
                    MetricCard(
                        value = stats.averageClearDaysBetweenOccurrences?.let { average ->
                            "${formatAlcoholAverage(average)} j"
                        } ?: "—",
                        label = stringResource(R.string.abstinence_stats_average_gap_short),
                        icon = Icons.Outlined.Speed,
                        iconTint = tint,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
            item {
                val filteredDays = stats.days.filter { it.date >= targetFrom }
                val cells = filteredDays.map { day ->
                    val tone = when (day.status) {
                        AbstinenceStatisticsDayStatus.CLEAR, AbstinenceStatisticsDayStatus.TODAY_CLEAR -> ActivityCalendarTone.SUCCESS
                        AbstinenceStatisticsDayStatus.OCCURRENCE, AbstinenceStatisticsDayStatus.TODAY_OCCURRENCE -> ActivityCalendarTone.DANGER
                        AbstinenceStatisticsDayStatus.PAUSED -> ActivityCalendarTone.NEUTRAL
                        AbstinenceStatisticsDayStatus.UNOBSERVED -> ActivityCalendarTone.NEUTRAL
                    }
                    val dateText = displayAbstinenceDate(day.date)
                    val label = when (day.status) {
                        AbstinenceStatisticsDayStatus.CLEAR -> stringResource(R.string.abstinence_stats_clear_day)
                        AbstinenceStatisticsDayStatus.TODAY_CLEAR -> stringResource(R.string.abstinence_stats_today_clear)
                        AbstinenceStatisticsDayStatus.OCCURRENCE -> stringResource(R.string.abstinence_stats_occurrence_day)
                        AbstinenceStatisticsDayStatus.TODAY_OCCURRENCE -> stringResource(R.string.abstinence_stats_today_occurrence)
                        AbstinenceStatisticsDayStatus.PAUSED -> stringResource(R.string.habit_stats_paused)
                        AbstinenceStatisticsDayStatus.UNOBSERVED -> stringResource(R.string.tracker_calendar_empty)
                    }
                    ActivityCalendarCell(
                        date = day.date,
                        tone = tone,
                        contentDescription = "$dateText : $label",
                        detailText = "$dateText · $label",
                    )
                }
                ActivityCalendar(
                    cells = cells,
                    title = stringResource(R.string.abstinence_stats_calendar_title),
                    helpText = stringResource(R.string.abstinence_assumption),
                )
            }
            item { SectionHeader(stringResource(R.string.abstinence_stats_history)) }
            if (item.recentEntries.isEmpty()) item {
                Text(stringResource(R.string.entries_empty), style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
            }
            items(item.recentEntries, key = { "occurrence-${it.id}" }) { entry ->
                EntryRow(entry, GoalType.COUNT, null) { onCorrect(entry) }
            }
        }
        Spacer(Modifier.height(Space.sm))
        TextButton(onClick = openTracking) { Text(stringResource(R.string.abstinence_stats_open_tracking)) }
    }
}

@Composable
internal fun HabitStatisticsHero(summary: HabitStatisticsSummary, streak: HabitStreak, tint: Color) {
    val palette = cadence
    if (summary.evaluatedPeriods == 0) {
        Box(
            Modifier
                .fillMaxWidth()
                .clip(Radius.Card)
                .background(palette.containerHigh)
                .padding(Space.lg),
        ) {
            Text(stringResource(R.string.habit_stats_no_period), style = MaterialTheme.typography.bodyLarge, color = palette.onSurfaceVariant)
        }
        return
    }
    val comp = summary.comparison
    val confidenceLabel = when (summary.confidence) {
        StatisticsConfidence.ESTABLISHED -> stringResource(R.string.stats_confidence_established)
        StatisticsConfidence.LIMITED -> stringResource(R.string.stats_confidence_limited)
        StatisticsConfidence.INSUFFICIENT -> stringResource(R.string.stats_confidence_insufficient)
    }
    val completenessText = if (summary.observablePeriods != summary.evaluatedPeriods) {
        stringResource(R.string.stats_completeness_detail, summary.evaluatedPeriods, summary.observablePeriods)
    } else {
        stringResource(R.string.stats_completeness_detail_single, summary.evaluatedPeriods)
    }
    val comparisonText = when {
        comp != null -> when (comp.trend) {
            StatisticsTrend.IMPROVING -> stringResource(R.string.stats_comparison_up, comp.deltaPercentagePoints, comp.previousRatePercent)
            StatisticsTrend.DECLINING -> stringResource(R.string.stats_comparison_down, -comp.deltaPercentagePoints, comp.previousRatePercent)
            StatisticsTrend.STABLE -> stringResource(R.string.stats_comparison_stable, comp.previousRatePercent)
        }
        !summary.isHomogeneous -> stringResource(R.string.stats_comparison_inhomogeneous)
        else -> stringResource(R.string.stats_comparison_insufficient)
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(Radius.Card)
            .background(palette.containerHigh)
            .padding(Space.lg),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(Space.md)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(Space.md),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier
                            .clip(Radius.Chip)
                            .background(palette.primaryContainer)
                            .padding(horizontal = Space.md, vertical = Space.sm),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = stringResource(R.string.habit_stats_rate_value, summary.successRatePercent ?: 0),
                            style = MaterialTheme.typography.headlineMedium,
                            color = palette.onPrimaryContainer,
                        )
                    }
                    Column(Modifier.weight(1f)) {
                        Text(
                            text = stringResource(R.string.habit_stats_success),
                            style = MaterialTheme.typography.titleMedium,
                            color = palette.onSurface,
                        )
                        Text(
                            text = stringResource(R.string.habit_stats_validated_compact, summary.validatedPeriods, summary.evaluatedPeriods),
                            style = MaterialTheme.typography.bodySmall,
                            color = palette.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                if (comp != null) {
                    val isUp = comp.deltaPercentagePoints > 0
                    val isDown = comp.deltaPercentagePoints < 0
                    val notableUp = comp.deltaPercentagePoints >= NOTABLE_TREND_POINTS
                    val notableDown = comp.deltaPercentagePoints <= -NOTABLE_TREND_POINTS
                    val chipBg = if (notableUp) palette.successContainer else if (notableDown) palette.error.copy(alpha = 0.15f) else palette.card
                    val chipColor = if (notableUp) palette.success else if (notableDown) palette.error else palette.onSurface
                    val trendText = when {
                        isUp -> stringResource(R.string.habit_stats_trend_short_up, comp.deltaPercentagePoints)
                        isDown -> stringResource(R.string.habit_stats_trend_short_down, -comp.deltaPercentagePoints)
                        else -> stringResource(R.string.habit_stats_trend_short_stable)
                    }
                    val trendIcon = when {
                        isUp -> Icons.AutoMirrored.Outlined.TrendingUp
                        isDown -> Icons.AutoMirrored.Outlined.TrendingDown
                        else -> Icons.AutoMirrored.Outlined.TrendingFlat
                    }
                    Row(
                        modifier = Modifier
                            .padding(start = Space.sm)
                            .clip(Radius.Pill)
                            .background(chipBg)
                            .padding(horizontal = Space.md, vertical = Space.xs),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(Space.xs),
                    ) {
                        Icon(trendIcon, contentDescription = null, tint = chipColor, modifier = Modifier.size(Size.iconSm))
                        Text(
                            trendText,
                            style = MaterialTheme.typography.labelMedium,
                            color = chipColor,
                            maxLines = 1,
                            softWrap = false,
                        )
                    }
                }
            }

            val progressRate = ((summary.successRatePercent ?: 0) / 100f).coerceIn(0f, 1f)
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(Size.counterTrack)
                    .clip(CircleShape)
                    .background(palette.card),
            ) {
                Box(
                    Modifier
                        .fillMaxWidth(fraction = progressRate)
                        .fillMaxHeight()
                        .background(palette.primary, CircleShape)
                )
            }

            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Space.sm),
            ) {
                MetricCard(
                    value = streak.current.toString(),
                    label = stringResource(R.string.habit_stats_streak_label),
                    icon = Icons.Outlined.LocalFireDepartment,
                    iconTint = palette.primary,
                    modifier = Modifier.weight(1f),
                )
                MetricCard(
                    value = summary.idealPeriods.toString(),
                    label = stringResource(R.string.habit_stats_day_ideal),
                    icon = Icons.Outlined.EmojiEvents,
                    iconTint = palette.primary,
                    modifier = Modifier.weight(1f),
                )
                MetricCard(
                    value = summary.evaluatedPeriods.toString(),
                    label = stringResource(R.string.stats_confidence_label),
                    icon = Icons.Outlined.DateRange,
                    iconTint = tint,
                    modifier = Modifier.weight(1f),
                )
            }

            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(Radius.Chip)
                    .background(palette.card.copy(alpha = 0.5f))
                    .padding(horizontal = Space.md, vertical = Space.sm),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Space.sm),
            ) {
                Icon(Icons.Outlined.Info, contentDescription = null, tint = palette.onSurfaceVariant, modifier = Modifier.size(Size.iconSm))
                Text(
                    text = "$confidenceLabel · $completenessText\n$comparisonText",
                    style = MaterialTheme.typography.bodySmall,
                    color = palette.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
internal fun TrackerStatisticsHero(
    stats: HabitActivityStats,
    goalType: GoalType,
    unit: MeasurementUnit?,
    tint: Color,
) {
    val palette = cadence
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(Radius.Card)
            .background(palette.containerHigh)
            .padding(Space.lg),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(Space.md)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(Space.md),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier
                            .clip(Radius.Chip)
                            .background(tint.copy(alpha = 0.15f))
                            .padding(horizontal = Space.md, vertical = Space.sm),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = stringResource(R.string.habit_stats_days_short, stats.activeDays30),
                            style = MaterialTheme.typography.headlineMedium,
                            color = readableTintOf(tint, tintedSurface(tint, 0.15f, palette.containerHigh)),
                        )
                    }
                    Column(Modifier.weight(1f)) {
                        Text(
                            text = stringResource(R.string.habit_stats_active_days_30),
                            style = MaterialTheme.typography.titleMedium,
                            color = palette.onSurface,
                        )
                        Text(
                            text = stringResource(R.string.habit_stats_entries_30),
                            style = MaterialTheme.typography.bodySmall,
                            color = palette.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                Box(
                    Modifier
                        .padding(start = Space.sm)
                        .clip(Radius.Pill)
                        .background(palette.card)
                        .padding(horizontal = Space.md, vertical = Space.xs),
                ) {
                    Text(
                        text = "${stats.entries30} ${stringResource(R.string.habit_stats_goals_label)}",
                        style = MaterialTheme.typography.labelMedium,
                        color = palette.onSurface,
                        maxLines = 1,
                        softWrap = false,
                    )
                }
            }

            val activeRatio = (stats.activeDays30 / 30f).coerceIn(0f, 1f)
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(Size.counterTrack)
                    .clip(CircleShape)
                    .background(palette.card),
            ) {
                Box(
                    Modifier
                        .fillMaxWidth(fraction = activeRatio)
                        .fillMaxHeight()
                        .background(tint, CircleShape)
                )
            }

            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Space.sm),
            ) {
                val totalFormatted = if (goalType != GoalType.BINARY && stats.entries30 > 0) {
                    HabitFormatter.formatWithUnit(stats.totalMinor30, goalType, unit)
                } else stats.entries30.toString()

                MetricCard(
                    value = totalFormatted,
                    label = stringResource(R.string.habit_stats_total_30),
                    icon = Icons.AutoMirrored.Outlined.ShowChart,
                    iconTint = tint,
                    modifier = Modifier.weight(1f),
                )
                MetricCard(
                    value = stats.averagePerActiveDayMinor30?.let { formatActivityAverage(it, unit) } ?: "—",
                    label = stringResource(R.string.habit_stats_average_active_day_30),
                    icon = Icons.Outlined.Speed,
                    iconTint = palette.primary,
                    modifier = Modifier.weight(1f),
                )
                MetricCard(
                    value = "${stats.activeDays90} j",
                    label = stringResource(R.string.stats_period_90d),
                    icon = Icons.Outlined.DateRange,
                    iconTint = palette.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
            }

            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(Radius.Chip)
                    .background(palette.card.copy(alpha = 0.5f))
                    .padding(horizontal = Space.md, vertical = Space.sm),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Space.sm),
            ) {
                Icon(Icons.Outlined.Info, contentDescription = null, tint = palette.onSurfaceVariant, modifier = Modifier.size(Size.iconSm))
                Text(
                    text = stringResource(R.string.tracker_stats_ninety_days, stats.activeDays90, stats.calendarDays90, stats.entries90),
                    style = MaterialTheme.typography.bodySmall,
                    color = palette.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun AbstinenceStatisticsHero(
    stats: ch.nicolab.cadence.domain.AbstinenceStats,
    saved: Long?,
    spending: Long?,
    spendingPeriod: SavingsPeriod?,
    currency: String?,
    tint: Color,
) {
    val palette = cadence
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(Radius.Card)
            .background(palette.containerHigh)
            .padding(Space.lg),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(Space.md)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(Space.md),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier
                            .clip(Radius.Chip)
                            .background(palette.primaryContainer)
                            .padding(horizontal = Space.md, vertical = Space.sm),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = stringResource(R.string.habit_stats_days_short, stats.currentDays),
                            style = MaterialTheme.typography.headlineMedium,
                            color = palette.onPrimaryContainer,
                        )
                    }
                    Column(Modifier.weight(1f)) {
                        Text(
                            text = stringResource(R.string.habit_stats_abstinence_hero),
                            style = MaterialTheme.typography.titleMedium,
                            color = palette.onSurface,
                        )
                        Text(
                            text = stringResource(R.string.habit_stats_active_short),
                            style = MaterialTheme.typography.bodySmall,
                            color = palette.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                Row(
                    modifier = Modifier
                        .padding(start = Space.sm)
                        .clip(Radius.Pill)
                        .background(palette.primaryContainer)
                        .padding(horizontal = Space.md, vertical = Space.xs),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(Space.xs),
                ) {
                    Icon(Icons.Outlined.EmojiEvents, contentDescription = null, tint = palette.onPrimaryContainer, modifier = Modifier.size(Size.iconSm))
                    Text(
                        text = "${stringResource(R.string.habit_stats_record_label)} : ${stringResource(R.string.habit_stats_days_short, stats.bestDays)}",
                        style = MaterialTheme.typography.labelMedium,
                        color = palette.onPrimaryContainer,
                        maxLines = 1,
                        softWrap = false,
                    )
                }
            }
            if (saved != null && spending != null && spendingPeriod != null && currency != null) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clip(Radius.Chip)
                        .background(palette.primaryContainer)
                        .padding(horizontal = Space.md, vertical = Space.sm),
                    horizontalArrangement = Arrangement.spacedBy(Space.sm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Outlined.Savings, contentDescription = null, tint = palette.onPrimaryContainer, modifier = Modifier.size(Size.icon))
                    Column {
                        Text(
                            text = stringResource(R.string.abst_savings_total, formatMoney(saved, currency)),
                            style = MaterialTheme.typography.titleMedium,
                            color = palette.onPrimaryContainer,
                        )
                        Text(
                            text = stringResource(R.string.abst_savings_basis, formatMoney(spending, currency), savingsPeriodLabel(spendingPeriod)),
                            style = MaterialTheme.typography.bodySmall,
                            color = palette.onSurfaceVariant,
                        )
                    }
                }
            }
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Space.sm),
            ) {
                MetricCard(
                    value = "${stats.clearDays90} / ${stats.observedDays90}",
                    label = stringResource(R.string.abstinence_stats_clear_days_label),
                    icon = Icons.Outlined.CheckCircle,
                    iconTint = palette.primary,
                    modifier = Modifier.weight(1f),
                )
                MetricCard(
                    value = stats.occurrences90.toString(),
                    label = stringResource(R.string.abstinence_stats_occurrences_label),
                    icon = Icons.Outlined.EventBusy,
                    iconTint = if (stats.occurrences90 > 0) palette.error else palette.onSurfaceVariant,
                    valueColor = if (stats.occurrences90 > 0) palette.error else palette.onSurface,
                    modifier = Modifier.weight(1f),
                )
                MetricCard(
                    value = stats.averageClearDaysBetweenOccurrences?.let { "${formatAlcoholAverage(it)} j" } ?: "—",
                    label = stringResource(R.string.abstinence_stats_average_gap_short),
                    icon = Icons.Outlined.Speed,
                    iconTint = tint,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
internal fun StatisticsCalendar(days: List<HabitStatisticsDay>) {
    if (days.isEmpty()) return
    var period by rememberSaveable { mutableStateOf(CalendarPeriod.DAYS_90) }
    val today = LocalDate.now()
    val from = when (period) {
        CalendarPeriod.DAYS_30 -> today.minusDays(29)
        CalendarPeriod.DAYS_90 -> today.minusDays(89)
        CalendarPeriod.YEAR_1 -> today.minusDays(364)
        CalendarPeriod.ALL_TIME -> days.minOfOrNull { it.date } ?: today
    }
    val filteredDays = days.filter { it.date >= from }
    val cells = filteredDays.map { day ->
        val tone = when (day.status) {
            HabitStatisticsDayStatus.IDEAL, HabitStatisticsDayStatus.ACTIVITY -> ActivityCalendarTone.SUCCESS
            HabitStatisticsDayStatus.MINIMUM -> ActivityCalendarTone.SUCCESS_SOFT
            HabitStatisticsDayStatus.MISSED -> ActivityCalendarTone.DANGER
            else -> ActivityCalendarTone.NEUTRAL
        }
        val label = stringResource(statisticsDayLabel(day.status))
        val dateText = displayAbstinenceDate(day.date)
        ActivityCalendarCell(
            date = day.date,
            tone = tone,
            contentDescription = "$dateText : $label",
            detailText = stringResource(R.string.habit_stats_selected_day, dateText, label),
        )
    }
    Column(verticalArrangement = Arrangement.spacedBy(Space.md)) {
        CalendarPeriodSelector(
            selected = period,
            onSelect = { period = it },
        )
        ActivityCalendar(
            cells = cells,
            title = stringResource(R.string.habit_stats_calendar),
            helpText = stringResource(R.string.habit_stats_calendar_help),
        )
    }
}

private fun statisticsDayLabel(status: HabitStatisticsDayStatus): Int = when (status) {
    HabitStatisticsDayStatus.UNPLANNED -> R.string.habit_stats_unplanned
    HabitStatisticsDayStatus.PAUSED -> R.string.habit_stats_paused
    HabitStatisticsDayStatus.MISSED -> R.string.habit_stats_missed
    HabitStatisticsDayStatus.MINIMUM -> R.string.habit_stats_minimum
    HabitStatisticsDayStatus.IDEAL -> R.string.habit_stats_day_ideal
    HabitStatisticsDayStatus.ACTIVITY -> R.string.habit_stats_activity
    HabitStatisticsDayStatus.NO_ACTIVITY -> R.string.habit_stats_no_activity
}

/** Écart de taux (en points) à partir duquel une évolution mérite une couleur sémantique ; en dessous, elle reste neutre. */
internal const val NOTABLE_TREND_POINTS = 10
