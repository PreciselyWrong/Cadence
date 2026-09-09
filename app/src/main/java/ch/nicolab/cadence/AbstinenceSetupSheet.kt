package ch.nicolab.cadence

import android.content.res.Configuration
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DateRange
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.*
import ch.nicolab.cadence.ui.components.*
import ch.nicolab.cadence.ui.icon.HabitIconRegistry
import ch.nicolab.cadence.ui.theme.Size
import ch.nicolab.cadence.ui.theme.Space
import ch.nicolab.cadence.ui.theme.cadence
import ch.nicolab.cadence.ui.theme.habitAccent
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneOffset
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.text.Collator
import java.util.Locale
import java.util.UUID

internal fun abstinenceIconId(profile: AbstinenceProfile): String = when (profile) {
    AbstinenceProfile.SMOKING, AbstinenceProfile.VAPING -> "smoke-free"
    AbstinenceProfile.CAFFEINE -> "coffee"
    AbstinenceProfile.ALCOHOL -> "water"
    AbstinenceProfile.CANNABIS, AbstinenceProfile.MASTURBATION -> "spa"
    AbstinenceProfile.GAMBLING -> "money"
    AbstinenceProfile.SOCIAL_MEDIA, AbstinenceProfile.PORNOGRAPHY -> "phone"
    AbstinenceProfile.BEDTIME_SCREENS -> "bed"
    AbstinenceProfile.IMPULSE_SHOPPING -> "shopping"
    else -> HabitIconRegistry.DEFAULT_ICON_ID
}

internal fun displayAbstinenceDate(date: LocalDate): String =
    date.format(DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.FRENCH))

