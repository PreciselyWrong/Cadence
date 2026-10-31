package ch.nicolab.cadence.settings

import ch.nicolab.cadence.designsystem.components.ICON_CONTRAST
import ch.nicolab.cadence.designsystem.components.readableTintOf
import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircleOutline
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.R
import ch.nicolab.cadence.calendar.CalendarDisplay
import ch.nicolab.cadence.calendar.CalendarGlobalSettings
import ch.nicolab.cadence.calendar.CalendarGraph
import ch.nicolab.cadence.calendar.CalendarWithDisplay
import ch.nicolab.cadence.calendar.DeviceCalendar
import ch.nicolab.cadence.calendar.EventInstanceKey
import ch.nicolab.cadence.calendar.HiddenEvent
import ch.nicolab.cadence.calendar.day
import ch.nicolab.cadence.calendar.isUsed
import ch.nicolab.cadence.designsystem.components.CadenceSwitch
import ch.nicolab.cadence.designsystem.components.SettingRow
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import ch.nicolab.cadence.designsystem.components.ChoiceChip
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.RowGroup
import ch.nicolab.cadence.designsystem.components.SettingToggleRow
import ch.nicolab.cadence.designsystem.components.rowGroupShape
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import kotlinx.coroutines.launch

/** Sous-titre de la rubrique : nombre d'agendas affichés, absent tant que la permission manque. */
@Composable
internal fun calendarsSubtitle(): String? {
    val context = LocalContext.current
    val repository = remember(context) { CalendarGraph.repository(context) }
    val calendarsFlow = remember(repository) { repository.calendars() }
    val permissionMissing by repository.permissionMissing.collectAsStateWithLifecycle(initialValue = true)
    val calendars by calendarsFlow.collectAsStateWithLifecycle(initialValue = emptyList())
    if (permissionMissing) return null
    val shown = calendars.count { it.display.isUsed(it.calendar) && (it.display.agenda || it.display.tasks || it.display.widget) }
    return pluralStringResource(R.plurals.settings_calendars_count, shown, shown)
}

/**
 * Réglages › Agendas : où apparaît chaque agenda de l'appareil, et les deux options communes.
 * Cocher un événement ne modifie jamais le fournisseur d'agendas.
 */
@Composable
internal fun CalendarsPage() {
    val context = LocalContext.current
    val repository = remember(context) { CalendarGraph.repository(context) }
    val calendarsFlow = remember(repository) { repository.calendars() }
    val calendars by calendarsFlow.collectAsStateWithLifecycle(initialValue = emptyList())
    val permissionMissing by repository.permissionMissing.collectAsStateWithLifecycle(initialValue = true)
    val settings by repository.globalSettings.collectAsStateWithLifecycle(initialValue = CalendarGlobalSettings())
    val hiddenFlow = remember(repository) { repository.hiddenEvents() }
    val hidden by hiddenFlow.collectAsStateWithLifecycle(initialValue = emptyList())
    val scope = rememberCoroutineScope()
    val requestPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        repository.refresh()
    }
    val palette = cadence

    Text(
        stringResource(R.string.calendars_intro),
        style = MaterialTheme.typography.bodyMedium,
        color = palette.onSurfaceVariant,
    )
    Text(
        stringResource(R.string.calendars_use_hint),
        style = MaterialTheme.typography.bodySmall,
        color = palette.onSurfaceVariant,
    )
    if (permissionMissing) {
        Panel {
            Text(stringResource(R.string.calendars_permission_title), style = MaterialTheme.typography.titleMedium, color = palette.onSurface)
            Spacer(Modifier.height(Space.xs))
            Text(stringResource(R.string.calendars_permission_message), style = MaterialTheme.typography.bodySmall, color = palette.onSurfaceVariant)
            Spacer(Modifier.height(Space.md))
            PrimaryAction(stringResource(R.string.calendars_permission_action), Modifier.fillMaxWidth()) {
                requestPermission.launch(Manifest.permission.READ_CALENDAR)
            }
        }
    } else if (calendars.isEmpty()) {
        Text(
            stringResource(R.string.calendars_empty),
            style = MaterialTheme.typography.bodyMedium,
            color = palette.onSurfaceVariant,
        )
    } else {
        calendars.groupBy { it.calendar.accountName to it.calendar.accountType }.forEach { (_, items) ->
            val (used, unused) = items.partition { it.display.isUsed(it.calendar) }
            AccountHeader(items.first().calendar)
            if (used.isNotEmpty()) {
                RowGroup {
                    used.forEachIndexed { index, item ->
                        CalendarBlock(item, rowGroupShape(index, used.size)) { display ->
                            scope.launch { repository.setDisplay(item.calendar.id, display) }
                        }
                    }
                }
            }
            if (unused.isNotEmpty()) {
                Text(
                    stringResource(R.string.calendars_unused_header, unused.size),
                    style = MaterialTheme.typography.labelLarge,
                    color = palette.onSurfaceVariant,
                )
                RowGroup {
                    unused.forEachIndexed { index, item ->
                        CalendarBlock(item, rowGroupShape(index, unused.size)) { display ->
                            scope.launch { repository.setDisplay(item.calendar.id, display) }
                        }
                    }
                }
            }
            Spacer(Modifier.height(Space.lg))
        }
    }
    HiddenEventsSection(
        hidden = hidden,
        onRestore = { key -> scope.launch { repository.restoreEvent(key) } },
    )
    RowGroup {
        SettingToggleRow(
            title = stringResource(R.string.calendars_check_title),
            checked = settings.checkEvents,
            onCheckedChange = { checked -> scope.launch { repository.setCheckEvents(checked) } },
            icon = Icons.Outlined.CheckCircleOutline,
            subtitle = stringResource(R.string.calendars_check_subtitle),
            shape = rowGroupShape(0, 2),
        )
        SettingToggleRow(
            title = stringResource(R.string.calendars_hide_done_title),
            checked = settings.hideDone,
            onCheckedChange = { checked -> scope.launch { repository.setHideDone(checked) } },
            icon = Icons.Outlined.VisibilityOff,
            subtitle = stringResource(R.string.calendars_hide_done_subtitle),
            shape = rowGroupShape(1, 2),
        )
    }
}

