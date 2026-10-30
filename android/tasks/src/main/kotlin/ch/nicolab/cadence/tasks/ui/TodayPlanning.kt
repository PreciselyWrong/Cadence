package ch.nicolab.cadence.tasks.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.NightsStay
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import ch.nicolab.cadence.designsystem.components.BadgeTone
import ch.nicolab.cadence.designsystem.components.CadenceBadge
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.theme.Glass
import ch.nicolab.cadence.designsystem.theme.Motion
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.planning.Capacity
import ch.nicolab.cadence.tasks.planning.ProposedBlock
import ch.nicolab.cadence.tasks.planning.formatMinutes
import java.time.LocalDate

/** Espace sous une carte posée dans la liste : les lignes de tâches, elles, restent jointives. */
@Composable
internal fun CardSlot(content: @Composable () -> Unit) {
    Box(Modifier.padding(bottom = Space.sm)) { content() }
}

/** Où va une tâche en retard pendant le triage. */
internal enum class TriageTarget(val label: Int) {
    TODAY(R.string.planning_target_today),
    TOMORROW(R.string.planning_target_tomorrow),
    LATER(R.string.planning_target_later),
}

/** Propositions en attente d'acceptation : rien n'est écrit tant que l'utilisateur n'a pas accepté. */
internal data class Proposals(val blocks: List<ProposedBlock>, val unplaced: List<TaskItem>) {
    val uids: Set<String> get() = blocks.mapTo(HashSet()) { it.uid }
}

/** « 3 h 20 planifiées · 4 h libres » avec sa jauge ; l'avertissement apparaît à 100 % de charge. */
@Composable
internal fun CapacityLine(capacity: Capacity, modifier: Modifier = Modifier) {
    val palette = cadence
    val tone = if (capacity.overloaded) palette.warning else palette.onSurfaceVariant
    val fill by animateFloatAsState(capacity.fill, Motion.normal(), label = "capacityFill")
    val percent = if (capacity.availableMinutes > 0) capacity.plannedMinutes * 100 / capacity.availableMinutes else 100
    val description = stringResource(R.string.planning_capacity_description, percent)
    Column(modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = description }) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                stringResource(
                    R.string.planning_capacity,
                    formatMinutes(capacity.plannedMinutes),
                    formatMinutes(capacity.freeMinutes),
                ),
                style = MaterialTheme.typography.labelLarge,
                color = tone,
                modifier = Modifier.weight(1f),
            )
            if (capacity.overloaded) {
                CadenceBadge(stringResource(R.string.planning_capacity_full), tone = BadgeTone.Warning)
            }
        }
        Spacer(Modifier.height(Space.xs))
        Box(Modifier.fillMaxWidth().height(Size.counterTrack).clip(Radius.Pill).background(palette.containerHigh)) {
            Box(
                Modifier
                    .fillMaxWidth(fill)
                    .height(Size.counterTrack)
                    .clip(Radius.Pill)
                    .background(if (capacity.overloaded) palette.warning else palette.primary),
            )
        }
    }
}

/** Carte du matin : un appui ouvre la feuille de planification ; la croix la masque pour la journée. */
@Composable
internal fun MorningCard(overdueCount: Int, toPlaceCount: Int, onOpen: () -> Unit, onDismiss: () -> Unit) {
    val summary = buildList {
        if (overdueCount > 0) add(pluralStringResource(R.plurals.tasks_overdue_count, overdueCount, overdueCount))
        if (toPlaceCount > 0) add(pluralStringResource(R.plurals.planning_to_place_count, toPlaceCount, toPlaceCount))
    }.joinToString(" · ")
    PlanningCard(
        icon = Icons.Outlined.EventAvailable,
        title = stringResource(R.string.planning_morning_title),
        summary = summary,
        onClick = onOpen,
        onDismiss = onDismiss,
    )
}

