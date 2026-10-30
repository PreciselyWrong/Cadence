package ch.nicolab.cadence.designsystem.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.selection.toggleable
import androidx.compose.runtime.remember
import ch.nicolab.cadence.designsystem.theme.Motion
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.cadence

/** Case de tâche : carré arrondi, trait primaire ou erreur pour une priorité haute. */
@Composable
fun TaskCheckbox(
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    highPriority: Boolean = false,
    contentDescription: String? = null,
) {
    val palette = cadence
    val stroke = when {
        checked -> palette.primary
        highPriority -> palette.error
        else -> palette.outline
    }
    CheckSurface(
        checked = checked,
        onCheckedChange = onCheckedChange,
        modifier = modifier,
        shape = Radius.Checkbox,
        fill = palette.primary,
        stroke = stroke,
        mark = palette.onPrimary,
        contentDescription = contentDescription,
    )
}

/** Case d'événement de calendrier : cercle à la couleur du calendrier. */
@Composable
fun EventCheck(
    checked: Boolean,
    color: Color,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    contentDescription: String? = null,
) {
    CheckSurface(
        checked = checked,
        onCheckedChange = onCheckedChange,
        modifier = modifier,
        shape = CircleShape,
        fill = color,
        stroke = color,
        mark = onColorOf(color),
        contentDescription = contentDescription,
    )
}

/**
 * Zone tactile de 48 dp qui dessine la case : le remplissage et le trait se transitionnent
 * entre l'état coché et non coché.
 */
@Composable
private fun CheckSurface(
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier,
    shape: Shape,
    fill: Color,
    stroke: Color,
    mark: Color,
    contentDescription: String?,
) {
    val haptic = rememberCadenceHaptic()
    val fillColor by animateColorAsState(
        targetValue = if (checked) fill else Color.Transparent,
        animationSpec = Motion.color(),
        label = "checkFill",
    )
    val strokeColor by animateColorAsState(
        targetValue = stroke,
        animationSpec = Motion.color(),
        label = "checkStroke",
    )
    Box(
        modifier
            .size(Size.touch)
            .toggleable(
                value = checked,
                interactionSource = remember { MutableInteractionSource() },
                indication = LocalIndication.current,
                role = Role.Checkbox,
                onValueChange = {
                    haptic.tap()
                    onCheckedChange(it)
                },
            )
            .semantics {
                contentDescription?.let { this.contentDescription = it }
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(Size.checkbox)
                .clip(shape)
                .background(fillColor)
                .border(Size.stroke, strokeColor, shape),
            contentAlignment = Alignment.Center,
        ) {
            if (checked) {
                Icon(Icons.Rounded.Check, null, tint = mark, modifier = Modifier.size(Size.iconSm))
            }
        }
    }
}
