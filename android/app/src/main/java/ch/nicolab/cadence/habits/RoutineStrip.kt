package ch.nicolab.cadence.habits

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import ch.nicolab.cadence.HabitCardState
import ch.nicolab.cadence.R
import ch.nicolab.cadence.designsystem.components.BadgeTone
import ch.nicolab.cadence.designsystem.components.CadenceBadge
import ch.nicolab.cadence.designsystem.components.HabitFacet
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.rememberCadenceHaptic
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.domain.HabitGroup
import ch.nicolab.cadence.ui.HabitFormatter
import ch.nicolab.cadence.ui.icon.HabitIconRegistry
import java.time.LocalTime
import kotlinx.coroutines.delay

/**
 * Routine du moment, sous les tâches du jour : n habitudes faites sur m attendues, et leurs
 * facettes à toucher. Absente quand rien n'est attendu dans le moment courant.
 */
@Composable
internal fun RoutineStrip(
    habits: List<HabitCardState>,
    groups: List<HabitGroup>,
    quick: (HabitCardState) -> Unit,
    openHabits: () -> Unit,
) {
    val time by produceState(LocalTime.now()) {
        while (true) {
            value = LocalTime.now()
            delay(30_000)
        }
    }
    val moment = selectRoutine(groups, habits.map(::routineCandidate), time) ?: return
    val byId = habits.associateBy { it.stored.id }
    val palette = cadence
    val haptic = rememberCadenceHaptic()
    val openLabel = stringResource(R.string.routine_open_habits)

    Panel {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                stringResource(R.string.routine_title, moment.group.name, moment.done, moment.due),
                Modifier.weight(1f),
                style = MaterialTheme.typography.titleMedium,
                color = palette.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (moment.partial > 0) {
                Spacer(Modifier.width(Space.sm))
                CadenceBadge(
                    pluralStringResource(R.plurals.routine_to_complete, moment.partial, moment.partial),
                    tone = BadgeTone.Warning,
                )
            }
            Box(
                Modifier
                    .size(Size.touch)
                    .clickable(role = Role.Button) {
                        haptic.tap()
                        openHabits()
                    }
                    .semantics { contentDescription = openLabel },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.AutoMirrored.Outlined.KeyboardArrowRight,
                    null,
                    tint = palette.onSurfaceVariant,
                    modifier = Modifier.size(Size.icon),
                )
            }
        }
        Spacer(Modifier.height(Space.sm))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.sm, Alignment.CenterHorizontally)) {
            moment.facetIds.forEach { id ->
                byId[id]?.let { item -> RoutineFacet(item, Modifier.widthIn(max = Size.routineFacet).weight(1f, fill = false)) { quick(item) } }
            }
        }
    }
}

@Composable
private fun RoutineFacet(item: HabitCardState, modifier: Modifier, onClick: () -> Unit) {
    val palette = cadence
    val tint = habitTint(item)
    val goal = item.stored.goal
    val icon = HabitIconRegistry.getIcon(item.stored.iconId)
    val evaluation = item.evaluation
    val target = evaluation.targetMinor.takeIf { it > 0 } ?: 1L
    val ratio = if (goal.isAbstinence || goal.isTracker) 0f else (evaluation.progressMinor.toFloat() / target).coerceIn(0f, 1f)
    val compact = HabitFormatter.formatCompactProgress(evaluation.progressMinor, target, goal.goalType, goal.unit)
    val value = if (goal.isLimit) stringResource(R.string.routine_limit_value, compact) else compact
    Column(
        modifier
            .clickable(role = Role.Button, onClick = onClick)
            .padding(vertical = Space.xs),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        HabitFacet(
            icon = icon.imageVector,
            label = icon.labelFr,
            progress = ratio,
            tint = tint,
            trackColor = tint.copy(alpha = 0.20f),
            size = Size.badge,
        )
        Spacer(Modifier.height(Space.xs))
        Text(
            item.stored.name,
            style = MaterialTheme.typography.labelMedium,
            color = palette.onSurface,
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            value,
            style = MaterialTheme.typography.labelMedium,
            color = if (evaluation.isCompleted) palette.success else palette.onSurfaceVariant,
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/** Traduit l'état d'une habitude en entrée de la sélection ; trackers et abstinences restent hors routine. */
private fun routineCandidate(item: HabitCardState): RoutineCandidate {
    val evaluation = item.evaluation
    val goal = item.stored.goal
    val due = item.stored.active && !item.stored.archived && !goal.isTracker && !goal.isAbstinence &&
        evaluation.isPlannedForDate && !evaluation.isPaused
    val done = evaluation.isCompleted
    return RoutineCandidate(
        id = item.stored.id,
        groupId = item.stored.groupId,
        due = due,
        done = done,
        partial = due && !done && !goal.isLimit && evaluation.progressMinor > 0,
    )
}
