package ch.nicolab.cadence.designsystem.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import ch.nicolab.cadence.designsystem.theme.Motion
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.designsystem.theme.glass
import ch.nicolab.cadence.designsystem.theme.glassBorder

/** Onglet à pastille : libellé et compteur facultatif. */
data class TabPill(val label: String, val count: Int? = null)

/**
 * Onglets défilants horizontalement. L'onglet actif est plein en primaire, les autres sont
 * en verre avec leur compteur.
 */
@Composable
fun TabPills(
    tabs: List<TabPill>,
    selected: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
    contentPadding: PaddingValues = PaddingValues(horizontal = Space.gutter),
) {
    Row(
        modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(contentPadding),
        horizontalArrangement = Arrangement.spacedBy(Space.sm),
    ) {
        tabs.forEachIndexed { index, tab ->
            PillTab(tab, index == selected) { onSelect(index) }
        }
    }
}

@Composable
private fun PillTab(tab: TabPill, active: Boolean, onClick: () -> Unit) {
    val palette = cadence
    val haptic = rememberCadenceHaptic()
    val container by animateColorAsState(
        targetValue = if (active) palette.primary else palette.glass,
        animationSpec = Motion.color(),
        label = "tabPillContainer",
    )
    val border by animateColorAsState(
        targetValue = if (active) Color.Transparent else palette.glassBorder,
        animationSpec = Motion.color(),
        label = "tabPillBorder",
    )
    val content = if (active) palette.onPrimary else palette.onSurface
    val countColor = if (active) palette.onPrimary else palette.onSurfaceVariant
    Box(Modifier.minimumInteractiveComponentSize()) {
        Row(
            Modifier
                .height(Size.tab)
                .clip(Radius.Pill)
                .background(container)
                .border(Size.hairline, border, Radius.Pill)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = androidx.compose.foundation.LocalIndication.current,
                    role = Role.Tab,
                    onClick = {
                        if (!active) haptic.selection()
                        onClick()
                    },
                )
                .semantics { selected = active }
                .padding(horizontal = Space.lg),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(tab.label, style = MaterialTheme.typography.labelLarge, color = content, maxLines = 1, overflow = TextOverflow.Ellipsis)
            tab.count?.let {
                Spacer(Modifier.width(Space.xs))
                Text(it.toString(), style = MaterialTheme.typography.labelMedium, color = countColor)
            }
        }
    }
}

/** Sélecteur segmenté pleine largeur : un segment actif en conteneur primaire. */
@Composable
fun SegmentedTabs(
    labels: List<String>,
    selected: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = cadence
    Row(
        modifier
            .fillMaxWidth()
            .clip(Radius.Pill)
            .background(palette.glass)
            .border(Size.hairline, palette.glassBorder, Radius.Pill)
            .padding(Space.xs),
    ) {
        labels.forEachIndexed { index, label ->
            Segment(label, index == selected, Modifier.weight(1f)) { onSelect(index) }
        }
    }
}

@Composable
private fun Segment(label: String, active: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val palette = cadence
    val haptic = rememberCadenceHaptic()
    val container by animateColorAsState(
        targetValue = if (active) palette.primaryContainer else Color.Transparent,
        animationSpec = Motion.color(),
        label = "segmentContainer",
    )
    val content by animateColorAsState(
        targetValue = if (active) palette.onPrimaryContainer else palette.onSurfaceVariant,
        animationSpec = Motion.color(),
        label = "segmentContent",
    )
    Box(
        modifier
            .height(Size.tab)
            .clip(Radius.Pill)
            .background(container)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = androidx.compose.foundation.LocalIndication.current,
                role = Role.Tab,
                onClick = {
                    if (!active) haptic.selection()
                    onClick()
                },
            )
            .semantics { selected = active },
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = MaterialTheme.typography.labelLarge, color = content, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
