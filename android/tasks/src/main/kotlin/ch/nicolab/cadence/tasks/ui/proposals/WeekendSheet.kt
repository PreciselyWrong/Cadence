@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package ch.nicolab.cadence.tasks.ui.proposals

import android.content.Context
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.AcUnit
import androidx.compose.material.icons.outlined.Cloud
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.Thunderstorm
import androidx.compose.material.icons.outlined.Umbrella
import androidx.compose.material.icons.outlined.WbCloudy
import androidx.compose.material.icons.outlined.WbSunny
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.CadenceScrollSheet
import ch.nicolab.cadence.designsystem.components.ChoiceChip
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.SectionHeader
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.components.rememberAppSnackbarHostState
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.proposals.ProposalRepository
import ch.nicolab.cadence.tasks.proposals.WeekendCounts
import ch.nicolab.cadence.tasks.proposals.WeekendDay
import ch.nicolab.cadence.tasks.proposals.WeekendDraft
import ch.nicolab.cadence.tasks.proposals.WeekendEvent
import ch.nicolab.cadence.tasks.proposals.WeekendElsewhere
import ch.nicolab.cadence.tasks.proposals.WeekendEventState
import ch.nicolab.cadence.tasks.proposals.WeekendModel
import ch.nicolab.cadence.tasks.proposals.WeekendOp
import ch.nicolab.cadence.tasks.proposals.WeekendPart
import ch.nicolab.cadence.tasks.proposals.WeekendProposal
import ch.nicolab.cadence.tasks.proposals.WeekendSlot
import ch.nicolab.cadence.tasks.proposals.WeekendWeather
import ch.nicolab.cadence.tasks.ui.tasksLocale
import java.io.IOException
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val weekendDayFormat: DateTimeFormatter = DateTimeFormatter.ofPattern("EEEE", tasksLocale)
private const val WEEKEND_POLL_MS = 5_000L

/**
 * Week-end (`docs/48-weekend.md`, « Sheet ») : une feuille qui défile, un bloc par créneau, « Valider » épinglé.
 * [uid] ouvre la semaine d'une notification ; null prend la plus récente prête (le bouton du Bilan).
 * Un toucher ne fait que préparer un choix ; « Valider » envoie tous les choix en un appel. En ligne seulement.
 */
