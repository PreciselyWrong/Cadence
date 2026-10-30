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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ShowChart
import androidx.compose.material.icons.outlined.Analytics
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.DateRange
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Speed
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
import ch.nicolab.cadence.AlcoholStatisticsSheet
import ch.nicolab.cadence.HabitCardState
import ch.nicolab.cadence.HabitInsightsPanel
import ch.nicolab.cadence.R
import ch.nicolab.cadence.StatisticsPulseLevel
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.EmptyState
import ch.nicolab.cadence.designsystem.components.HabitFacet
import ch.nicolab.cadence.designsystem.components.Hairline
import ch.nicolab.cadence.designsystem.components.MetricCard
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.SectionHeader
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.domain.AbstinenceProfile
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitActivityStats
import ch.nicolab.cadence.domain.HabitEntry
import ch.nicolab.cadence.domain.MeasurementUnit
import ch.nicolab.cadence.domain.PeriodType
import ch.nicolab.cadence.domain.StatisticsConfidence
import ch.nicolab.cadence.formatAlcoholAverage
import ch.nicolab.cadence.habits.EntryRow
import ch.nicolab.cadence.habits.habitTint
import ch.nicolab.cadence.toStatisticsPulse
import ch.nicolab.cadence.ui.HabitFormatter
import ch.nicolab.cadence.ui.ScreenList
import ch.nicolab.cadence.ui.components.ActivityCalendar
import ch.nicolab.cadence.ui.components.ActivityCalendarCell
import ch.nicolab.cadence.ui.components.ActivityCalendarTone
import ch.nicolab.cadence.ui.components.CalendarPeriod
import ch.nicolab.cadence.ui.components.CalendarPeriodSelector
import ch.nicolab.cadence.ui.icon.HabitIconRegistry
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.util.Locale

