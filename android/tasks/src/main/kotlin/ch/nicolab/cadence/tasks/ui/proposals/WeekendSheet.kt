@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package ch.nicolab.cadence.tasks.ui.proposals

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.AcUnit
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Cloud
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.Thunderstorm
import androidx.compose.material.icons.outlined.Umbrella
import androidx.compose.material.icons.outlined.WbCloudy
import androidx.compose.material.icons.outlined.WbSunny
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.CadenceScrollSheet
import ch.nicolab.cadence.designsystem.components.ChoiceChip
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.SectionHeader
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.components.onColorOf
import ch.nicolab.cadence.designsystem.components.rememberAppSnackbarHostState
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.proposals.ProposalError
import ch.nicolab.cadence.tasks.proposals.ProposalRepository
import ch.nicolab.cadence.tasks.proposals.ProposalStatus
import ch.nicolab.cadence.tasks.proposals.WeekendCounts
import ch.nicolab.cadence.tasks.proposals.WeekendDay
import ch.nicolab.cadence.tasks.proposals.WeekendDraft
import ch.nicolab.cadence.tasks.proposals.WeekendEvent
import ch.nicolab.cadence.tasks.proposals.WeekendElsewhere
import ch.nicolab.cadence.tasks.proposals.WeekendEventState
import ch.nicolab.cadence.tasks.proposals.WeekendModel
import ch.nicolab.cadence.tasks.proposals.WeekendNearby
import ch.nicolab.cadence.tasks.proposals.WeekendOp
import ch.nicolab.cadence.tasks.proposals.WeekendPart
import ch.nicolab.cadence.tasks.proposals.WeekendProposal
import ch.nicolab.cadence.tasks.proposals.WeekendSlot
import ch.nicolab.cadence.tasks.proposals.WeekendState
import ch.nicolab.cadence.tasks.proposals.WeekendWeather
import ch.nicolab.cadence.tasks.ui.LinkThumb
import ch.nicolab.cadence.tasks.ui.tasksLocale
import java.io.IOException
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val weekendDayFormat: DateTimeFormatter = DateTimeFormatter.ofPattern("EEEE", tasksLocale)
private val shortWeekdayFormat: DateTimeFormatter = DateTimeFormatter.ofPattern("E", tasksLocale)
private val shortDayFormat: DateTimeFormatter = DateTimeFormatter.ofPattern("E d", tasksLocale)
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
    var state by remember(uid) { mutableStateOf(WeekendState()) }
    var loaded by remember(uid) { mutableStateOf(false) }
    var loadError by remember(uid) { mutableStateOf<String?>(null) }
    var busy by remember(uid) { mutableStateOf(false) }
    var draft by remember(uid) { mutableStateOf(WeekendDraft()) }
    var noteOpen by remember(uid) { mutableStateOf(emptySet<String>()) }
    var pickerOpen by remember(uid) { mutableStateOf(false) }
    val today = remember { LocalDate.now() }
    var selectedDays by remember(uid) { mutableStateOf(WeekendModel.defaultDays(today)) }
    var requesting by remember(uid) { mutableStateOf(false) }
    var requestError by remember(uid) { mutableStateOf<String?>(null) }
    var sharing by remember(uid) { mutableStateOf(false) }

    suspend fun load() {
        val result: Result<WeekendState> = if (uid == null) {
            repo.weekendState()
        } else {
            repo.weekend(uid).map { found ->
                when (found?.status) {
                    ProposalStatus.PENDING -> WeekendState(pending = found)
                    ProposalStatus.FAILED -> WeekendState(failed = found)
                    null -> WeekendState()
                    else -> WeekendState(shown = found)
                }
            }
        }
        result
            .onSuccess { found ->
                state = found
                draft = found.shown?.let { WeekendModel.reconcile(draft, it) } ?: WeekendDraft()
                loadError = null
            }
            .onFailure { err ->
                loadError = when {
                    err is ProposalError -> err.message?.takeIf { it.isNotBlank() } ?: failed
                    err is IOException -> offline
                    else -> failed
                }
            }
        loaded = true
    }

    LaunchedEffect(uid) { load() }

    // Les évènements d'agenda arrivent après « Valider » (capgw) et une demande en cours peut finir pendant que la feuille est ouverte.
    val requested = state.shown?.slots?.any { it.event?.state == WeekendEventState.REQUESTED } == true
    val shouldPoll = requested || state.pending != null
    LaunchedEffect(shouldPoll, uid) {
        while (shouldPoll) {
            delay(WEEKEND_POLL_MS)
            load()
        }
    }

    val current = state.shown
    val actionsEnabled = !busy && loadError != offline && current != null
    val open = current?.slots?.count { it.isOpen } ?: 0
    val counts = WeekendModel.countsOf(draft)
    val showPicker = pickerOpen || (loaded && loadError == null && state.pending == null && current == null)

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
                .onFailure { err ->
                    val message = when {
                        err is ProposalError -> err.message?.takeIf { it.isNotBlank() } ?: failed
                        err is IOException -> offline
                        else -> failed
                    }
                    snackbar.showSnackbar(message)
                }
            busy = false
        }
    }

    fun requestDays() {
        if (selectedDays.isEmpty() || requesting) return
        scope.launch {
            requesting = true
            requestError = null
            repo.requestWeekend(selectedDays)
                .onSuccess {
                    pickerOpen = false
                    requestError = null
                    load()
                }
                .onFailure { err ->
                    requestError = when {
                        err is ProposalError -> err.message?.takeIf { it.isNotBlank() } ?: failed
                        err is IOException -> offline
                        else -> failed
                    }
                }
            requesting = false
        }
    }

    fun share() {
        val week = current ?: return
        if (sharing) return
        scope.launch {
            sharing = true
            runCatching { WeekendShareImage.share(context, week, draft.picks) }
                .onFailure { snackbar.showSnackbar(context.getString(R.string.weekend_share_error)) }
            sharing = false
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
        if (loaded && loadError == null) {
            item(key = "header-actions") {
                WeekendHeaderActions(
                    pickerOpen = showPicker,
                    canShare = current != null && !sharing,
                    onTogglePicker = {
                        pickerOpen = !showPicker
                        requestError = null
                    },
                    onShare = ::share,
                )
            }
        }
        loadError?.let { message -> item(key = "error") { SheetNote(message) } }
        if (!loaded) {
            item(key = "loading") { SheetNote(stringResource(R.string.proposal_loading)) }
        } else {
            state.pending?.let { pending ->
                item(key = "pending") { PendingWeekendBanner(pending.requestedDates) }
            }
            if (state.pending == null && state.failed != null) {
                item(key = "failed") { SheetNote(stringResource(R.string.weekend_failed)) }
            }
            if (showPicker && loadError == null) {
                item(key = "picker") {
                    DayPickerPanel(
                        days = WeekendModel.pickerDays(today),
                        selected = selectedDays,
                        busy = requesting,
                        error = requestError,
                        onToggle = { date ->
                            selectedDays = WeekendModel.toggleDay(selectedDays, date)
                            requestError = null
                        },
                        onPrepare = ::requestDays,
                    )
                }
            }
            if (current != null) {
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
                if (current.nearby.isNotEmpty()) {
                    item(key = "nearby") {
                        SectionHeader(title = stringResource(R.string.weekend_nearby), modifier = Modifier.padding(top = Space.md))
                    }
                    val nearbyItems = WeekendModel.groupNearbyByDay(current.nearby).flatMap { it.second }
                    items(nearbyItems.size, key = { idx -> "n:$idx:${nearbyItems[idx].title}" }) { idx ->
                        NearbyRow(nearbyItems[idx], onOpen = { uriHandler.openUri(it) })
                    }
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
private fun WeekendHeaderActions(
    pickerOpen: Boolean,
    canShare: Boolean,
    onTogglePicker: () -> Unit,
    onShare: () -> Unit,
) {
    FlowRow(
        Modifier.fillMaxWidth().padding(bottom = Space.sm),
        horizontalArrangement = Arrangement.spacedBy(Space.sm, Alignment.CenterHorizontally),
        verticalArrangement = Arrangement.spacedBy(Space.xs),
    ) {
        ChoiceChip(
            label = stringResource(R.string.weekend_other_days),
            selected = pickerOpen,
            leadingIcon = Icons.Outlined.CalendarMonth,
            onClick = onTogglePicker,
        )
        if (canShare) {
            ChoiceChip(
                label = stringResource(R.string.weekend_share),
                selected = false,
                leadingIcon = Icons.Outlined.Share,
                onClick = onShare,
            )
        }
    }
}

@Composable
private fun PendingWeekendBanner(dates: List<LocalDate>) {
    val palette = cadence
    val label = if (dates.isNotEmpty()) {
        stringResource(R.string.weekend_pending_for, dates.joinToString(", ") { it.format(shortDayFormat) })
    } else {
        stringResource(R.string.proposal_preparing)
    }
    Panel(Modifier.padding(bottom = Space.sm)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
            CircularProgressIndicator(
                modifier = Modifier.size(16.dp),
                strokeWidth = 2.dp,
                color = palette.primary,
            )
            Text(label, style = MaterialTheme.typography.bodyMedium, color = palette.onSurface)
        }
    }
}

@Composable
private fun DayPickerPanel(
    days: List<LocalDate>,
    selected: List<LocalDate>,
    busy: Boolean,
    error: String?,
    onToggle: (LocalDate) -> Unit,
    onPrepare: () -> Unit,
) {
    val palette = cadence
    Panel(Modifier.padding(bottom = Space.md)) {
        Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
            days.chunked(7).forEach { week ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
                    week.forEach { date ->
                        val isSelected = date in selected
                        val isWeekend = date.dayOfWeek == DayOfWeek.SATURDAY || date.dayOfWeek == DayOfWeek.SUNDAY
                        val enabled = !busy && (isSelected || selected.size < WeekendModel.MAX_REQUEST_DAYS)
                        val container = when {
                            isSelected -> palette.primary
                            isWeekend -> palette.primary.copy(alpha = if (palette.isDark) 0.18f else 0.10f)
                            else -> palette.containerHigh
                        }
                        val content = if (isSelected) onColorOf(palette.primary) else palette.onSurface
                        val accessibilityLabel = date.format(shortDayFormat)
                        Box(
                            Modifier
                                .weight(1f)
                                .defaultMinSize(minHeight = 48.dp)
                                .clip(Radius.Chip)
                                .background(container)
                                .alpha(if (enabled || isSelected) 1f else 0.38f)
                                .clickable(enabled = enabled, role = Role.Checkbox, onClick = { onToggle(date) })
                                .semantics { this.contentDescription = accessibilityLabel }
                                .padding(vertical = Space.xs),
                            contentAlignment = Alignment.Center,
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(
                                    date.format(shortWeekdayFormat),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = content.copy(alpha = 0.8f),
                                    maxLines = 1,
                                )
                                Text(
                                    date.dayOfMonth.toString(),
                                    style = MaterialTheme.typography.labelLarge,
                                    color = content,
                                    maxLines = 1,
                                )
                            }
                        }
                    }
                }
            }
            Text(
                stringResource(R.string.weekend_picker_hint),
                style = MaterialTheme.typography.bodySmall,
                color = palette.onSurfaceVariant,
            )
            error?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = palette.error)
            }
            PrimaryAction(
                label = stringResource(R.string.weekend_prepare),
                modifier = Modifier.fillMaxWidth(),
                enabled = selected.isNotEmpty() && !busy,
                onClick = onPrepare,
            )
        }
    }
}