@Composable
fun WeekendSheet(uid: String?, onClose: () -> Unit) {
    val context = LocalContext.current
    val repo = remember(context) { ProposalRepository.of(context) }
    val uriHandler = LocalUriHandler.current
    val snackbar = rememberAppSnackbarHostState()
    val scope = rememberCoroutineScope()
    val offline = stringResource(R.string.proposal_offline)
    val failed = stringResource(R.string.proposal_error)
    var proposal by remember(uid) { mutableStateOf<WeekendProposal?>(null) }
    var loaded by remember(uid) { mutableStateOf(false) }
    var loadError by remember(uid) { mutableStateOf<String?>(null) }
    var busy by remember(uid) { mutableStateOf(false) }
    var draft by remember(uid) { mutableStateOf(WeekendDraft()) }
    var noteOpen by remember(uid) { mutableStateOf(emptySet<String>()) }

    suspend fun load() {
        val result = if (uid == null) repo.weekendLatest() else repo.weekend(uid)
        result
            .onSuccess { found ->
                proposal = found
                draft = found?.let { WeekendModel.reconcile(draft, it) } ?: WeekendDraft()
                loadError = null
            }
            .onFailure { loadError = if (it is IOException) offline else failed }
        loaded = true
    }

    LaunchedEffect(uid) { load() }

    // Les évènements d'agenda arrivent après « Valider » (capgw) : tant qu'une sortie est demandée, la feuille se relit.
    val requested = proposal?.slots?.any { it.event?.state == WeekendEventState.REQUESTED } == true
    LaunchedEffect(requested, uid) {
        while (requested) {
            delay(WEEKEND_POLL_MS)
            load()
        }
    }

    val current = proposal
    val actionsEnabled = !busy && loadError != offline && current != null
    val open = current?.slots?.count { it.isOpen } ?: 0
    val counts = WeekendModel.countsOf(draft)

    fun validate() {
        val week = current ?: return
        if (draft.picks.isEmpty()) return
        scope.launch {
            busy = true
            repo.decideWeekend(week.uid, draft)
                .onSuccess {
                    draft = WeekendDraft(uid = week.uid)
                    load()
                    snackbar.showSnackbar(context.getString(R.string.weekend_saved))
                }
                .onFailure { snackbar.showSnackbar(if (it is IOException) offline else failed) }
            busy = false
        }
    }

    val footer: (@Composable ColumnScope.() -> Unit)? = if (current == null || open == 0) null else {
        {
            WeekendFooter(
                countLine = countLine(context, counts),
                enabled = actionsEnabled && draft.picks.isNotEmpty(),
                onValidate = ::validate,
            )
        }
    }

    CadenceScrollSheet(
        title = current?.headline ?: stringResource(R.string.weekend_title),
        subtitle = current?.subtitle,
        dismiss = onClose,
        footer = footer,
    ) {
        loadError?.let { message -> item(key = "error") { SheetNote(message) } }
        when {
            current == null && !loaded -> item { SheetNote(stringResource(R.string.proposal_loading)) }
            current == null && loadError == null -> item { SheetNote(stringResource(R.string.weekend_nothing)) }
            current == null -> Unit
            else -> {
                item(key = "days") { DayTiles(current.days) }
                items(current.slots, key = { "slot:${it.id}" }) { slot ->
                    val key = slot.id
                    SlotBlock(
                        slot = slot,
                        title = stringResource(R.string.weekend_slot_title, dayName(slot.date), stringResource(partLabel(slot.part))),
                        pick = draft.pickOf(slot.id),
                        noteOpen = key in noteOpen,
                        note = draft.noteOf(slot.id),
                        enabled = !busy,
                        onPick = { op -> draft = draft.tap(slot, op) },
                        onToggleNote = { noteOpen = if (key in noteOpen) noteOpen - key else noteOpen + key },
                        onNote = { draft = draft.withNote(slot.id, it) },
                        onOpen = { uriHandler.openUri(it) },
                    )
                }
                if (current.elsewhere.isNotEmpty()) {
                    item(key = "elsewhere") {
                        SectionHeader(title = stringResource(R.string.weekend_elsewhere), modifier = Modifier.padding(top = Space.md))
                    }
                    items(current.elsewhere, key = { "e:${it.place}:${it.date}" }) { ElsewhereRow(it) }
                }
            }
        }
    }
}

/** Point d'entrée dans Bilan : ouvre la semaine de week-end prête la plus récente. */
@Composable
fun WeekendEntryPanel(onOpen: () -> Unit) {
    val palette = cadence
    Panel(onClick = onOpen) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.weekend_title), style = MaterialTheme.typography.titleMedium, color = palette.onSurface)
                Text(stringResource(R.string.weekend_entry_text), style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant)
            }
            Spacer(Modifier.width(Space.sm))
            Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = palette.onSurfaceVariant)
        }
    }
}