internal fun sortedAbstinenceProfiles(
    profiles: Collection<AbstinenceProfile> = AbstinenceProfile.entries.filter { it != AbstinenceProfile.NONE },
    label: (AbstinenceProfile) -> String,
): List<AbstinenceProfile> {
    val collator = Collator.getInstance(Locale.FRENCH)
    return profiles.sortedWith { left, right ->
        when {
            left == AbstinenceProfile.CUSTOM -> if (right == AbstinenceProfile.CUSTOM) 0 else 1
            right == AbstinenceProfile.CUSTOM -> -1
            else -> collator.compare(label(left), label(right))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun AbstinenceSetupSheet(
    existing: HabitCardState?,
    groups: List<HabitGroup>,
    dismiss: () -> Unit,
    save: (PersistedHabit, List<Long>, List<String>, Boolean, Boolean) -> Unit,
    busy: Boolean = false,
    error: String? = null,
) {
    val stored = existing?.stored
    val habitId = rememberSaveable(stored?.id) { stored?.id ?: UUID.randomUUID().toString() }
    var profile by rememberSaveable(stored?.id) { mutableStateOf(stored?.abstinenceProfile ?: AbstinenceProfile.NONE) }
    var choosing by rememberSaveable(stored?.id) { mutableStateOf(stored == null) }
    val listState = remember(choosing) { LazyListState() }
    var name by rememberSaveable(stored?.id) { mutableStateOf(stored?.name.orEmpty()) }
    val currencyCode = rememberSaveable(stored?.id) { stored?.abstinenceSavingsCurrency ?: defaultCurrencyCode() }
    var savingsText by rememberSaveable(stored?.id) {
        mutableStateOf(dailySavingsInput(stored?.abstinenceSavingsDailyMinor, currencyCode))
    }
    val initialStart = stored?.abstinenceStartedAt?.atZone(ZoneId.systemDefault())
        ?: java.time.ZonedDateTime.now().withSecond(0).withNano(0)
    var startText by rememberSaveable(stored?.id) { mutableStateOf(initialStart.toLocalDate().toString()) }
    var startTimeText by rememberSaveable(stored?.id) { mutableStateOf(initialStart.toLocalTime().toString()) }
    var groupId by rememberSaveable(stored?.id) { mutableStateOf(stored?.groupId ?: HabitGroup.ALL_DAY_ID) }
    var reminder by rememberSaveable(stored?.id) { mutableStateOf(existing?.reminders?.joinToString(", ") { it.time }.orEmpty()) }
    var dateOpen by remember { mutableStateOf(false) }
    var timeOpen by remember { mutableStateOf(false) }
    var validation by remember { mutableStateOf<Int?>(null) }
    val start = LocalDate.parse(startText)
    val startTime = LocalTime.parse(startTimeText)
    val startAt = start.atTime(startTime).atZone(ZoneId.systemDefault()).toInstant()
    val palette = cadence
    val accent = palette.habitAccent(stored?.colorArgb)
    val content = AbstinenceGuide.content(profile)
    val resources = LocalResources.current
    val profileChoices = remember(resources.configuration) {
        sortedAbstinenceProfiles { resources.getString(AbstinenceGuide.content(it).label) }
    }
    val close = { if (!busy) dismiss() }

    CadenceSheet(
        title = stringResource(if (choosing) R.string.abst_setup_title else R.string.abst_setup_personal),
        subtitle = stringResource(if (choosing) R.string.abst_setup_subtitle else R.string.abst_setup_personal_subtitle),
        dismiss = close,
    ) {
        LazyColumn(Modifier.weight(1f, fill = false).heightIn(max = Size.sheetContent),
            state = listState,
            verticalArrangement = Arrangement.spacedBy(Space.lg),
        ) {
            if (choosing) {
                items(profileChoices, key = { it.name }) { choice ->
                    val info = AbstinenceGuide.content(choice)
                    val defaultName = stringResource(info.defaultName)
                    ActionRow(HabitIconRegistry.getIcon(abstinenceIconId(choice)).imageVector,
                        stringResource(info.label), accent,
                    ) { profile = choice; name = defaultName; choosing = false }
                }
            } else {
                item {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(Space.lg)) {
                        HabitFacet(
                            icon = HabitIconRegistry.getIcon(abstinenceIconId(profile)).imageVector,
                            label = null,
                            progress = 0f,
                            tint = accent,
                            trackColor = palette.hairline,
                            size = Size.badge,
                        )
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                            Text(stringResource(content.description), style = MaterialTheme.typography.bodyMedium, color = palette.inkMuted)
                        }
                    }
                }
                item { CadenceField(name, { name = it.take(80) }, stringResource(R.string.abst_setup_name), accent = accent) }
                item { CadenceField(savingsText, { savingsText = it.take(18) }, stringResource(R.string.abst_setup_savings),
                    placeholder = stringResource(R.string.abst_setup_savings_hint),
                    support = stringResource(R.string.abst_setup_savings_help), suffix = currencyCode, accent = accent, decimal = true) }
                item {
                    ActionRow(Icons.Outlined.DateRange, stringResource(R.string.abst_setup_start, displayAbstinenceDate(start)), accent) {
                        if (!busy) dateOpen = true
                    }
                    Spacer(Modifier.height(Space.sm))
                    ActionRow(Icons.Outlined.AccessTime, stringResource(R.string.abst_setup_time, startTime), accent) {
                        if (!busy) timeOpen = true
                    }
                    Spacer(Modifier.height(Space.sm))
                    Text(stringResource(R.string.abst_setup_start_help), style = MaterialTheme.typography.bodySmall, color = palette.inkMuted)
                }
                item {
                    CadenceField(reminder, { reminder = it }, stringResource(R.string.abst_setup_reminder),
                        placeholder = stringResource(R.string.abst_setup_reminder_placeholder),
                        support = stringResource(R.string.abst_setup_reminder_help), accent = accent)
                }
                if (groups.size > 1) item {
                    FieldGroup(stringResource(R.string.habit_form_group_label)) {
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                            groups.forEach { group -> ChoiceChip(group.name, groupId == group.id, accent = accent) { groupId = group.id } }
                        }
                    }
                }
                if (stored != null) item { Text(stringResource(R.string.abst_setup_profile_locked),
                    style = MaterialTheme.typography.bodySmall, color = palette.inkMuted) }
                content.notice?.let { notice -> item {
                    Text(stringResource(notice), style = MaterialTheme.typography.bodySmall, color = palette.inkMuted)
                } }
            }
        }
        (error ?: validation?.let { stringResource(it) })?.let {
            Spacer(Modifier.height(Space.md)); ErrorText(it)
        }
        Spacer(Modifier.height(Space.lg))
        if (!choosing) PrimaryAction(
            stringResource(if (busy) R.string.abst_setup_saving else if (stored == null) R.string.abst_setup_save else R.string.form_btn_save),
            Modifier.fillMaxWidth(), accent, enabled = !busy,
        ) {
            val times = reminder.split(',', ' ').filter(String::isNotBlank)
            val savingsMinor = parseDailySavingsMinor(savingsText, currencyCode)
            validation = when {
                name.isBlank() || startAt > Instant.now() || profile == AbstinenceProfile.NONE -> R.string.abst_setup_invalid
                savingsText.isNotBlank() && savingsMinor == null -> R.string.abst_setup_bad_savings
                times.any { runCatching { LocalTime.parse(it) }.isFailure } -> R.string.abst_setup_bad_reminder
                else -> null
            }
            if (validation == null) {
                val habit = stored?.copy(name = name.trim(), description = null, groupId = groupId,
                    startsOn = minOf(stored.startsOn, start),
                    abstinenceStartedAt = startAt, abstinenceSavingsDailyMinor = savingsMinor,
                    abstinenceSavingsCurrency = currencyCode.takeIf { savingsMinor != null })
                    ?: PersistedHabit(
                        id = habitId, name = name.trim(), description = null,
                        iconId = abstinenceIconId(profile), colorArgb = accent.toArgb(), active = true, startsOn = start,
                        groupId = groupId, abstinenceProfile = profile, abstinenceStartedAt = startAt,
                        abstinenceSavingsDailyMinor = savingsMinor,
                        abstinenceSavingsCurrency = currencyCode.takeIf { savingsMinor != null },
                        goal = HabitGoal(0, PeriodType.DAY, GoalType.COUNT, MeasurementUnit.COUNT, direction = GoalDirection.AT_MOST),
                        schedule = HabitSchedule(mode = ScheduleMode.EVERY_DAY),
                    )
                save(habit, listOf(1), times, true, stored == null)
            }
        }
        Spacer(Modifier.height(Space.sm))
        TertiaryAction(stringResource(if (!choosing && stored == null) R.string.form_btn_back else R.string.form_btn_cancel),
            Modifier.fillMaxWidth(),
        ) { if (!busy) { if (!choosing && stored == null) choosing = true else close() } }
    }
    if (dateOpen) {
        val context = LocalContext.current
        val configuration = LocalConfiguration.current
        val calendarConfiguration = remember(configuration) {
            Configuration(configuration).apply { setLocale(Locale.FRENCH) }
        }
        val calendarContext = remember(context, calendarConfiguration) {
            context.createConfigurationContext(calendarConfiguration)
        }
        val dateState = remember(startText) {
            DatePickerState(
                locale = Locale.FRENCH,
                initialSelectedDateMillis = start.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
                selectableDates = object : SelectableDates {
                    override fun isSelectableDate(utcTimeMillis: Long): Boolean =
                        Instant.ofEpochMilli(utcTimeMillis).atZone(ZoneOffset.UTC).toLocalDate() <= LocalDate.now()
                },
            )
        }
        DatePickerDialog(onDismissRequest = { dateOpen = false },
            confirmButton = { TextButton(enabled = dateState.selectedDateMillis != null, onClick = {
                dateState.selectedDateMillis?.let { startText = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString() }
                dateOpen = false
            }) { Text(stringResource(R.string.abst_setup_date_confirm)) } },
            dismissButton = { TextButton(onClick = { dateOpen = false }) { Text(stringResource(R.string.form_btn_cancel)) } },
        ) {
            // Le dialogue recrée ses locaux : la langue se fournit dans son contenu.
            CompositionLocalProvider(
                LocalContext provides calendarContext,
                LocalConfiguration provides calendarConfiguration,
                LocalResources provides calendarContext.resources,
            ) {
                DatePicker(state = dateState, title = { Text(stringResource(R.string.abst_setup_date_title), Modifier.padding(Space.lg)) })
            }
        }
    }
    if (timeOpen) {
        val timeState = rememberTimePickerState(startTime.hour, startTime.minute, is24Hour = true)
        AlertDialog(
            onDismissRequest = { timeOpen = false },
            title = { Text(stringResource(R.string.abst_setup_time_title)) },
            text = { TimePicker(timeState) },
            confirmButton = { TextButton(onClick = {
                startTimeText = LocalTime.of(timeState.hour, timeState.minute).toString()
                timeOpen = false
            }) { Text(stringResource(R.string.abst_setup_time_confirm)) } },
            dismissButton = { TextButton(onClick = { timeOpen = false }) { Text(stringResource(R.string.form_btn_cancel)) } },
        )
    }
}