/** Carte du soir : terminées du jour, ce qu'il reste, et un geste pour tout reporter à demain. */
@Composable
internal fun EveningCard(doneCount: Int, unfinishedCount: Int, onCarry: () -> Unit, onKeep: () -> Unit) {
    val summary = buildList {
        add(pluralStringResource(R.plurals.planning_evening_done, doneCount, doneCount))
        if (unfinishedCount > 0) add(pluralStringResource(R.plurals.planning_evening_left, unfinishedCount, unfinishedCount))
    }.joinToString(" · ")
    Panel {
        Row(verticalAlignment = Alignment.CenterVertically) {
            CardIcon(Icons.Outlined.NightsStay)
            Spacer(Modifier.width(Space.md))
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.planning_evening_title), style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
                Text(summary, style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant)
            }
        }
        Spacer(Modifier.height(Space.md))
        Row(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalAlignment = Alignment.CenterVertically) {
            PrimaryAction(
                label = if (unfinishedCount > 0) {
                    pluralStringResource(R.plurals.planning_evening_carry, unfinishedCount, unfinishedCount)
                } else {
                    stringResource(R.string.planning_evening_close)
                },
                modifier = Modifier.weight(1f),
                onClick = onCarry,
            )
            if (unfinishedCount > 0) {
                TertiaryAction(stringResource(R.string.planning_evening_keep), onClick = onKeep)
            }
        }
    }
}

@Composable
private fun PlanningCard(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, summary: String, onClick: () -> Unit, onDismiss: () -> Unit) {
    Panel(onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            CardIcon(icon)
            Spacer(Modifier.width(Space.md))
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
                Text(summary, style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant)
            }
            IconButton(onClick = onDismiss, modifier = Modifier.size(Size.touch)) {
                Icon(
                    Icons.Outlined.Close,
                    contentDescription = stringResource(R.string.planning_dismiss_today),
                    tint = cadence.onSurfaceVariant,
                    modifier = Modifier.size(Size.icon),
                )
            }
        }
    }
}

@Composable
private fun CardIcon(icon: androidx.compose.ui.graphics.vector.ImageVector) {
    Box(
        Modifier.size(Size.badge).clip(CircleShape).background(cadence.primaryContainer),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = cadence.onPrimaryContainer, modifier = Modifier.size(Size.iconLarge))
    }
}

/** Bandeau des propositions : accepter en bloc, annuler, ou reporter ce qui ne tient pas. */
@Composable
internal fun ProposalPanel(
    count: Int,
    unplacedCount: Int,
    onAcceptAll: () -> Unit,
    onCancel: () -> Unit,
    onPostponeUnplaced: () -> Unit,
) {
    Panel {
        Text(
            pluralStringResource(R.plurals.planning_proposal_title, count, count),
            style = MaterialTheme.typography.titleMedium,
            color = cadence.onSurface,
        )
        Text(
            stringResource(R.string.planning_proposal_hint),
            style = MaterialTheme.typography.bodyMedium,
            color = cadence.onSurfaceVariant,
        )
        if (unplacedCount > 0) {
            Spacer(Modifier.height(Space.sm))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    pluralStringResource(R.plurals.planning_unplaced, unplacedCount, unplacedCount),
                    style = MaterialTheme.typography.labelLarge,
                    color = cadence.warning,
                    modifier = Modifier.weight(1f),
                )
                TertiaryAction(stringResource(R.string.planning_unplaced_action), onClick = onPostponeUnplaced)
            }
        }
        Spacer(Modifier.height(Space.md))
        Row(horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
            PrimaryAction(stringResource(R.string.planning_accept_all), Modifier.weight(1f), enabled = count > 0, onClick = onAcceptAll)
            SecondaryAction(stringResource(R.string.planning_cancel), Modifier.weight(1f), onClick = onCancel)
        }
    }
}

/** Créneau proposé : translucide, liseré primaire, avec une croix pour l'écarter. */
@Composable
internal fun GhostRow(name: String, start: String, end: String, onRemove: () -> Unit, modifier: Modifier = Modifier) {
    val palette = cadence
    Row(
        modifier
            .fillMaxWidth()
            .clip(Radius.Card)
            .background(palette.primaryContainer.copy(alpha = Glass.BadgeAlpha * 2))
            .border(BorderStroke(Size.hairline, palette.primary.copy(alpha = 0.45f)), Radius.Card)
            .padding(start = Space.lg),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CadenceBadge(stringResource(R.string.planning_ghost_time, start, end), tone = BadgeTone.Primary)
        Spacer(Modifier.width(Space.md))
        Text(
            name,
            style = MaterialTheme.typography.bodyLarge,
            color = palette.onSurface,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f).padding(vertical = Space.md),
        )
        IconButton(onClick = onRemove, modifier = Modifier.size(Size.touch)) {
            Icon(
                Icons.Outlined.Close,
                contentDescription = stringResource(R.string.planning_ghost_remove),
                tint = palette.onSurfaceVariant,
                modifier = Modifier.size(Size.icon),
            )
        }
    }
}