@Composable
private fun DayTiles(days: List<WeekendDay>) {
    val palette = cadence
    Row(Modifier.fillMaxWidth().padding(top = Space.md), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
        days.forEach { day ->
            Panel(Modifier.weight(1f)) {
                Column(verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                    Text(dayName(day.date), style = MaterialTheme.typography.titleSmall, color = palette.onSurface)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        day.weather?.let {
                            Icon(weatherIcon(it), stringResource(weatherLabel(it)), tint = palette.onSurfaceVariant, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(Space.xs))
                        }
                        val min = day.min
                        val max = day.max
                        if (min != null && max != null) {
                            Text(stringResource(R.string.weekend_range, min, max), style = MaterialTheme.typography.labelMedium, color = palette.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SlotBlock(
    slot: WeekendSlot,
    title: String,
    pick: WeekendOp?,
    noteOpen: Boolean,
    note: String,
    enabled: Boolean,
    onPick: (WeekendOp) -> Unit,
    onToggleNote: () -> Unit,
    onNote: (String) -> Unit,
    onOpen: (String) -> Unit,
) {
    val palette = cadence
    Column(Modifier.fillMaxWidth().padding(vertical = Space.sm), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(title, style = MaterialTheme.typography.titleMedium, color = palette.onSurface, modifier = Modifier.weight(1f))
            WeatherTag(slot.weather, slot.temp, slot.feels)
        }
        val activity = slot.activity
        val busy = slot.busy
        if (activity != null) {
            val linkModifier = activity.url?.let { url -> Modifier.clickable { onOpen(url) } } ?: Modifier
            Text(
                activity.title,
                style = MaterialTheme.typography.bodyLarge,
                color = palette.onSurface,
                textDecoration = if (activity.url != null) TextDecoration.Underline else null,
                modifier = linkModifier,
            )
            val timing = when {
                activity.start != null && activity.end != null -> "${activity.start}–${activity.end}"
                else -> activity.start
            }
            listOfNotNull(timing, activity.note, activity.travel).joinToString(" · ").takeIf { it.isNotEmpty() }?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant)
            }
            activity.after?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = palette.onSurface) }

            val decision = slot.decision
            if (decision?.op?.final == true) {
                DecidedLines(decision.op, slot.event, onOpen)
            } else {
                if (decision?.op == WeekendOp.OTHER) {
                    Text(stringResource(R.string.weekend_decided_other), style = MaterialTheme.typography.labelLarge, color = palette.primary)
                }
                FlowRow(
                    Modifier.fillMaxWidth().padding(top = Space.xs),
                    horizontalArrangement = Arrangement.spacedBy(Space.sm),
                    verticalArrangement = Arrangement.spacedBy(Space.xs),
                ) {
                    ChoiceChip(stringResource(R.string.weekend_choice_calendar), selected = pick == WeekendOp.CALENDAR, onClick = { if (enabled) onPick(WeekendOp.CALENDAR) })
                    ChoiceChip(stringResource(R.string.weekend_choice_other), selected = pick == WeekendOp.OTHER, onClick = { if (enabled) onPick(WeekendOp.OTHER) })
                    ChoiceChip(stringResource(R.string.weekend_choice_skip), selected = pick == WeekendOp.SKIP, onClick = { if (enabled) onPick(WeekendOp.SKIP) })
                    TertiaryAction(stringResource(R.string.weekend_note), onClick = onToggleNote)
                }
                if (noteOpen) {
                    CadenceField(
                        value = note,
                        onValue = onNote,
                        label = stringResource(R.string.weekend_note_hint),
                        support = "${note.length}/${WeekendModel.NOTE_MAX_LENGTH}",
                        enabled = enabled,
                    )
                }
            }
        } else if (busy != null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.EventBusy, null, tint = palette.onSurfaceVariant, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(Space.xs))
                Text(stringResource(R.string.weekend_busy, busy), style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant)
            }
            slot.after?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant) }
        }
    }
}

/** Décision finale d'une sortie et l'état de sa mise à l'agenda. */
@Composable
private fun DecidedLines(op: WeekendOp, event: WeekendEvent?, onOpen: (String) -> Unit) {
    val palette = cadence
    Text(
        stringResource(if (op == WeekendOp.CALENDAR) R.string.weekend_decided_calendar else R.string.weekend_decided_skip),
        style = MaterialTheme.typography.labelLarge,
        color = palette.onSurfaceVariant,
    )
    when (event?.state) {
        WeekendEventState.REQUESTED -> Text(stringResource(R.string.weekend_event_requested), style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant)
        WeekendEventState.CREATED -> Row(verticalAlignment = Alignment.CenterVertically) {
            Text(stringResource(R.string.weekend_event_created), style = MaterialTheme.typography.bodyMedium, color = palette.primary)
            event.link?.let { link -> TertiaryAction(stringResource(R.string.weekend_event_open), onClick = { onOpen(link) }) }
        }
        WeekendEventState.FAILED -> Text(stringResource(R.string.weekend_event_failed), style = MaterialTheme.typography.bodyMedium, color = palette.error)
        null -> Unit
    }
}

