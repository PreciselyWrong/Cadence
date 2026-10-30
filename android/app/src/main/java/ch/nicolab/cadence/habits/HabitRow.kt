package ch.nicolab.cadence.habits

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import ch.nicolab.cadence.HabitCardState
import ch.nicolab.cadence.R
import ch.nicolab.cadence.abstinenceStatus
import ch.nicolab.cadence.domain.GoalAttainment
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitGroup
import ch.nicolab.cadence.domain.HabitStreak
import ch.nicolab.cadence.domain.LimitStatus
import ch.nicolab.cadence.ui.HabitFormatter
import ch.nicolab.cadence.ui.components.ChoiceChip
import ch.nicolab.cadence.ui.components.HabitFacet
import ch.nicolab.cadence.ui.components.Panel
import ch.nicolab.cadence.ui.components.onColorOf
import ch.nicolab.cadence.ui.components.rememberCadenceHaptic
import ch.nicolab.cadence.ui.icon.HabitIconRegistry
import ch.nicolab.cadence.ui.theme.Motion
import ch.nicolab.cadence.ui.theme.Radius
import ch.nicolab.cadence.ui.theme.Size
import ch.nicolab.cadence.ui.theme.Space
import ch.nicolab.cadence.ui.theme.cadence
import ch.nicolab.cadence.ui.theme.habitAccent

/**
 * Unité fonctionnelle de l'application : une habitude, sa facette de progression,
 * son nom et sa mesure. Aucune sous-carte, la hiérarchie vient de la typographie.
 */
@Composable
internal fun HabitRow(
    item: HabitCardState,
    done: Boolean = false,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    actionLabel: String? = null,
    actionEnabled: Boolean = true,
    action: (() -> Unit)? = null,
) {
    val palette = cadence
    val tint = habitTint(item)
    val target = item.evaluation.targetMinor.takeIf { it > 0 } ?: 1L
    val ratio = if (item.stored.goal.isAbstinence || item.stored.goal.isTracker) 0f else (item.evaluation.progressMinor.toFloat() / target).coerceIn(0f, 1f)
    Panel(onClick = onClick, onLongClick = onLongClick) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            HabitFacet(
                icon = HabitIconRegistry.getIcon(item.stored.iconId).imageVector,
                label = HabitIconRegistry.getIcon(item.stored.iconId).labelFr,
                progress = ratio,
                tint = if (done) palette.inkFaint else tint,
                trackColor = tint.copy(alpha = 0.20f),
                size = Size.badge,
            )
            Spacer(Modifier.width(Space.lg))
            Column(Modifier.weight(1f)) {
                Text(
                    item.stored.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = if (done) palette.inkMuted else palette.ink,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(conciseHabitStatus(item), style = MaterialTheme.typography.bodySmall, color = palette.inkMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (actionLabel != null && action != null) {
                Spacer(Modifier.width(Space.sm))
                val description = stringResource(R.string.today_action_description, item.stored.name, actionLabel)
                val haptic = rememberCadenceHaptic()
                val actionInteraction = remember { MutableInteractionSource() }
                val actionPressed by actionInteraction.collectIsPressedAsState()
                val actionScale by animateFloatAsState(
                    targetValue = if (actionPressed && actionEnabled) 0.94f else 1f,
                    animationSpec = Motion.interactive(),
                    label = "habitActionPress",
                )
                val isBinary = item.stored.goal.goalType == GoalType.BINARY
                if (isBinary) {
                    Box(
                        Modifier
                            .graphicsLayer {
                                scaleX = actionScale
                                scaleY = actionScale
                            }
                            .size(Size.actionSm)
                            .clip(CircleShape)
                            .background(tint.copy(alpha = if (palette.isDark) 0.20f else 0.10f))
                            .clickable(
                                interactionSource = actionInteraction,
                                indication = androidx.compose.foundation.LocalIndication.current,
                                enabled = actionEnabled,
                                role = androidx.compose.ui.semantics.Role.Button,
                                onClick = {
                                    haptic.confirm()
                                    action()
                                },
                            )
                            .semantics { contentDescription = description },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Outlined.Check, null, tint = if (actionEnabled) tint else palette.inkFaint, modifier = Modifier.size(Size.iconSm))
                    }
                } else {
                    Box(
                        Modifier
                            .graphicsLayer {
                                scaleX = actionScale
                                scaleY = actionScale
                            }
                            .clip(Radius.Pill)
                            .background(tint.copy(alpha = if (palette.isDark) 0.20f else 0.10f))
                            .clickable(
                                interactionSource = actionInteraction,
                                indication = androidx.compose.foundation.LocalIndication.current,
                                enabled = actionEnabled,
                                role = androidx.compose.ui.semantics.Role.Button,
                                onClick = {
                                    haptic.confirm()
                                    action()
                                },
                            )
                            .heightIn(min = Size.actionSm)
                            .padding(horizontal = Space.md, vertical = Space.xs)
                            .semantics { contentDescription = description },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(actionLabel, style = MaterialTheme.typography.labelMedium, color = if (actionEnabled) tint else palette.inkFaint)
                    }
                }
            }
            if (done) {
                Spacer(Modifier.width(Space.sm))
                Box(Modifier.size(Size.actionSm).clip(CircleShape).background(palette.success.copy(alpha = 0.16f)), contentAlignment = Alignment.Center) {
                    Icon(Icons.Outlined.Check, null, tint = palette.success, modifier = Modifier.size(Size.iconSm))
                }
            }
        }
    }
}