@Composable
@OptIn(ExperimentalMaterial3Api::class)
internal fun StatsScreen(
    habits: List<HabitCardState>,
    open: (HabitCardState) -> Unit,
    onCorrect: (HabitEntry) -> Unit,
) {
    val visible = habits.filterNot { it.stored.archived }
    val archived = habits.filter { it.stored.archived }
    val regular = visible.filter { !it.stored.goal.isAbstinence && !it.stored.goal.isTracker }
    val trackers = visible.filter { it.stored.goal.isTracker }
    val abstinences = visible.filter { it.stored.goal.isAbstinence }
    var detailId by rememberSaveable { mutableStateOf<String?>(null) }
    var alcoholDetailId by rememberSaveable { mutableStateOf<String?>(null) }
    var abstinenceDetailId by rememberSaveable { mutableStateOf<String?>(null) }
    ScreenList(context = stringResource(R.string.habit_stats_subtitle), title = stringResource(R.string.tab_stats)) {
        if (visible.isEmpty() && archived.isEmpty()) item {
            EmptyState(Icons.Outlined.Analytics, stringResource(R.string.empty_habits_title), stringResource(R.string.empty_habits_message))
        }
        if (regular.isNotEmpty()) {
            item { SectionHeader(stringResource(R.string.today_regular_section)) }
            items(regular, key = { it.stored.id }) { item ->
                HabitStatisticsOverview(item) { detailId = item.stored.id }
            }
        }
        if (trackers.isNotEmpty()) {
            item { SectionHeader(stringResource(R.string.today_activities_section)) }
            items(trackers, key = { it.stored.id }) { item ->
                TrackerStatisticsOverview(item) { detailId = item.stored.id }
            }
        }
        if (abstinences.isNotEmpty()) {
            item { SectionHeader(stringResource(R.string.today_abstinences_section)) }
            items(abstinences, key = { it.stored.id }) { item ->
                AbstinenceStatisticsOverview(item) {
                    if (item.stored.abstinenceProfile == AbstinenceProfile.ALCOHOL) alcoholDetailId = item.stored.id
                    else abstinenceDetailId = item.stored.id
                }
            }
        }
        if (archived.isNotEmpty()) {
            item { SectionHeader(stringResource(R.string.habits_archived_section)) }
            items(archived, key = { "stats-archived-${it.stored.id}" }) { item ->
                Panel(onClick = {
                    when {
                        item.stored.abstinenceProfile == AbstinenceProfile.ALCOHOL -> alcoholDetailId = item.stored.id
                        item.stored.goal.isAbstinence -> abstinenceDetailId = item.stored.id
                        else -> detailId = item.stored.id
                    }
                }) {
                    Text(item.stored.name, style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
                    Text(stringResource(R.string.status_archived), style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
                }
            }
        }
    }
    (regular + trackers + archived.filterNot { it.stored.goal.isAbstinence }).firstOrNull { it.stored.id == detailId }?.let { item ->
        val tint = habitTint(item)
        val isTracker = item.stored.goal.isTracker
        val progress = if (isTracker) 0f else (item.statistics?.successRatePercent ?: 0) / 100f
        CadenceSheet(
            title = item.stored.name,
            subtitle = stringResource(if (isTracker) R.string.tracker_stats_detail_subtitle else R.string.habit_stats_detail_subtitle),
            dismiss = { detailId = null },
            modifier = Modifier.fillMaxHeight(0.94f),
            leading = {
                HabitFacet(
                    icon = HabitIconRegistry.getIcon(item.stored.iconId).imageVector,
                    label = null,
                    progress = progress,
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
                if (!isTracker) {
                    item { item.statistics?.let { HabitStatisticsHero(it, item.streak, tint) } }
                } else {
                    item { item.activityStats?.let { TrackerStatisticsHero(it, item.stored.goal.goalType, item.stored.goal.unit, tint) } }
                }
                if (!isTracker) {
                    item { item.activityStats?.let { HabitActivityNumbers(it, item.stored.goal.goalType, item.stored.goal.unit, tint) } }
                }
                item { Hairline() }
                if (isTracker) item { TrackerActivityCalendar(item) }
                else item { item.statistics?.let { StatisticsCalendar(it.calendarDays) } }
                if (!item.stored.goal.isLimit && !isTracker) {
                    item { HabitInsightsPanel(item.insights, item.stored.goal, Modifier.fillMaxWidth()) }
                }
                item { Hairline() }
                item { Text(stringResource(R.string.entries_section), style = MaterialTheme.typography.titleMedium, color = cadence.onSurface) }
                if (item.recentEntries.isEmpty()) item {
                    Text(stringResource(R.string.entries_empty), style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
                }
                items(item.recentEntries, key = { "entry-${it.id}" }) { entry ->
                    EntryRow(entry, item.stored.goal.goalType, item.stored.goal.unit) { onCorrect(entry) }
                }
            }
        }
    }
    (abstinences + archived).firstOrNull { it.stored.id == alcoholDetailId }?.let { item ->
        AlcoholStatisticsSheet(item) { alcoholDetailId = null }
    }
    (abstinences + archived).firstOrNull { it.stored.id == abstinenceDetailId }?.let { item ->
        AbstinenceStatisticsSheet(item, { abstinenceDetailId = null }, onCorrect = onCorrect) {
            abstinenceDetailId = null
            open(item)
        }
    }
}

@Composable
private fun HabitStatisticsOverview(item: HabitCardState, onClick: () -> Unit) {
    val palette = cadence
    val tint = habitTint(item)
    val stats = item.statistics
    val rate = stats?.successRatePercent
    Panel(onClick = onClick) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.md), verticalAlignment = Alignment.CenterVertically) {
            HabitFacet(
                icon = HabitIconRegistry.getIcon(item.stored.iconId).imageVector,
                label = null,
                progress = 0f,
                tint = tint,
                trackColor = palette.containerHigh,
                size = Size.badge,
            )
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                Text(item.stored.name, style = MaterialTheme.typography.titleMedium, color = palette.onSurface)
                Text(stringResource(when (item.stored.goal.period) {
                    PeriodType.DAY -> R.string.stats_rhythm_daily
                    PeriodType.WEEK -> R.string.stats_rhythm_weekly
                    PeriodType.MONTH -> R.string.stats_rhythm_monthly
                }), style = MaterialTheme.typography.labelMedium, color = palette.onSurfaceVariant)
            }
        }
        if (stats == null || stats.evaluatedPeriods == 0) {
            Spacer(Modifier.height(Space.xl))
            Text(stringResource(R.string.habit_stats_waiting), style = MaterialTheme.typography.bodySmall, color = palette.onSurfaceVariant)
            item.activityStats?.let { activity ->
                Spacer(Modifier.height(Space.sm))
                Text(stringResource(R.string.habit_stats_activity_overview, activity.entries30, activity.activeDays30),
                    style = MaterialTheme.typography.bodySmall, color = palette.onSurfaceVariant)
            }
            return@Panel
        }
        Spacer(Modifier.height(Space.xl))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            Text(stringResource(R.string.habit_stats_rate_value, rate ?: 0), style = MaterialTheme.typography.displayMedium, color = palette.onSurface)
            Spacer(Modifier.weight(1f))
            Text(stringResource(R.string.habit_stats_success), style = MaterialTheme.typography.labelMedium, color = palette.success)
        }
        Spacer(Modifier.height(Space.lg))
        StatisticsPulse(stats.periods.toStatisticsPulse())
        Spacer(Modifier.height(Space.sm))
        val reculLabel = when (stats.confidence) {
            StatisticsConfidence.ESTABLISHED -> stringResource(R.string.stats_confidence_established)
            StatisticsConfidence.LIMITED -> stringResource(R.string.stats_confidence_limited)
            StatisticsConfidence.INSUFFICIENT -> stringResource(R.string.stats_confidence_insufficient)
        }
        val periodType = stats.periods.map { it.periodType }.distinct().singleOrNull()
        val pulseLabel = stringResource(when (periodType) {
            PeriodType.DAY -> R.string.stats_pulse_days
            PeriodType.WEEK -> R.string.stats_pulse_weeks
            PeriodType.MONTH -> R.string.stats_pulse_months
            null -> R.string.stats_pulse_periods
        }, stats.periods.takeLast(14).size)
        Text("$reculLabel · $pulseLabel", style = MaterialTheme.typography.bodySmall, color = palette.onSurfaceVariant)
        Spacer(Modifier.height(Space.xl))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            OverviewMetric(stringResource(R.string.habit_stats_goal_count, stats.validatedPeriods, stats.evaluatedPeriods), stringResource(R.string.habit_stats_goals_label))
            OverviewMetric(item.streak.current.toString(), stringResource(R.string.habit_stats_streak_label))
            val comp = stats.comparison
            val trendText = when {
                comp == null -> "—"
                comp.deltaPercentagePoints > 0 -> stringResource(R.string.habit_stats_trend_short_up, comp.deltaPercentagePoints)
                comp.deltaPercentagePoints < 0 -> stringResource(R.string.habit_stats_trend_short_down, -comp.deltaPercentagePoints)
                else -> stringResource(R.string.habit_stats_trend_short_stable)
            }
            val trendColor = when {
                comp == null -> palette.onSurfaceVariant
                comp.deltaPercentagePoints > 0 -> palette.success
                else -> palette.onSurface
            }
            OverviewMetric(
                trendText,
                stringResource(R.string.habit_stats_trend_label),
                trendColor,
            )
        }
        item.activityStats?.let { activity ->
            Spacer(Modifier.height(Space.sm))
            Text(stringResource(R.string.habit_stats_activity_overview, activity.entries30, activity.activeDays30),
                style = MaterialTheme.typography.bodySmall, color = palette.onSurfaceVariant)
        }
    }
}