@Composable
private fun WeatherTag(weather: WeekendWeather?, temp: Int?, feels: Int?) {
    val palette = cadence
    Column(horizontalAlignment = Alignment.End) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            weather?.let {
                Icon(weatherIcon(it), stringResource(weatherLabel(it)), tint = palette.onSurfaceVariant, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(Space.xs))
            }
            temp?.let { Text(stringResource(R.string.weekend_degrees, it), style = MaterialTheme.typography.labelLarge, color = palette.onSurface) }
        }
        feels?.let { Text(stringResource(R.string.weekend_feels, it), style = MaterialTheme.typography.labelSmall, color = palette.onSurfaceVariant) }
    }
}

@Composable
private fun ElsewhereRow(place: WeekendElsewhere) {
    val palette = cadence
    val head = listOfNotNull(place.place, place.date?.format(weekendDayFormat)).joinToString(", ")
    val detail = listOfNotNull(
        place.weather?.let { stringResource(weatherLabel(it)) },
        place.temp?.let { stringResource(R.string.weekend_degrees, it) },
    ).joinToString(", ")
    val line = listOfNotNull(detail.takeIf { it.isNotEmpty() }, place.travel).joinToString(" · ")
    Row(Modifier.fillMaxWidth().padding(vertical = Space.xs), verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Outlined.WbSunny, null, tint = palette.onSurfaceVariant, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(Space.sm))
        Text(stringResource(R.string.weekend_elsewhere_line, head, line), style = MaterialTheme.typography.bodyMedium, color = palette.onSurface)
    }
}

@Composable
private fun WeekendFooter(countLine: String, enabled: Boolean, onValidate: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(top = Space.sm)) {
        Text(
            countLine,
            style = MaterialTheme.typography.labelMedium,
            color = cadence.onSurfaceVariant,
            modifier = Modifier.fillMaxWidth().padding(bottom = Space.xs),
        )
        PrimaryAction(stringResource(R.string.weekend_validate), modifier = Modifier.fillMaxWidth(), enabled = enabled, onClick = onValidate)
    }
}

@Composable
private fun SheetNote(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.bodyMedium,
        color = cadence.onSurfaceVariant,
        modifier = Modifier.fillMaxWidth().padding(vertical = Space.sm),
    )
}

/** « 1 sortie à l'agenda · 1 autre idée demandée », ou « Rien de choisi ». */
private fun countLine(context: Context, counts: WeekendCounts): String {
    val parts = buildList {
        if (counts.calendar > 0) add(context.resources.getQuantityString(R.plurals.weekend_count_calendar, counts.calendar, counts.calendar))
        if (counts.other > 0) add(context.resources.getQuantityString(R.plurals.weekend_count_other, counts.other, counts.other))
    }
    return parts.joinToString(" · ").ifEmpty { context.getString(R.string.weekend_count_none) }
}

private fun dayName(date: LocalDate): String = date.format(weekendDayFormat).replaceFirstChar { it.titlecase(tasksLocale) }

private fun partLabel(part: WeekendPart): Int = when (part) {
    WeekendPart.MORNING -> R.string.weekend_part_morning
    WeekendPart.AFTERNOON -> R.string.weekend_part_afternoon
    WeekendPart.DAY -> R.string.weekend_part_day
}

private fun weatherLabel(weather: WeekendWeather): Int = when (weather) {
    WeekendWeather.SUN -> R.string.weekend_weather_sun
    WeekendWeather.PARTLY -> R.string.weekend_weather_partly
    WeekendWeather.CLOUD -> R.string.weekend_weather_cloud
    WeekendWeather.RAIN -> R.string.weekend_weather_rain
    WeekendWeather.SNOW -> R.string.weekend_weather_snow
    WeekendWeather.STORM -> R.string.weekend_weather_storm
    WeekendWeather.FOG -> R.string.weekend_weather_fog
}

private fun weatherIcon(weather: WeekendWeather): ImageVector = when (weather) {
    WeekendWeather.SUN -> Icons.Outlined.WbSunny
    WeekendWeather.PARTLY -> Icons.Outlined.WbCloudy
    WeekendWeather.CLOUD, WeekendWeather.FOG -> Icons.Outlined.Cloud
    WeekendWeather.RAIN -> Icons.Outlined.Umbrella
    WeekendWeather.SNOW -> Icons.Outlined.AcUnit
    WeekendWeather.STORM -> Icons.Outlined.Thunderstorm
}