@Composable
private fun DayTiles(days: List<WeekendDay>) {
    val palette = cadence
    Column(Modifier.fillMaxWidth().padding(top = Space.md), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
        days.chunked(2).forEach { rowDays ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                rowDays.forEach { day ->
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
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Space.sm),
                verticalAlignment = Alignment.Top,
            ) {
                LinkThumb(
                    imageUrl = activity.image,
                    modifier = Modifier.size(56.dp).then(linkModifier),
                )
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                    Text(
                        activity.title,
                        style = MaterialTheme.typography.bodyLarge,
                        color = palette.onSurface,
                        textDecoration = if (activity.url != null) TextDecoration.Underline else null,
                        modifier = linkModifier,
                    )
                    WeekendModel.activityMetaLine(activity)?.let {
                        Text(it, style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant)
                    }
                    activity.note?.let {
                        Text(it, style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant)
                    }
                    (activity.after ?: slot.after)?.let {
                        Text(it, style = MaterialTheme.typography.bodyMedium, color = palette.onSurface)
                    }
                }
            }

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
private fun NearbyRow(item: WeekendNearby, onOpen: (String) -> Unit) {
    val palette = cadence
    val linkModifier = item.url?.let { url -> Modifier.clickable { onOpen(url) } } ?: Modifier
    val day = item.date.format(weekendDayFormat)
    Row(
        Modifier.fillMaxWidth().padding(vertical = Space.xs),
        horizontalArrangement = Arrangement.spacedBy(Space.sm),
        verticalAlignment = Alignment.Top,
    ) {
        LinkThumb(
            imageUrl = item.image,
            modifier = Modifier.size(40.dp).then(linkModifier),
        )
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
            Text(
                item.title,
                style = MaterialTheme.typography.bodyMedium,
                color = palette.onSurface,
                textDecoration = if (item.url != null) TextDecoration.Underline else null,
                modifier = linkModifier,
            )
            Text(
                WeekendModel.nearbyMetaLine(item, day),
                style = MaterialTheme.typography.bodySmall,
                color = palette.onSurfaceVariant,
            )
            item.note?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = palette.onSurfaceVariant)
            }
        }
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
