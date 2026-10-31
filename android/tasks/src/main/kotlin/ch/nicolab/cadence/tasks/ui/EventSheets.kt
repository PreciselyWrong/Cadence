@file:OptIn(ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarToday
import androidx.compose.material.icons.outlined.Place
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Subject
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.calendar.EventDetail
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.RowGroup
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.components.SettingRow
import ch.nicolab.cadence.designsystem.components.rowGroupShape
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.swipe.SwipeAction
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

private val FULL_DAY: DateTimeFormatter = DateTimeFormatter.ofLocalizedDate(FormatStyle.FULL).withLocale(Locale.FRENCH)
private val SHORT_DAY: DateTimeFormatter = DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(Locale.FRENCH)
private val CLOCK: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

/**
 * Fiche d'un événement d'agenda, commune à Tâches et à Agenda : quand, agenda, lieu, description et
 * aperçus de liens. Lecture seule vis-à-vis du fournisseur : cocher et masquer restent dans Cadence.
 */
@Composable
fun EventDetailSheet(
    detail: EventDetail,
    checkable: Boolean,
    onToggle: () -> Unit,
    onHide: () -> Unit,
    onDismiss: () -> Unit,
) {
    val palette = cadence
    val context = LocalContext.current
    val previews = remember(context) { TasksGraph.linkPreviews(context) }
    val title = detail.title.ifBlank { stringResource(R.string.tasks_event_untitled) }
    val description = remember(detail.description) { EventDescription.plain(detail.description) }
    val allDay = stringResource(R.string.tasks_event_all_day)
    val whenText = eventWhenText(detail, allDay, stringResource(R.string.tasks_event_date_range), stringResource(R.string.tasks_event_date_time_range))
    CadenceSheet(title = title, subtitle = detail.calendarName, dismiss = onDismiss) {
        Column(
            Modifier.verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(Space.md),
        ) {
            val fields = listOfNotNull(
                Triple(Icons.Outlined.Schedule, R.string.tasks_event_field_when, whenText),
                Triple(Icons.Outlined.CalendarToday, R.string.tasks_event_field_calendar, detail.calendarName),
                detail.location?.let { Triple(Icons.Outlined.Place, R.string.tasks_event_field_location, it) },
            )
            RowGroup {
                fields.forEachIndexed { index, (icon, label, value) ->
                    SettingRow(
                        title = value,
                        subtitle = stringResource(label),
                        icon = icon,
                        shape = rowGroupShape(index, fields.size),
                        trailing = {},
                    )
                }
            }
            if (description != null) {
                Column(verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                    Row {
                        Icon(
                            Icons.Outlined.Subject,
                            contentDescription = null,
                            tint = palette.onSurfaceVariant,
                        )
                        Text(
                            stringResource(R.string.tasks_event_field_description),
                            style = MaterialTheme.typography.labelLarge,
                            color = palette.onSurfaceVariant,
                            modifier = Modifier.padding(start = Space.sm),
                        )
                    }
                    SelectionContainer {
                        Text(description, style = MaterialTheme.typography.bodyMedium, color = palette.onSurface)
                    }
                }
            }
            LinkPreviewList("${detail.title}\n${description.orEmpty()}\n${detail.location.orEmpty()}", previews)
            Text(
                stringResource(R.string.tasks_event_read_only),
                style = MaterialTheme.typography.bodySmall,
                color = palette.onSurfaceVariant,
            )
            Row(
                Modifier.fillMaxWidth().padding(bottom = Space.md),
                horizontalArrangement = Arrangement.spacedBy(Space.md),
            ) {
                SecondaryAction(
                    label = stringResource(R.string.tasks_event_hide),
                    modifier = Modifier.weight(1f),
                    onClick = {
                        onHide()
                        onDismiss()
                    },
                )
                if (checkable) {
                    PrimaryAction(
                        label = stringResource(if (detail.done) R.string.tasks_event_reopen else R.string.tasks_event_complete),
                        modifier = Modifier.weight(1f),
                        onClick = {
                            onToggle()
                            onDismiss()
                        },
                    )
                }
            }
        }
    }
}

/** Menu d'un appui long sur un événement : cocher, masquer ici, voir les détails. */
@Composable
fun EventMenuSheet(
    detail: EventDetail,
    checkable: Boolean,
    onToggle: () -> Unit,
    onHide: () -> Unit,
    onOpenDetails: () -> Unit,
    onDismiss: () -> Unit,
) {
    class Entry(val icon: ImageVector, val label: Int, val onClick: () -> Unit)
    val entries = buildList {
        add(Entry(Icons.Outlined.Subject, R.string.tasks_event_menu_details, onOpenDetails))
        if (checkable) {
            add(
                Entry(
                    swipeActionIcon(SwipeAction.COMPLETE, closed = detail.done),
                    if (detail.done) R.string.tasks_event_reopen else R.string.tasks_event_complete,
                ) {
                    onToggle()
                    onDismiss()
                },
            )
        }
        add(
            Entry(Icons.Outlined.VisibilityOff, R.string.tasks_event_hide) {
                onHide()
                onDismiss()
            },
        )
    }
    CadenceSheet(
        title = stringResource(R.string.tasks_event_menu_title),
        subtitle = detail.title.ifBlank { stringResource(R.string.tasks_event_untitled) },
        dismiss = onDismiss,
    ) {
        RowGroup {
            entries.forEachIndexed { index, entry ->
                SettingRow(
                    title = stringResource(entry.label),
                    icon = entry.icon,
                    shape = rowGroupShape(index, entries.size),
                    trailing = {},
                    onClick = entry.onClick,
                )
            }
        }
    }
}

/** « vendredi 30 octobre 2026 · 10:00–11:00 », « 30 oct. 2026 → 1 nov. 2026 » ou « vendredi 30 octobre 2026 » pour une journée. */
internal fun eventWhenText(detail: EventDetail, allDayLabel: String, rangePattern: String, timedPattern: String): String {
    val lastDay = if (detail.allDay) detail.end.minusDays(1).coerceAtLeast(detail.start) else detail.end
    val sameDay = detail.start.toLocalDate() == lastDay.toLocalDate()
    return when {
        detail.allDay && sameDay -> "${detail.start.format(FULL_DAY)} · $allDayLabel"
        detail.allDay -> rangePattern.format(detail.start.format(SHORT_DAY), lastDay.format(SHORT_DAY))
        sameDay -> timedPattern.format(detail.start.format(FULL_DAY), detail.start.format(CLOCK), detail.end.format(CLOCK))
        else -> rangePattern.format(
            "${detail.start.format(SHORT_DAY)} ${detail.start.format(CLOCK)}",
            "${detail.end.format(SHORT_DAY)} ${detail.end.format(CLOCK)}",
        )
    }
}

private fun LocalDateTime.coerceAtLeast(other: LocalDateTime): LocalDateTime = if (isBefore(other)) other else this
