package ch.nicolab.cadence

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.DateRange
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.LocalBar
import androidx.compose.material.icons.outlined.Speed
import ch.nicolab.cadence.designsystem.components.readableTintOf
import ch.nicolab.cadence.designsystem.components.MetricCard
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DatePickerState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import ch.nicolab.cadence.designsystem.components.ActionRow
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.ErrorText
import ch.nicolab.cadence.designsystem.components.HabitFacet
import ch.nicolab.cadence.designsystem.components.Hairline
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.components.SectionHeader
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.theme.MetricStyle
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.designsystem.theme.habitAccent
import ch.nicolab.cadence.domain.AbstinenceProfile
import ch.nicolab.cadence.domain.AlcoholConsumption
import ch.nicolab.cadence.domain.AlcoholStatisticsDay
import ch.nicolab.cadence.domain.AlcoholStatisticsDayStatus
import ch.nicolab.cadence.ui.components.ActivityCalendar
import ch.nicolab.cadence.ui.components.ActivityCalendarCell
import ch.nicolab.cadence.ui.components.ActivityCalendarTone
import ch.nicolab.cadence.ui.components.CalendarPeriod
import ch.nicolab.cadence.ui.components.CalendarPeriodSelector
import ch.nicolab.cadence.ui.icon.HabitIconRegistry
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.ui.unit.dp
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AlcoholDetailSheet(
    item: HabitCardState,
    dismiss: () -> Unit,
    recordToday: (() -> Unit) -> Unit,
    saveConsumption: (AlcoholConsumption?, LocalDate, Int, () -> Unit) -> Unit,
    deleteConsumption: (AlcoholConsumption, () -> Unit) -> Unit,
    editHabit: () -> Unit,
    initialConsumptionId: String? = null,
    busy: Boolean = false,
    error: String? = null,
) {
    val stats = item.alcoholStats ?: return
    val today = LocalDate.now()
    val observationStart = item.stored.abstinenceStartedOn() ?: item.stored.startsOn
    var editing by remember(item.stored.id) { mutableStateOf<AlcoholConsumption?>(null) }
    var addingPast by rememberSaveable(item.stored.id) { mutableStateOf(false) }
    var savedMessage by rememberSaveable(item.stored.id) { mutableStateOf(false) }
    var historyExpanded by rememberSaveable(item.stored.id) { mutableStateOf(false) }
    LaunchedEffect(initialConsumptionId, item.alcoholConsumptions) {
        if (initialConsumptionId != null) {
            editing = item.alcoholConsumptions.firstOrNull { it.id == initialConsumptionId && it.standardDrinks == null }
        }
    }

    CadenceSheet(item.stored.name, null, dismiss = { if (!busy) dismiss() }) {
        LazyColumn(
            Modifier.weight(1f, fill = false).heightIn(max = Size.sheetContent).testTag("alcohol_detail_list"),
            verticalArrangement = Arrangement.spacedBy(Space.xl),
        ) {
            if (error != null) item { ErrorText(error) }
            item {
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                    Text(stats.currentSoberDays.toString(), style = MaterialTheme.typography.displayLarge, color = readableTintOf(cadence.habitAccent(item.stored.colorArgb)))
                    Text(stringResource(R.string.alcohol_days_hero), style = MaterialTheme.typography.titleMedium, color = cadence.onSurfaceVariant)
                }
            }
            item { LiveAbstinenceCounter(item, cadence.habitAccent(item.stored.colorArgb)) }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                    val plan = stats.restPlan
                    Text(
                        if (plan == null) stringResource(if (stats.pendingQuantityDates.isEmpty()) R.string.alcohol_rest_complete else R.string.alcohol_rest_pending)
                        else stringResource(R.string.alcohol_rest_until, displayAbstinenceDate(plan.avoidThrough)),
                        style = MaterialTheme.typography.titleMedium,
                        color = if (plan == null) cadence.onSurfaceVariant else cadence.onSurface,
                    )
                    plan?.let {
                        Text(stringResource(R.string.alcohol_rest_unrestricted, displayAbstinenceDate(it.nextUnrestrictedOn)), style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant)
                    }
                }
            }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                    PrimaryAction(
                        stringResource(if (stats.todayHasConsumption) R.string.alcohol_today_recorded else R.string.alcohol_today_action),
                        Modifier.fillMaxWidth(),
                        accent = cadence.habitAccent(item.stored.colorArgb),
                        enabled = !busy && !stats.isPaused && !stats.todayHasConsumption,
                    ) {
                        recordToday { savedMessage = true }
                    }
                    SecondaryAction(stringResource(R.string.alcohol_past_action), Modifier.fillMaxWidth(), enabled = !busy) {
                        addingPast = true
                    }
                    if (savedMessage) Text(stringResource(R.string.alcohol_today_saved), style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
                }
            }
            if (stats.pendingQuantityDates.isNotEmpty()) item {
                Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                    SectionHeader(stringResource(R.string.alcohol_pending_title))
                    item.alcoholConsumptions.filter { it.standardDrinks == null }.forEach { consumption ->
                        PendingAlcoholQuantityAction(consumption.localDate) { editing = consumption }
                    }
                }
            }
            val allKnownConsumptions = item.alcoholConsumptions.filter { it.standardDrinks != null }
            val knownConsumptions = if (historyExpanded) allKnownConsumptions else allKnownConsumptions.take(3)
            if (knownConsumptions.isNotEmpty()) {
                item { SectionHeader(stringResource(R.string.alcohol_history_title)) }
                items(knownConsumptions, key = { "known-${it.id}" }) { consumption ->
                    val drinks = requireNotNull(consumption.standardDrinks)
                    TertiaryAction(
                        pluralStringResource(R.plurals.alcohol_history_item, drinks,
                            displayAbstinenceDate(consumption.localDate), drinks),
                        Modifier.fillMaxWidth(),
                    ) { editing = consumption }
                }
                if (allKnownConsumptions.size > 3) item {
                    TertiaryAction(
                        stringResource(if (historyExpanded) R.string.alcohol_history_reduce else R.string.alcohol_history_more),
                        Modifier.fillMaxWidth(),
                    ) { historyExpanded = !historyExpanded }
                }
            }
            item { AbstinenceMilestones(AbstinenceProfile.ALCOHOL, stats.currentSoberDays) }
            item { Text(stringResource(R.string.abstinence_assumption), style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant) }
        }
        Spacer(Modifier.height(Space.sm))
        TextButton(enabled = !busy, onClick = editHabit) { Text(stringResource(R.string.abst_edit)) }
    }

    if (addingPast || editing != null) {
        AlcoholConsumptionEditor(
            existing = editing,
            startsOn = observationStart,
            initialDate = editing?.localDate ?: today.minusDays(1).coerceAtLeast(observationStart),
            busy = busy,
            error = error,
            dismiss = { if (!busy) { editing = null; addingPast = false } },
            save = { date, drinks ->
                saveConsumption(editing, date, drinks) { editing = null; addingPast = false }
            },
            delete = editing?.let { consumption ->
                { deleteConsumption(consumption) { editing = null; addingPast = false } }
            },
        )
    }
}

