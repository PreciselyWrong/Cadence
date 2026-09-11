package ch.nicolab.cadence

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DateRange
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DatePickerState
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import ch.nicolab.cadence.domain.AbstinenceProfile
import ch.nicolab.cadence.domain.AlcoholConsumption
import ch.nicolab.cadence.domain.AlcoholStatisticsDay
import ch.nicolab.cadence.domain.AlcoholStatisticsDayStatus
import ch.nicolab.cadence.ui.components.ActionRow
import ch.nicolab.cadence.ui.components.ActivityCalendar
import ch.nicolab.cadence.ui.components.ActivityCalendarCell
import ch.nicolab.cadence.ui.components.ActivityCalendarTone
import ch.nicolab.cadence.ui.components.CadenceField
import ch.nicolab.cadence.ui.components.CadenceSheet
import ch.nicolab.cadence.ui.components.ErrorText
import ch.nicolab.cadence.ui.components.Hairline
import ch.nicolab.cadence.ui.components.PrimaryAction
import ch.nicolab.cadence.ui.components.SecondaryAction
import ch.nicolab.cadence.ui.components.SectionLabel
import ch.nicolab.cadence.ui.components.TertiaryAction
import ch.nicolab.cadence.ui.theme.Radius
import ch.nicolab.cadence.ui.theme.Size
import ch.nicolab.cadence.ui.theme.Space
import ch.nicolab.cadence.ui.theme.cadence
import ch.nicolab.cadence.ui.theme.habitAccent
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
    LaunchedEffect(initialConsumptionId, item.alcoholConsumptions) {
        if (initialConsumptionId != null) {
            editing = item.alcoholConsumptions.firstOrNull { it.id == initialConsumptionId && it.standardDrinks == null }
        }
    }

    CadenceSheet(item.stored.name, null, dismiss = { if (!busy) dismiss() }) {
        LazyColumn(
            Modifier.weight(1f, fill = false).heightIn(max = Size.sheetContent),
            verticalArrangement = Arrangement.spacedBy(Space.xl),
        ) {
            if (error != null) item { ErrorText(error) }
            item {
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                    Text(stats.currentSoberDays.toString(), style = MaterialTheme.typography.displayLarge, color = cadence.habitAccent(item.stored.colorArgb))
                    Text(stringResource(R.string.alcohol_days_hero), style = MaterialTheme.typography.titleMedium, color = cadence.inkMuted)
                }
            }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                    val plan = stats.restPlan
                    Text(
                        if (plan == null) stringResource(if (stats.pendingQuantityDates.isEmpty()) R.string.alcohol_rest_complete else R.string.alcohol_rest_pending)
                        else stringResource(R.string.alcohol_rest_until, displayAbstinenceDate(plan.avoidThrough)),
                        style = MaterialTheme.typography.titleMedium,
                        color = if (plan == null) cadence.inkMuted else cadence.ink,
                    )
                    plan?.let {
                        Text(stringResource(R.string.alcohol_rest_unrestricted, displayAbstinenceDate(it.nextUnrestrictedOn)), style = MaterialTheme.typography.bodyMedium, color = cadence.inkMuted)
                    }
                    Text(stringResource(R.string.alcohol_rest_next), style = MaterialTheme.typography.bodySmall, color = cadence.inkFaint)
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
                    if (savedMessage) Text(stringResource(R.string.alcohol_today_saved), style = MaterialTheme.typography.bodySmall, color = cadence.inkMuted)
                }
            }
            if (stats.pendingQuantityDates.isNotEmpty()) item {
                Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                    SectionLabel(stringResource(R.string.alcohol_pending_title))
                    item.alcoholConsumptions.filter { it.standardDrinks == null }.forEach { consumption ->
                        TertiaryAction(
                            stringResource(R.string.alcohol_pending_item, displayAbstinenceDate(consumption.localDate)),
                            Modifier.fillMaxWidth(),
                        ) { editing = consumption }
                    }
                }
            }
            val knownConsumptions = item.alcoholConsumptions.filter { it.standardDrinks != null }.take(12)
            if (knownConsumptions.isNotEmpty()) item {
                Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                    SectionLabel(stringResource(R.string.alcohol_history_title))
                    knownConsumptions.forEach { consumption ->
                        val drinks = requireNotNull(consumption.standardDrinks)
                        TertiaryAction(
                            pluralStringResource(
                                R.plurals.alcohol_history_item,
                                drinks,
                                displayAbstinenceDate(consumption.localDate),
                                drinks,
                            ),
                            Modifier.fillMaxWidth(),
                        ) { editing = consumption }
                    }
                }
            }
            item { Hairline() }
            item { AbstinenceMilestones(AbstinenceProfile.ALCOHOL, stats.currentSoberDays) }
            item { Text(stringResource(R.string.abstinence_assumption), style = MaterialTheme.typography.bodySmall, color = cadence.inkMuted) }
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
    val accent = cadence.accent
    CadenceSheet(stringResource(R.string.alcohol_count_title), stringResource(R.string.alcohol_count_subtitle), dismiss) {
        ActionRow(Icons.Outlined.DateRange, displayAbstinenceDate(date), accent) { if (!busy) dateOpen = true }
        Spacer(Modifier.height(Space.lg))
        CadenceField(drinks, { drinks = it.filter(Char::isDigit) }, stringResource(R.string.alcohol_count_label), accent = accent, numeric = true)
        Spacer(Modifier.height(Space.sm))
        Text(stringResource(R.string.alcohol_count_examples), style = MaterialTheme.typography.bodySmall, color = cadence.inkMuted)
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AlcoholStatisticsSheet(item: HabitCardState, dismiss: () -> Unit) {
    val stats = item.alcoholStats ?: return
    CadenceSheet(item.stored.name, stringResource(R.string.alcohol_stats_detail_subtitle), dismiss) {
        LazyColumn(
            Modifier.weight(1f, fill = false).heightIn(max = Size.sheetContent),
            verticalArrangement = Arrangement.spacedBy(Space.lg),
        ) {
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.xl)) {
                    AlcoholMetric(stats.currentSoberDays.toString(), stringResource(R.string.alcohol_days_hero), cadence.success, Modifier.weight(1f))
                    AlcoholMetric(stats.bestSoberDays.toString(), stringResource(R.string.alcohol_stats_record), cadence.ink, Modifier.weight(1f))
                }
            }
            item {
                val average = stats.averageDaysBetweenDrinking
                Text(
                    if (average == null) stringResource(R.string.alcohol_stats_frequency_missing)
                    else stringResource(R.string.alcohol_stats_frequency, formatAlcoholAverage(average)),
                    style = MaterialTheme.typography.titleMedium,
                    color = cadence.ink,
                )
                val averageSober = stats.averageSoberDaysBetweenDrinking
                if (stats.exceedsUsualSoberGap && averageSober != null) {
                    Spacer(Modifier.height(Space.sm))
                    Text(
                        stringResource(R.string.alcohol_stats_congratulations, stats.currentSoberDays, formatAlcoholAverage(averageSober)),
                        style = MaterialTheme.typography.bodyMedium,
                        color = cadence.success,
                    )
                }
            }
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.xl)) {
                    AlcoholMetric(stringResource(R.string.alcohol_stats_days_30, stats.drinkingDays30), stringResource(R.string.alcohol_stats_drinking_days), modifier = Modifier.weight(1f))
                    AlcoholMetric(stringResource(R.string.alcohol_stats_days_90, stats.drinkingDays90), stringResource(R.string.alcohol_stats_drinking_days), modifier = Modifier.weight(1f))
                }
            }
            item {
                Text(stringResource(R.string.alcohol_stats_drinks_30, stats.standardDrinks30), style = MaterialTheme.typography.titleMedium, color = cadence.ink)
                Text(stringResource(R.string.alcohol_stats_completeness, stats.knownQuantityDays30, stats.quantityDays30), style = MaterialTheme.typography.bodySmall, color = cadence.inkMuted)
            }
            item { Hairline() }
            item { AlcoholCalendar(stats.days) }
            item { Text(stringResource(R.string.abstinence_assumption), style = MaterialTheme.typography.bodySmall, color = cadence.inkMuted) }
        }
    }
}

@Composable
private fun AlcoholMetric(value: String, label: String, color: Color = cadence.ink, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(Space.xs)) {
        Text(value, style = MaterialTheme.typography.titleLarge, color = color)
        Text(label, style = MaterialTheme.typography.labelSmall, color = cadence.inkFaint)
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
