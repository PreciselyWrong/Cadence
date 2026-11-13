package ch.nicolab.cadence.settings

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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.R
import ch.nicolab.cadence.calendar.CalendarDisplay
import ch.nicolab.cadence.calendar.CalendarGraph
import ch.nicolab.cadence.calendar.CalendarWithDisplay
import ch.nicolab.cadence.calendar.calendarAccountSections
import ch.nicolab.cadence.calendar.isUsed
import ch.nicolab.cadence.designsystem.components.CadenceSwitch
import ch.nicolab.cadence.designsystem.components.ChoiceChip
import ch.nicolab.cadence.designsystem.components.ICON_CONTRAST
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.RowGroup
import ch.nicolab.cadence.designsystem.components.readableTintOf
import ch.nicolab.cadence.designsystem.components.rowGroupShape
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import kotlinx.coroutines.launch

/**
 * Les agendas de l'appareil et où chacun apparaît : la seule présentation, partagée par
 * Réglages › Agendas et la feuille « Affichage » de l'Agenda. Lit et écrit directement le dépôt
 * des agendas, donc un choix fait d'un côté se voit de l'autre. Sans la permission de lecture,
 * la liste est remplacée par la demande d'accès.
 */
@Composable
internal fun CalendarChoices(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val repository = remember(context) { CalendarGraph.repository(context) }
    val calendarsFlow = remember(repository) { repository.calendars() }
    val calendars by calendarsFlow.collectAsStateWithLifecycle(initialValue = emptyList())
    val permissionMissing by repository.permissionMissing.collectAsStateWithLifecycle(initialValue = true)
    val scope = rememberCoroutineScope()
    val requestPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        repository.refresh()
    }
    val palette = cadence
    val setDisplay: (CalendarWithDisplay, CalendarDisplay) -> Unit = { item, display ->
        scope.launch { repository.setDisplay(item.calendar.id, display) }
    }

    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Space.md)) {
        when {
            permissionMissing -> Panel {
                Text(stringResource(R.string.calendars_permission_title), style = MaterialTheme.typography.titleMedium, color = palette.onSurface)
                Spacer(Modifier.height(Space.xs))
                Text(stringResource(R.string.calendars_permission_message), style = MaterialTheme.typography.bodySmall, color = palette.onSurfaceVariant)
                Spacer(Modifier.height(Space.md))
                PrimaryAction(stringResource(R.string.calendars_permission_action), Modifier.fillMaxWidth()) {
                    requestPermission.launch(Manifest.permission.READ_CALENDAR)
                }
            }
            calendars.isEmpty() -> Text(
                stringResource(R.string.calendars_empty),
                style = MaterialTheme.typography.bodyMedium,
                color = palette.onSurfaceVariant,
            )
            else -> calendarAccountSections(calendars).forEach { section ->
                AccountHeader(section.accountName, section.accountType)
                if (section.used.isNotEmpty()) {
                    RowGroup {
                        section.used.forEachIndexed { index, item ->
                            CalendarBlock(item, rowGroupShape(index, section.used.size)) { setDisplay(item, it) }
                        }
                    }
                }
                if (section.unused.isNotEmpty()) {
                    Text(
                        stringResource(R.string.calendars_unused_header, section.unused.size),
                        style = MaterialTheme.typography.labelLarge,
                        color = palette.onSurfaceVariant,
                    )
                    RowGroup {
                        section.unused.forEachIndexed { index, item ->
                            CalendarBlock(item, rowGroupShape(index, section.unused.size)) { setDisplay(item, it) }
                        }
                    }
                }
                Spacer(Modifier.height(Space.xs))
            }
        }
    }
}

@Composable
private fun AccountHeader(accountName: String, accountType: String) {
    val palette = cadence
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = Space.lg, vertical = Space.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            accountName,
            Modifier.weight(1f),
            style = MaterialTheme.typography.labelLarge,
            color = palette.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (accountType == GOOGLE_ACCOUNT_TYPE) {
            Text(stringResource(R.string.calendars_source_google), style = MaterialTheme.typography.bodySmall, color = palette.outline)
        }
    }
}

/** Un agenda : « Utiliser dans Cadence », puis, s'il sert, Agenda, Liste Tâches, Notifications et Cocher une fois passé. */
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
                    label = stringResource(R.string.calendars_surface_notify),
                    selected = display.notify,
                    leadingIcon = if (display.notify) Icons.Rounded.Check else null,
                ) { onDisplay(display.copy(notify = !display.notify)) }
                ChoiceChip(
                    label = stringResource(R.string.calendars_auto_done_past),
                    selected = display.autoDonePast,
                    leadingIcon = if (display.autoDonePast) Icons.Rounded.Check else null,
                ) { onDisplay(display.copy(autoDonePast = !display.autoDonePast)) }
            }
        }
    }
}

private const val GOOGLE_ACCOUNT_TYPE = "com.google"