@Composable
private fun PendingAlcoholQuantityAction(date: LocalDate, onClick: () -> Unit) {
    val accent = cadence.onPrimaryContainer
    Row(
        Modifier
            .fillMaxWidth()
            .clip(Radius.Control)
            .background(cadence.primaryContainer)
            .clickable(onClick = onClick)
            .padding(Space.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Space.md),
    ) {
        Icon(Icons.Outlined.Edit, contentDescription = null, tint = accent, modifier = Modifier.size(Size.iconLarge))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
            Text(displayAbstinenceDate(date), style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
            Text(stringResource(R.string.alcohol_pending_action), style = MaterialTheme.typography.labelLarge, color = accent)
        }
        Icon(Icons.Outlined.ChevronRight, contentDescription = null, tint = accent, modifier = Modifier.size(Size.iconLarge))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AlcoholConsumptionEditor(
    existing: AlcoholConsumption?,
    startsOn: LocalDate,
    initialDate: LocalDate,
    busy: Boolean,
    error: String?,
    dismiss: () -> Unit,
    save: (LocalDate, Int) -> Unit,
    delete: (() -> Unit)?,
) {
    var date by rememberSaveable(existing?.id) { mutableStateOf(initialDate) }
    var drinks by rememberSaveable(existing?.id) { mutableStateOf(existing?.standardDrinks?.toString().orEmpty()) }
    var dateOpen by remember { mutableStateOf(false) }
    var validation by remember { mutableStateOf<Int?>(null) }
    val today = LocalDate.now()
    val accent = cadence.primary
    CadenceSheet(stringResource(R.string.alcohol_count_title), stringResource(R.string.alcohol_count_subtitle), dismiss) {
        ActionRow(Icons.Outlined.DateRange, displayAbstinenceDate(date), accent) { if (!busy) dateOpen = true }
        Spacer(Modifier.height(Space.lg))
        CadenceField(drinks, { drinks = it.filter(Char::isDigit) }, stringResource(R.string.alcohol_count_label), accent = accent, numeric = true)
        Spacer(Modifier.height(Space.sm))
        Text(stringResource(R.string.alcohol_count_examples), style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
        (validation?.let { stringResource(it) } ?: error)?.let { Spacer(Modifier.height(Space.md)); ErrorText(it) }
        Spacer(Modifier.height(Space.xl))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.md)) {
            SecondaryAction(stringResource(R.string.form_btn_cancel), Modifier.weight(1f), onClick = dismiss)
            PrimaryAction(stringResource(R.string.form_btn_save), Modifier.weight(1f), accent = accent, enabled = !busy) {
                val amount = drinks.toIntOrNull()
                validation = when {
                    date !in startsOn..today -> R.string.alcohol_date_invalid
                    amount == null || amount <= 0 -> R.string.alcohol_count_invalid
                    else -> null
                }
                if (validation == null) save(date, amount!!)
            }
        }
        delete?.let {
            Spacer(Modifier.height(Space.sm))
            TertiaryAction(stringResource(R.string.alcohol_delete_day), Modifier.fillMaxWidth()) { if (!busy) it() }
        }
    }
    if (dateOpen) {
        val state = remember(date, startsOn, today) {
            DatePickerState(
                locale = Locale.FRENCH,
                initialSelectedDateMillis = date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
                selectableDates = object : SelectableDates {
                    override fun isSelectableDate(utcTimeMillis: Long): Boolean {
                        val candidate = Instant.ofEpochMilli(utcTimeMillis).atZone(ZoneOffset.UTC).toLocalDate()
                        return candidate in startsOn..today
                    }
                },
            )
        }
        DatePickerDialog(
            onDismissRequest = { dateOpen = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { date = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate() }
                    dateOpen = false
                }) { Text(stringResource(R.string.abst_setup_date_confirm)) }
            },
            dismissButton = { TextButton(onClick = { dateOpen = false }) { Text(stringResource(R.string.form_btn_cancel)) } },
        ) { DatePicker(state) }
    }
}

