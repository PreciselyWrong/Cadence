package ch.nicolab.cadence.habits

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import ch.nicolab.cadence.HabitCardState
import ch.nicolab.cadence.R
import ch.nicolab.cadence.designsystem.components.HabitFacet
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
 * Routine du moment, sous les tâches du jour, sur une seule ligne : « Matin 0/2 », puis les facettes à toucher (anneau
 * de progrès, nom et valeur lus par TalkBack) et la flèche vers Habitudes. Absente quand rien n'est attendu dans le
 * moment courant.
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

    Row(
        Modifier.fillMaxWidth().padding(vertical = Space.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Space.sm),
    ) {
        Text(
            stringResource(R.string.routine_title_short, moment.group.name, moment.done, moment.due),
            style = MaterialTheme.typography.labelLarge,
            color = palette.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.widthIn(max = Size.routineFacet * 2),
        )
        Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
            moment.facetIds.forEach { id -> byId[id]?.let { item -> RoutineFacet(item) { quick(item) } } }
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
}

/** Une facette compacte : l'anneau seul, à toucher ; nom et progrès dans sa description. */
@Composable
private fun RoutineFacet(item: HabitCardState, onClick: () -> Unit) {
    val tint = habitTint(item)
    val goal = item.stored.goal
    val icon = HabitIconRegistry.getIcon(item.stored.iconId)
    val evaluation = item.evaluation
    val target = evaluation.targetMinor.takeIf { it > 0 } ?: 1L
    val ratio = if (goal.isAbstinence || goal.isTracker) 0f else (evaluation.progressMinor.toFloat() / target).coerceIn(0f, 1f)
    val compact = HabitFormatter.formatCompactProgress(evaluation.progressMinor, target, goal.goalType, goal.unit)
    val value = if (goal.isLimit) stringResource(R.string.routine_limit_value, compact) else compact
    val description = "${item.stored.name}, $value"
    Box(
        Modifier
            .size(Size.touch)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        HabitFacet(
            icon = icon.imageVector,
            label = icon.labelFr,
            progress = ratio,
            tint = tint,
            trackColor = tint.copy(alpha = 0.20f),
            size = Size.icon + Space.md,
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