@Composable
private fun TrackerStatisticsOverview(item: HabitCardState, onClick: () -> Unit) {
    val stats = item.activityStats ?: return
    val palette = cadence
    Panel(onClick = onClick) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.md), verticalAlignment = Alignment.CenterVertically) {
            HabitFacet(
                icon = HabitIconRegistry.getIcon(item.stored.iconId).imageVector,
                label = null,
                progress = 0f,
                tint = habitTint(item),
                trackColor = palette.containerHigh,
                size = Size.badge,
            )
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                Text(item.stored.name, style = MaterialTheme.typography.titleMedium, color = palette.onSurface)
                Text(stringResource(R.string.today_activities_section), style = MaterialTheme.typography.labelMedium, color = palette.onSurfaceVariant)
            }
        }
        Spacer(Modifier.height(Space.xl))
        Row(verticalAlignment = Alignment.Bottom) {
            Text(stats.activeDays30.toString(), style = MaterialTheme.typography.displayMedium, color = palette.onSurface)
            Spacer(Modifier.width(Space.sm))
            Text(stringResource(R.string.tracker_stats_active_days_short), style = MaterialTheme.typography.labelMedium, color = palette.success)
        }
        Spacer(Modifier.height(Space.lg))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.xxl)) {
            OverviewMetric(stats.entries30.toString(), stringResource(R.string.habit_stats_entries_30))
            if (item.stored.goal.goalType != GoalType.BINARY && stats.entries30 > 0) {
                OverviewMetric(HabitFormatter.formatWithUnit(stats.totalMinor30, item.stored.goal.goalType, item.stored.goal.unit), stringResource(R.string.habit_stats_total_30))
            } else {
                OverviewMetric(stringResource(R.string.tracker_stats_calendar_days, stats.calendarDays30), stringResource(R.string.tracker_stats_observed_label))
            }
        }
    }
}