@Composable
private fun AlcoholStatisticsHero(
    stats: ch.nicolab.cadence.domain.AlcoholStats,
    accent: Color,
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
                            .background(palette.successContainer)
                            .padding(horizontal = Space.md, vertical = Space.sm),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = stringResource(R.string.habit_stats_days_short, stats.currentSoberDays),
                            style = MaterialTheme.typography.headlineMedium,
                            color = palette.success,
                        )
                    }
                    Column(Modifier.weight(1f)) {
                        Text(
                            text = stringResource(R.string.alcohol_days_hero),
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
                        text = "${stringResource(R.string.alcohol_stats_record)} : ${stringResource(R.string.habit_stats_days_short, stats.bestSoberDays)}",
                        style = MaterialTheme.typography.labelMedium,
                        color = palette.onPrimaryContainer,
                        maxLines = 1,
                        softWrap = false,
                    )
                }
            }
            val averageSober = stats.averageSoberDaysBetweenDrinking
            if (stats.exceedsUsualSoberGap && averageSober != null) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clip(Radius.Chip)
                        .background(palette.successContainer)
                        .padding(horizontal = Space.md, vertical = Space.sm),
                    horizontalArrangement = Arrangement.spacedBy(Space.sm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Outlined.EmojiEvents, contentDescription = null, tint = palette.success, modifier = Modifier.size(Size.icon))
                    Text(
                        text = stringResource(R.string.alcohol_stats_congratulations, stats.currentSoberDays, formatAlcoholAverage(averageSober)),
                        style = MaterialTheme.typography.bodySmall,
                        color = palette.success,
                    )
                }
            }
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Space.sm),
            ) {
                MetricCard(
                    value = stats.averageDaysBetweenDrinking?.let { "${formatAlcoholAverage(it)} j" } ?: "—",
                    label = stringResource(R.string.alcohol_stats_frequency_label),
                    icon = Icons.Outlined.Speed,
                    iconTint = accent,
                    modifier = Modifier.weight(1f),
                )
                MetricCard(
                    value = stats.averageSoberDaysBetweenDrinking?.let { "${formatAlcoholAverage(it)} j" } ?: "—",
                    label = stringResource(R.string.alcohol_stats_average_sober_short),
                    icon = Icons.Outlined.CheckCircle,
                    iconTint = palette.success,
                    modifier = Modifier.weight(1f),
                )
                MetricCard(
                    value = "${stats.drinkingDays90} / ${stats.observedDays90}",
                    label = stringResource(R.string.alcohol_stats_drinking_days_label),
                    icon = Icons.Outlined.DateRange,
                    iconTint = palette.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AlcoholStatisticsSheet(item: HabitCardState, dismiss: () -> Unit) {
    val stats = item.alcoholStats ?: return
    var period by rememberSaveable { mutableStateOf(CalendarPeriod.DAYS_90) }
    val today = LocalDate.now()
    val accent = cadence.habitAccent(item.stored.colorArgb)

    CadenceSheet(
        title = item.stored.name,
        subtitle = stringResource(R.string.alcohol_stats_detail_subtitle),
        dismiss = dismiss,
        modifier = Modifier.fillMaxHeight(0.94f),
        leading = {
            HabitFacet(
                icon = HabitIconRegistry.getIcon(item.stored.iconId).imageVector,
                label = null,
                progress = 0f,
                tint = accent,
                trackColor = cadence.containerHigh,
                size = 48.dp,
            )
        },
    ) {
        LazyColumn(
            Modifier.fillMaxWidth().weight(1f),
            verticalArrangement = Arrangement.spacedBy(Space.lg),
        ) {
            item {
                AlcoholStatisticsHero(stats = stats, accent = accent)
            }
            item {
                CalendarPeriodSelector(
                    selected = period,
                    onSelect = { period = it },
                )
            }
            item {
                val (drinkingDays, observedDays, standardDrinks) = when (period) {
                    CalendarPeriod.DAYS_30 -> Triple(stats.drinkingDays30, stats.observedDays30, stats.standardDrinks30)
                    CalendarPeriod.DAYS_90 -> Triple(stats.drinkingDays90, stats.observedDays90, stats.standardDrinks30)
                    CalendarPeriod.YEAR_1 -> Triple(stats.drinkingDays365, stats.observedDays365, stats.standardDrinks365)
                    CalendarPeriod.ALL_TIME -> Triple(stats.drinkingDaysAllTime, stats.observedDaysAllTime, stats.standardDrinksAllTime)
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                    MetricCard(
                        value = "$drinkingDays / $observedDays",
                        label = stringResource(R.string.alcohol_stats_drinking_days_label),
                        icon = Icons.Outlined.EventBusy,
                        iconTint = if (drinkingDays > 0) cadence.error else cadence.onSurfaceVariant,
                        valueColor = if (drinkingDays > 0) cadence.error else cadence.onSurface,
                        modifier = Modifier.weight(1f),
                    )
                    MetricCard(
                        value = stats.averageSoberDaysBetweenDrinking?.let(::formatAlcoholAverage)?.let { "$it j" } ?: "—",
                        label = stringResource(R.string.alcohol_stats_average_sober_short),
                        icon = Icons.Outlined.CheckCircle,
                        iconTint = cadence.success,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
            item {
                val standardDrinks = when (period) {
                    CalendarPeriod.DAYS_30 -> stats.standardDrinks30
                    CalendarPeriod.DAYS_90 -> stats.standardDrinks30
                    CalendarPeriod.YEAR_1 -> stats.standardDrinks365
                    CalendarPeriod.ALL_TIME -> stats.standardDrinksAllTime
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                    MetricCard(
                        value = stringResource(R.string.alcohol_stats_drinks_30, standardDrinks),
                        label = stringResource(R.string.alcohol_stats_known_drinks_short),
                        icon = Icons.Outlined.LocalBar,
                        iconTint = accent,
                        modifier = Modifier.weight(1f),
                    )
                    MetricCard(
                        value = stats.averageDrinksPerDrinkingDay30?.let(::formatAlcoholAverage) ?: "—",
                        label = stringResource(R.string.alcohol_stats_average_drinks_short),
                        icon = Icons.Outlined.Speed,
                        iconTint = accent,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
            item { Hairline() }
            item {
                val filteredDays = when (period) {
                    CalendarPeriod.DAYS_30 -> stats.days.filter { it.date >= today.minusDays(29) }
                    CalendarPeriod.DAYS_90 -> stats.days.filter { it.date >= today.minusDays(89) }
                    CalendarPeriod.YEAR_1 -> stats.days.filter { it.date >= today.minusDays(364) }
                    CalendarPeriod.ALL_TIME -> stats.days
                }
                AlcoholCalendar(filteredDays)
            }
            item { Text(stringResource(R.string.abstinence_assumption), style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant) }
            item { SectionHeader(stringResource(R.string.alcohol_stats_full_history)) }
            if (item.alcoholConsumptions.isEmpty()) item {
                Text(stringResource(R.string.entries_empty), style = MaterialTheme.typography.bodySmall, color = cadence.outline)
            }
            items(item.alcoholConsumptions, key = { "consumption-${it.id}" }) { consumption ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(displayAbstinenceDate(consumption.localDate), style = MaterialTheme.typography.bodyMedium, color = cadence.onSurface)
                    Text(consumption.standardDrinks?.let { drinks -> pluralStringResource(R.plurals.alcohol_drinks_known, drinks, drinks) }
                        ?: stringResource(R.string.alcohol_stats_unknown_history),
                        style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun AlcoholMetric(value: String, label: String, color: Color = cadence.onSurface, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(Space.xs)) {
        Text(value, style = MaterialTheme.typography.titleLarge, color = color)
        Text(label, style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
    }
}

@Composable
private fun AlcoholCalendar(days: List<AlcoholStatisticsDay>) {
    if (days.isEmpty()) return
    val cells = days.map { day ->
        val tone = when (day.status) {
            AlcoholStatisticsDayStatus.DRINKING, AlcoholStatisticsDayStatus.TODAY_DRINKING -> ActivityCalendarTone.DANGER
            AlcoholStatisticsDayStatus.CLEAR -> ActivityCalendarTone.SUCCESS
            AlcoholStatisticsDayStatus.TODAY_CLEAR -> ActivityCalendarTone.SUCCESS_SOFT
            AlcoholStatisticsDayStatus.PAUSED, AlcoholStatisticsDayStatus.UNOBSERVED -> ActivityCalendarTone.NEUTRAL
        }
        val label = alcoholDayLabel(day)
        val dateText = displayAbstinenceDate(day.date)
        ActivityCalendarCell(
            date = day.date,
            tone = tone,
            contentDescription = "$dateText : $label",
            detailText = stringResource(R.string.alcohol_stats_calendar_selected, dateText, label),
        )
    }
    ActivityCalendar(
        cells = cells,
        title = stringResource(R.string.alcohol_stats_calendar),
    )
}

@Composable
private fun alcoholDayLabel(day: AlcoholStatisticsDay): String = when (day.status) {
    AlcoholStatisticsDayStatus.DRINKING, AlcoholStatisticsDayStatus.TODAY_DRINKING ->
        day.standardDrinks?.let { pluralStringResource(R.plurals.alcohol_drinks_known, it, it) }
            ?: stringResource(R.string.alcohol_stats_drinking_day)
    AlcoholStatisticsDayStatus.CLEAR -> stringResource(R.string.alcohol_stats_clear_day)
    AlcoholStatisticsDayStatus.TODAY_CLEAR -> stringResource(R.string.alcohol_stats_today_clear)
    AlcoholStatisticsDayStatus.PAUSED -> stringResource(R.string.alcohol_stats_paused_day)
    AlcoholStatisticsDayStatus.UNOBSERVED -> stringResource(R.string.alcohol_stats_unobserved_day)
}

internal fun formatAlcoholAverage(value: Double): String = String.format(Locale.FRENCH, "%.1f", value)

private fun LocalDate.coerceAtLeast(minimum: LocalDate): LocalDate = if (this < minimum) minimum else this
