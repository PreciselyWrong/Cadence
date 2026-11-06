package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import ch.nicolab.cadence.designsystem.components.BadgeTone
import ch.nicolab.cadence.designsystem.components.CadenceBadge
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.theme.Glass
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

/** Journée pleine : une ligne calme, sans jauge, seulement quand la charge atteint 100 %. */
@Composable
internal fun CapacityLine(capacity: Capacity, modifier: Modifier = Modifier) {
    Text(
        stringResource(R.string.planning_capacity_full_line, formatMinutes(capacity.plannedMinutes)),
        // Information, pas alarme : texte neutre.
        style = MaterialTheme.typography.labelLarge,
        color = cadence.onSurfaceVariant,
        modifier = modifier.fillMaxWidth(),
    )
}

/**
 * Carte du matin sans résumé : un appui ouvre Ma journée ; la croix la masque pour la journée.
 * Le résumé ne compte jamais le retard (ton sans culpabilité) : seulement ce qu'il reste à placer et les suggestions.
 */
@Composable
internal fun MorningCard(
    toPlaceCount: Int,
    onOpen: () -> Unit,
    onDismiss: () -> Unit,
    suggestionCount: Int = 0,
) {
    val summary = buildList {
        if (toPlaceCount > 0) add(pluralStringResource(R.plurals.planning_to_place_count, toPlaceCount, toPlaceCount))
        if (suggestionCount > 0) add(pluralStringResource(R.plurals.planning_suggestion_count, suggestionCount, suggestionCount))
    }.joinToString(" · ")
    PlanningCard(
        icon = Icons.Outlined.EventAvailable,
        title = stringResource(R.string.planning_morning_title),
        summary = summary,
        onClick = onOpen,
        onDismiss = onDismiss,
    )
}

/** Fin de journée : une ligne après les tâches, deux liens texte ; jamais un gros bouton qui passe avant le travail. */
@Composable
internal fun EveningCard(doneCount: Int, unfinishedCount: Int, onCarry: () -> Unit, onKeep: () -> Unit) {
    val summary = buildList {
        add(pluralStringResource(R.plurals.planning_evening_done, doneCount, doneCount))
        if (unfinishedCount > 0) add(pluralStringResource(R.plurals.planning_evening_left, unfinishedCount, unfinishedCount))
    }.joinToString(" · ")
    Column(Modifier.fillMaxWidth().padding(vertical = Space.sm)) {
        Text(summary, style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant)
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onCarry, contentPadding = PaddingValues()) {
                Text(
                    if (unfinishedCount > 0) {
                        pluralStringResource(R.plurals.planning_evening_carry, unfinishedCount, unfinishedCount)
                    } else {
                        stringResource(R.string.planning_evening_close)
                    },
                )
            }
            if (unfinishedCount > 0) {
                Spacer(Modifier.width(Space.lg))
                TextButton(onClick = onKeep) {
                    Text(stringResource(R.string.planning_evening_keep), color = cadence.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun PlanningCard(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, summary: String, onClick: () -> Unit, onDismiss: () -> Unit) {
    // Une ligne-lien, pas une carte : l'invitation reste visible sans peser plus que les tâches.
    Row(
        Modifier.fillMaxWidth().clip(Radius.Control).clickable(role = Role.Button, onClick = onClick).padding(vertical = Space.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = cadence.primary, modifier = Modifier.size(Size.icon))
        Spacer(Modifier.width(Space.md))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.labelLarge, color = cadence.primary)
            if (summary.isNotEmpty()) {
                Text(summary, style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
            }
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

/** Trier ce qui est en retard : Aujourd'hui, Demain ou Sans date, une tâche à la fois ou toutes d'un coup. */
@Composable
internal fun OverdueTriage(overdue: List<TaskItem>, today: LocalDate, onTriage: (List<TaskItem>, TriageTarget) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(Space.md)) {
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
}

/** Placer les tâches sans heure : le calcul est local, rien n'est écrit avant l'acceptation dans Aujourd'hui. */
@Composable
internal fun PlaceInDay(capacity: Capacity, toPlaceCount: Int, workday: Boolean, onPlace: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
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
        if (workday && toPlaceCount > 0) {
            SecondaryAction(stringResource(R.string.planning_place_auto), Modifier.fillMaxWidth(), onClick = onPlace)
        }
    }
}

/**
 * Suggestions du jour : « Cette semaine » puis « En vue », jamais « Plus tard ». Une ligne dit pourquoi
 * elle est là ; « Aujourd'hui » lui donne l'échéance du jour, « Aide-moi à choisir » ouvre le duel.
 */
@Composable
internal fun SuggestionList(
    suggestions: List<TaskItem>,
    weekStart: LocalDate,
    onAddToday: (TaskItem) -> Unit,
    onChoose: () -> Unit,
) {
    if (suggestions.size >= 2) {
        SecondaryAction(stringResource(R.string.choose_open), Modifier.fillMaxWidth(), onClick = onChoose)
    }
    suggestions.forEach { task ->
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(task.name, style = MaterialTheme.typography.bodyLarge, color = cadence.onSurface, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(
                    stringResource(if (task.weekOf == weekStart) R.string.funnel_this_week else R.string.funnel_in_view),
                    style = MaterialTheme.typography.labelMedium,
                    color = cadence.onSurfaceVariant,
                )
            }
            Spacer(Modifier.width(Space.sm))
            Box(
                Modifier
                    .defaultMinSize(minHeight = Size.touch)
                    .clip(Radius.Chip)
                    .background(cadence.containerHigh)
                    .clickable { onAddToday(task) }
                    .padding(horizontal = Space.md),
                contentAlignment = Alignment.Center,
            ) {
                Text(stringResource(R.string.suggestions_add_today), style = MaterialTheme.typography.labelLarge, color = cadence.onSurface)
            }
        }
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