@Composable
private fun TrackerActivityCalendar(item: HabitCardState) {
    var period by rememberSaveable { mutableStateOf(CalendarPeriod.DAYS_90) }
    val today = LocalDate.now()
    val daysBack = when (period) {
        CalendarPeriod.DAYS_30 -> 29L
        CalendarPeriod.DAYS_90 -> 89L
        CalendarPeriod.YEAR_1 -> 364L
        CalendarPeriod.ALL_TIME -> ChronoUnit.DAYS.between(item.stored.startsOn, today).coerceAtLeast(0L)
    }
    val dailyTotals = item.recentEntries.groupBy(HabitEntry::localDate)
        .mapValues { (_, entries) -> entries.sumOf(HabitEntry::valueMinor) }
    val cells = (daysBack downTo 0L).map { offset ->
        val date = today.minusDays(offset)
        val value = dailyTotals[date]
        val label = when {
            date < item.stored.startsOn -> stringResource(R.string.tracker_calendar_before)
            value != null -> stringResource(R.string.tracker_calendar_activity,
                HabitFormatter.formatWithUnit(value, item.stored.goal.goalType, item.stored.goal.unit))
            else -> stringResource(R.string.tracker_calendar_empty)
        }
        ActivityCalendarCell(
            date = date,
            tone = if (value != null) ActivityCalendarTone.SUCCESS else ActivityCalendarTone.NEUTRAL,
            contentDescription = "$date : $label",
            detailText = "$date · $label",
        )
    }
    Column(verticalArrangement = Arrangement.spacedBy(Space.md)) {
        CalendarPeriodSelector(selected = period, onSelect = { period = it })
        ActivityCalendar(cells, title = stringResource(R.string.tracker_calendar_title))
    }
}

