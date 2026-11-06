package ch.nicolab.cadence.habits

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.material.icons.outlined.MoreVert
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import ch.nicolab.cadence.HabitCardState
import ch.nicolab.cadence.R
import ch.nicolab.cadence.abstinenceStatus
import ch.nicolab.cadence.designsystem.components.HabitFacet
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.TabPill
import ch.nicolab.cadence.designsystem.components.TabPills
import ch.nicolab.cadence.designsystem.components.onColorOf
import ch.nicolab.cadence.designsystem.components.readableTintOf
import ch.nicolab.cadence.designsystem.components.rememberCadenceHaptic
import ch.nicolab.cadence.designsystem.theme.Motion
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.designsystem.theme.habitAccent
import ch.nicolab.cadence.designsystem.theme.habitFillArgb
import ch.nicolab.cadence.domain.GoalAttainment
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitGoal
import ch.nicolab.cadence.domain.HabitGroup
import ch.nicolab.cadence.domain.HabitStreak
import ch.nicolab.cadence.domain.LimitStatus
import ch.nicolab.cadence.ui.HabitFormatter
import ch.nicolab.cadence.ui.icon.HabitIconRegistry

/**
 * Part remplie d'une carte : 0 sans objectif à atteindre (abstinence, plafond, simple suivi) ou archivée, 1 seulement
 * quand l'objectif de la période (jour ou semaine) est atteint ; avant cela, jamais assez pour paraître pleine.
 */
internal fun habitFillRatio(goal: HabitGoal, progressMinor: Long, targetMinor: Long, completed: Boolean, archived: Boolean): Float = when {
    archived || goal.isAbstinence || goal.isLimit || goal.isTracker -> 0f
    completed -> 1f
    else -> (progressMinor.toFloat() / (targetMinor.takeIf { it > 0 } ?: 1L)).coerceIn(0f, MAX_UNFINISHED_FILL)
}

private const val MAX_UNFINISHED_FILL = 0.95f

