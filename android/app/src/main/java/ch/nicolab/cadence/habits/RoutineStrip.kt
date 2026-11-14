package ch.nicolab.cadence.habits

import androidx.compose.foundation.clickable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.border
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

    // Les habitudes du moment en pastilles : l'hexagone de l'app (anneau de progrès), le nom et la valeur.
    Row(
        Modifier.fillMaxWidth().padding(top = Space.md, bottom = Space.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            stringResource(R.string.routine_title_short, moment.group.name, moment.done, moment.due).uppercase(),
            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
            color = palette.onSurfaceVariant,
            maxLines = 1,
            modifier = Modifier
                .weight(1f)
                .clickable(role = Role.Button) {
                    haptic.tap()
                    openHabits()
                }
                .semantics { contentDescription = openLabel },
        )
    }
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(Space.sm),
    ) {
        moment.facetIds.forEach { id -> byId[id]?.let { item -> RoutinePill(item) { quick(item) } } }
    }
}

/** Pastille d'une habitude : petit hexagone de progrès, nom et valeur ; un toucher ouvre la saisie rapide. */
@Composable
private fun RoutinePill(item: HabitCardState, onClick: () -> Unit) {
    val palette = cadence
    val tint = habitTint(item)
    val goal = item.stored.goal
    val icon = HabitIconRegistry.getIcon(item.stored.iconId)
    val evaluation = item.evaluation
    val target = evaluation.targetMinor.takeIf { it > 0 } ?: 1L
    val ratio = if (goal.isAbstinence || goal.isTracker) 0f else (evaluation.progressMinor.toFloat() / target).coerceIn(0f, 1f)
    val compact = HabitFormatter.formatCompactProgress(evaluation.progressMinor, target, goal.goalType, goal.unit)
    val value = if (goal.isLimit) stringResource(R.string.routine_limit_value, compact) else compact
    Row(
        Modifier
            .heightIn(min = 40.dp)
            .clip(RoundedCornerShape(50))
            .clickable(role = Role.Button, onClick = onClick)
            .border(1.dp, palette.outlineVariant, RoundedCornerShape(50))
            .padding(start = 4.dp, end = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        HabitFacet(
            icon = icon.imageVector,
            label = null,
            progress = ratio,
            tint = tint,
            trackColor = tint.copy(alpha = 0.20f),
            size = 24.dp,
        )
        Text(
            "${item.stored.name} $value",
            style = MaterialTheme.typography.labelMedium.copy(fontSize = 12.5.sp),
            color = if (evaluation.isCompleted) palette.success else palette.onSurface,
            maxLines = 1,
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
