package ch.nicolab.cadence.settings

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Checklist
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.WbSunny
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.core.app.NotificationManagerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.R
import ch.nicolab.cadence.calendar.CalendarGraph
import ch.nicolab.cadence.calendar.CalendarWithDisplay
import ch.nicolab.cadence.calendar.EventReminderSettings
import ch.nicolab.cadence.calendar.isHiddenEverywhere
import ch.nicolab.cadence.designsystem.components.ChoiceChip
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.RowGroup
import ch.nicolab.cadence.designsystem.components.SectionHeader
import ch.nicolab.cadence.designsystem.components.SettingRow
import ch.nicolab.cadence.designsystem.components.SettingToggleRow
import ch.nicolab.cadence.designsystem.components.rowGroupShape
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.domain.QuietHours
import ch.nicolab.cadence.domain.ReminderLead
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.reminder.ReminderAlarms
import ch.nicolab.cadence.tasks.reminder.TimedReminders
import ch.nicolab.cadence.tasks.reminder.TimedRemindersStore
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.launch

private val HOUR_MINUTE: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

/**
 * Réglages › Notifications : tâches à heure fixe, événements d'agenda (avec un interrupteur par agenda),
 * habitudes et heures calmes. Les heures calmes se lisent seulement ici : elles se règlent sur le compte.
 */