@Composable
internal fun habitTint(item: HabitCardState): Color = cadence.habitAccent(item.stored.colorArgb)

@Composable
private fun limitLabel(status: LimitStatus): String = stringResource(
    when (status) {
        LimitStatus.UNDER -> R.string.status_limit_under
        LimitStatus.AT_LIMIT -> R.string.status_limit_at
        LimitStatus.EXCEEDED -> R.string.status_limit_exceeded
    },
)

@Composable
private fun attainmentLabel(attainment: GoalAttainment): String = stringResource(
    when (attainment) {
        GoalAttainment.TODO -> R.string.status_todo
        GoalAttainment.MINIMUM -> R.string.status_minimum_reached
        GoalAttainment.IDEAL -> R.string.status_ideal_reached
    },
)

@Composable
internal fun progress(item: HabitCardState): String {
    val goal = item.stored.goal
    if (goal.isAbstinence) return abstinenceStatus(item)
    if (goal.isTracker) return stringResource(R.string.tracker_today_total,
        HabitFormatter.formatWithUnit(item.evaluation.progressMinor, goal.goalType, goal.unit))
    // `2 / 2` se lirait comme un objectif atteint : un plafond s'annonce comme un maximum.
    if (goal.isLimit) {
        return stringResource(
            R.string.limit_progress,
            HabitFormatter.formatValue(item.evaluation.progressMinor, goal.goalType, goal.unit),
            HabitFormatter.formatValue(item.evaluation.targetMinor, goal.goalType, goal.unit),
        )
    }
    val quantity = HabitFormatter.formatProgress(item.evaluation.progressMinor, item.evaluation.targetMinor, goal.goalType, goal.unit)
    val frequency = goal.frequencyTarget ?: return quantity
    return stringResource(R.string.habit_sessions_format, quantity, item.evaluation.sessionCount, frequency)
}

/**
 * Filtre par groupe. `Tous` reste toujours en tête et sélectionnable : accéder à
 * l'ensemble ne doit jamais demander de deviner quel groupe choisir.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun GroupFilter(
    groups: List<HabitGroup>,
    habits: List<HabitCardState>,
    selectedGroupId: String?,
    onSelect: (String?) -> Unit,
) {
    val populatedGroups = groups.filter { group -> habits.any { it.stored.groupId == group.id } }
    if (populatedGroups.size <= 1) return
    FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
        ChoiceChip(stringResource(R.string.group_filter_all), selectedGroupId == null) { onSelect(null) }
        groups.forEach { group ->
            // Un groupe sans aucune habitude n'encombre pas le filtre.
            if (habits.any { it.stored.groupId == group.id }) {
                ChoiceChip(group.name, selectedGroupId == group.id) {
                    onSelect(group.id.takeIf { it != selectedGroupId })
                }
            }
        }
    }
}

/**
 * La série se lit en périodes planifiées réussies, pas en jours calendaires : le libellé
 * évite donc de parler de jours, qui serait faux pour un objectif hebdomadaire ou un
 * rythme tous les N jours.
 */
@Composable
internal fun StreakLine(streak: HabitStreak) {
    val palette = cadence
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            if (streak.current > 0) {
                pluralStringResource(R.plurals.streak_current, streak.current, streak.current)
            } else {
                stringResource(R.string.streak_none)
            },
            style = MaterialTheme.typography.titleMedium,
            color = if (streak.current > 0) palette.ink else palette.inkFaint,
        )
        if (streak.best > streak.current) {
            Text(
                stringResource(R.string.streak_best, streak.best),
                style = MaterialTheme.typography.bodySmall,
                color = palette.inkFaint,
            )
        }
    }
}

@Composable
internal fun HabitAvatar(item: HabitCardState, tint: Color) {
    val icon = HabitIconRegistry.getIcon(item.stored.iconId)
    Box(Modifier.size(Size.badge).clip(Radius.Control).background(tint), contentAlignment = Alignment.Center) {
        Icon(icon.imageVector, icon.labelFr, tint = onColorOf(tint), modifier = Modifier.size(Size.iconLarge))
    }
}