/**
 * Unité fonctionnelle de l'application : une carte d'habitude de 80 dp (e07), sombre et neutre comme la carte des
 * abstinences, où la couleur de l'habitude se remplit à mesure que l'objectif avance. Facette de progression, nom,
 * mesure, puis l'action rapide ; la même encre se lit sur la part remplie et sur le reste (`habitFillArgb`).
 *
 * [onOptions] ajoute un bouton ⋮ en plus de l'appui long, pour la liste complète où la carte
 * entière ouvre le détail.
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
    onOptions: (() -> Unit)? = null,
) {
    val palette = cadence
    val tint = habitTint(item)
    val target = item.evaluation.targetMinor.takeIf { it > 0 } ?: 1L
    val ratio = if (item.stored.goal.isAbstinence || item.stored.goal.isTracker) 0f else (item.evaluation.progressMinor.toFloat() / target).coerceIn(0f, 1f)
    val ink = palette.onSurface
    val fillTarget = habitFillRatio(item.stored.goal, item.evaluation.progressMinor, target, item.evaluation.isCompleted, item.stored.archived)
    val fillRatio by animateFloatAsState(fillTarget, animationSpec = Motion.interactive(), label = "habitFill")
    val fillColor = remember(tint, ink) { Color(habitFillArgb(tint.toArgb(), ink.toArgb())) }
    val filled = fillTarget > 0f
    val secondary = if (filled) ink else palette.onSurfaceVariant
    val facetTint = if (filled) ink else readableTintOf(tint)
    val container = when {
        fillRatio <= 0f -> null
        fillRatio >= 1f -> SolidColor(fillColor)
        else -> Brush.horizontalGradient(0f to fillColor, fillRatio to fillColor, fillRatio to palette.card, 1f to palette.card)
    }
    Panel(
        onClick = onClick,
        onLongClick = onLongClick,
        container = container,
        contentPadding = PaddingValues(horizontal = Space.lg),
    ) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = Size.habitCard),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            HabitFacet(
                icon = HabitIconRegistry.getIcon(item.stored.iconId).imageVector,
                label = HabitIconRegistry.getIcon(item.stored.iconId).labelFr,
                progress = ratio,
                tint = facetTint,
                trackColor = if (filled) ink.copy(alpha = 0.30f) else palette.containerHigh,
                size = Size.badge,
            )
            Spacer(Modifier.width(Space.lg))
            Column(Modifier.weight(1f)) {
                Text(
                    item.stored.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = ink,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(conciseHabitStatus(item), style = MaterialTheme.typography.bodySmall, color = secondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (actionLabel != null && action != null) {
                Spacer(Modifier.width(Space.sm))
                HabitActionPill(item, actionLabel, actionEnabled, action)
            }
            if (done) {
                Spacer(Modifier.width(Space.sm))
                Box(Modifier.size(Size.actionSm).clip(CircleShape).background(palette.success.copy(alpha = 0.16f)), contentAlignment = Alignment.Center) {
                    Icon(Icons.Outlined.Check, null, tint = palette.success, modifier = Modifier.size(Size.iconSm))
                }
            }
            if (onOptions != null) {
                val optionsLabel = stringResource(R.string.habit_options_description, item.stored.name)
                Box(
                    Modifier
                        .size(Size.touch)
                        .clip(CircleShape)
                        .clickable(role = androidx.compose.ui.semantics.Role.Button, onClick = onOptions)
                        .semantics { contentDescription = optionsLabel },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Outlined.MoreVert, null, tint = secondary, modifier = Modifier.size(Size.icon))
                }
            }
        }
    }
}

/** Action rapide : fond de surface et encre du thème, lisibles sur la part remplie comme sur le reste. */
@Composable
private fun HabitActionPill(
    item: HabitCardState,
    label: String,
    enabled: Boolean,
    action: () -> Unit,
) {
    val palette = cadence
    val description = stringResource(R.string.today_action_description, item.stored.name, label)
    val haptic = rememberCadenceHaptic()
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed && enabled) 0.94f else 1f,
        animationSpec = Motion.interactive(),
        label = "habitActionPress",
    )
    val ink = palette.onSurface
    val shape = if (item.stored.goal.goalType == GoalType.BINARY) CircleShape else Radius.Pill
    val size = if (item.stored.goal.goalType == GoalType.BINARY) Modifier.size(Size.actionSm) else Modifier.heightIn(min = Size.actionSm).padding(horizontal = Space.md, vertical = Space.xs)
    Box(
        Modifier
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .clip(shape)
            .background(palette.containerHigh)
            .clickable(
                interactionSource = interaction,
                indication = androidx.compose.foundation.LocalIndication.current,
                enabled = enabled,
                role = androidx.compose.ui.semantics.Role.Button,
                onClick = {
                    haptic.confirm()
                    action()
                },
            )
            .then(size)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        if (item.stored.goal.goalType == GoalType.BINARY) {
            Icon(Icons.Outlined.Check, null, tint = if (enabled) ink else ink.copy(alpha = 0.6f), modifier = Modifier.size(Size.iconSm))
        } else {
            Text(label, style = MaterialTheme.typography.labelLarge, color = if (enabled) ink else ink.copy(alpha = 0.6f))
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
@Composable
internal fun GroupFilter(
    groups: List<HabitGroup>,
    habits: List<HabitCardState>,
    selectedGroupId: String?,
    onSelect: (String?) -> Unit,
) {
    val populatedGroups = groups.filter { group -> habits.any { it.stored.groupId == group.id } }
    if (populatedGroups.size <= 1) return
    // Une seule rangée défilante, comme les onglets des Tâches : les libellés ne passent jamais à la ligne.
    val tabs = listOf(TabPill(stringResource(R.string.group_filter_all))) + populatedGroups.map { TabPill(it.name) }
    val selected = populatedGroups.indexOfFirst { it.id == selectedGroupId }.let { if (it < 0) 0 else it + 1 }
    TabPills(
        tabs = tabs,
        selected = selected,
        onSelect = { index -> onSelect(if (index == 0) null else populatedGroups[index - 1].id) },
        contentPadding = PaddingValues(),
    )
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
            color = if (streak.current > 0) palette.onSurface else palette.outline,
        )
        if (streak.best > streak.current) {
            Text(
                stringResource(R.string.streak_best, streak.best),
                style = MaterialTheme.typography.bodySmall,
                color = palette.outline,
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