@Composable
internal fun NotificationsPage() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repository = remember(context) { CalendarGraph.repository(context) }
    val taskStore = remember(context) { TimedRemindersStore(context) }
    val tasks by remember(taskStore) { taskStore.changes() }.collectAsStateWithLifecycle(initialValue = taskStore.read())
    val events by repository.reminderSettings.collectAsStateWithLifecycle(initialValue = EventReminderSettings())
    val calendarsFlow = remember(repository) { repository.calendars() }
    val calendars by calendarsFlow.collectAsStateWithLifecycle(initialValue = emptyList())
    val permissionMissing by repository.permissionMissing.collectAsStateWithLifecycle(initialValue = true)
    val connection = remember(context) { TasksGraph.connection(context).observe() }
    val quiet by connection.collectAsStateWithLifecycle(initialValue = null)
    // L'autorisation d'Android se règle hors de l'app : on la relit au retour.
    var refresh by remember { mutableIntStateOf(0) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { refresh++ }
    val notificationsAllowed = remember(refresh) { NotificationManagerCompat.from(context).areNotificationsEnabled() }
    val exactAllowed = remember(refresh) { ReminderAlarms.canScheduleExact(context) }

    Column(verticalArrangement = Arrangement.spacedBy(Space.md)) {
        Text(stringResource(R.string.notifications_intro), style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant)
        if (!notificationsAllowed) {
            Panel {
                Text(stringResource(R.string.notifications_off_title), style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
                Spacer(Modifier.height(Space.xs))
                Text(stringResource(R.string.notifications_off_message), style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
                Spacer(Modifier.height(Space.md))
                PrimaryAction(stringResource(R.string.notifications_off_action), Modifier.fillMaxWidth()) {
                    context.startActivity(
                        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName),
                    )
                }
            }
        }

        SectionHeader(stringResource(R.string.notifications_tasks_header))
        RowGroup {
            SettingToggleRow(
                title = stringResource(R.string.notifications_tasks_title),
                subtitle = stringResource(R.string.notifications_tasks_subtitle),
                checked = tasks.enabled,
                onCheckedChange = { taskStore.write(tasks.copy(enabled = it)) },
                icon = Icons.Outlined.Checklist,
            )
        }
        if (tasks.enabled) {
            LeadChoice(tasks.lead.minutes) { taskStore.write(tasks.copy(lead = ReminderLead.ofMinutes(it, ReminderLead.AT_TIME))) }
        }

        SectionHeader(stringResource(R.string.notifications_events_header))
        RowGroup {
            SettingToggleRow(
                title = stringResource(R.string.notifications_events_title),
                subtitle = stringResource(R.string.notifications_events_subtitle),
                checked = events.enabled,
                onCheckedChange = { checked -> scope.launch { repository.setReminderSettings(events.copy(enabled = checked)) } },
                icon = Icons.Outlined.CalendarMonth,
                shape = rowGroupShape(0, if (events.enabled) 2 else 1),
            )
            if (events.enabled) {
                SettingToggleRow(
                    title = stringResource(R.string.notifications_digest_title),
                    subtitle = stringResource(R.string.notifications_digest_subtitle),
                    checked = events.allDayDigest,
                    onCheckedChange = { checked -> scope.launch { repository.setReminderSettings(events.copy(allDayDigest = checked)) } },
                    icon = Icons.Outlined.WbSunny,
                    shape = rowGroupShape(1, 2),
                )
            }
        }
        if (events.enabled) {
            LeadChoice(events.leadMinutes) { scope.launch { repository.setReminderSettings(events.copy(leadMinutes = it)) } }
            CalendarSwitches(
                calendars = calendars,
                permissionMissing = permissionMissing,
                onNotify = { item, notify -> scope.launch { repository.setDisplay(item.calendar.id, item.display.copy(notify = notify)) } },
            )
        }

        if (!exactAllowed && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            RowGroup {
                SettingRow(
                    title = stringResource(R.string.notifications_exact_title),
                    subtitle = stringResource(R.string.notifications_exact_subtitle),
                    icon = Icons.Outlined.AccessTime,
                    onClick = {
                        context.startActivity(
                            Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${context.packageName}")),
                        )
                    },
                )
            }
        }

        SectionHeader(stringResource(R.string.notifications_habits_header))
        Text(stringResource(R.string.notifications_habits_message), style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant)

        SectionHeader(stringResource(R.string.notifications_quiet_header))
        QuietHoursSummary(quiet?.quietHours)
    }
}

/** Les cinq avances possibles, communes aux tâches et aux événements. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun LeadChoice(selectedMinutes: Long, onSelect: (Long) -> Unit) {
    Text(stringResource(R.string.notifications_lead_label), style = MaterialTheme.typography.labelLarge, color = cadence.onSurfaceVariant)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
        ReminderLead.entries.forEach { lead ->
            val selected = lead.minutes == selectedMinutes
            ChoiceChip(
                label = if (lead == ReminderLead.AT_TIME) stringResource(R.string.notifications_lead_at_time) else stringResource(R.string.notifications_lead_minutes, lead.minutes.toInt()),
                selected = selected,
                leadingIcon = if (selected) Icons.Rounded.Check else null,
            ) { onSelect(lead.minutes) }
        }
    }
}

@Composable
private fun CalendarSwitches(
    calendars: List<CalendarWithDisplay>,
    permissionMissing: Boolean,
    onNotify: (CalendarWithDisplay, Boolean) -> Unit,
) {
    if (permissionMissing) {
        Text(stringResource(R.string.notifications_calendars_permission), style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
        return
    }
    val listed = calendars.filterNot { it.display.isHiddenEverywhere(it.calendar) }
    if (listed.isEmpty()) return
    Text(stringResource(R.string.notifications_calendars_header), style = MaterialTheme.typography.labelLarge, color = cadence.onSurfaceVariant)
    RowGroup {
        listed.forEachIndexed { index, item ->
            SettingToggleRow(
                title = item.calendar.displayName,
                subtitle = item.calendar.accountName,
                checked = item.display.notify,
                onCheckedChange = { onNotify(item, it) },
                shape = rowGroupShape(index, listed.size),
            )
        }
    }
    Text(stringResource(R.string.notifications_calendars_hint), style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant, modifier = Modifier.padding(horizontal = Space.xs))
}

@Composable
private fun QuietHoursSummary(hours: QuietHours?) {
    val active = hours?.takeIf { it.enabled }
    RowGroup {
        SettingRow(
            title = if (active != null) {
                stringResource(R.string.notifications_quiet_range, active.start.format(HOUR_MINUTE), active.end.format(HOUR_MINUTE))
            } else {
                stringResource(R.string.notifications_quiet_none)
            },
            icon = Icons.Outlined.Notifications,
        )
    }
    Text(stringResource(R.string.notifications_quiet_hint), style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant, modifier = Modifier.padding(horizontal = Space.xs))
}