/** « Journée bouclée » : tout est fait ou reporté ; un coup d'œil sur demain. */
@Composable
internal fun ClosedDay(doneCount: Int, modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxWidth().padding(vertical = Space.xxl, horizontal = Space.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.size(Size.touch + Space.sm).clip(CircleShape).background(cadence.primaryContainer), contentAlignment = Alignment.Center) {
            Icon(Icons.Outlined.EventAvailable, null, tint = cadence.primary, modifier = Modifier.size(Size.iconLarge))
        }
        Spacer(Modifier.height(Space.lg))
        Text(
            stringResource(R.string.planning_closed_title),
            style = MaterialTheme.typography.titleMedium,
            color = cadence.onSurface,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(Space.xs))
        Text(
            if (doneCount > 0) {
                pluralStringResource(R.plurals.planning_closed_done, doneCount, doneCount)
            } else {
                stringResource(R.string.planning_closed_nothing)
            },
            style = MaterialTheme.typography.bodyMedium,
            color = cadence.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

/**
 * Feuille « Planifier la journée » : trier ce qui est en retard (Aujourd'hui, Demain, Plus tard, une
 * tâche à la fois ou tout d'un coup), puis lancer le placement automatique.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun PlanDaySheet(
    day: LocalDate,
    today: LocalDate,
    overdue: List<TaskItem>,
    capacity: Capacity,
    toPlaceCount: Int,
    workday: Boolean,
    onTriage: (List<TaskItem>, TriageTarget) -> Unit,
    onPlace: () -> Unit,
    dismiss: () -> Unit,
) {
    CadenceSheet(
        title = stringResource(R.string.planning_sheet_title),
        subtitle = dayLabel(day, today),
        dismiss = dismiss,
    ) {
        Column(
            Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(Space.md),
        ) {
            if (overdue.isNotEmpty()) {
                Text(
                    stringResource(R.string.planning_triage_title),
                    style = MaterialTheme.typography.titleSmall,
                    color = cadence.error,
                )
                Text(
                    stringResource(R.string.planning_triage_hint),
                    style = MaterialTheme.typography.bodySmall,
                    color = cadence.onSurfaceVariant,
                )
                if (overdue.size > 1) {
                    Text(
                        stringResource(R.string.planning_triage_bulk),
                        style = MaterialTheme.typography.labelLarge,
                        color = cadence.onSurface,
                    )
                    TriageChips { target -> onTriage(overdue, target) }
                }
                overdue.forEach { task ->
                    Column(verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                        Text(
                            task.name,
                            style = MaterialTheme.typography.bodyLarge,
                            color = cadence.onSurface,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                        task.dueDay?.let {
                            Text(
                                dayLabel(it, today, DayLabelStyle.SHORT),
                                style = MaterialTheme.typography.labelMedium,
                                color = cadence.onSurfaceVariant,
                            )
                        }
                        TriageChips { target -> onTriage(listOf(task), target) }
                    }
                }
            }
            Text(
                stringResource(R.string.planning_place_title),
                style = MaterialTheme.typography.titleSmall,
                color = cadence.onSurfaceVariant,
                modifier = Modifier.padding(top = Space.sm),
            )
            Text(
                when {
                    !workday -> stringResource(R.string.planning_place_day_off)
                    toPlaceCount == 0 -> stringResource(R.string.planning_place_nothing)
                    else -> stringResource(
                        R.string.planning_place_summary,
                        formatMinutes(capacity.freeMinutes),
                        formatMinutes(capacity.plannedMinutes),
                    )
                },
                style = MaterialTheme.typography.bodyMedium,
                color = cadence.onSurfaceVariant,
            )
        }
        Spacer(Modifier.height(Space.lg))
        PrimaryAction(
            stringResource(R.string.planning_place_auto),
            Modifier.fillMaxWidth(),
            enabled = workday && toPlaceCount > 0,
            onClick = onPlace,
        )
        Spacer(Modifier.height(Space.lg))
    }
}

@Composable
private fun TriageChips(onPick: (TriageTarget) -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
        TriageTarget.entries.forEach { target ->
            val label = stringResource(target.label)
            Box(
                Modifier
                    .weight(1f)
                    .defaultMinSize(minHeight = Size.touch)
                    .clip(Radius.Chip)
                    .background(cadence.containerHigh)
                    .clickable { onPick(target) }
                    .padding(horizontal = Space.sm),
                contentAlignment = Alignment.Center,
            ) {
                Text(label, style = MaterialTheme.typography.labelLarge, color = cadence.onSurface, maxLines = 1)
            }
        }
    }
}