@Composable
private fun HabitActivityNumbers(stats: HabitActivityStats, goalType: GoalType, unit: MeasurementUnit?, tint: Color) {
    val palette = cadence
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(Radius.Card)
            .background(palette.containerHigh)
            .padding(Space.lg),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(Space.md)) {
            Text(stringResource(R.string.habit_stats_activity_title), style = MaterialTheme.typography.titleMedium, color = palette.onSurface)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                MetricCard(
                    value = stats.entries30.toString(),
                    label = stringResource(R.string.habit_stats_entries_30),
                    icon = Icons.Outlined.Check,
                    iconTint = tint,
                    modifier = Modifier.weight(1f),
                )
                MetricCard(
                    value = "${stats.activeDays30} j",
                    label = stringResource(R.string.habit_stats_active_days_30),
                    icon = Icons.Outlined.DateRange,
                    iconTint = palette.primary,
                    modifier = Modifier.weight(1f),
                )
            }
            if (goalType != GoalType.BINARY && stats.entries30 > 0) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                    MetricCard(
                        value = HabitFormatter.formatWithUnit(stats.totalMinor30, goalType, unit),
                        label = stringResource(R.string.habit_stats_total_30),
                        icon = Icons.AutoMirrored.Outlined.ShowChart,
                        iconTint = tint,
                        modifier = Modifier.weight(1f),
                    )
                    stats.averagePerActiveDayMinor30?.let { average ->
                        MetricCard(
                            value = formatActivityAverage(average, unit),
                            label = stringResource(R.string.habit_stats_average_active_day_30),
                            icon = Icons.Outlined.Speed,
                            iconTint = palette.primary,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
                MetricCard(
                    value = HabitFormatter.formatWithUnit(stats.peakDayMinor30, goalType, unit),
                    label = stringResource(R.string.habit_stats_peak_day_30),
                    icon = Icons.Outlined.EmojiEvents,
                    iconTint = palette.success,
                    modifier = Modifier.fillMaxWidth(),
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
                Column {
                    Text(
                        stringResource(R.string.tracker_stats_ninety_days, stats.activeDays90, stats.calendarDays90, stats.entries90),
                        style = MaterialTheme.typography.bodySmall, color = palette.onSurfaceVariant,
                    )
                    if (goalType != GoalType.BINARY && stats.entries90 > 0) {
                        Text(
                            stringResource(R.string.tracker_stats_ninety_total, HabitFormatter.formatWithUnit(stats.totalMinor90, goalType, unit)),
                            style = MaterialTheme.typography.bodySmall, color = palette.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

internal fun formatActivityAverage(minor: Double, unit: MeasurementUnit?): String {
    val value = String.format(Locale.FRENCH, "%.1f", minor / (unit?.scaleToCanonical ?: 1L))
    val symbol = unit?.symbol?.takeIf(String::isNotBlank) ?: return value
    return "$value $symbol"
}

@Composable
private fun StatisticsPulse(levels: List<StatisticsPulseLevel>) {
    val palette = cadence
    if (levels.isEmpty()) return
    Row(
        Modifier.fillMaxWidth().height(Size.statisticsPulse),
        horizontalArrangement = Arrangement.spacedBy(Space.xs),
        verticalAlignment = Alignment.Bottom,
    ) {
        levels.forEach { level ->
            val fraction = when (level) {
                StatisticsPulseLevel.QUIET -> 0.18f
                StatisticsPulseLevel.MISSED -> 0.42f
                StatisticsPulseLevel.ACTIVE -> 0.68f
                StatisticsPulseLevel.IDEAL -> 1f
            }
            val color = when (level) {
                StatisticsPulseLevel.QUIET -> palette.containerHigh
                StatisticsPulseLevel.MISSED -> palette.error
                StatisticsPulseLevel.ACTIVE -> palette.successContainer
                StatisticsPulseLevel.IDEAL -> palette.success
            }
            Box(Modifier.weight(1f).fillMaxHeight(fraction).clip(Radius.Pill).background(color))
        }
    }
}

@Composable
private fun AbstinenceStatisticsOverview(item: HabitCardState, onClick: () -> Unit) {
    val palette = cadence
    val tint = habitTint(item)
    val stats = item.abstinenceStats
    val alcohol = item.alcoholStats
    Panel(onClick = onClick) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.md), verticalAlignment = Alignment.CenterVertically) {
            HabitFacet(
                icon = HabitIconRegistry.getIcon(item.stored.iconId).imageVector,
                label = null,
                progress = 0f,
                tint = tint,
                trackColor = palette.containerHigh,
                size = Size.badge,
            )
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                Text(item.stored.name, style = MaterialTheme.typography.titleMedium, color = palette.onSurface)
                Text(
                    stringResource(when {
                        alcohol?.isPaused == true || stats?.isPaused == true -> R.string.habit_stats_paused_short
                        alcohol?.todayHasConsumption == true || stats?.todayHasOccurrence == true -> R.string.habit_stats_today_occurrence_short
                        else -> R.string.habit_stats_active_short
                    }),
                    style = MaterialTheme.typography.labelMedium,
                    color = if (alcohol?.isPaused == true || alcohol?.todayHasConsumption == true || stats?.isPaused == true || stats?.todayHasOccurrence == true) palette.onSurfaceVariant else palette.success,
                )
            }
        }
        if (alcohol != null) {
            Spacer(Modifier.height(Space.xl))
            Row(verticalAlignment = Alignment.Bottom) {
                Text(alcohol.currentSoberDays.toString(), style = MaterialTheme.typography.displayMedium, color = palette.onSurface)
                Spacer(Modifier.width(Space.sm))
                Text(stringResource(R.string.alcohol_days_hero), style = MaterialTheme.typography.labelMedium, color = palette.success)
            }
            Spacer(Modifier.height(Space.xl))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.xxl)) {
                OverviewMetric(stringResource(R.string.alcohol_stats_observed_days, alcohol.drinkingDays30, alcohol.observedDays30),
                    stringResource(R.string.alcohol_stats_drinking_30))
                OverviewMetric(
                    alcohol.averageDaysBetweenDrinking?.let(::formatAlcoholAverage) ?: "—",
                    stringResource(R.string.alcohol_stats_frequency_label),
                )
            }
        } else stats?.let {
            Spacer(Modifier.height(Space.xl))
            Row(verticalAlignment = Alignment.Bottom) {
                Text(it.currentDays.toString(), style = MaterialTheme.typography.displayMedium, color = palette.onSurface)
                Spacer(Modifier.width(Space.sm))
                Text(stringResource(R.string.habit_stats_abstinence_hero), style = MaterialTheme.typography.labelMedium, color = palette.success)
            }
            Spacer(Modifier.height(Space.lg))
            val observed = it.observedDays30.coerceAtLeast(1)
            Box(Modifier.fillMaxWidth().height(Space.sm).clip(Radius.Pill).background(palette.containerHigh)) {
                Box(
                    Modifier.fillMaxWidth(it.clearDays30.toFloat() / observed).fillMaxHeight()
                        .clip(Radius.Pill).background(palette.success),
                )
            }
            Spacer(Modifier.height(Space.sm))
            Text(
                stringResource(R.string.habit_stats_abstinence_clear, it.clearDays30, it.observedDays30),
                style = MaterialTheme.typography.bodySmall,
                color = palette.onSurfaceVariant,
            )
            Spacer(Modifier.height(Space.xl))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.xxl)) {
                OverviewMetric(stringResource(R.string.habit_stats_days_short, it.bestDays), stringResource(R.string.habit_stats_record_label))
                OverviewMetric(it.occurrences30.toString(), stringResource(R.string.habit_stats_occurrences_label))
            }
        }
    }
}

@Composable
private fun OverviewMetric(value: String, label: String, color: Color = cadence.onSurface, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(Space.xs)) {
        Text(value, style = MaterialTheme.typography.titleLarge, color = color)
        Text(label, style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
    }
}