private val HIDDEN_DAY: DateTimeFormatter = DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(java.util.Locale.FRENCH)

/** Événements masqués dans Cadence : ils restent dans l'agenda de l'appareil et se rétablissent ici. */
@Composable
private fun HiddenEventsSection(hidden: List<HiddenEvent>, onRestore: (EventInstanceKey) -> Unit) {
    val palette = cadence
    Text(
        stringResource(R.string.calendars_hidden_title),
        style = MaterialTheme.typography.titleMedium,
        color = palette.onSurface,
    )
    if (hidden.isEmpty()) {
        Text(
            stringResource(R.string.calendars_hidden_empty),
            style = MaterialTheme.typography.bodyMedium,
            color = palette.onSurfaceVariant,
        )
        return
    }
    val zone = remember { ZoneId.systemDefault() }
    RowGroup {
        hidden.forEachIndexed { index, item ->
            SettingRow(
                title = item.title.ifBlank { stringResource(R.string.agenda_untitled) },
                subtitle = item.day(zone).format(HIDDEN_DAY),
                icon = Icons.Outlined.VisibilityOff,
                shape = rowGroupShape(index, hidden.size),
                trailing = {
                    Text(
                        stringResource(R.string.calendars_hidden_restore),
                        style = MaterialTheme.typography.labelLarge,
                        color = readableTintOf(palette.primary, palette.card),
                    )
                },
                onClick = { onRestore(item.key) },
            )
        }
    }
}

@Composable
private fun AccountHeader(calendar: DeviceCalendar) {
    val palette = cadence
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = Space.lg, vertical = Space.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            calendar.accountName,
            Modifier.weight(1f),
            style = MaterialTheme.typography.labelLarge,
            color = palette.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (calendar.accountType == GOOGLE_ACCOUNT_TYPE) {
            Text(stringResource(R.string.calendars_source_google), style = MaterialTheme.typography.bodySmall, color = palette.outline)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CalendarBlock(
    item: CalendarWithDisplay,
    shape: Shape,
    onDisplay: (CalendarDisplay) -> Unit,
) {
    val palette = cadence
    val calendar = item.calendar
    val display = item.display
    val used = display.isUsed(calendar)
    Column(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(palette.card)
            .padding(horizontal = Space.lg, vertical = Space.md),
        verticalArrangement = Arrangement.spacedBy(Space.sm),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(Size.eventIcon).clip(CircleShape).background(readableTintOf(Color(calendar.colorArgb), minContrast = ICON_CONTRAST)))
            Spacer(Modifier.width(Space.md))
            Text(
                calendar.displayName,
                Modifier.weight(1f),
                style = MaterialTheme.typography.bodyLarge,
                color = palette.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Row(
            Modifier
                .fillMaxWidth()
                .toggleable(value = used, role = Role.Switch) { onDisplay(display.copy(used = it)) },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                stringResource(R.string.calendars_use),
                Modifier.weight(1f),
                style = MaterialTheme.typography.bodyMedium,
                color = palette.onSurface,
            )
            CadenceSwitch(checked = used, onCheckedChange = null)
        }
        if (used) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(Space.sm),
                verticalArrangement = Arrangement.spacedBy(Space.sm),
            ) {
                ChoiceChip(
                    label = stringResource(R.string.calendars_surface_agenda),
                    selected = display.agenda,
                    leadingIcon = if (display.agenda) Icons.Rounded.Check else null,
                ) { onDisplay(display.copy(agenda = !display.agenda)) }
                ChoiceChip(
                    label = stringResource(R.string.calendars_surface_tasks),
                    selected = display.tasks,
                    leadingIcon = if (display.tasks) Icons.Rounded.Check else null,
                ) { onDisplay(display.copy(tasks = !display.tasks)) }
                ChoiceChip(
                    label = stringResource(R.string.calendars_surface_widget),
                    selected = display.widget,
                    leadingIcon = if (display.widget) Icons.Rounded.Check else null,
                ) { onDisplay(display.copy(widget = !display.widget)) }
            }
        }
    }
}

private const val GOOGLE_ACCOUNT_TYPE = "com.google"
